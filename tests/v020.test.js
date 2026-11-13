import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import mammoth from "mammoth";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  emptyState,
  stateSchema,
  assertTextIntegrity,
  migrateResumeDrafts,
} from "../server/domain.js";
import {
  migrateState,
  parseJD,
  verifyJD,
  candidates,
  compose,
} from "../server/knowledge.js";
const photo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";

test("knowledge migration, exact selection, JD cleaning and unsupported facts", () => {
  assert.doesNotThrow(() => assertTextIntegrity("中文事实 12", "中文事实 12"));
  assert.throws(() => assertTextIntegrity("中文事实", "中中中中"), /缺字/);
  const old = emptyState();
  delete old.knowledge;
  old.profile.projects = "完成 12 次合成测试";
  old.profile.notes = "未核对草稿";
  const legacyResume = {
    id: "legacy-resume",
    title: "旧简历",
    content: "旧正文",
    photo,
    versions: [{ id: "v", content: "旧版本", photo, createdAt: "" }],
  };
  const legacy = {
    ...old,
    resumes: [legacyResume],
    jobs: [{ id: "old-job", resumeId: legacyResume.id }],
  };
  delete legacy.resumeDrafts;
  const moved = migrateResumeDrafts(legacy);
  assert.equal(moved.resumes.length, 0);
  assert.deepEqual(moved.resumeDrafts, [legacyResume]);
  assert.equal(moved.jobs[0].resumeId, "");
  assert.deepEqual(migrateResumeDrafts(moved), moved);
  assert.throws(
    () => migrateResumeDrafts({ ...moved, resumeDrafts: "bad" }),
    /格式/,
  );
  const migrated = migrateState(old);
  assert.equal(migrated.profile.projects, old.profile.projects);
  assert.equal(migrated.knowledge.length, 2);
  assert.equal(
    migrated.knowledge.find((e) => e.id === "legacy-notes").confirmed,
    false,
  );
  assert.deepEqual(migrateState(migrated), migrated);
  const selected = candidates(migrated, "测试");
  assert.equal(selected.length, 1);
  assert.ok(compose(old.profile, selected).includes(old.profile.projects));
  const raw =
    "首页\n职位名称：数据运营\n公司：合成公司\n工作地点：上海\n薪资：10-15K\n岗位职责\n分析业务数据\n任职要求\n熟悉 SQL\n立即投递\n隐私政策";
  const jd = parseJD(raw);
  assert.equal(jd.title, "数据运营");
  assert.equal(jd.location, "上海");
  assert.equal(jd.salary, "10-15K");
  assert.ok(!jd.jd.includes("立即投递"));
  assert.ok(jd.requirements.includes("熟悉 SQL"));
  assert.equal(verifyJD(jd, raw).company, "合成公司");
  assert.throws(
    () => verifyJD({ ...jd, company: "虚构公司" }, raw),
    /原文依据/,
  );
  assert.throws(() =>
    stateSchema.parse({
      ...migrated,
      knowledge: [migrated.knowledge[0], migrated.knowledge[0]],
    }),
  );
  assert.throws(() =>
    stateSchema.parse({
      ...migrated,
      resumes: [
        {
          id: "r",
          title: "",
          content: "",
          updatedAt: "",
          versions: [],
          photo: "data:image/svg+xml;base64,PHN2Zz4=",
        },
      ],
    }),
  );
});

