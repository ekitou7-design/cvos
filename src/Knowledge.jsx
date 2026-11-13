import React, { useState, useEffect } from "react";
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
    [category, setCategory] = useState("全部"),
    [view, setView] = useState(false),
    [tagText, setTagText] = useState("");
  const entries = state.knowledge || [];
  useEffect(() => {
    const saved = entries.find((e) => e.id === entry?.id);
    if (saved && !changed) {
      setEntry(structuredClone(saved));
      setTagText(saved.tags.join(", "));
    }
  }, [entries]);
  const categories = [
    ...new Set([
      "教育经历",
      "工作 / 实习",
      "项目",
      "技能",
      "成果",
      "笔记",
      ...entries.map((e) => e.category),
    ]),
  ];
  function select(e) {
    if (changed && !confirm("放弃这条知识的未保存修改？")) return;
    setEntry(structuredClone(e));
    setTagText(e.tags.join(", "));
    setChanged(false);
    setDirty(false);
    setView(false);
  }
  function change(patch) {
    setEntry((e) => ({ ...e, ...patch }));
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
  const filtered = entries.filter(
    (e) =>
      (category === "全部" || e.category === category) &&
      `${e.title} ${e.category} ${e.tags.join(" ")} ${e.content} ${e.attachments.map((a) => a.name).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="knowledge-layout">
      <aside className="card knowledge-list">
        <div className="card-heading">
          <h2>
            我的知识库 <span className="count">{entries.length}</span>
          </h2>
          <button className="primary" onClick={() => select(blank())}>
            新建条目
          </button>
        </div>
        <input
          aria-label="搜索知识库"
          placeholder="搜索正文、标签、附件…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="知识分类筛选"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {["全部", ...categories].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <p className="hint">
          {entries.filter((e) => e.confirmed).length} 条已确认 ·
          仅已确认正文用于定制简历
        </p>
        <div className="knowledge-rows">
          {filtered.map((e) => (
            <button
              key={e.id}
              className={
                "knowledge-row " + (entry?.id === e.id ? "selected" : "")
              }
              onClick={() => select(e)}
            >
              <small>
                {e.category} · {e.confirmed ? "已确认" : "草稿"}
              </small>
              <b>{e.title}</b>
              <span>{e.content.slice(0, 72) || "暂无正文"}</span>
              <small>
                {e.tags.map((t) => "#" + t).join(" ")}
                {e.attachments.length
                  ? ` · ${e.attachments.length} 个附件`
                  : ""}
              </small>
            </button>
          ))}
        </div>
        {!filtered.length && (
          <p className="muted">
            还没有匹配的条目。记录一个项目、一次实习，或今天的新想法。
          </p>
        )}
      </aside>
      <section className="card knowledge-editor">
        {entry ? (
          <>
            <div className="card-heading">
              <div>
                <h2>{entry.title || "新的知识条目"}</h2>
                <p>{changed ? "尚未保存" : "自由记录，长期积累"}</p>
              </div>
              <button
                className="primary"
                onClick={() => run(persist, "知识条目已保存")}
              >
                保存条目
              </button>
            </div>
            <label className="field">
              <span>标题</span>
              <input
                value={entry.title}
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                <span>分类 · 可自定义</span>
                <input
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
                    "不必按简历格式写。可以记录背景、过程、具体行动、结果和反思。\n将可独立使用的事实分行记录，便于定制时选择。"
                  }
                />
              </label>
            )}
            <details>
              <summary>关联知识与反向链接</summary>
              <div className="source-select">
                {entries
                  .filter((e) => e.id !== entry.id)
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
                      knowledge: entries
                        .filter((e) => e.id !== entry.id)
                        .map((e) => ({
                          ...e,
                          links: e.links.filter((k) => k !== entry.id),
                        })),
                    });
                    setEntry(null);
                    setChanged(false);
                  });
              }}
            >
              删除条目
            </button>
          </>
        ) : (
          <div className="knowledge-welcome">
            <span className="eyebrow">YOUR KNOWLEDGE, YOUR CAREER</span>
            <h2>经历先积累，简历再生成。</h2>
            <p>
              项目、技能、成果、反思，都有自己的位置。
              <br />
              在左侧选一条知识，或从一段自由记录开始。
            </p>
            <button className="primary" onClick={() => select(blank())}>
              记录一条知识
            </button>
          </div>
        )}
      </section>
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
