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
      content: "# Example Person\n## Experience\n- Verified synthetic fact",
      gaps: "No synthetic gap",
    });
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    headers: { "Content-Type": "application/json" },
  });
};
