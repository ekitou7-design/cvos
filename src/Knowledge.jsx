import React, { useState, useEffect, useRef } from "react";
import {
  PAGE_SIZE,
  queryKnowledge,
  removeKnowledge,
} from "./knowledge-view.js";
const date = () => new Date().toISOString();
const blank = () => ({
  id: crypto.randomUUID(),
  title: "",
  category: "笔记",
  content: "",
  tags: [],
  links: [],
  attachments: [],
  confirmed: false,
  createdAt: date(),
  updatedAt: date(),
});
const split = (value) => [
  ...new Set(
    value
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
export function Knowledge({ state, save, run, setDirty }) {
  const [entry, setEntry] = useState(null),
    [changed, setChanged] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [tag, setTag] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("updated-desc"),
    [layout, setLayout] = useState(() => {
      try {
        const saved = localStorage.getItem("cvos-knowledge-view");
        return ["table", "cards", "list"].includes(saved) ? saved : "table";
      } catch {
        return "table";
      }
    }),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState([]),
    [bulkCategory, setBulkCategory] = useState(""),
    [bulkTag, setBulkTag] = useState(""),
    [linkQuery, setLinkQuery] = useState(""),
    [editorNotice, setEditorNotice] = useState(""),
    [view, setView] = useState(false),
    [tagText, setTagText] = useState("");
  const entries = state.knowledge || [];
  const dialog = useRef(null);
  const opener = useRef(null);
  const editing = Boolean(entry);
  useEffect(() => {
    if (!editing) {
      opener.current?.focus();
      return;
    }
    dialog.current.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [editing]);
  useEffect(() => {
    setPage(0);
    setSelected([]);
  }, [query, category, tag, status, sort]);
  useEffect(() => {
    try {
      localStorage.setItem("cvos-knowledge-view", layout);
    } catch {}
  }, [layout]);
  function close() {
    if (dialog.current?.closest("fieldset[disabled]")) return;
    if (changed && !confirm("放弃这条知识的未保存修改？")) return;
    setEntry(null);
    setChanged(false);
    setDirty(false);
  }
  useEffect(() => {
    const saved = entries.find((e) => e.id === entry?.id);
    if (saved && !changed) {
      setEntry(structuredClone(saved));
      setTagText(saved.tags.join(", "));
    }
  }, [entries]);
  const categories = [
    ...new Set([
      "笔记",
      "阅读摘录",
      "研究资料",
      "灵感收藏",
      "项目",
      "教育经历",
      "工作 / 实习",
      "技能",
      "成果",
      ...entries.map((e) => e.category),
    ]),
  ];
  function select(e) {
    if (changed && !confirm("放弃这条知识的未保存修改？")) return;
    if (!entry) opener.current = document.activeElement;
    setEditorNotice("");
    setLinkQuery("");
    setEntry(structuredClone(e));
    setTagText(e.tags.join(", "));
    setChanged(false);
    setDirty(false);
    setView(false);
  }
  function change(patch) {
    setEntry((e) => ({ ...e, ...patch }));
    setEditorNotice("");
    setChanged(true);
    setDirty(true);
  }
  async function persist() {
    if (!entry.title.trim()) throw new Error("请填写知识标题。");
    const updated = {
      ...entry,
      title: entry.title.trim(),
      tags: split(tagText),
      updatedAt: date(),
    };
    const exists = entries.some((e) => e.id === entry.id);
    await save({
      ...state,
      knowledge: exists
        ? entries.map((e) => (e.id === entry.id ? updated : e))
        : [updated, ...entries],
    });
    setEntry(updated);
    setChanged(false);
    setDirty(false);
    setEditorNotice("已保存");
  }
  function download(a) {
    const bytes = Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/octet-stream" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = a.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filtered = queryKnowledge(entries, {
    query,
    category,
    tag,
    status,
    sort,
  });
  const pageIndex = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1),
  );
  const visible = filtered.slice(
    pageIndex * PAGE_SIZE,
    (pageIndex + 1) * PAGE_SIZE,
  );
  const tags = [...new Set(entries.flatMap((e) => e.tags))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  const toggle = (id) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  async function bulk(action) {
    if (
      action === "delete" &&
      !confirm(
        `删除选中的 ${selected.length} 条知识及其附件？已生成简历的历史内容仍保留。`,
      )
    )
      return;
    await save({
      ...state,
      knowledge:
        action === "delete"
          ? removeKnowledge(entries, selected)
          : entries.map((e) => {
              if (!selected.includes(e.id)) return e;
              return {
                ...e,
                updatedAt: date(),
                ...(action === "category"
                  ? { category: bulkCategory.trim() }
                  : { tags: [...new Set([...e.tags, ...split(bulkTag)])] }),
              };
            }),
    });
    setSelected([]);
    setBulkCategory("");
    setBulkTag("");
  }
  const stamp = (value) =>
    value && !Number.isNaN(Date.parse(value))
      ? new Date(value).toLocaleDateString("zh-CN")
      : "—";
  const chips = (e) => (
    <span className="kb-tags">
      {e.tags.slice(0, 3).map((t) => (
        <span key={t} title={t}>
          {t}
        </span>
      ))}
      {e.tags.length > 3 && <small>+{e.tags.length - 3}</small>}
    </span>
  );
  const check = (e) => (
    <input
      type="checkbox"
      aria-label={`选择 ${e.title}`}
      checked={selected.includes(e.id)}
      onChange={() => toggle(e.id)}
    />
  );
  return (
    <div className="knowledge-database">
      <section className="card kb-database" aria-label="知识数据库">
        <div className="kb-heading">
          <div>
            <h2>
              全部资料 <span className="count">{entries.length}</span>
            </h2>
            <p className="muted">收藏、阅读、思考，在这里持续积累。</p>
          </div>
          <button className="primary" onClick={() => select(blank())}>
            ＋ 新建条目
          </button>
        </div>
        <div className="kb-viewbar">
          <div className="kb-views" role="group" aria-label="数据库视图">
            {[
              ["table", "表格"],
              ["cards", "卡片"],
              ["list", "列表"],
            ].map(([key, name]) => (
              <button
                key={key}
                aria-pressed={layout === key}
                className={layout === key ? "active" : ""}
                onClick={() => setLayout(key)}
              >
                {name}
              </button>
            ))}
          </div>
          <input
            aria-label="搜索知识库"
            placeholder="搜索标题、正文、标签、附件…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="kb-filters">
          <label>
            分类
            <select
              aria-label="知识分类筛选"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            标签
            <select
              aria-label="知识标签筛选"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">全部标签</option>
              {tags.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            状态
            <select
              aria-label="知识状态筛选"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">全部状态</option>
              <option value="draft">未确认</option>
              <option value="confirmed">已确认</option>
            </select>
          </label>
          <label className="kb-sort">
            排序
            <select
              aria-label="知识排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="updated-desc">最近修改</option>
              <option value="updated-asc">最早修改</option>
              <option value="created-desc">最近创建</option>
              <option value="created-asc">最早创建</option>
              <option value="title-asc">标题 A → Z</option>
              <option value="title-desc">标题 Z → A</option>
            </select>
          </label>
          {(query || category || tag || status) && (
            <button
              className="text-button"
              onClick={() => {
                setQuery("");
                setCategory("");
                setTag("");
                setStatus("");
              }}
            >
              清除筛选
            </button>
          )}
        </div>
        {selected.length > 0 && (
          <div className="kb-bulk" aria-label="批量操作">
            <b>已选 {selected.length} 条</b>
            <button className="text-button" onClick={() => setSelected([])}>
              取消选择
            </button>
            <input
              aria-label="批量分类"
              list="bulk-categories"
              placeholder="设置分类"
              maxLength={500}
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            />
            <datalist id="bulk-categories">
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </datalist>
            <button
              className="secondary"
              disabled={!bulkCategory.trim()}
              onClick={() => run(() => bulk("category"), "已批量归类")}
            >
              应用分类
            </button>
            <input
              aria-label="批量标签"
              placeholder="添加标签，逗号分隔"
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
            />
            <button
              className="secondary"
              disabled={!split(bulkTag).length}
              onClick={() => run(() => bulk("tags"), "已添加标签")}
            >
              添加标签
            </button>
            <button
              className="text-button danger"
              onClick={() => run(() => bulk("delete"))}
            >
              删除所选
            </button>
          </div>
        )}
        <div className="kb-resultbar">
          <label className="check-label">
            <input
              type="checkbox"
              aria-label="选择本页全部条目"
              checked={
                visible.length > 0 &&
                visible.every((e) => selected.includes(e.id))
              }
              ref={(el) => {
                if (el)
                  el.indeterminate =
                    visible.some((e) => selected.includes(e.id)) &&
                    !visible.every((e) => selected.includes(e.id));
              }}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...new Set([...selected, ...visible.map((e) => e.id)])]
                    : selected.filter(
                        (id) => !visible.some((e) => e.id === id),
                      ),
                )
              }
            />
            选择本页
          </label>
          <span role="status">
            {filtered.length} 条结果 · 共 {entries.length} 条
          </span>
        </div>
        {filtered.length > 0 ? (
          layout === "table" ? (
            <div className="kb-table-scroll">
              <table className="kb-table">
                <thead>
                  <tr>
                    <th aria-label="选择" />
                    <th scope="col">名称</th>
                    <th scope="col">分类</th>
                    <th scope="col">标签</th>
                    <th scope="col">状态</th>
                    <th scope="col">附件 / 关联</th>
                    <th scope="col">修改日期</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr
                      key={e.id}
                      className={selected.includes(e.id) ? "selected" : ""}
                    >
                      <td>{check(e)}</td>
                      <th scope="row">
                        <button
                          className="kb-title"
                          onClick={() => select(e)}
                          title={e.title}
                        >
                          ▤ <span>{e.title}</span>
                        </button>
                      </th>
                      <td>
                        <span className="kb-category">
                          {e.category || "未分类"}
                        </span>
                      </td>
                      <td>{chips(e)}</td>
                      <td>
                        <span
                          className={
                            "kb-status " + (e.confirmed ? "confirmed" : "")
                          }
                        >
                          {e.confirmed ? "已确认" : "未确认"}
                        </span>
                      </td>
                      <td className="kb-meta">
                        {e.attachments.length} 附件 · {e.links.length} 关联
                      </td>
                      <td className="kb-meta">{stamp(e.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={layout === "cards" ? "kb-cards" : "kb-list"}>
              {visible.map((e) => (
                <article
                  key={e.id}
                  className={
                    "kb-item " + (selected.includes(e.id) ? "selected" : "")
                  }
                >
                  <div className="kb-item-top">
                    {check(e)}
                    <span className="kb-category">
                      {e.category || "未分类"}
                    </span>
                    <span
                      className={
                        "kb-status " + (e.confirmed ? "confirmed" : "")
                      }
                    >
                      {e.confirmed ? "已确认" : "未确认"}
                    </span>
                  </div>
                  <button
                    className="kb-title"
                    onClick={() => select(e)}
                    title={e.title}
                  >
                    <span>{e.title}</span>
                  </button>
                  {chips(e)}
                  <div className="kb-meta">
                    {e.attachments.length} 附件 · {e.links.length} 关联 ·{" "}
                    {stamp(e.updatedAt)}
                  </div>
                </article>
              ))}
            </div>
          )
        ) : (
          <div className="empty">
            <h3>{entries.length ? "没有匹配的资料" : "从一条记录开始"}</h3>
            <p>
              {entries.length
                ? "试试其他关键词，或清除筛选。"
                : "阅读摘录、研究资料、灵感、日常笔记，都可以放在这里。"}
            </p>
            <button
              className="secondary"
              onClick={() =>
                entries.length
                  ? (setQuery(""), setCategory(""), setTag(""), setStatus(""))
                  : select(blank())
              }
            >
              {entries.length ? "清除筛选" : "新建条目"}
            </button>
          </div>
        )}
        <div className="kb-footer">
          <span>
            {filtered.length
              ? `${pageIndex * PAGE_SIZE + 1}–${Math.min((pageIndex + 1) * PAGE_SIZE, filtered.length)}`
              : 0}{" "}
            / {filtered.length} 条 · 每页 {PAGE_SIZE} 条
          </span>
          <div className="actions">
            <button
              className="secondary"
              disabled={pageIndex === 0}
              onClick={() => setPage(pageIndex - 1)}
            >
              上一页
            </button>
            <span>
              {pageIndex + 1} /{" "}
              {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
            </span>
            <button
              className="secondary"
              disabled={(pageIndex + 1) * PAGE_SIZE >= filtered.length}
              onClick={() => setPage(pageIndex + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </section>
      <p className="hint">
        {entries.filter((e) => e.confirmed).length} 条已确认可用于简历 ·
        其他资料自由积累，正文与附件仅存本地
      </p>
      {entry && (
        <dialog
          className="knowledge-editor"
          ref={dialog}
          aria-labelledby="knowledge-editor-title"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <header className="kb-editor-heading">
            <div>
              <span className="eyebrow">知识条目</span>
              <h2 id="knowledge-editor-title">
                {entry.title || "新的知识条目"}
              </h2>
              <p role="status">{changed ? "尚未保存" : "自由记录，长期积累"}</p>
            </div>
            <div className="actions">
              <button className="secondary" onClick={close}>
                关闭
              </button>
              <button
                className="primary"
                onClick={() =>
                  run(async () => {
                    try {
                      await persist();
                    } catch (error) {
                      setEditorNotice(error.message);
                      throw error;
                    }
                  }, "知识条目已保存")
                }
              >
                保存条目
              </button>
            </div>
          </header>
          <div className="kb-editor-body">
            {editorNotice && (
              <p role="status" className="hint">
                {editorNotice}
              </p>
            )}
            <label className="field">
              <span>标题</span>
              <input
                autoFocus
                maxLength={500}
                value={entry.title}
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                <span>分类 · 可自定义</span>
                <input
                  maxLength={500}
                  list="knowledge-categories"
                  value={entry.category}
                  onChange={(e) => change({ category: e.target.value })}
                />
                <datalist id="knowledge-categories">
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span>标签 · 逗号分隔</span>
                <input
                  value={tagText}
                  onChange={(e) => {
                    setTagText(e.target.value);
                    setChanged(true);
                    setDirty(true);
                  }}
                />
              </label>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => setView(!view)}>
                {view ? "编辑正文" : "阅读视图"}
              </button>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={entry.confirmed}
                  onChange={(e) => change({ confirmed: e.target.checked })}
                />
                我确认正文中的事实，可用于简历
              </label>
            </div>
            {view ? (
              <div className="knowledge-reading">
                {entry.content.split("\n").map((line, i) =>
                  /^#{1,3} /.test(line) ? (
                    <h3 key={i}>{line.replace(/^#+ /, "")}</h3>
                  ) : (
                    <p key={i}>
                      {line.split(/(\[\[.*?\]\])/).map((part, j) => {
                        const title = part.match(/^\[\[(.*?)\]\]$/)?.[1],
                          linked = entries.find((e) => e.title === title);
                        return title ? (
                          <button
                            key={j}
                            className="text-button"
                            disabled={!linked}
                            onClick={() => select(linked)}
                          >
                            {title}
                            {!linked ? "（待建立）" : ""}
                          </button>
                        ) : (
                          part
                        );
                      })}
                    </p>
                  ),
                )}
              </div>
            ) : (
              <label className="field">
                <span>正文 · 支持 Markdown 与 [[知识标题]] 关联</span>
                <textarea
                  rows={17}
                  value={entry.content}
                  onChange={(e) => change({ content: e.target.value })}
                  placeholder={
                    "记录摘录、想法、过程与反思…\n使用 # 标题组织笔记，使用 [[知识标题]] 关联其他资料。"
                  }
                />
              </label>
            )}
            <details>
              <summary>
                关联知识与反向链接 · {entry.links.length} 条关联
              </summary>
              <input
                aria-label="查找关联知识"
                placeholder="按标题查找资料…"
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
              />
              <div className="source-select">
                {entries
                  .filter(
                    (e) =>
                      e.id !== entry.id &&
                      e.title
                        .toLowerCase()
                        .includes(linkQuery.trim().toLowerCase()),
                  )
                  .map((e) => (
                    <label key={e.id}>
                      <input
                        type="checkbox"
                        checked={entry.links.includes(e.id)}
                        onChange={(event) =>
                          change({
                            links: event.target.checked
                              ? [...entry.links, e.id]
                              : entry.links.filter((k) => k !== e.id),
                          })
                        }
                      />
                      {e.title}
                    </label>
                  ))}
              </div>
              {entries
                .filter(
                  (e) =>
                    e.id !== entry.id &&
                    (e.links.includes(entry.id) ||
                      e.content.includes(`[[${entry.title}]]`)),
                )
                .map((e) => (
                  <button
                    className="secondary"
                    key={e.id}
                    onClick={() => select(e)}
                  >
                    ← {e.title}
                  </button>
                ))}
            </details>
            <div className="attachments">
              <h3>附件</h3>
              <p className="hint">
                原文件仅存本地，不自动发送给 AI。单文件最多 12
                MB，整个资料库含附件最多 96 MB。
              </p>
              {entry.attachments.map((a) => (
                <div className="attachment-row" key={a.id}>
                  <button className="text-button" onClick={() => download(a)}>
                    {a.name}
                  </button>
                  <button
                    aria-label={"移除附件 " + a.name}
                    onClick={() =>
                      change({
                        attachments: entry.attachments.filter(
                          (x) => x.id !== a.id,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <label className="button-link">
                添加附件
                <input
                  type="file"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files[0];
                    event.target.value = "";
                    if (file)
                      run(async () => {
                        if (file.size > 12 * 1024 * 1024)
                          throw new Error("附件最大 12 MB。");
                        const base64 = await new Promise((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () =>
                            resolve(reader.result.split(",")[1]);
                          reader.onerror = () =>
                            reject(new Error("无法读取附件"));
                          reader.readAsDataURL(file);
                        });
                        change({
                          attachments: [
                            ...entry.attachments,
                            {
                              id: crypto.randomUUID(),
                              name: file.name,
                              base64,
                            },
                          ],
                        });
                      });
                  }}
                />
              </label>
            </div>
            <p className="hint">
              创建 {new Date(entry.createdAt).toLocaleString("zh-CN")} · 修改{" "}
              {new Date(entry.updatedAt).toLocaleString("zh-CN")}
            </p>
            <button
              className="text-button danger"
              onClick={() => {
                if (
                  confirm("删除这条知识及其附件？已生成简历的历史内容仍保留。")
                )
                  run(async () => {
                    await save({
                      ...state,
                      knowledge: removeKnowledge(entries, [entry.id]),
                    });
                    setEntry(null);
                    setChanged(false);
                    setDirty(false);
                  });
              }}
            >
              删除条目
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}

export function PhotoEditor({ photo, onChange, run }) {
  const [image, setImage] = useState(null),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50);
  const canvas = React.useRef(null);
  useEffect(() => {
    if (!image || !canvas.current) return;
    const ctx = canvas.current.getContext("2d");
    const scale = Math.max(300 / image.width, 400 / image.height) * zoom;
    const width = image.width * scale,
      height = image.height * scale;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 300, 400);
    ctx.drawImage(
      image,
      (-(width - 300) * x) / 100,
      (-(height - 400) * y) / 100,
      width,
      height,
    );
  }, [image, zoom, x, y]);
  return (
    <div className="photo-editor">
      <h3>简历照片 · 可选</h3>
      {photo && <img className="saved-photo" src={photo} alt="当前简历照片" />}
      <label className="button-link">
        {photo ? "替换照片" : "上传照片"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files[0];
            e.target.value = "";
            if (file)
              run(async () => {
                if (file.size > 12 * 1024 * 1024)
                  throw new Error("照片最大 12 MB。");
                if (
                  !["image/png", "image/jpeg", "image/webp"].includes(file.type)
                )
                  throw new Error("请选择 PNG、JPEG 或 WebP 照片。");
                const url = URL.createObjectURL(file);
                try {
                  const img = await new Promise((resolve, reject) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = () => reject(new Error("照片无法读取"));
                    i.src = url;
                  });
                  if (img.width * img.height > 40000000)
                    throw new Error(
                      "照片分辨率过大，请先缩小到 4000 万像素以下。",
                    );
                  setImage(img);
                  setZoom(1);
                  setX(50);
                  setY(50);
                } finally {
                  URL.revokeObjectURL(url);
                }
              });
          }}
        />
      </label>
      {photo && (
        <button
          className="text-button danger"
          onClick={() => {
            setImage(null);
            onChange("");
          }}
        >
          删除照片
        </button>
      )}
      {image && (
        <div className="crop-panel">
          <canvas
            ref={canvas}
            width={300}
            height={400}
            aria-label="照片裁剪预览"
          />
          <label className="field">
            <span>放大</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>水平位置</span>
            <input
              type="range"
              min="0"
              max="100"
              value={x}
              onChange={(e) => setX(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>垂直位置</span>
            <input
              type="range"
              min="0"
              max="100"
              value={y}
              onChange={(e) => setY(Number(e.target.value))}
            />
          </label>
          <button
            className="primary"
            onClick={() => {
              onChange(canvas.current.toDataURL("image/png"));
              setImage(null);
            }}
          >
            应用裁剪
          </button>
          <button className="secondary" onClick={() => setImage(null)}>
            取消裁剪
          </button>
        </div>
      )}
    </div>
  );
}
