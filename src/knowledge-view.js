export const PAGE_SIZE = 50;
export function queryKnowledge(
  entries,
  {
    query = "",
    category = "",
    tag = "",
    status = "",
    sort = "updated-desc",
  } = {},
) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const [field, direction] = sort.split("-");
  return entries
    .filter((e) => {
      const hay =
        `${e.title} ${e.category} ${e.tags.join(" ")} ${e.content} ${e.attachments.map((a) => a.name).join(" ")}`.toLocaleLowerCase();
      return (
        (!category || e.category === category) &&
        (!tag || e.tags.includes(tag)) &&
        (!status || (status === "confirmed" ? e.confirmed : !e.confirmed)) &&
        words.every((word) => hay.includes(word))
      );
    })
    .sort((a, b) => {
      const key =
        field === "title"
          ? "title"
          : field === "created"
            ? "createdAt"
            : "updatedAt";
      const order = (a[key] || "").localeCompare(b[key] || "", "zh-CN", {
        numeric: true,
      });
      return (direction === "asc" ? order : -order) || a.id.localeCompare(b.id);
    });
}
export function removeKnowledge(entries, ids) {
  const removed = new Set(ids);
  return entries
    .filter((e) => !removed.has(e.id))
    .map((e) => ({ ...e, links: e.links.filter((id) => !removed.has(id)) }));
}
