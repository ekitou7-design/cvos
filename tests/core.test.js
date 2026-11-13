import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import {
  emptyState,
  parseChatImport,
  jsonOutput,
  stateSchema,
} from "../server/domain.js";

test("chat imports preserve selected ChatGPT branch, Claude, standard and plain text", () => {
  const chats = parseChatImport(
    JSON.stringify([
      {
        title: "Test",
        current_node: "c",
        mapping: {
          a: {
            parent: null,
            message: { author: { role: "user" }, content: { parts: ["Fact"] } },
          },
          b: {
            parent: "a",
            message: {
              author: { role: "assistant" },
              content: { parts: ["Discarded"] },
            },
          },
          c: {
            parent: "a",
            message: {
              author: { role: "assistant" },
              content: { parts: ["Selected"] },
            },
          },
        },
      },
    ]),
    "conversations.json",
  );
  assert.deepEqual(
    chats[0].messages.map((m) => m.content),
    ["Fact", "Selected"],
  );
  assert.equal(
    parseChatImport(
      JSON.stringify([
        { name: "Claude", chat_messages: [{ sender: "human", text: "Hello" }] },
      ]),
      "claude.json",
    )[0].messages[0].role,
    "user",
  );
  assert.equal(
    parseChatImport(
      '{"messages":[{"role":"user","content":"Hello"}]}',
      "chat.json",
    ).length,
    1,
  );
  assert.equal(parseChatImport("Plain text", "chat.md").length, 1);
  assert.throws(() => parseChatImport("{broken", "a.json"));
  assert.throws(() => parseChatImport("{}", "a.json"));
  assert.deepEqual(jsonOutput('```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() =>
    stateSchema.parse({
      ...emptyState(),
      profile: { ...emptyState().profile, unexpected: "x" },
    }),
  );
});

test("local API: security, persistence, confirmation, import, DOCX, backup and restore", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cvos-test-"));
  const child = spawn(
    process.execPath,
    ["--import", "./tests/provider-hook.js", "server/index.js"],
    {
      env: { ...process.env, CVOS_DATA_DIR: dir, PORT: "3219" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const base = "http://127.0.0.1:3219";
  let token;
  async function request(route, body, method, extra = {}) {
    const r = await fetch(base + route, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        ...(body
          ? { "Content-Type": "application/json", "X-CVOS-Token": token }
          : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { r, data: await r.json() };
  }
  try {
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(base + "/api/session");
        if (r.ok) {
          token = (await r.json()).token;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(token, output);
    let d = (await request("/api/state")).data;
    assert.equal(d.revision, 0);
    assert.equal(
      (
        await request("/api/state", { state: d.state, revision: 0 }, "PUT", {
          "X-CVOS-Token": "bad",
        })
      ).r.status,
      403,
    );
    assert.equal(
      (
        await request("/api/state", null, "GET", {
          Origin: "https://evil.example",
        })
      ).r.status,
      403,
    );
    const foreignHost = await new Promise((resolve, reject) => {
      http
        .get(
          base + "/api/state",
          { headers: { Host: "evil.example:3219" } },
          (r) => {
            r.resume();
            resolve(r.statusCode);
          },
        )
        .on("error", reject);
    });
    assert.equal(foreignHost, 403);
    d.state.profile.name = "Example Person";
    d = (await request("/api/state", d, "PUT")).data;
    assert.equal(d.state.profile.name, "Example Person");
    assert.equal(d.revision, 1);
    assert.equal(
      (await request("/api/state", { state: d.state, revision: 0 }, "PUT")).r
        .status,
      409,
    );
    const initial = d.state.profile;
    d.state.proposals = [
      {
        id: "proposal",
        patch: { skills: "Verified skill" },
        baseProfile: { ...initial },
        reason: "User said so",
        createdAt: new Date().toISOString(),
        status: "pending",
      },
    ];
    d = (await request("/api/state", d, "PUT")).data;
    assert.equal(d.state.profile.skills, "");
    d = (await request("/api/proposals/proposal", { action: "accept" })).data;
    assert.equal(d.state.profile.skills, "Verified skill");
    assert.equal(d.state.profile.name, "Example Person");
    assert.equal(
      (await request("/api/proposals/proposal", { action: "accept" })).r.status,
      500,
    );
    d.state.proposals.push({
      id: "stale",
      patch: { skills: "Incorrect" },
      baseProfile: initial,
      reason: "Old",
      createdAt: new Date().toISOString(),
      status: "pending",
    });
    d = (await request("/api/state", d, "PUT")).data;
    assert.equal(
      (await request("/api/proposals/stale", { action: "accept" })).r.status,
      409,
    );
    let r = await request("/api/import/chat", {
      name: "chat.json",
      content: '{"messages":[{"role":"user","content":"An imported fact"}]}',
    });
    assert.equal(r.data.count, 1);
    d = r.data;
    r = await request("/api/import/document", {
      name: "notes.md",
      base64: Buffer.from("A real note").toString("base64"),
    });
    assert.equal(r.data.state.sources[0].content, "A real note");
    d = r.data;
    const p = {
      id: "p1",
      name: "Test",
      protocol: "openai",
      baseUrl: "https://cvos-test.invalid/v1",
      model: "test",
      apiKey: "fake-secret-do-not-use",
    };
    const publicConfig = await request(
      "/api/settings",
      { activeId: "p1", providers: [p] },
      "PUT",
    );
    assert.equal(publicConfig.data.providers[0].hasKey, true);
    assert.ok(!JSON.stringify(publicConfig.data).includes("fake-secret"));
    assert.equal(
      (
        await request(
          "/api/settings",
          {
            activeId: "p1",
            providers: [{ ...p, baseUrl: "http://127.0.0.1:8080" }],
          },
          "PUT",
        )
      ).r.status,
      400,
    );
    assert.ok(
      !fs
        .readFileSync(path.join(dir, "cvos.sqlite"))
        .includes(Buffer.from("fake-secret-do-not-use")),
    );
    r = await request("/api/ai/chat", {
      chatId: d.state.chats[0].id,
      content: "A synthetic fact",
      useProfile: true,
      sourceIds: [],
    });
    assert.equal(r.r.status, 200, JSON.stringify(r.data));
    d = r.data;
    assert.equal(
      d.state.chats[0].messages.at(-1).content,
      "Synthetic assistant reply",
    );
    r = await request("/api/ai/proposal", {
      chatId: d.state.chats[0].id,
      sourceIds: [],
    });
    assert.equal(r.r.status, 200, JSON.stringify(r.data));
    d = r.data;
    assert.equal(d.state.profile.skills, "Verified skill");
    assert.equal(d.state.profile.name, "Example Person");
    assert.equal(d.state.proposals[0].status, "pending");
    assert.deepEqual(Object.keys(d.state.proposals[0].patch), ["skills"]);
    d = (
      await request("/api/proposals/" + d.state.proposals[0].id, {
        action: "accept",
      })
    ).data;
    assert.equal(d.state.profile.skills, "Verified skill from mock");
    d.state.jobs = [
      {
        id: "job",
        company: "Example Co",
        title: "Example Role",
        jd: "Synthetic requirement",
        url: "",
        status: "准备中",
        notes: "",
        resumeId: "",
      },
    ];
    d = (
      await request(
        "/api/state",
        { state: d.state, revision: d.revision },
        "PUT",
      )
    ).data;
    r = await request("/api/ai/resume", { jobId: "job" });
    assert.equal(r.r.status, 200, JSON.stringify(r.data));
    d = r.data;
    assert.ok(d.state.resumes[0].content.includes("Verified synthetic fact"));
    assert.equal(d.state.jobs[0].resumeId, r.data.resumeId);
    d.state.resumes = [
      {
        id: "r1",
        title: "Example",
        content: "# Example Person\n## Experience\n- Verified fact",
        jobId: "",
        updatedAt: new Date().toISOString(),
        versions: [],
      },
    ];
    d = (
      await request(
        "/api/state",
        { state: d.state, revision: d.revision },
        "PUT",
      )
    ).data;
    const doc = await fetch(base + "/api/resumes/r1/docx");
    assert.equal(doc.status, 200);
    const buf = Buffer.from(await doc.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), "PK");
    assert.ok(buf.length > 1000);
    r = await request("/api/import/document", {
      name: "roundtrip.docx",
      base64: buf.toString("base64"),
    });
    assert.equal(r.r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.state.sources[0].content.includes("Example Person"));
    d = r.data;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    const stream = "BT /F1 12 Tf 50 780 Td (CVOS example document) Tj ET";
    objects.push(
      "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream",
    );
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += i + 1 + " 0 obj\n" + objects[i] + "\nendobj\n";
    }
    const xref = Buffer.byteLength(pdf);
    pdf +=
      "xref\n0 6\n0000000000 65535 f \n" +
      offsets
        .slice(1)
        .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
        .join("") +
      "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" +
      xref +
      "\n%%EOF";
    r = await request("/api/import/document", {
      name: "example.pdf",
      base64: Buffer.from(pdf).toString("base64"),
    });
    assert.equal(r.r.status, 200, JSON.stringify(r.data));
    assert.ok(
      r.data.state.sources[0].content.includes("CVOS example document"),
    );
    d = r.data;
    const backup = (await request("/api/backup")).data;
    assert.equal(backup.format, "cvos");
    assert.ok(!JSON.stringify(backup).includes("fake-secret"));
    assert.ok(!JSON.stringify(backup).includes("secret"));
    assert.equal(
      (
        await request("/api/restore", {
          backup: { ...backup, version: 8 },
          revision: d.revision,
        })
      ).r.status,
      400,
    );
    r = await request("/api/restore", { backup, revision: d.revision });
    assert.equal(r.r.status, 200, JSON.stringify(r.data));
    assert.ok(fs.readdirSync(path.join(dir, "backups")).length === 1);
    assert.equal(
      (await request("/api/restore", { backup, revision: d.revision })).r
        .status,
      409,
    );
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
