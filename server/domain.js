import { z } from "zod";
import { randomUUID } from "node:crypto";
export const uid = () => randomUUID();
const text = z.string().max(200000);
const short = z.string().max(500);
export const profileSchema = z
  .object({
    name: short,
    email: short,
    phone: short,
    location: short,
    headline: short,
    education: text,
    experience: text,
    projects: text,
    skills: text,
    notes: text,
  })
  .strict();
export const emptyProfile = () =>
  profileSchema.parse(
    Object.fromEntries(
      Object.keys(profileSchema.shape).map((key) => [key, ""]),
    ),
  );
const message = z.object({
  id: short,
  role: z.enum(["user", "assistant"]),
  content: text,
});
const photo = z
  .string()
  .max(1000000)
  .refine(
    (v) => !v || /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(v),
    "照片必须是裁剪后的 PNG",
  )
  .default("");
const evidence = z
  .array(z.object({ entryId: short, title: short, text }))
  .max(500)
  .default([]);
export const knowledgeSchema = z.object({
  id: short.min(1),
  title: short.min(1),
  category: short,
  content: text,
  tags: z.array(short).max(50),
  links: z.array(short).max(100),
  confirmed: z.boolean(),
  createdAt: short,
  updatedAt: short,
  attachments: z
    .array(
      z.object({
        id: short,
        name: short,
        base64: z
          .string()
          .max(16800000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      }),
    )
    .max(30)
    .default([]),
});
export const resumeSchema = z.object({
  id: short,
  title: short,
  content: text,
  jobId: short.default(""),
  updatedAt: short,
  photo,
  evidence,
  selectionNote: text.default(""),
  gaps: text.default(""),
  versions: z
    .array(
      z.object({
        id: short,
        content: text,
        createdAt: short,
        photo,
        title: short.optional(),
        evidence,
      }),
    )
    .max(500),
});
export const stateSchema = z
  .object({
    profile: profileSchema,
    knowledge: z.array(knowledgeSchema).max(3000).default([]),
    chats: z
      .array(
        z.object({
          id: short,
          title: short,
          messages: z.array(message).max(2000),
        }),
      )
      .max(300),
    resumes: z.array(resumeSchema).max(500),
    resumeDrafts: z.array(resumeSchema).max(500).default([]),
    jobs: z
      .array(
        z.object({
          id: short,
          company: short,
          title: short,
          jd: text,
          rawJd: text.default(""),
          location: short.default(""),
          salary: short.default(""),
          requirements: text.default(""),
          url: short,
          status: z.enum(["准备中", "已投递", "面试中", "已录用", "已结束"]),
          notes: text,
          resumeId: short.default(""),
        }),
      )
      .max(1000),
    sources: z
      .array(
        z.object({ id: short, name: short, content: text, createdAt: short }),
      )
      .max(500),
    proposals: z
      .array(
        z.object({
          id: short,
          patch: profileSchema.partial(),
          baseProfile: profileSchema,
          reason: text,
          createdAt: short,
          status: z.enum(["pending", "accepted", "rejected"]),
        }),
      )
      .max(500),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (Buffer.byteLength(JSON.stringify(state)) > 96 * 1024 * 1024)
      ctx.addIssue({
        code: "custom",
        message: "资料库超过 96 MB，请移除大型附件后保存",
      });
    for (const key of [
      "knowledge",
      "resumes",
      "resumeDrafts",
      "jobs",
      "sources",
      "chats",
      "proposals",
    ]) {
      if (new Set(state[key].map((x) => x.id)).size !== state[key].length)
        ctx.addIssue({ code: "custom", message: "条目 ID 重复" });
    }
    if (
      new Set([...state.resumes, ...state.resumeDrafts].map((r) => r.id))
        .size !==
      state.resumes.length + state.resumeDrafts.length
    )
      ctx.addIssue({ code: "custom", message: "草稿与简历 ID 重复" });
  });
export const emptyState = () => ({
  profile: emptyProfile(),
  knowledge: [],
  chats: [],
  resumes: [],
  resumeDrafts: [],
  jobs: [],
  sources: [],
  proposals: [],
});
export function jsonOutput(raw) {
  const clean = raw
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("模型未返回有效 JSON，请重试或换用支持结构化输出的模型。");
  }
}
export function parseChatImport(raw, name) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    if (/\.json$/i.test(name)) throw new Error("JSON 格式错误");
    return [
      {
        id: uid(),
        title: name,
        messages: [{ id: uid(), role: "user", content: raw.slice(0, 200000) }],
      },
    ];
  }
  const list = Array.isArray(data) ? data : [data];
  const chats = [];
  for (const c of list) {
    let entries = [];
    if (c.mapping) {
      // Follow the selected branch; exclude deleted/alternative answers.
      let node = c.current_node;
      const seen = new Set();
      while (node && c.mapping[node] && !seen.has(node)) {
        seen.add(node);
        const n = c.mapping[node];
        if (n.message) entries.unshift(n.message);
        node = n.parent;
      }
      if (!c.current_node)
        entries = Object.values(c.mapping)
          .map((n) => n.message)
          .filter(Boolean);
    } else entries = c.chat_messages || c.messages || [];
    const messages = entries
      .map((m) => ({
        id: uid(),
        role:
          (m.author?.role || m.role || m.sender) === "human"
            ? "user"
            : m.author?.role || m.role || m.sender,
        content:
          typeof m.content === "string"
            ? m.content
            : m.text ||
              (m.content?.parts || m.content || [])
                .map((p) => (typeof p === "string" ? p : p.text || ""))
                .join("\n"),
      }))
      .filter((m) => ["user", "assistant"].includes(m.role) && m.content.trim())
      .map((m) => ({ ...m, content: m.content.slice(0, 200000) }));
    if (messages.length)
      chats.push({
        id: uid(),
        title: String(c.title || c.name || name).slice(0, 500),
        messages,
      });
  }
  if (!chats.length)
    throw new Error(
      "未识别到对话。支持 ChatGPT conversations.json、Claude JSON、标准 messages JSON，或 TXT/Markdown。",
    );
  return chats;
}
export function resumeBlocks(content) {
  return content
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => ({
      text: line.replace(/^#{1,3}\s+|^[-*]\s+/g, ""),
      type: /^#\s/.test(line)
        ? "title"
        : /^#{2,3}\s/.test(line)
          ? "heading"
          : /^[-*]\s/.test(line)
            ? "bullet"
            : "text",
    }));
}

