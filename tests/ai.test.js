import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("model adapters: key privacy, provider switching, JSON and service failures", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cvos-ai-"));
  process.env.CVOS_DATA_DIR = dir;
  const store = await import("../server/store.js"),
    { callAI } = await import("../server/ai.js");
  const original = globalThis.fetch;
  let request;
  try {
    await assert.rejects(() => callAI([], "system"), /API Key/);
    store.writeSettings({
      activeId: "one",
      providers: [
        {
          id: "one",
          model: "model-a",
          protocol: "openai",
          baseUrl: "https://example.com/v1",
          secret: store.encrypt("test-key"),
        },
        {
          id: "two",
          model: "model-b",
          protocol: "anthropic",
          baseUrl: "https://example.org/v1",
          secret: store.encrypt("test-key-b"),
        },
      ],
    });
    globalThis.fetch = async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"patch":{"skills":"Fact"}}' } }],
        }),
      };
    };
    assert.equal(
      (await callAI([{ role: "user", content: "fact" }], "system", true)).patch
        .skills,
      "Fact",
    );
    assert.equal(request.url, "https://example.com/v1/chat/completions");
    assert.equal(request.options.headers.authorization, "Bearer test-key");
    assert.equal(request.body.messages[0].role, "system");
    assert.equal(request.options.redirect, "error");
    const cfg = store.settings();
    cfg.activeId = "two";
    store.writeSettings(cfg);
    globalThis.fetch = async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "Reply" }] }),
      };
    };
    assert.equal(
      await callAI([{ role: "user", content: "fact" }], "system"),
      "Reply",
    );
    assert.equal(request.url, "https://example.org/v1/messages");
    assert.equal(request.options.headers["x-api-key"], "test-key-b");
    assert.equal(request.body.system, "system");
    globalThis.fetch = async () => ({ ok: false, status: 401 });
    await assert.rejects(() => callAI([], "system"), /401/);
    globalThis.fetch = async () => {
      throw new Error("secret");
    };
    await assert.rejects(
      () => callAI([], "system"),
      (e) => !e.message.includes("secret"),
    );
  } finally {
    globalThis.fetch = original;
    store.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
