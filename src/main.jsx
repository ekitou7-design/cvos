import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { Knowledge, PhotoEditor } from "./Knowledge.jsx";
const Preview = React.lazy(() => import("./Preview.jsx"));
const labels = {
  name: "姓名",
  headline: "求职方向",
  email: "邮箱",
  phone: "电话",
  location: "城市",
  education: "教育经历",
  experience: "工作 / 实习经历",
  projects: "项目经历",
  skills: "技能",
  notes: "自由笔记",
};
const id = () => crypto.randomUUID(),
  now = () => new Date().toISOString();
let sessionToken = "";
async function api(url, body, method) {
  const r = await fetch("/api" + url, {
    method: method || (body ? "POST" : "GET"),
    headers: body
      ? { "Content-Type": "application/json", "X-CVOS-Token": sessionToken }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "请求失败");
  return data;
}
function Icon({ name, ...rest }) {
  const paths = {
    chat: (
      <>
        <path d="M20 11a8 8 0 0 1-8 8H5l-4 3 2-7a8 8 0 1 1 17-4Z" />
        <path d="M7 9h8M7 13h5" />
      </>
    ),
    profile: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="3" />
        <circle cx="12" cy="9" r="2" />
        <path d="M8 17c0-4 8-4 8 0" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
    file: (
      <>
        <path d="M6 2h8l5 5v15H6zM14 2v6h5M9 12h7M9 16h7" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name] || paths.file}
    </svg>
  );
}
function Empty({ icon = "file", title, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function App() {
  const [loaded, setLoaded] = useState(false),
    [state, setState] = useState(null),
    [revision, setRevision] = useState(0),
    [session, setSession] = useState({}),
    [module, setModule] = useState("profile"),
    [settings, setSettings] = useState(null),
    [showSettings, setShowSettings] = useState(false),
    [notice, setNotice] = useState(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [resumeId, setResumeId] = useState(""),
    [draftId, setDraftId] = useState(""),
    [chatId, setChatId] = useState(""),
    [editorEpoch, setEditorEpoch] = useState(0);
  const apply = (data) => {
    if (data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
    return data;
  };
  useEffect(() => {
    Promise.all([api("/session"), api("/state"), api("/settings")])
      .then(([s, d, c]) => {
        sessionToken = s.token;
        setSession(s);
        apply(d);
        setSettings(c);
        setLoaded(true);
      })
      .catch((e) => setNotice({ error: true, text: e.message }));
  }, []);
  useEffect(() => {
    const f = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  async function run(fn, success) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await fn();
      if (success) setNotice({ text: success });
      return r;
    } catch (e) {
      setNotice({ error: true, text: e.message });
      return null;
    } finally {
      setBusy(false);
    }
  }
  const save = async (next, clearDirty = true) => {
    const r = apply(await api("/state", { state: next, revision }, "PUT"));
    if (clearDirty) setDirty(false);
    return r;
  };
  const navigate = (next) => {
    if (busy) return false;
    if (dirty && !confirm("有尚未保存的编辑，确认离开并放弃这些编辑？"))
      return false;
    if (dirty) setEditorEpoch((n) => n + 1);
    setDirty(false);
    if (next === "file") setResumeId("");
    setModule(next);
    return true;
  };
  const safe = () => {
    if (!dirty) return true;
    if (!confirm("有尚未保存的编辑，确认放弃这些编辑并继续？")) return false;
    setEditorEpoch((n) => n + 1);
    return true;
  };
  if (!loaded)
    return (
      <div className="loading">
        <b>CVOS</b>
        <p>{notice?.text || "正在打开你的本地工作空间…"}</p>
      </div>
    );
  const active = settings.providers.find((p) => p.id === settings.activeId);
  const pending = state.proposals.filter((p) => p.status === "pending").length;
  const titles = {
    chat: ["AI 对话", "从一次对话，梳理你的下一步。"],
    profile: ["个人知识库", "收集资料，连接想法，建立自己的知识网络。"],
    target: ["JD 定制", "让真实经历，与理想岗位相遇。"],
    file: ["简历库", "你确认保存的简历，随时继续编辑。"],
    review: ["审核生成的简历", "检查并修改，确认后再保存到简历库。"],
  };
  return (
    <div className="app">
      <aside className="sidebar" aria-hidden={showSettings || undefined}>
        <div className="brand">
          <span className="brand-mark">C</span>
          <b>CVOS</b>
          <span className="version">0.2.1</span>
        </div>
        <div className="workspace-label">个人工作空间</div>
        <nav>
          {[
            ["chat", "AI 对话"],
            ["profile", "个人知识库"],
            ["target", "JD 定制"],
            ["file", "简历库"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-label={label}
              title={label}
              className={
                module === key || (module === "review" && key === "target")
                  ? "nav active"
                  : "nav"
              }
              onClick={() => navigate(key)}
              disabled={busy}
            >
              <Icon name={key} />
              <span>{label}</span>
              {key === "profile" && pending > 0 ? <i>{pending}</i> : null}
              {key === "file" && state.resumes.length > 0 ? (
                <small>{state.resumes.length}</small>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className="dot" />
            仅在本机存储<small>你的经历，由你掌握</small>
          </div>
          <button
            className="nav"
            aria-label="模型与数据设置"
            title="模型与数据设置"
            onClick={() => {
              if (safe()) {
                setDirty(false);
                setShowSettings(true);
              }
            }}
            disabled={busy}
          >
            <Icon name="settings" />
            <span>模型与数据设置</span>
          </button>
          <div className="profile-chip">
            <span>{state.profile.name?.[0] || "我"}</span>
            <div>
              <b>{state.profile.name || "我的工作空间"}</b>
              <small>LOCAL WORKSPACE</small>
            </div>
          </div>
        </div>
      </aside>
      <main aria-hidden={showSettings || undefined}>
        <header className="topbar">
          <span>
            工作空间 <span className="slash">/</span> {titles[module][0]}
          </span>
          <button
            className="model-pill"
            onClick={() => {
              if (safe()) {
                setDirty(false);
                setShowSettings(true);
              }
            }}
            disabled={busy}
          >
            <span className={"dot " + (active?.hasKey ? "" : "gray")} />
            {active?.name || "尚未配置模型"}
            <span>⌄</span>
          </button>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR CAREER, YOUR STORY</div>
            <h1>{titles[module][0]}</h1>
            <p>{titles[module][1]}</p>
          </div>
          <span className="private-label">
            <Icon name="lock" />
            本地优先
          </span>
        </div>
        {notice && (
          <div
            className={"notice " + (notice.error ? "error" : "")}
            role="status"
          >
            {notice.text}
            <button onClick={() => setNotice(null)} aria-label="关闭提示">
              ×
            </button>
          </div>
        )}
        {busy && (
          <div className="working" role="status">
            正在处理，请稍候…
          </div>
        )}
        <fieldset className="workspace" disabled={busy}>
          {module === "chat" && (
            <Chat
              key={editorEpoch}
              {...{ state, save, run, apply, chatId, setChatId, setDirty }}
              onProfile={() => navigate("profile")}
            />
          )}
          {module === "profile" && (
            <Profile
              key={editorEpoch}
              {...{ state, save, run, apply, setDirty }}
            />
          )}
          {module === "target" && (
            <Jobs
              key={editorEpoch}
              {...{ state, save, run, apply, setDirty }}
              onResume={(r) => {
                if (navigate("file")) setResumeId(r);
              }}
              onDraft={(r) => {
                setDraftId(r);
                setDirty(false);
                setModule("review");
              }}
            />
          )}
          {module === "file" && (
            <Resumes
              key={editorEpoch}
              {...{
                state,
                save,
                run,
                apply,
                revision,
                setDirty,
                resumeId,
                setResumeId,
              }}
              onCreate={() => navigate("target")}
              onBack={() => setResumeId("")}
            />
          )}
          {module === "review" && (
            <Resumes
              key={"draft-" + draftId + "-" + editorEpoch}
              {...{ state, save, run, apply, revision, setDirty }}
              isDraft
              resumeId={draftId}
              setResumeId={setDraftId}
              onBack={() => setModule("target")}
              onConfirmed={(r) => {
                setDraftId("");
                setResumeId(r);
                setModule("file");
              }}
            />
          )}
        </fieldset>
        <footer>CVOS 0.2.1 · 知识沉淀于本地，简历因机会而生。</footer>
      </main>
      {showSettings && (
        <Settings
          config={settings}
          {...{ state, revision, session, run, apply, busy }}
          onConfig={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
function Sources({ sources, selected, onChange }) {
  return sources.length ? (
    <div className="source-select">
      {sources.map((s) => (
        <label key={s.id}>
          <input
            type="checkbox"
            checked={selected.includes(s.id)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, s.id]
                  : selected.filter((x) => x !== s.id),
              )
            }
          />
          {s.name}
        </label>
      ))}
    </div>
  ) : (
    <p className="muted">还没有参考文档，可在个人知识库导入。</p>
  );
}
function Chat({
  state,
  save,
  run,
  apply,
  chatId,
  setChatId,
  setDirty,
  onProfile,
}) {
  const [draft, setDraft] = useState(""),
    [useProfile, setUseProfile] = useState(false),
    [sources, setSources] = useState([]);
  const end = useRef(null);
  const current = state.chats.find((c) => c.id === chatId) || state.chats[0];
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [current?.messages.length]);
  async function newChat() {
    if (draft && !confirm("放弃尚未发送的内容并开始新对话？")) return;
    const c = { id: id(), title: "新的对话", messages: [] };
    await save({ ...state, chats: [c, ...state.chats] });
    setChatId(c.id);
    setDraft("");
    setDirty(false);
  }
  async function send(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    await run(async () => {
      let target = current;
      if (!target) {
        const c = { id: id(), title: draft.slice(0, 28), messages: [] };
        await save({ ...state, chats: [c, ...state.chats] });
        setChatId(c.id);
        setDirty(true);
        target = c;
      }
      const r = await api("/ai/chat", {
        chatId: target.id,
        content: draft,
        useProfile,
        sourceIds: sources,
      });
      apply(r);
      setDraft("");
      setDirty(false);
    });
  }
  return (
    <div className="chat-layout">
      <div className="card chat-list">
        <button className="secondary full" onClick={() => run(newChat)}>
          <Icon name="plus" />
          开启新对话
        </button>
        <p className="section-label">最近的对话</p>
        {state.chats.map((c) => (
          <div className="chat-row" key={c.id}>
            <button
              className={current?.id === c.id ? "selected" : ""}
              onClick={() => {
                if (draft && !confirm("放弃尚未发送的内容？")) return;
                setDraft("");
                setDirty(false);
                setChatId(c.id);
              }}
            >
              {c.title}
            </button>
            <button
              className="tiny"
              aria-label={"删除对话 " + c.title}
              onClick={() => {
                if (confirm("删除这段对话？"))
                  run(() =>
                    save({
                      ...state,
                      chats: state.chats.filter((x) => x.id !== c.id),
                    }),
                  );
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div className="import-chat">
          <label className="button-link">
            导入历史聊天
            <input
              type="file"
              accept=".json,.txt,.md"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                if (f)
                  run(async () => {
                    if (f.size > 12000000)
                      throw new Error("文件最大 12 MB，请拆分后导入");
                    const r = apply(
                      await api("/import/chat", {
                        name: f.name,
                        content: await f.text(),
                      }),
                    );
                    setChatId(r.state.chats[0]?.id);
                  }, "历史对话已导入，仅保存在本机");
                e.target.value = "";
              }}
            />
          </label>
          <small>
            ChatGPT / Claude JSON
            <br />
            通用 JSON、TXT、Markdown
          </small>
        </div>
      </div>
      <div className="card conversation">
        <div className="conversation-top">
          <b>{current?.title || "你的经历，值得好好整理"}</b>
          <button
            className="text-button"
            disabled={!current?.messages.length && !sources.length}
            onClick={() =>
              run(async () => {
                apply(
                  await api("/ai/proposal", {
                    chatId: current?.id,
                    sourceIds: sources,
                  }),
                );
                onProfile();
              }, "已生成修改建议，请核对后确认")
            }
          >
            提取资料建议 <Icon name="arrow" />
          </button>
        </div>
        <div className="messages">
          {!current?.messages.length ? (
            <div className="chat-welcome">
              <span className="welcome-mark">C</span>
              <h2>从你自己开始。</h2>
              <p>
                聊聊做过的项目、解决的问题，
                <br />
                或一段还没整理好的经历。
              </p>
              <div className="suggestions">
                {[
                  "帮我梳理一段项目经历",
                  "我想整理自己的技能与优势",
                  "如何把实习经历写得更清楚？",
                ].map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setDraft(t);
                      setDirty(true);
                    }}
                  >
                    {t}
                    <Icon name="arrow" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            current.messages.map((m) => (
              <article key={m.id} className={"message " + m.role}>
                <span className="message-avatar">
                  {m.role === "user" ? "我" : "C"}
                </span>
                <div>
                  <small>{m.role === "user" ? "你" : "CVOS"}</small>
                  <p>{m.content}</p>
                </div>
              </article>
            ))
          )}
          <div ref={end} />
        </div>
        <form className="composer" onSubmit={send}>
          <details>
            <summary>本次发送的参考资料</summary>
            <label className="check-label">
              <input
                type="checkbox"
                checked={useProfile}
                onChange={(e) => setUseProfile(e.target.checked)}
              />
              附带已确认的个人资料
            </label>
            <Sources
              sources={state.sources}
              selected={sources}
              onChange={setSources}
            />
          </details>
          <div className="composer-input">
            <textarea
              aria-label="对话内容"
              placeholder="写下你的经历，或向 CVOS 提问…"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(!!e.target.value);
              }}
              rows={3}
            />
            <button
              className="send"
              type="submit"
              disabled={!draft.trim()}
              aria-label="发送消息"
            >
              ↑
            </button>
          </div>
          <p className="composer-hint">
            发送后，消息与所选资料将传至当前云端模型。AI
            建议需经你确认才能写入资料库。
          </p>
        </form>
      </div>
    </div>
  );
}
function Profile({ state, save, run, apply, setDirty }) {
  const [profile, setProfile] = useState(state.profile),
    [sources, setSources] = useState([]),
    [knowledgeDirty, setKnowledgeDirty] = useState(false);
  const profileDirty =
    JSON.stringify(profile) !== JSON.stringify(state.profile);
  useEffect(() => setProfile(state.profile), [JSON.stringify(state.profile)]);
  async function importFile(f) {
    if (f.size > 12000000) throw new Error("文件最大 12 MB");
    const bytes = new Uint8Array(await f.arrayBuffer());
    let str = "";
    for (let i = 0; i < bytes.length; i += 8192)
      str += String.fromCharCode(...bytes.subarray(i, i + 8192));
    apply(await api("/import/document", { name: f.name, base64: btoa(str) }));
  }
  return (
    <>
      <fieldset disabled={profileDirty}>
        <Knowledge
          {...{ state, save, run }}
          setDirty={(value) => {
            setKnowledgeDirty(value);
            setDirty(value);
          }}
        />
      </fieldset>
      <details className="card identity-details">
        <summary>基本信息、参考文档与 AI 资料建议</summary>
        <fieldset disabled={knowledgeDirty}>
          <div className="profile-layout">
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>基本信息</h2>
                  <p>真实、完整，比措辞更重要。</p>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    run(() => save({ ...state, profile }), "资料已保存")
                  }
                >
                  保存资料
                </button>
              </div>
              <div className="profile-fields">
                {Object.entries(labels)
                  .filter(([k]) =>
                    ["name", "headline", "email", "phone", "location"].includes(
                      k,
                    ),
                  )
                  .map(([key, label]) => (
                    <Field key={key} label={label}>
                      {[
                        "name",
                        "email",
                        "phone",
                        "location",
                        "headline",
                      ].includes(key) ? (
                        <input
                          value={profile[key]}
                          onChange={(e) => {
                            setProfile({ ...profile, [key]: e.target.value });
                            setDirty(true);
                          }}
                          placeholder={
                            key === "headline" ? "例如：AI 产品运营" : ""
                          }
                        />
                      ) : (
                        <textarea
                          rows={key === "notes" ? 6 : 4}
                          value={profile[key]}
                          onChange={(e) => {
                            setProfile({ ...profile, [key]: e.target.value });
                            setDirty(true);
                          }}
                          placeholder={
                            key === "projects"
                              ? "项目背景、你的具体职责、行动与可核实的结果"
                              : ""
                          }
                        />
                      )}
                    </Field>
                  ))}
              </div>
            </section>
            <div className="right-stack">
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>待确认的资料建议</h2>
                    <p>AI 提议，你来决定。</p>
                  </div>
                  <span className="count">
                    {
                      state.proposals.filter((p) => p.status === "pending")
                        .length
                    }
                  </span>
                </div>
                {state.proposals
                  .filter((p) => p.status === "pending")
                  .map((p) => (
                    <div className="proposal" key={p.id}>
                      <p className="muted">{p.reason}</p>
                      {Object.entries(p.patch).map(([k, v]) => (
                        <div className="diff" key={k}>
                          <b>{labels[k]}</b>
                          <del>{p.baseProfile[k] || "（空）"}</del>
                          <ins>{v}</ins>
                        </div>
                      ))}
                      <div className="actions">
                        <button
                          className="secondary"
                          onClick={() =>
                            run(async () =>
                              apply(
                                await api("/proposals/" + p.id, {
                                  action: "reject",
                                }),
                              ),
                            )
                          }
                        >
                          拒绝
                        </button>
                        <button
                          className="primary"
                          onClick={() => {
                            if (
                              JSON.stringify(profile) !==
                              JSON.stringify(state.profile)
                            ) {
                              alert("请先保存或放弃手动编辑，再处理资料建议。");
                              return;
                            }
                            run(async () => {
                              apply(
                                await api("/proposals/" + p.id, {
                                  action: "accept",
                                }),
                              );
                              setDirty(false);
                            }, "已确认并更新资料");
                          }}
                        >
                          确认写入
                        </button>
                      </div>
                    </div>
                  ))}
                {!state.proposals.some((p) => p.status === "pending") && (
                  <Empty icon="check" title="目前没有待确认建议">
                    对话或文档中的经历，可由 AI 整理为建议。
                  </Empty>
                )}
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>参考文档</h2>
                    <p>导入只存档，不会自动覆盖资料。</p>
                  </div>
                  <label className="button-link">
                    导入
                    <input
                      type="file"
                      hidden
                      accept=".pdf,.docx,.txt,.md,.json"
                      onChange={(e) => {
                        const f = e.target.files[0];
                        if (f) run(() => importFile(f), "文档已导入");
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <Sources
                  sources={state.sources}
                  selected={sources}
                  onChange={setSources}
                />
                {state.sources.map((s) => (
                  <details className="source-item" key={s.id}>
                    <summary>{s.name}</summary>
                    <pre>{s.content}</pre>
                    <button
                      className="text-button danger"
                      onClick={() => {
                        if (confirm("删除此参考文档？"))
                          run(() =>
                            save(
                              {
                                ...state,
                                sources: state.sources.filter(
                                  (x) => x.id !== s.id,
                                ),
                              },
                              false,
                            ),
                          );
                      }}
                    >
                      删除文档
                    </button>
                  </details>
                ))}
                <button
                  className="secondary full"
                  disabled={!sources.length}
                  onClick={() =>
                    run(
                      async () =>
                        apply(
                          await api("/ai/proposal", { sourceIds: sources }),
                        ),
                      "修改建议已生成，请逐项核对",
                    )
                  }
                >
                  从所选文档提取资料建议
                </button>
                <p className="hint">
                  所选文档与当前资料将发送至云端模型。扫描 PDF 需先做 OCR。
                </p>
              </section>
            </div>
          </div>
        </fieldset>
      </details>
    </>
  );
}
const blankJob = () => ({
  id: id(),
  company: "",
  title: "",
  jd: "",
  url: "",
  status: "准备中",
  notes: "",
  resumeId: "",
  rawJd: "",
  location: "",
  salary: "",
  requirements: "",
});
function Jobs({ state, save, run, apply, setDirty, onResume, onDraft }) {
  const [job, setJob] = useState(null),
    [changed, setChanged] = useState(false);
  function select(j) {
    if (changed && !confirm("放弃未保存的岗位编辑？")) return;
    setJob({ ...j });
    setChanged(false);
    setDirty(false);
  }
  function change(k, v) {
    setJob({ ...job, [k]: v });
    setChanged(true);
    setDirty(true);
  }
  async function saveJob() {
    const exists = state.jobs.some((j) => j.id === job.id);
    const next = {
      ...state,
      jobs: exists
        ? state.jobs.map((j) => (j.id === job.id ? job : j))
        : [job, ...state.jobs],
    };
    await save(next);
    setChanged(false);
  }
  return (
    <div className="jobs-layout">
      <div className="card">
        <div className="card-heading">
          <h2>
            目标岗位 <span className="count">{state.jobs.length}</span>
          </h2>
          <button
            className="icon-button"
            onClick={() => select(blankJob())}
            aria-label="新增岗位"
          >
            <Icon name="plus" />
          </button>
        </div>
        {state.jobs.length ? (
          state.jobs.map((j) => (
            <button
              className={"job-row " + (job?.id === j.id ? "selected" : "")}
              key={j.id}
              onClick={() => select(j)}
            >
              <span className="company-logo">{j.company?.[0] || "J"}</span>
              <div>
                <b>{j.title || "未命名岗位"}</b>
                <small>{j.company || "未填写公司"}</small>
              </div>
              <span className="status">{j.status}</span>
            </button>
          ))
        ) : (
          <Empty icon="target" title="下一次机会，从这里开始">
            添加岗位 JD，生成专属简历并跟进投递进度。
          </Empty>
        )}
        <button className="secondary full" onClick={() => select(blankJob())}>
          <Icon name="plus" />
          添加目标岗位
        </button>
        <div className="pending-drafts">
          <h3>
            待确认草稿{" "}
            <span className="count">{state.resumeDrafts.length}</span>
          </h3>
          <p className="hint">生成结果暂存在这里，确认后才进入简历库。</p>
          {state.resumeDrafts.map((d) => (
            <button
              className="draft-row"
              key={d.id}
              onClick={() => {
                if (changed && !confirm("放弃未保存的岗位编辑并审核草稿？"))
                  return;
                setDirty(false);
                onDraft(d.id);
              }}
            >
              <b>继续审核：{d.title}</b>
              <small>{new Date(d.updatedAt).toLocaleString("zh-CN")}</small>
            </button>
          ))}
          {!state.resumeDrafts.length && (
            <p className="muted">暂无待确认草稿</p>
          )}
        </div>
      </div>
      {job ? (
        <section className="card job-editor">
          <div className="card-heading">
            <div>
              <h2>{job.title || "新建目标岗位"}</h2>
              <p>先保存岗位，再基于资料库定制。</p>
            </div>
            <button
              className="primary"
              onClick={() => run(saveJob, "岗位已保存")}
            >
              保存岗位
            </button>
          </div>
          <Field label="招聘网页原始文本 · 直接整页粘贴">
            <textarea
              rows={7}
              value={job.rawJd || ""}
              onChange={(e) => change("rawJd", e.target.value)}
              placeholder="在招聘网站全选并复制，粘贴到这里。识别结果会进入下方字段供你核对，原文始终保留。"
            />
          </Field>
          <div className="actions">
            {[
              ["local", "本地整理"],
              ["ai", "AI 智能识别"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                className="secondary"
                disabled={!job.rawJd?.trim()}
                onClick={() =>
                  run(async () => {
                    const result = await api("/jd/parse", {
                      raw: job.rawJd,
                      mode,
                    });
                    if (
                      (job.jd || job.company || job.title) &&
                      !confirm(
                        "用识别结果替换当前岗位字段？原始文本和投递备注会保留。",
                      )
                    )
                      return;
                    setJob({ ...job, ...result });
                    setChanged(true);
                    setDirty(true);
                  }, "已整理，请核对公司、岗位、地点、薪资和要求后保存。")
                }
              >
                {label}
              </button>
            ))}
          </div>
          <p className="hint">
            本地整理无需模型；AI
            识别会发送原始网页文本。未能确认的字段留空，请核对完整性。
          </p>
          <div className="form-grid">
            <Field label="公司">
              <input
                value={job.company}
                onChange={(e) => change("company", e.target.value)}
              />
            </Field>
            <Field label="岗位名称">
              <input
                value={job.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </Field>
            <Field label="工作地点">
              <input
                value={job.location || ""}
                onChange={(e) => change("location", e.target.value)}
              />
            </Field>
            <Field label="薪资">
              <input
                value={job.salary || ""}
                onChange={(e) => change("salary", e.target.value)}
              />
            </Field>
            <Field label="岗位链接">
              <input
                value={job.url}
                onChange={(e) => change("url", e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="投递进度">
              <select
                value={job.status}
                onChange={(e) => change("status", e.target.value)}
              >
                {["准备中", "已投递", "面试中", "已录用", "已结束"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="岗位描述 JD">
            <textarea
              rows={13}
              placeholder="粘贴完整岗位职责与任职要求…"
              value={job.jd}
              onChange={(e) => change("jd", e.target.value)}
            />
          </Field>
          <Field label="任职要求 · 可修改">
            <textarea
              rows={5}
              value={job.requirements || ""}
              onChange={(e) => change("requirements", e.target.value)}
            />
          </Field>
          <Field label="投递备注">
            <textarea
              rows={3}
              placeholder="投递日期、面试安排、后续跟进…"
              value={job.notes}
              onChange={(e) => change("notes", e.target.value)}
            />
          </Field>
          <div className="generation-note">
            <Icon name="lock" />
            <span>
              AI 定制将发送已确认知识正文与此岗位
              JD。只选取原文事实片段；附件不会发送。生成后可编辑与添加照片。
            </span>
          </div>
          <div className="actions">
            <button
              className="text-button danger"
              onClick={() => {
                if (confirm("删除这个岗位？已保存的简历仍会保留。"))
                  run(async () => {
                    await save({
                      ...state,
                      jobs: state.jobs.filter((j) => j.id !== job.id),
                    });
                    setJob(null);
                  });
              }}
            >
              删除岗位
            </button>
            {job.resumeId && (
              <button
                className="secondary"
                onClick={() => onResume(job.resumeId)}
              >
                查看关联简历
              </button>
            )}
            <button
              className="secondary"
              disabled={
                changed ||
                !state.jobs.some((j) => j.id === job.id) ||
                !job.jd.trim()
              }
              onClick={() =>
                run(async () => {
                  const result = apply(
                    await api("/ai/resume", { jobId: job.id, mode: "local" }),
                  );
                  onDraft(result.draftId);
                }, "草稿已生成并校验一页 A4，请核对后确认入库")
              }
            >
              本地生成单页草稿
            </button>
            <button
              className="primary"
              disabled={
                changed ||
                !state.jobs.some((j) => j.id === job.id) ||
                !job.jd.trim()
              }
              onClick={() =>
                run(async () => {
                  const r = apply(await api("/ai/resume", { jobId: job.id }));

                  onDraft(r.draftId);
                }, "草稿已生成，核对后再确认保存到简历库")
              }
            >
              AI 定制单页草稿 <Icon name="arrow" />
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <Empty icon="target" title="为一个岗位，准备一份简历">
            选择左侧岗位，或添加新的目标。
          </Empty>
        </section>
      )}
    </div>
  );
}
function Resumes({
  state,
  save,
  run,
  apply,
  revision,
  setDirty,
  resumeId,
  setResumeId,
  isDraft = false,
  onBack,
  onCreate,
  onConfirmed,
}) {
  const collection = isDraft ? "resumeDrafts" : "resumes";
  const current = state[collection].find((r) => r.id === resumeId);
  const [content, setContent] = useState(current?.content || ""),
    [title, setTitle] = useState(current?.title || ""),
    [photo, setPhoto] = useState(current?.photo || ""),
    [evidence, setEvidence] = useState(current?.evidence || []),
    [changed, setChanged] = useState(false),
    [history, setHistory] = useState(false);
  useEffect(() => {
    setContent(current?.content || "");
    setTitle(current?.title || "");
    setPhoto(current?.photo || "");
    setEvidence(current?.evidence || []);
    setChanged(false);
  }, [current?.id, current?.updatedAt]);
  async function persist(snapshotDraft = false) {
    if (!current) return;
    if (!changed && !(isDraft && snapshotDraft)) return;
    const date = now();
    const r = {
      ...current,
      content,
      title,
      photo,
      evidence,
      updatedAt: date,
      versions:
        !isDraft || snapshotDraft
          ? [
              ...current.versions,
              { id: id(), content, photo, title, evidence, createdAt: date },
            ]
          : current.versions,
    };
    await save({
      ...state,
      [collection]: state[collection].map((x) => (x.id === r.id ? r : x)),
    });
    setChanged(false);
  }
  const select = (r) => {
    if (changed && !confirm("放弃未保存的简历编辑？")) return;
    setDirty(false);
    setChanged(false);
    setHistory(false);
    setResumeId(r.id);
  };
  async function downloadResume(id, format) {
    const response = await fetch("/api/resumes/" + id + "/" + format);
    if (!response.ok)
      throw new Error((await response.json()).error || "导出失败");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = (title || "resume") + "." + format;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function leave() {
    if (changed && !confirm("有尚未保存的编辑，确认放弃这些编辑并返回？"))
      return;
    setDirty(false);
    onBack();
  }
  if (!current) {
    if (isDraft)
      return (
        <section className="card">
          <Empty title="草稿已处理或不存在">返回 JD 定制继续操作。</Empty>
          <button className="secondary" onClick={onBack}>
            返回 JD 定制
          </button>
        </section>
      );
    return (
      <section className="card resume-library">
        <div className="card-heading">
          <div>
            <h2>
              已确认保存的简历{" "}
              <span className="count">{state.resumes.length}</span>
            </h2>
            <p>这里保留你审核后确认保存的简历，打开即可继续编辑。</p>
          </div>
          <button className="primary" onClick={onCreate}>
            按 JD 创建简历
          </button>
        </div>
        <div className="resume-cards">
          {[...state.resumes]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((r) => {
              const job = state.jobs.find((j) => j.id === r.jobId);
              return (
                <button
                  className="resume-card"
                  key={r.id}
                  onClick={() => select(r)}
                  aria-label={"编辑简历 " + r.title}
                >
                  {r.photo && <img src={r.photo} alt="" />}
                  <div>
                    <h3>{r.title}</h3>
                    <p>
                      {job
                        ? [job.company, job.title].filter(Boolean).join(" · ")
                        : r.jobId
                          ? "关联岗位已删除"
                          : "未关联岗位"}
                    </p>
                    <small>
                      更新于 {new Date(r.updatedAt).toLocaleString("zh-CN")}
                      <br />
                      {r.versions.length} 个版本
                    </small>
                    <span className="button-link">打开编辑 →</span>
                  </div>
                </button>
              );
            })}
        </div>
        {!state.resumes.length && (
          <Empty title="还没有确认保存的简历">
            先根据 JD 生成草稿，核对并确认保存后，就会显示在这里。
          </Empty>
        )}
      </section>
    );
  }
  return (
    <div>
      {isDraft && (
        <section className="card draft-notice">
          <h2>待确认草稿</h2>
          <p>
            这份简历尚未进入简历库。你可以修改正文和照片，满意后点击“确认保存到简历库”。
          </p>
          {current.gaps && (
            <details open>
              <summary>需核对的资料缺口</summary>
              <p className="gap-text">{current.gaps}</p>
            </details>
          )}
        </section>
      )}
      <div className="resume-toolbar">
        <button className="secondary" onClick={leave}>
          {isDraft ? "返回 JD 定制" : "返回简历库"}
        </button>
        {current && (
          <>
            {(!isDraft || current.versions.length > 0) && (
              <button
                className="secondary"
                onClick={() => setHistory(!history)}
              >
                {isDraft ? "草稿记录" : "历史版本"} · {current.versions.length}
              </button>
            )}
            {!isDraft && (
              <>
                <button
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      await persist();
                      await downloadResume(current.id, "docx");
                    })
                  }
                >
                  <Icon name="download" />
                  Word
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      await persist();
                      await downloadResume(current.id, "pdf");
                    })
                  }
                >
                  PDF
                </button>
              </>
            )}
            <button
              className="primary"
              disabled={!changed}
              onClick={() =>
                run(persist, isDraft ? "草稿已保存，尚未入库" : "已保存新版本")
              }
            >
              {isDraft ? "保存草稿" : "保存版本"}
              {changed ? " ·" : ""}
            </button>
            {isDraft && (
              <button
                className="primary"
                disabled={!title.trim() || !content.trim()}
                onClick={() =>
                  run(async () => {
                    const result = apply(
                      await api("/resume-drafts/" + current.id + "/confirm", {
                        revision,
                        resume: { title, content, photo, evidence },
                      }),
                    );
                    setDirty(false);
                    setChanged(false);
                    onConfirmed(result.resumeId);
                  }, "已确认保存到简历库")
                }
              >
                确认保存到简历库
              </button>
            )}
          </>
        )}
      </div>
      {history && current && (
        <div className="card version-list">
          <h3>历史版本</h3>
          <p>恢复内容将进入编辑器，保存后创建新版本。</p>
          {[...current.versions].reverse().map((v, i) => (
            <button
              className="secondary"
              key={v.id}
              onClick={() => {
                if (changed && !confirm("放弃当前编辑并载入此历史版本？"))
                  return;
                setContent(v.content);
                setPhoto(v.photo || "");
                setEvidence(v.evidence || []);
                if (v.title) setTitle(v.title);
                setChanged(true);
                setDirty(true);
                setHistory(false);
              }}
            >
              版本 {current.versions.length - i} ·{" "}
              {new Date(v.createdAt).toLocaleString("zh-CN")}
            </button>
          ))}
        </div>
      )}
      {current ? (
        <div className="resume-layout">
          <section className="card resume-editor">
            <div className="card-heading">
              <h2>{isDraft ? "草稿内容" : "简历内容"}</h2>
              <span className="muted">
                {changed ? "尚未保存" : "已保存至本机"}
              </span>
            </div>
            <Field label="简历名称">
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setChanged(true);
                  setDirty(true);
                }}
              />
            </Field>
            <Field label="正文 · 支持简单 Markdown">
              <textarea
                className="resume-text"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setChanged(true);
                  setDirty(true);
                }}
                spellCheck="false"
              />
            </Field>
            <p className="hint">
              # 姓名 · ## 章节 · -
              列表。修改会重新校验实际分页。超页内容必须精简后才能导出；正文最小
              10.5 pt。
            </p>
            <button
              className="secondary full"
              disabled={!content.trim()}
              onClick={() =>
                run(async () => {
                  await persist(true);
                  const result = await api("/compact", {
                    content,
                    photo,
                    jobId: current.jobId || "",
                  });
                  if (result.content !== content) {
                    setContent(result.content);
                    setChanged(true);
                    setDirty(true);
                    alert(
                      "已保留完整事实并精简到一页。请检查后保存新版本。原内容保留在历史版本中。\n\n本次省略的完整片段：\n" +
                        result.omitted.join("\n"),
                    );
                  }
                }, "已校验单页内容，请核对后保存")
              }
            >
              按岗位精简到一页
            </button>
            <PhotoEditor
              key={current.id}
              photo={photo}
              run={run}
              onChange={(value) => {
                setPhoto(value);
                setChanged(true);
                setDirty(true);
              }}
            />
            {current.selectionNote && (
              <p className="hint">生成记录：{current.selectionNote}</p>
            )}
            <details className="evidence">
              <summary>生成时的事实来源 · {evidence.length} 个片段</summary>
              <p className="hint">
                这是生成时的原文快照。手动编辑的新增内容需要你自行核对。
              </p>
              {evidence.map((e, i) => (
                <blockquote key={i}>
                  <b>{e.title}</b>
                  <p>{e.text}</p>
                </blockquote>
              ))}
            </details>
            <button
              className="text-button danger"
              onClick={() => {
                if (
                  confirm(
                    isDraft
                      ? "放弃这份草稿？已确认保存的简历不会改变。"
                      : "删除此简历及全部历史版本？",
                  )
                )
                  run(async () => {
                    await save({
                      ...state,
                      [collection]: state[collection].filter(
                        (r) => r.id !== current.id,
                      ),
                      jobs: state.jobs.map((j) =>
                        j.resumeId === current.id ? { ...j, resumeId: "" } : j,
                      ),
                    });
                    setResumeId("");
                    if (isDraft) onBack();
                  });
              }}
            >
              {isDraft ? "放弃草稿" : "删除简历"}
            </button>
          </section>
          <React.Suspense fallback={<p>正在加载 A4 预览…</p>}>
            <Preview content={content} photo={photo} request={api} />
          </React.Suspense>
        </div>
      ) : (
        <div className="card">
          <Empty title="你的专属简历，将汇聚在这里">
            前往 JD 定制生成草稿，核对后保存到这里。
          </Empty>
        </div>
      )}
    </div>
  );
}
function Settings({
  config,
  state,
  revision,
  session,
  run,
  apply,
  busy,
  onConfig,
  onClose,
}) {
  const [draft, setDraft] = useState(config),
    [changed, setChanged] = useState(false),
    [restore, setRestore] = useState(null);
  const modalRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    modalRef.current?.querySelector("button")?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const handle = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...modalRef.current.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
        ),
      ].filter((el) => el.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [busy, changed]);

  const close = () => {
    if (!busy && (!changed || confirm("放弃未保存的模型设置？"))) onClose();
  };
  function changeProvider(i, k, v) {
    setDraft({
      ...draft,
      providers: draft.providers.map((p, j) =>
        j === i ? { ...p, [k]: v } : p,
      ),
    });
    setChanged(true);
  }
  async function saveConfig() {
    const saved = await api("/settings", draft, "PUT");
    onConfig(saved);
    setDraft(saved);
    setChanged(false);
  }
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="模型与数据设置"
      >
        <div className="card-heading">
          <div>
            <h2>模型与数据设置</h2>
            <p>本地保存，按需连接。</p>
          </div>
          <button
            className="icon-button"
            aria-label="关闭设置"
            onClick={close}
            disabled={busy}
          >
            ×
          </button>
        </div>
        <fieldset disabled={busy}>
          <h3>云端模型</h3>
          <p className="muted">
            支持 OpenAI 兼容接口与
            Anthropic。密钥仅保存在本机，不包含在数据备份中。
          </p>
          {draft.providers.map((p, i) => (
            <div className="provider" key={p.id}>
              <div className="provider-title">
                <label className="check-label">
                  <input
                    type="radio"
                    name="provider"
                    checked={draft.activeId === p.id}
                    onChange={() => {
                      setDraft({ ...draft, activeId: p.id });
                      setChanged(true);
                    }}
                  />
                  使用此模型
                </label>
                <button
                  className="text-button danger"
                  onClick={() => {
                    setDraft({
                      ...draft,
                      activeId: draft.activeId === p.id ? "" : draft.activeId,
                      providers: draft.providers.filter((x) => x.id !== p.id),
                    });
                    setChanged(true);
                  }}
                >
                  移除
                </button>
              </div>
              <div className="form-grid">
                <Field label="显示名称">
                  <input
                    value={p.name}
                    onChange={(e) => changeProvider(i, "name", e.target.value)}
                  />
                </Field>
                <Field label="协议">
                  <select
                    value={p.protocol}
                    onChange={(e) =>
                      changeProvider(i, "protocol", e.target.value)
                    }
                  >
                    <option value="openai">OpenAI 兼容</option>
                    <option value="anthropic">Anthropic Messages</option>
                  </select>
                </Field>
                <Field label="API Base URL（不含请求路径）">
                  <input
                    value={p.baseUrl}
                    onChange={(e) =>
                      changeProvider(i, "baseUrl", e.target.value)
                    }
                    placeholder="https://api.example.com/v1"
                  />
                </Field>
                <Field label="模型 ID">
                  <input
                    value={p.model}
                    onChange={(e) => changeProvider(i, "model", e.target.value)}
                  />
                </Field>
              </div>
              <Field
                label={"API Key" + (p.hasKey ? " · 已保存，留空保留" : "")}
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  value={p.apiKey || ""}
                  onChange={(e) => changeProvider(i, "apiKey", e.target.value)}
                  placeholder={
                    p.hasKey ? "••••••••（留空保留）" : "填写服务商 API Key"
                  }
                />
              </Field>
            </div>
          ))}
          <div className="actions">
            <button
              className="secondary"
              onClick={() => {
                const p = {
                  id: id(),
                  name: "新模型",
                  protocol: "openai",
                  baseUrl: "",
                  model: "",
                  apiKey: "",
                };
                setDraft({
                  ...draft,
                  activeId: draft.activeId || p.id,
                  providers: [...draft.providers, p],
                });
                setChanged(true);
              }}
            >
              添加模型
            </button>
            <button
              className="secondary"
              disabled={changed || !draft.activeId}
              onClick={() => run(() => api("/ai/test"), "模型连接成功")}
            >
              测试已保存配置
            </button>
            <button
              className="primary"
              disabled={!changed}
              onClick={() => run(saveConfig, "模型设置已保存")}
            >
              保存设置
            </button>
          </div>
          <div className="settings-divider" />
          <h3>数据与备份</h3>
          <p className="muted">数据位置</p>
          <code className="data-path">{session.dataDir}</code>
          <p className="hint">
            资料、聊天、岗位和简历都在此目录。代码目录不允许用作数据目录。备份含个人信息，请保管在私人位置。
          </p>
          <div className="actions left">
            <a className="secondary" href="/api/backup" download>
              导出全部数据
            </a>
            <label className="secondary">
              从备份恢复
              <input
                type="file"
                accept=".json"
                hidden
                onChange={(e) => {
                  const f = e.target.files[0];
                  if (f)
                    run(async () => {
                      if (f.size > 128 * 1024 * 1024)
                        throw new Error("备份文件过大");
                      const b = JSON.parse(await f.text());
                      if (
                        b.format !== "cvos" ||
                        ![1, 2].includes(b.version) ||
                        !b.state
                      )
                        throw new Error("不是支持的 CVOS 备份文件");
                      setRestore(b);
                    });
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {restore && (
            <div className="restore-box">
              <h3>确认恢复此备份？</h3>
              <p>
                包含 {restore.state.knowledge?.length || 0} 条知识（含附件）、
                {restore.state.chats?.length || 0} 段对话、
                {restore.version === 2
                  ? restore.state.resumes?.length || 0
                  : 0}{" "}
                份已保存简历、
                {(restore.state.resumeDrafts?.length || 0) +
                  (restore.version === 1
                    ? restore.state.resumes?.length || 0
                    : 0)}{" "}
                份待确认草稿、
                {restore.state.jobs?.length || 0}{" "}
                个岗位。将替换当前数据；恢复前会在本地自动保存副本。模型密钥保持当前设置。
              </p>
              {restore.version === 1 && (
                <p className="hint">
                  旧备份中的简历将恢复为待确认草稿，核对后再保存到简历库。
                </p>
              )}
              <div className="actions">
                <button className="secondary" onClick={() => setRestore(null)}>
                  取消
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    run(async () => {
                      apply(
                        await api("/restore", { backup: restore, revision }),
                      );
                      setRestore(null);
                      onClose();
                    }, "数据已恢复")
                  }
                >
                  确认替换并恢复
                </button>
              </div>
            </div>
          )}
          <p className="hint">
            CVOS {session.version} · 不采集遥测。API Key
            使用本地密钥加密；这不能防止能读取硬盘的其他人解密，请使用系统账户保护与磁盘加密。
          </p>
        </fieldset>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
