# CVOS

**Your career, your story.** 开源、本地优先的 AI 求职管理工作空间。

用对话和文档整理真实经历，建立个人资料库，为不同岗位准备简历。界面采用克制的桌面应用风格，默认不创建账户，也不托管你的个人资料。

> 当前版本：0.1.0，早期可用版本。AI 生成内容需要本人核对。CVOS 不会自动投递职位。

## 快速开始

需要 **Node.js 24.14 或更新的 24.x 版本**、npm、Git。支持运行这些工具的 macOS、Windows 和 Linux；本项目当前在 Apple Silicon macOS 上验证。无需 Docker 或数据库服务。

```sh
git clone https://github.com/ekitou7-design/cvos.git
cd cvos
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:3210 。停止服务：终端按 `Ctrl+C`。

macOS 安装后也可双击 `scripts/start.command`，会构建、启动并打开浏览器。

代码目录外的 `../private-data/` 会自动创建。**个人数据库与密钥永远不能放在代码仓库中。** 如果在外置硬盘使用，请先连接硬盘，在该硬盘上克隆仓库，再运行上述命令。不要在服务运行时拔出硬盘。

自定义数据目录（必须与代码目录隔离）：

```sh
# macOS / Linux，路径仅为示例
CVOS_DATA_DIR="/absolute/private/path/cvos-data" npm start
```

```powershell
# Windows PowerShell
$env:CVOS_DATA_DIR = "D:\CVOS\private-data"
npm start
```

自定义端口：设置 `PORT=3211`。仅监听 `127.0.0.1`，不适合直接暴露到公网或多用户服务器。

## 工作流程

1. **个人资料库**：手动编辑基本信息、教育、实习、项目、技能和自由笔记；点击保存写入本地数据库。
2. **导入材料**：导入 DOCX、文字 PDF、TXT、Markdown、JSON 作为参考文档。导入不自动更新正式资料。扫描 PDF 需要先 OCR，单文件最大 12 MB，PDF 最多 150 页。
3. **AI 对话**：在设置中配置云端模型。选择本次参考资料，发送对话，或从文档提取资料建议。AI 建议显示原值和新值，经你确认后才写入。资料已变动时，旧建议会阻止覆盖。
4. **JD 定制**：粘贴 JD，保存公司、岗位、链接、进度与备注。生成时发送已确认资料和该岗位 JD，结果保存到简历库，资料缺口单独提示。
5. **简历库**：手动编辑正文，实时 A4 分页预览；每次保存建立版本。可载入历史内容并保存为新版本。
6. **导出**：Word 下载 `.docx`；PDF 使用浏览器打印 → 另存为 PDF，选择 A4、100% 缩放、关闭浏览器页眉页脚。Word 与网页使用不同排版引擎，分页可能有差异。
7. **投递管理**：在 JD 定制记录准备中、已投递、面试中、已录用、已结束及备注。没有招聘网站自动投递或状态同步。

## 模型设置

支持多个可切换配置，每个配置独立填写名称、协议、API Base URL、模型 ID 与 API Key。请填写你在服务商账户中可用的准确模型 ID。

- **OpenAI 兼容协议**：Base URL 一般以 `/v1` 结尾，不含 `/chat/completions`；可接入提供该接口的服务商。Gemini 兼容入口可参考其[官方说明](https://ai.google.dev/gemini-api/docs/openai)。不同服务商兼容程度不同。
- **Anthropic Messages**：Base URL 填写 `https://api.anthropic.com/v1`，不含 `/messages`。
- 仅支持 HTTPS，禁止接口重定向。保存后可测试连接；测试会产生一次服务商请求，可能计费。
- 没有 API Key 时，本地编辑、导入、简历新建、版本、导出与备份照常使用，AI 操作会提示配置。

API Key 使用本机独立文件中的密钥做 AES-256-GCM 加密，接口不返回已保存明文。密钥文件与数据库均在私人目录；这不抵抗能读取整个硬盘的攻击者。建议启用磁盘加密。

**本地优先不等于离线 AI**：只有点击 AI 操作才会向所配置的服务商发送消息和所选资料。聊天是否附带个人资料可选择；提取资料建议会发送当前资料与所选材料；JD 生成会发送当前资料和该 JD。没有遥测、云端账户或自动上传 GitHub。

## 导入历史聊天

在 AI 对话左侧选择“导入历史聊天”：

- ChatGPT 导出的 `conversations.json`，有 `current_node` 时沿当前分支导入。
- Claude JSON 中的 `chat_messages`（human / assistant）。
- 通用格式：`{"title":"对话标题","messages":[{"role":"user","content":"我的经历"}]}`。
- TXT / Markdown：作为一条用户消息导入，之后可交给 AI 梳理。

不直接处理 ZIP、聊天网页链接、图片或音频。其他平台可先转成通用 JSON / TXT。请核对来源：聊天中的 AI 回复不等于真实经历。

## 数据备份与恢复

“模型与数据设置 → 导出全部数据”生成带格式版本的 JSON，含资料、聊天、参考文档文字、岗位、简历及历史版本，**不含模型配置和 API Key**。恢复前显示数据数量并要求确认；服务会先将旧数据保存到私人目录的 `backups/`。备份未加密，请自行妥善保管。浏览器下载位置由浏览器设置决定；使用外置硬盘时，导出的 Word、PDF 和 JSON 也请选择硬盘上的私人目录。

完整机器迁移：先停止 CVOS，复制整个 `private-data` 目录至新电脑的代码仓库外。仅复制数据库无法解密模型凭证，需同时复制 `secrets.key`；也可用普通 JSON 备份恢复后重新配置模型。不要在运行中单独复制 SQLite 文件。

## 开发与验证

```sh
npm ci
npm run dev    # 同一个本地端口，Vite 开发界面
npm run check  # 自动化测试 + 生产构建
```

架构：React + Vite 界面、Express 本地服务、Node 内置 SQLite、Zod 输入校验、docx 导出、Mammoth 与 PDF.js 文字提取。SQLite 在当前 Node 24 版本仍可能打印实验性提示；项目锁定运行时下限并通过实际读写测试。没有向量数据库和云数据库依赖。

目录：`src/` 界面，`server/` 本地 API、数据与模型适配，`tests/` 合成资料自动测试。`package-lock.json` 固定依赖；CI 使用 Node 24。

实现与验证分为三个提交阶段：本地数据与安全基础、完整求职流程界面、验证和开源文档。当前迭代不提供富文本拖拽模板、OCR、加密备份、多用户权限或自动投递。

## 安全与参与

参见 [SECURITY.md](SECURITY.md) 和 [CONTRIBUTING.md](CONTRIBUTING.md)。提交问题和截图前请删除个人经历、邮箱、简历、API Key 和备份。不要提交真实私人材料作为测试数据。

MIT License。第三方依赖保留各自许可。

技术参考：[Vite](https://vite.dev/guide/)、[Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)、[docx](https://docx.js.org/)、[Anthropic Messages](https://platform.claude.com/docs/en/api/messages)。
