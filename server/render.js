import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { dataDir, root } from "./store.js";
import { existsSync } from "node:fs";
import { resumeBlocks, assertTextIntegrity } from "./domain.js";
const exec = promisify(execFile);
const cache = new Map();
let queue = Promise.resolve(),
  pending = 0;
export function engine() {
  const portable = path.join(
    root,
    "..",
    "runtime",
    "LibreOffice.app",
    "Contents",
    "MacOS",
    "soffice",
  );
  return (
    process.env.CVOS_SOFFICE ||
    (process.platform === "darwin" &&
    existsSync("/Applications/LibreOffice.app/Contents/MacOS/soffice")
      ? "/Applications/LibreOffice.app/Contents/MacOS/soffice"
      : null) ||
    (process.platform === "darwin" && existsSync(portable) ? portable : null) ||
    (process.platform === "darwin"
      ? "/Applications/LibreOffice.app/Contents/MacOS/soffice"
      : process.platform === "win32"
        ? "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
        : "soffice")
  );
}
async function convert(dir) {
  const env = { ...process.env };
  if (process.platform === "darwin" && !env.FONTCONFIG_FILE) {
    // Headless macOS engines may only discover their bundled Latin fonts.
    const escape = (value) =>
      value.replace(
        /[&<>"']/g,
        (char) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&apos;",
          })[char],
      );
    const dirs = [
      path.join(os.homedir(), "Library", "Fonts"),
      "/Library/Fonts",
      "/System/Library/Fonts",
    ];
    const cache = path.join(dataDir, "font-cache");
    await fs.mkdir(cache, { recursive: true });
    const config = path.join(dir, "fonts.conf");
    await fs.writeFile(
      config,
      '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig>' +
        dirs.map((d) => "<dir>" + escape(d) + "</dir>").join("") +
        "<cachedir>" +
        escape(cache) +
        "</cachedir></fontconfig>",
    );
    env.FONTCONFIG_FILE = config;
  }
  const args = [
    `-env:UserInstallation=${pathToFileURL(path.join(dir, "profile")).href}`,
    "--headless",
    "--convert-to",
    "pdf",
    "--outdir",
    dir,
    path.join(dir, "resume.docx"),
  ];
  try {
    try {
      await exec(engine(), args, { timeout: 90000, maxBuffer: 200000, env });
    } catch (e) {
      if (e.code !== "ENOENT" || process.env.CVOS_SOFFICE) throw e;
      await exec("soffice", args, { timeout: 90000, maxBuffer: 200000, env });
    }
    return await fs.readFile(path.join(dir, "resume.pdf"));
  } catch (error) {
    throw Object.assign(
      new Error(
        error.killed || error.code === "ETIMEDOUT"
          ? "排版等待超时，请稍后重试。原正文已保留。"
          : "单页排版引擎不可用。请安装 LibreOffice，或用 CVOS_SOFFICE 指定 soffice 路径。正文已保留。",
      ),
      { status: 503 },
    );
  }
}
export async function wordBuffer(content, photo = "", size = 22) {
  const make = (b) =>
    new Paragraph({
      children: [
        new TextRun({
          text: (b.type === "bullet" ? "• " : "") + b.text,
          font: {
            ascii: "Arial",
            hAnsi: "Arial",
            eastAsia: "Noto Sans CJK SC",
            cs: "Arial",
          },
          size: b.type === "title" ? 36 : b.type === "heading" ? 24 : size,
          bold: ["title", "heading"].includes(b.type),
          color: "24292F",
        }),
      ],
      spacing: {
        after: b.type === "heading" ? 70 : 50,
        before: b.type === "heading" ? 110 : 0,
        line: 276,
      },
      keepNext: b.type === "heading" || b.type === "title",
    });
  const blocks = resumeBlocks(content);
  let children = blocks.map(make);
  if (photo) {
    const bytes = Buffer.from(photo.split(",")[1] || "", "base64");
    if (
      bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.length > 750000
    )
      throw new Error("照片格式无效，请重新上传并裁剪。");
    // Bound dimensions before handing the image to an office renderer.
    if (
      bytes.length < 24 ||
      bytes.readUInt32BE(16) > 2000 ||
      bytes.readUInt32BE(20) > 2000
    )
      throw new Error("照片尺寸无效，请重新裁剪。");
    const border = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const headerCount =
      blocks[0]?.type === "title" ? (blocks[1]?.type === "text" ? 2 : 1) : 0;
    children = [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [8000, 1500],
        borders: {
          top: border,
          bottom: border,
          left: border,
          right: border,
          insideHorizontal: border,
          insideVertical: border,
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: headerCount
                  ? blocks.slice(0, headerCount).map(make)
                  : [new Paragraph("")],
                width: { size: 82, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new ImageRun({
                        type: "png",
                        data: bytes,
                        transformation: { width: 83, height: 112 },
                      }),
                    ],
                  }),
                ],
                width: { size: 18, type: WidthType.PERCENTAGE },
              }),
            ],
          }),
        ],
      }),
      ...blocks.slice(headerCount).map(make),
    ];
  }
  return Packer.toBuffer(
    new Document({
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 794, bottom: 794, left: 964, right: 964 },
            },
          },
          children,
        },
      ],
    }),
  );
}
async function render(content, photo, size) {
  await fs.mkdir(path.join(dataDir, "render-tmp"), { recursive: true });
  const dir = await fs.mkdtemp(path.join(dataDir, "render-tmp", "a4-"));
  try {
    const docx = await wordBuffer(content, photo, size);
    await fs.writeFile(path.join(dir, "resume.docx"), docx, { mode: 0o600 });
    const pdf = await convert(dir);
    const task = getDocument({
      data: new Uint8Array(pdf),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    try {
      const doc = await task.promise;
      const page = await doc.getPage(1),
        view = page.view;
      if (
        Math.abs(view[2] - view[0] - 595.3) > 3 ||
        Math.abs(view[3] - view[1] - 841.9) > 3
      )
        throw new Error("排版结果不是 A4，请检查排版引擎。");
      let extracted = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const text = await (await doc.getPage(i)).getTextContent();
        extracted += text.items.map((item) => item.str || "").join("");
      }
      assertTextIntegrity(content, extracted);
      return { docx, pdf, pages: doc.numPages, fontSize: size / 2 };
    } finally {
      await task.destroy();
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
export function renderResume(content, photo = "", size = 22) {
  const key = createHash("sha256")
    .update(JSON.stringify([content, photo, size]))
    .digest("hex");
  if (cache.has(key)) return cache.get(key);
  if (pending >= 8)
    throw Object.assign(new Error("排版请求较多，请稍后重试。"), {
      status: 429,
    });
  pending++;
  // Local single-user renderer: serialize office processes to bound memory use.
  const result = queue.then(() => render(content, photo, size));
  queue = result.catch(() => {}).finally(() => pending--);
  cache.set(key, result);
  if (cache.size > 10) cache.delete(cache.keys().next().value);
  result.catch(() => cache.delete(key));
  return result;
}
export async function checkedResume(content, photo = "") {
  let result = await renderResume(content, photo);
  if (result.pages > 1) result = await renderResume(content, photo, 21);
  return result;
}
export async function fitSelection(profile, units, photo = "") {
  const { compose } = await import("./knowledge.js");
  let selected = [...units];
  while (selected.length) {
    const content = compose(profile, selected);
    const result = await renderResume(content, photo);
    if (result.pages === 1) return { content, selected, ...result };
    // Remove complete low-priority units, never truncate a sentence or shrink below 10.5 pt.
    const drop = Math.max(1, Math.ceil(selected.length * 0.2));
    selected = selected.slice(0, -drop);
  }
  throw new Error(
    "单条经历或基本信息过长，无法完整放入一页。请把长段落拆成简短的事实条目后重试。",
  );
}

export async function compactContent(content, photo = "", jd = "") {
  if ((await renderResume(content, photo)).pages === 1)
    return { content, omitted: [] };
  const lines = content.split("\n").filter((l) => l.trim());
  const firstSection = lines.findIndex((l) => /^#{2,3}\s/.test(l));
  const headerSize =
    firstSection >= 0 ? firstSection : Math.min(2, lines.length);
  const header = lines.slice(0, headerSize),
    units = [];
  let heading = "";
  const words =
    jd.toLowerCase().match(/[a-z0-9+#]{2,}|[\u3400-\u9fff]{2}/g) || [];
  for (const [i, line] of lines.slice(headerSize).entries()) {
    if (/^#{2,3}\s/.test(line)) {
      heading = line;
      continue;
    }
    const hay = (heading + " " + line).toLowerCase();
    units.push({
      i,
      line,
      heading,
      score: words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0),
    });
  }
  let selected = [...units].sort((a, b) => b.score - a.score || a.i - b.i);
  const assemble = () => {
    const result = [...header];
    let last = null;
    for (const u of [...selected].sort((a, b) => a.i - b.i)) {
      if (u.heading && u.heading !== last) {
        result.push(u.heading);
        last = u.heading;
      }
      result.push(u.line);
    }
    return result.join("\n");
  };
  while (selected.length) {
    const proposed = assemble(),
      rendered = await renderResume(proposed, photo);
    if (rendered.pages === 1)
      return {
        content: proposed,
        omitted: units.filter((u) => !selected.includes(u)).map((u) => u.line),
      };
    selected = selected.slice(
      0,
      -Math.max(1, Math.ceil(selected.length * 0.15)),
    );
  }
  throw new Error(
    "基本信息或单条事实过长，请拆分为完整的短句。原内容没有改动。",
  );
}