export function assertTextIntegrity(content, extracted) {
  const count = (value) => {
    const result = new Map();
    for (const char of value.normalize("NFKC").match(/[\u3400-\u9fff]/gu) || [])
      result.set(char, (result.get(char) || 0) + 1);
    return result;
  };
  const expected = count(content),
    actual = count(extracted);
  for (const [char, amount] of expected) {
    if ((actual.get(char) || 0) < amount)
      throw Object.assign(
        new Error(
          "排版结果存在中文缺字，已阻止导出。请安装 Noto Sans CJK SC 中文字体后重启 CVOS。原正文已保留。",
        ),
        { status: 503 },
      );
  }
}

export function migrateResumeDrafts(state, force = false) {
  if (
    !state ||
    !Array.isArray(state.resumes) ||
    !Array.isArray(state.jobs) ||
    (state.resumeDrafts !== undefined && !Array.isArray(state.resumeDrafts))
  )
    throw Object.assign(new Error("备份资料格式不正确。"), { status: 400 });
  if (!force && Object.hasOwn(state, "resumeDrafts")) return state;
  const oldIds = new Set(state.resumes.map((r) => r.id));
  return {
    ...state,
    resumes: [],
    resumeDrafts: [...(state.resumeDrafts || []), ...state.resumes],
    jobs: state.jobs.map((j) =>
      oldIds.has(j.resumeId) ? { ...j, resumeId: "" } : j,
    ),
  };
}