test(
  "v0.2 real workflow: old database, photos, exact one-page exports, overflow refusal and restore",
  { timeout: 240000 },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cvos-v020-"));
    const old = emptyState();
    delete old.knowledge;
    delete old.resumeDrafts;
    old.profile.name = "合成测试用户";
    old.profile.projects =
      "以 SQL 整理 12 份合成报表\n使用 Python 校验 24 条测试数据";
    old.profile.notes = "未经确认的推测不能进入简历";
    const db = new DatabaseSync(path.join(dir, "cvos.sqlite"));
    db.exec(
      "CREATE TABLE state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL)",
    );
    db.prepare("INSERT INTO state VALUES(1,7,?)").run(JSON.stringify(old));
    db.close();
    const child = spawn(process.execPath, ["server/index.js"], {
      env: { ...process.env, CVOS_DATA_DIR: dir, PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let base = "",
      logs = "",
      token;
    child.stdout.on("data", (d) => {
      logs += d;
      const match = logs.match(/CVOS http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) base = "http://127.0.0.1:" + match[1];
    });
    child.stderr.on("data", (d) => (logs += d));
    async function req(route, body, method) {
      const response = await fetch(base + route, {
        method: method || (body ? "POST" : "GET"),
        headers: body
          ? { "Content-Type": "application/json", "X-CVOS-Token": token }
          : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      assert.ok(response.ok, JSON.stringify(data));
      return data;
    }
    try {
      for (let i = 0; i < 600; i++) {
        try {
          token = (await (await fetch(base + "/api/session")).json()).token;
          break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(token, logs);
      let snapshot = await req("/api/state");
      assert.equal(snapshot.revision, 8);
      assert.equal(snapshot.state.profile.projects, old.profile.projects);
      const backupFile = fs
        .readdirSync(path.join(dir, "backups"))
        .find((n) => n.startsWith("before-v020-"));
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(dir, "backups", backupFile)))
          .state,
        old,
      );
      snapshot.state.knowledge.push({
        id: "attachment",
        title: "原始证据",
        category: "成果",
        content: "一份附件",
        tags: ["证据"],
        links: ["legacy-projects"],
        confirmed: false,
        createdAt: "",
        updatedAt: "",
        attachments: [
          {
            id: "a",
            name: "test.txt",
            base64: Buffer.from("附件合成内容").toString("base64"),
          },
        ],
      });
      snapshot.state.jobs.push({
        id: "j",
        title: "数据运营",
        company: "测试公司",
        jd: "熟悉 SQL Python 测试",
        url: "",
        status: "准备中",
        notes: "",
      });
      snapshot = await req("/api/state", snapshot, "PUT");
      let generated = await req("/api/ai/resume", {
        jobId: "j",
        mode: "local",
        photo,
      });
      assert.equal(generated.state.resumes.length, 0);
      assert.equal(generated.state.jobs[0].resumeId, "");
      const draft = generated.state.resumeDrafts[0];
      assert.equal(draft.id, generated.draftId);
      assert.equal(draft.versions.length, 0);
      assert.equal(
        (await fetch(base + "/api/resumes/" + draft.id + "/pdf")).status,
        404,
      );
      const reloaded = await req("/api/state");
      assert.equal(reloaded.state.resumeDrafts[0].photo, photo);
      generated = await req("/api/resume-drafts/" + draft.id + "/confirm", {
        revision: reloaded.revision,
        resume: {
          ...draft,
          title: "本人确认的合成简历",
          content: draft.content + "\n- 本人确认的合成说明",
        },
      });
      const resume = generated.state.resumes[0];
      assert.equal(resume.versions[0].content, resume.content);
      assert.equal(resume.title, "本人确认的合成简历");
      assert.equal(generated.state.resumeDrafts.length, 0);
      generated = await req("/api/ai/resume", {
        jobId: "j",
        mode: "local",
        photo,
      });
      assert.equal(generated.state.resumeDrafts.length, 1);
      assert.equal(generated.state.resumes.length, 1);
      assert.equal(generated.state.jobs[0].resumeId, resume.id);
      assert.notEqual(generated.draftId, resume.id);
      assert.equal(resume.photo, photo);
      assert.equal(resume.versions[0].photo, photo);
      assert.ok(!resume.content.includes("未经确认"));
      assert.ok(!resume.content.includes("一份附件"));
      assert.equal(resume.evidence.length, 2);
      for (const e of resume.evidence)
        assert.ok(old.profile.projects.includes(e.text));
      const pdfResponse = await fetch(
        base + "/api/resumes/" + resume.id + "/pdf",
      );
      assert.equal(pdfResponse.status, 200);
      const pdfTask = getDocument({
        data: new Uint8Array(await pdfResponse.arrayBuffer()),
        isEvalSupported: false,
        useSystemFonts: true,
      });
      try {
        const pdf = await pdfTask.promise;
        assert.equal(pdf.numPages, 1);
        const page = await pdf.getPage(1),
          text = (await page.getTextContent()).items.map((x) => x.str).join("");
        assert.ok(text.includes("12"), text);
        assert.ok(text.includes("24"), text);
        assert.ok(text.includes("SQL"), text);
        assert.ok(text.includes("合成测试用户"), text);
        const ops = await page.getOperatorList();
        assert.ok(
          ops.fnArray.includes(OPS.paintImageXObject),
          "Photo must be embedded in actual PDF",
        );
      } finally {
        await pdfTask.destroy();
      }
      const docResponse = await fetch(
        base + "/api/resumes/" + resume.id + "/docx",
      );
      assert.equal(docResponse.status, 200);
      const buffer = Buffer.from(await docResponse.arrayBuffer());
      const html = (await mammoth.convertToHtml({ buffer })).value;
      assert.ok(html.includes("<img"));
      assert.ok(html.includes("SQL"));
      assert.ok(html.includes("24"));
      const exported = await req("/api/backup");
      assert.equal(exported.version, 2);
      assert.equal(exported.state.resumeDrafts.length, 1);
      assert.equal(
        exported.state.knowledge.find((e) => e.id === "attachment")
          .attachments[0].base64,
        Buffer.from("附件合成内容").toString("base64"),
      );
      assert.equal(exported.state.resumes[0].versions[0].photo, photo);
      snapshot = generated;
      snapshot.state.resumes[0].content +=
        "\n" +
        Array.from(
          { length: 100 },
          (_, i) => "- 完整保留的经历 " + i + "，禁止截断或隐藏",
        ).join("\n");
      snapshot = await req(
        "/api/state",
        { state: snapshot.state, revision: snapshot.revision },
        "PUT",
      );
      const overflow = await fetch(
        base + "/api/resumes/" + resume.id + "/docx",
      );
      assert.equal(overflow.status, 422);
      assert.match((await overflow.json()).error, /精简/);
      const compacted = await req("/api/compact", {
        content: snapshot.state.resumes[0].content,
        photo,
        jobId: "j",
      });
      assert.ok(compacted.omitted.length > 0);
      for (const line of compacted.content.split("\n"))
        assert.ok(snapshot.state.resumes[0].content.includes(line));
      const checked = await req("/api/render", {
        content: compacted.content,
        photo,
      });
      assert.equal(checked.pages, 1);
      assert.ok(checked.fontSize >= 10.5);
      const restoredV2 = await req("/api/restore", {
        backup: exported,
        revision: snapshot.revision,
      });
      assert.equal(restoredV2.state.resumes.length, 1);
      assert.equal(restoredV2.state.resumeDrafts[0].photo, photo);
      const discarded = await req(
        "/api/state",
        {
          revision: restoredV2.revision,
          state: { ...restoredV2.state, resumeDrafts: [] },
        },
        "PUT",
      );
      assert.equal(discarded.state.jobs[0].resumeId, resume.id);
      assert.equal(discarded.state.resumes.length, 1);
      const restored = await req("/api/restore", {
        backup: {
          format: "cvos",
          version: 1,
          state: {
            ...old,
            resumes: [resume],
            jobs: [{ ...generated.state.jobs[0], resumeId: resume.id }],
          },
        },
        revision: discarded.revision,
      });
      assert.equal(restored.state.resumes.length, 0);
      assert.equal(restored.state.resumeDrafts[0].id, resume.id);
      assert.equal(restored.state.resumeDrafts[0].versions[0].photo, photo);
      assert.equal(restored.state.jobs[0].resumeId, "");
      assert.equal(restored.state.knowledge.length, 2);
      assert.equal(restored.state.profile.name, old.profile.name);
      assert.equal(
        fs.readdirSync(path.join(dir, "render-tmp")).length,
        0,
        "Temporary private artifacts must be cleaned",
      );
    } finally {
      child.kill("SIGTERM");
      if (child.exitCode === null)
        await new Promise((resolve) => child.once("exit", resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
