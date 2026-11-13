import express from "express";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  root,
  db,
  dataDir,
  readState,
  saveState,
  settings,
  writeSettings,
  publicSettings,
  encrypt,
} from "./store.js";
import {
  uid,
  profileSchema,
  stateSchema,
  resumeSchema,
  migrateResumeDrafts,
  parseChatImport,
} from "./domain.js";
import { callAI, factRule } from "./ai.js";
import {
  candidates,
  parseJD,
  verifyJD,
  migrateState,
  categories,
} from "./knowledge.js";
import { checkedResume, fitSelection, compactContent } from "./render.js";
const app = express(),
  port = Number(process.env.PORT || 3210),
  token = randomBytes(32).toString("hex");
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; object-src 'none'; frame-ancestors 'none'",
  });
  if (!hosts.has(req.headers.host))
    return res.status(403).json({ error: "禁止访问此主机" });
  if (req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      if (origin.protocol !== "http:" || !hosts.has(origin.host))
        throw new Error();
    } catch {
      return res.status(403).json({ error: "禁止跨站访问" });
    }
  }
  next();
});
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.headers["x-cvos-token"] !== token)
    return res.status(403).json({ error: "会话验证失败，请刷新页面。" });
  next();
});
app.use(express.json({ limit: "128mb" }));
app.get("/api/session", (_, res) =>
  res.json({ token, dataDir, version: "0.2.1" }),
);
app.get("/api/state", (_, res) => res.json(readState()));
app.put("/api/state", (req, res) => {
  res.json(
    saveState(
      req.body.state,
      z.number().int().nonnegative().parse(req.body.revision),
    ),
  );
});
app.get("/api/settings", (_, res) => res.json(publicSettings()));
const providerSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(100),
  protocol: z.enum(["openai", "anthropic"]),
  baseUrl: z.url().refine((v) => {
    const u = new URL(v);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash
    );
  }, "API 地址必须是无凭证的 HTTPS 地址"),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(2000).optional(),
  hasKey: z.boolean().optional(),
});
app.put("/api/settings", (req, res) => {
  const input = z
    .object({
      activeId: z.string(),
      providers: z.array(providerSchema).max(20),
    })
    .parse(req.body);
  if (new Set(input.providers.map((p) => p.id)).size !== input.providers.length)
    throw new Error("模型配置 ID 重复");
  if (input.activeId && !input.providers.some((p) => p.id === input.activeId))
    throw new Error("请选择有效模型");
  const old = settings();
  writeSettings({
    activeId: input.activeId,
    providers: input.providers.map(({ apiKey, hasKey, ...p }) => ({
      ...p,
      secret: apiKey
        ? encrypt(apiKey)
        : old.providers.find((x) => x.id === p.id)?.secret || "",
    })),
  });
  res.json(publicSettings());
});
app.post("/api/ai/test", async (_, res) => {
  res.json({
    message: await callAI(
      [{ role: "user", content: "仅回复：连接成功" }],
      "简短回复。",
    ),
  });
});
app.post("/api/ai/chat", async (req, res) => {
  const input = z
    .object({
      chatId: z.string(),
      content: z.string().min(1).max(20000),
      useProfile: z.boolean(),
      sourceIds: z.array(z.string()).max(20),
    })
    .parse(req.body);
  const snapshot = readState();
  let chat = snapshot.state.chats.find((c) => c.id === input.chatId);
  if (!chat) throw new Error("对话不存在");
  const sources = snapshot.state.sources
    .filter((s) => input.sourceIds.includes(s.id))
    .map((s) => ({ name: s.name, content: s.content }));
  const system =
    factRule +
    "\n资料只有经确认才能更新。不要声称已更新资料。\n" +
    (input.useProfile
      ? "用户已同意参考资料：" +
        JSON.stringify({
          identity: Object.fromEntries(
            Object.entries(snapshot.state.profile).filter(
              ([k]) => !categories[k],
            ),
          ),
          knowledge: snapshot.state.knowledge
            .filter((e) => e.confirmed)
            .map(({ attachments, ...e }) => e),
        })
      : "不参考个人资料。") +
    "\n用户选择的参考文档：" +
    JSON.stringify(sources);
  const content = await callAI(
    [
      ...chat.messages
        .slice(-24)
        .map(({ role, content }) => ({ role, content })),
      { role: "user", content: input.content },
    ],
    system,
  );
  chat.messages.push(
    { id: uid(), role: "user", content: input.content },
    { id: uid(), role: "assistant", content },
  );
  res.json(saveState(snapshot.state, snapshot.revision));
});
app.post("/api/ai/proposal", async (req, res) => {
  const input = z
    .object({
      chatId: z.string().optional(),
      sourceIds: z.array(z.string()).max(20),
    })
    .parse(req.body);
  const snapshot = readState();
  const chat = snapshot.state.chats.find((c) => c.id === input.chatId);
  const sources = snapshot.state.sources.filter((s) =>
    input.sourceIds.includes(s.id),
  );
  if (!chat?.messages.length && !sources.length)
    throw new Error("请先进行对话或选择参考文档。");
  const result = await callAI(
    [
      {
        role: "user",
        content: JSON.stringify({
          currentProfile: Object.fromEntries(
            Object.entries(snapshot.state.profile).filter(
              ([k]) => !categories[k],
            ),
          ),
          knowledge: snapshot.state.knowledge.map(({ attachments, ...e }) => e),
          messages: chat?.messages,
          sources,
        }),
      },
    ],
    factRule +
      '只输出 JSON：{"patch":{"字段":"完整新值"},"reason":"修改依据"}。可用字段为 ' +
      Object.keys(snapshot.state.profile).join(",") +
      "。patch 只包含有充分用户事实依据的字段；对话中助手推测不算事实。已有信息应保留。",
    true,
  );
  const patch = profileSchema.partial().parse(result.patch);
  if (!Object.keys(patch).length)
    throw new Error("没有找到需要新增或修改的资料。");
  snapshot.state.proposals.unshift({
    id: uid(),
    patch,
    baseProfile: snapshot.state.profile,
    reason: String(result.reason || "来自所选资料").slice(0, 200000),
    createdAt: new Date().toISOString(),
    status: "pending",
  });
  res.json(saveState(snapshot.state, snapshot.revision));
});
app.post("/api/proposals/:id", (req, res) => {
  const action = z.enum(["accept", "reject"]).parse(req.body.action);
  const s = readState(),
    p = s.state.proposals.find((p) => p.id === req.params.id);
  if (!p || p.status !== "pending") throw new Error("修改建议已处理或不存在");
  if (action === "accept") {
    for (const key of Object.keys(p.patch)) {
      if (s.state.profile[key] !== p.baseProfile[key]) {
        const e = new Error("相关资料已变更，请拒绝此建议并重新生成。");
        e.status = 409;
        throw e;
      }
    }
    for (const [key, content] of Object.entries(p.patch)) {
      if (!categories[key]) continue;
      const entry = s.state.knowledge.find((e) => e.id === `legacy-${key}`);
      if (entry && entry.content !== p.baseProfile[key])
        throw Object.assign(new Error("关联知识条目已修改，请重新提取建议。"), {
          status: 409,
        });
      const date = new Date().toISOString();
      if (entry) {
        entry.content = content;
        entry.confirmed = key !== "notes";
        entry.updatedAt = date;
      } else
        s.state.knowledge.push({
          id: `legacy-${key}`,
          title: categories[key],
          category: categories[key],
          content,
          tags: ["已确认建议"],
          links: [],
          confirmed: key !== "notes",
          attachments: [],
          createdAt: date,
          updatedAt: date,
        });
    }
    s.state.profile = { ...s.state.profile, ...p.patch };
  }
  p.status = action === "accept" ? "accepted" : "rejected";
  res.json(saveState(s.state, s.revision));
});
app.post("/api/jd/parse", async (req, res) => {
  const { raw, mode } = z
    .object({
      raw: z.string().min(1).max(200000),
      mode: z.enum(["local", "ai"]).default("local"),
    })
    .parse(req.body);
  if (mode === "local") return res.json(parseJD(raw));
  const result = await callAI(
    [{ role: "user", content: raw }],
    factRule +
      "提取招聘网页正文。只输出 JSON，字段 company,title,location,salary,requirements,jd,url，全部为字符串。删除导航、推荐岗位与按钮。字段的每一行必须逐字摘自输入；不能补全或改写；未知填空字符串。保留完整岗位职责与要求。",
    true,
  );
  res.json(verifyJD(result, raw));
});
app.post("/api/compact", async (req, res) => {
  const input = z
    .object({
      content: z.string().min(1).max(200000),
      photo: z.string().max(1000000).default(""),
      jobId: z.string().default(""),
    })
    .parse(req.body);
  const job = readState().state.jobs.find((j) => j.id === input.jobId);
  res.json(
    await compactContent(
      input.content,
      input.photo,
      [job?.title, job?.jd, job?.requirements].filter(Boolean).join("\n"),
    ),
  );
});
app.post("/api/render", async (req, res) => {
  const { content, photo } = z
    .object({
      content: z.string().min(1).max(200000),
      photo: z.string().max(1000000).default(""),
    })
    .parse(req.body);
  const result = await checkedResume(content, photo);
  res.json({
    pages: result.pages,
    fontSize: result.fontSize,
    pdf: result.pdf.toString("base64"),
  });
});
app.post("/api/ai/resume", async (req, res) => {
  const input = z
    .object({
      jobId: z.string(),
      mode: z.enum(["local", "ai"]).default("ai"),
      photo: z.string().max(1000000).default(""),
    })
    .parse(req.body);
  const s = readState(),
    job = s.state.jobs.find((j) => j.id === input.jobId);
  if (!job?.jd.trim()) throw new Error("请先填写并保存 JD");
  const matchText = [job.title, job.location, job.requirements, job.jd]
    .filter(Boolean)
    .join("\n");
  let candidateSize = 0;
  let units = candidates(s.state, matchText)
    .slice(0, 80)
    .filter((u) => {
      if (candidateSize + u.text.length > 30000) return false;
      candidateSize += u.text.length;
      return true;
    });
  if (!units.length) throw new Error("请在个人知识库中填写并确认真实经历。");
  let gaps = "",
    selectionNote = "按 JD 关键词本地排序；逐字选用已确认知识条目。";
  if (input.mode === "ai") {
    const result = await callAI(
      [
        {
          role: "user",
          content: JSON.stringify({
            job: {
              title: job.title,
              company: job.company,
              location: job.location,
              salary: job.salary,
              requirements: job.requirements,
              jd: job.jd,
            },
            candidates: units.map(({ score, ...u }) => u),
          }),
        },
      ],
      factRule +
        '只输出 JSON：{"ids":["片段ID"],"gaps":"缺失的岗位要求"}。为单页简历选择最相关的事实片段，按重要性排序，最多30个。只能返回输入中的 ID，不生成简历正文。不因 JD 提及某技能就认为用户具有该技能。',
      true,
    );
    const ids = z.array(z.string()).min(1).max(30).parse(result.ids);
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !units.some((u) => u.id === id))
    )
      throw new Error("模型返回了无依据或重复的片段，请重新生成。");
    units = ids.map((id) => units.find((u) => u.id === id));
    gaps = String(result.gaps || "").slice(0, 20000);
    selectionNote = "AI 选择与排序，正文逐字来自已确认知识条目。";
  }
  // Bound the initial render; whole low-priority units can be omitted, never cut mid-line.
  let length = 0;
  units = units.filter((u) => {
    if (length + u.text.length > 7000) return false;
    length += u.text.length;
    return true;
  });
  const fit = await fitSelection(s.state.profile, units, input.photo);
  const id = uid(),
    date = new Date().toISOString();
  const evidence = fit.selected.map(({ entryId, title, text }) => ({
    entryId,
    title,
    text,
  }));
  const omitted = candidates(s.state, matchText).length - fit.selected.length;
  selectionNote += ` 本次选用 ${fit.selected.length} 个完整片段，未选用 ${omitted} 个；正文 ${fit.fontSize} pt，已校验一页 A4。`;
  s.state.resumeDrafts.unshift({
    id,
    title: `${job.company} · ${job.title}`,
    content: fit.content,
    photo: input.photo,
    evidence,
    selectionNote,
    jobId: job.id,
    updatedAt: date,
    gaps: String(gaps || ""),
    versions: [],
  });
  res.json({ ...saveState(s.state, s.revision), draftId: id, gaps });
});
app.post("/api/resume-drafts/:id/confirm", (req, res) => {
  const input = z
    .object({
      revision: z.number().int().nonnegative(),
      resume: resumeSchema.pick({
        title: true,
        content: true,
        photo: true,
        evidence: true,
      }),
    })
    .parse(req.body);
  if (!input.resume.title.trim() || !input.resume.content.trim())
    throw Object.assign(new Error("请填写简历名称和正文后确认。"), {
      status: 400,
    });
  const snapshot = readState();
  if (snapshot.revision !== input.revision)
    throw Object.assign(
      new Error("资料已在其他窗口修改，请刷新后再确认。草稿仍会保留。"),
      { status: 409 },
    );
  const draft = snapshot.state.resumeDrafts.find((r) => r.id === req.params.id);
  if (!draft)
    throw Object.assign(new Error("草稿已确认、已放弃或不存在，请刷新。"), {
      status: 409,
    });
  const date = new Date().toISOString();
  const confirmed = {
    ...draft,
    ...input.resume,
    updatedAt: date,
    versions: [
      ...draft.versions,
      {
        id: uid(),
        ...input.resume,
        evidence: input.resume.evidence,
        createdAt: date,
      },
    ],
  };
  snapshot.state.resumes.unshift(confirmed);
  snapshot.state.resumeDrafts = snapshot.state.resumeDrafts.filter(
    (r) => r.id !== draft.id,
  );
  const job = snapshot.state.jobs.find((j) => j.id === draft.jobId);
  if (job) job.resumeId = confirmed.id;
  res.json({
    ...saveState(snapshot.state, input.revision),
    resumeId: confirmed.id,
  });
});
app.post("/api/import/chat", (req, res) => {
  const input = z
      .object({ name: z.string().max(500), content: z.string().max(16000000) })
      .parse(req.body),
    s = readState();
  const imported = parseChatImport(input.content, input.name);
  s.state.chats.unshift(...imported);
  res.json({ ...saveState(s.state, s.revision), count: imported.length });
});
app.post("/api/import/document", async (req, res) => {
  const input = z
    .object({ name: z.string().max(500), base64: z.string().max(18000000) })
    .parse(req.body);
  const bytes = Buffer.from(input.base64, "base64");
  let content;
  if (/\.docx$/i.test(input.name))
    content = (await mammoth.extractRawText({ buffer: bytes })).value;
  else if (/\.pdf$/i.test(input.name)) {
    const loadingTask = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      enableScripting: false,
      useSystemFonts: true,
    });
    try {
      const doc = await loadingTask.promise;
      if (doc.numPages > 150) throw new Error("PDF 最多支持 150 页");
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i),
          t = await page.getTextContent();
        pages.push(
          t.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join(""),
        );
      }
      content = pages.join("\n");
    } finally {
      await loadingTask.destroy();
    }
  } else if (/\.(txt|md|json)$/i.test(input.name))
    content = bytes.toString("utf8");
  else throw new Error("支持 PDF、DOCX、TXT、MD、JSON");
  if (!content.trim()) throw new Error("未提取到文字。扫描 PDF 请先进行 OCR。");
  if (content.length > 200000) throw new Error("文档过长，请拆分后导入");
  const s = readState();
  s.state.sources.unshift({
    id: uid(),
    name: input.name,
    content,
    createdAt: new Date().toISOString(),
  });
  res.json(saveState(s.state, s.revision));
});
app.get("/api/backup", (_, res) => {
  res.attachment("cvos-backup.json").json({
    format: "cvos",
    version: 2,
    exportedAt: new Date().toISOString(),
    state: readState().state,
  });
});
app.post("/api/restore", (req, res) => {
  const input = z
    .object({
      format: z.literal("cvos"),
      version: z.union([z.literal(1), z.literal(2)]),
      state: z.unknown(),
    })
    .parse(req.body.backup);
  input.state = stateSchema.parse(
    migrateResumeDrafts(migrateState(input.state), input.version === 1),
  );
  const revision = z.number().int().parse(req.body.revision),
    s = readState();
  if (revision !== s.revision) {
    const e = new Error("资料已变化，请刷新后重新恢复");
    e.status = 409;
    throw e;
  }
  const backupDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, `before-restore-${Date.now()}.json`),
    JSON.stringify({ format: "cvos", version: 2, state: s.state }),
    { mode: 0o600 },
  );
  res.json(saveState(input.state, revision));
});
app.get("/api/resumes/:id/:format", async (req, res) => {
  if (!["docx", "pdf"].includes(req.params.format)) return res.sendStatus(404);
  const r = readState().state.resumes.find((r) => r.id === req.params.id);
  if (!r) return res.sendStatus(404);
  const result = await checkedResume(r.content, r.photo);
  if (result.pages !== 1)
    return res.status(422).json({
      error: `当前正文为 ${result.pages} 页。请精简内容并重新校验；不会截断或隐藏正文。`,
    });
  const word = req.params.format === "docx";
  res
    .type(
      word
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf",
    )
    .attachment(`resume.${req.params.format}`)
    .send(word ? result.docx : result.pdf);
});
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
}
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(err.status || (err instanceof z.ZodError ? 400 : 500)).json({
    error:
      err instanceof z.ZodError
        ? err.issues.find((issue) => issue.code === "custom")?.message ||
          "输入格式不正确，请检查字段与文件。"
        : err.message || "请求失败",
  });
});
const server = app.listen(port, "127.0.0.1", () => {
  const boundPort = server.address().port;
  hosts.add(`127.0.0.1:${boundPort}`);
  hosts.add(`localhost:${boundPort}`);
  console.log(`CVOS http://127.0.0.1:${boundPort}\nPrivate data: ${dataDir}`);
});
server.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    server.closeAllConnections();
  });
