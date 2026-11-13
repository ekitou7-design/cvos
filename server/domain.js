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
const resume = z.object({
  id: short,
  title: short,
  content: text,
  jobId: short.default(""),
  updatedAt: short,
  versions: z
    .array(z.object({ id: short, content: text, createdAt: short }))
    .max(500),
});
export const stateSchema = z
  .object({
    profile: profileSchema,
    chats: z
      .array(
        z.object({
          id: short,
          title: short,
          messages: z.array(message).max(2000),
        }),
      )
      .max(300),
    resumes: z.array(resume).max(500),
    jobs: z
      .array(
        z.object({
          id: short,
          company: short,
          title: short,
          jd: text,
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
  .strict();
export const emptyState = () => ({
  profile: emptyProfile(),
  chats: [],
  resumes: [],
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
