import { parseJD } from "../server/knowledge.js";
// Synthetic provider for API integration tests. No network or real user facts.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://cvos-test.invalid/"))
    return originalFetch(url, options);
  const body = JSON.parse(options.body);
  const system = body.messages[0].content;
  let content = "Synthetic assistant reply";
  if (system.includes('"patch"'))
    content = JSON.stringify({
      patch: { skills: "Verified skill from mock" },
      reason: "Synthetic user fact",
    });
  if (system.includes('"gaps"'))
    content = JSON.stringify({
      ids: JSON.parse(body.messages.at(-1).content)
        .candidates.slice(0, 1)
        .map((c) => c.id),
      gaps: "No synthetic gap",
    });
  if (system.includes("提取招聘网页")) {
    const raw = body.messages.at(-1).content;
    const jd = parseJD(raw);
    if (raw.includes("PROVIDER_INVENT")) jd.company = "Invented Company";
    content = JSON.stringify(jd);
  }
  if (
    system.includes('"ids"') &&
    body.messages.at(-1).content.includes("REJECT_UNKNOWN_ID")
  )
    content = JSON.stringify({ ids: ["unsupported-id"], gaps: "" });
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    headers: { "Content-Type": "application/json" },
  });
};
