import test from "node:test";
import assert from "node:assert/strict";
import {
  queryKnowledge,
  removeKnowledge,
  PAGE_SIZE,
} from "../src/knowledge-view.js";

test("database queries compose filters, search hidden body/attachments, sort without mutating and page large collections", () => {
  const entries = Array.from({ length: 120 }, (_, i) => ({
    id: String(i),
    title: `资料 ${i}`,
    category: i % 2 ? "阅读" : "研究",
    content: i === 60 ? "Long body with SQL" : "",
    tags: ["合成", ...(i % 2 ? [] : ["方法"])],
    confirmed: i % 3 === 0,
    links: ["1", "60"],
    attachments: i === 60 ? [{ name: "原始笔记.txt", base64: "YQ==" }] : [],
    updatedAt: new Date(2026, 0, i + 1).toISOString(),
    createdAt: new Date(2025, 0, i + 1).toISOString(),
  }));
  const before = structuredClone(entries);
  assert.equal(queryKnowledge(entries).length, 120);
  assert.equal(queryKnowledge(entries)[0].id, "119");
  assert.equal(queryKnowledge(entries, { sort: "created-asc" })[0].id, "0");
  assert.equal(
    queryKnowledge(entries, { sort: "title-asc" })[2].title,
    "资料 2",
  );
  assert.deepEqual(
    queryKnowledge(entries, {
      query: "sql 笔记.TXT",
      category: "研究",
      tag: "方法",
      status: "confirmed",
    }).map((e) => e.id),
    ["60"],
  );
  assert.equal(
    queryKnowledge(entries, { query: "SQL", status: "draft" }).length,
    0,
  );
  assert.equal(queryKnowledge(entries, { query: "   " }).length, 120);
  assert.equal(queryKnowledge(entries, { query: "missing" }).length, 0);
  assert.equal(
    queryKnowledge(entries).slice(PAGE_SIZE * 2, PAGE_SIZE * 3).length,
    20,
  );
  const removed = removeKnowledge(entries, ["1", "60"]);
  assert.equal(removed.length, 118);
  assert.ok(removed.every((e) => !e.links.length));
  assert.deepEqual(entries, before);
});
