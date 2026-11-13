export const categories = {
  education: "教育经历",
  experience: "工作 / 实习",
  projects: "项目",
  skills: "技能",
  notes: "笔记",
};
export function migrateState(state) {
  if (
    !state ||
    typeof state !== "object" ||
    !state.profile ||
    typeof state.profile !== "object"
  )
    throw Object.assign(new Error("备份资料格式不正确。"), { status: 400 });
  if (Object.hasOwn(state, "knowledge")) return state;
  const date = new Date().toISOString();
  return {
    ...state,
    knowledge: Object.entries(categories)
      .filter(
        ([key]) =>
          typeof state.profile[key] === "string" && state.profile[key].trim(),
      )
      .map(([key, category]) => ({
        id: `legacy-${key}`,
        title: category,
        category,
        content: state.profile[key],
        tags: ["历史资料"],
        links: [],
        confirmed: key !== "notes",
        attachments: [],
        createdAt: date,
        updatedAt: date,
      })),
  };
}
// Exact extractive units: no model-authored numbers, titles, achievements or skills.
export function candidates(state, jd = "") {
  const words = [
    ...new Set(
      (
        jd
          .slice(0, 20000)
          .toLowerCase()
          .match(/[a-z0-9+#.]{2,}|[\u3400-\u9fff]{2,}/g) || []
      ).flatMap((w) =>
        /[\u3400-\u9fff]/.test(w)
          ? Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2))
          : [w],
      ),
    ),
  ].slice(0, 512);
  return state.knowledge
    .filter((e) => e.confirmed && e.content.trim())
    .flatMap((e) => {
      // Split only at sentence boundaries; every selected unit remains an exact quotation.
      return e.content
        .split("\n")
        .flatMap((line) =>
          line.split(/(?<=[。！？!?])\s*|(?<=\.)\s+(?=[A-Z])/u),
        )
        .map((t) => t.trim().replace(/^#{1,3}\s+|^[-*]\s+/g, ""))
        .filter(Boolean)
        .map((text, i) => {
          const hay = `${e.title} ${e.tags.join(" ")} ${text}`.toLowerCase();
          return {
            id: `${e.id}:${i}`,
            entryId: e.id,
            title: e.title,
            category: e.category,
            text,
            score:
              words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) +
              (e.category === "教育经历" ? 2 : 0),
          };
        });
    })
    .sort((a, b) => b.score - a.score);
}
export function compose(profile, units) {
  const identity = [
    "# " + (profile.name || "个人简历"),
    [profile.headline, profile.email, profile.phone, profile.location]
      .filter(Boolean)
      .join(" · "),
  ];
  const groups = new Map();
  for (const u of units) {
    const key = u.category === u.title ? u.title : `${u.category} · ${u.title}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push("- " + u.text);
  }
  return [
    ...identity,
    ...[...groups].flatMap(([title, lines]) => ["## " + title, ...lines]),
  ]
    .filter(Boolean)
    .join("\n");
}
const noise =
  /^(首页|推荐职位|相关职位|热门职位|扫码.*|立即沟通|立即投递|投递简历|下载.*APP|登录|注册|举报|收藏|分享|隐私政策|用户协议|帮助中心|返回顶部|Copyright.*|版权所有.*|BOSS直聘|职位推荐)$/i;
export function parseJD(raw) {
  const lines = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const cleaned = lines.filter((l) => !noise.test(l));
  const labeled = (pattern) =>
    cleaned.map((l) => l.match(pattern)?.[1]?.trim()).find(Boolean) || "";
  const title =
    labeled(/^(?:职位名称|岗位名称|岗位|职位|Job Title)\s*[:：]\s*(.+)$/i) ||
    cleaned.find(
      (l) =>
        l.length < 60 &&
        /(?:运营|经理|工程师|设计师|实习生|专员|研究员|分析师|Developer|Engineer|Manager)$/i.test(
          l,
        ),
    ) ||
    "";
  const company =
    labeled(/^(?:公司名称|公司|Company)\s*[:：]\s*(.+)$/i) ||
    cleaned.find(
      (l) => l.length < 100 && /(?:有限公司|股份公司|有限责任公司)$/.test(l),
    ) ||
    "";
  const location =
    labeled(/^(?:工作地点|工作城市|地点|城市|Location)\s*[:：]\s*(.+)$/i) || "";
  const salary =
    labeled(/^(?:薪资|薪酬|Salary)\s*[:：]\s*(.+)$/i) ||
    cleaned.find((l) =>
      /\d+(?:\.\d+)?\s*[-–~至]\s*\d+(?:\.\d+)?\s*[kK千万元]|\d+\s*元\s*[\/／]\s*[天日月年]/.test(
        l,
      ),
    ) ||
    "";
  const start = cleaned.findIndex((l) =>
    /^(任职要求|岗位要求|职位要求|任职资格|Qualifications|Requirements)/i.test(
      l,
    ),
  );
  return {
    title,
    company,
    location,
    salary,
    jd: cleaned.join("\n"),
    requirements: start >= 0 ? cleaned.slice(start).join("\n") : "",
    url: raw.match(/https?:\/\/[^\s<>]+/)?.[0] || "",
  };
}
export function verifyJD(result, raw) {
  const fields = [
    "title",
    "company",
    "location",
    "salary",
    "requirements",
    "jd",
    "url",
  ];
  const normalized = raw.replace(/\s/g, "").toLowerCase();
  return Object.fromEntries(
    fields.map((k) => {
      const value = typeof result[k] === "string" ? result[k].trim() : "";
      // Every extracted line must be present verbatim (apart from whitespace) in the input.
      if (
        value.length > (["requirements", "jd"].includes(k) ? 200000 : 500) ||
        value
          .split("\n")
          .some(
            (line) =>
              !normalized.includes(line.replace(/\s/g, "").toLowerCase()),
          )
      )
        throw new Error(
          `JD 字段 ${k} 缺少原文依据，请使用本地整理或手动填写。`,
        );
      return [k, value];
    }),
  );
}
