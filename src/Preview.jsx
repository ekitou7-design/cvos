import React, { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerURL;
export default function Preview({ content, photo, request }) {
  const [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const host = useRef(null);
  useEffect(() => {
    let cancelled = false,
      task;
    setResult(null);
    setError("");
    setLoading(true);
    if (host.current) host.current.replaceChildren();
    const timer = setTimeout(async () => {
      if (!content.trim()) {
        setLoading(false);
        return;
      }
      try {
        const data = await request("/render", { content, photo });
        if (cancelled) return;
        task = getDocument({
          data: Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0)),
          isEvalSupported: false,
        });
        const pdf = await task.promise;
        for (let i = 1; i <= Math.min(data.pages, 3); i++) {
          if (cancelled || !host.current) break;
          const page = await pdf.getPage(i),
            viewport = page.getViewport({ scale: 1.3 });
          if (cancelled || !host.current) break;
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.setAttribute("aria-label", `A4 简历第 ${i} 页`);
          canvas.setAttribute("role", "img");
          host.current.appendChild(canvas);
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
          }).promise;
        }
        if (!cancelled) {
          setResult(data);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      } finally {
        await task?.destroy();
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [content, photo]);
  return (
    <div className="preview-area actual-preview">
      <div className="preview-label">
        A4 · 实际导出预览{" "}
        <span>
          {loading
            ? "正在校验排版…"
            : result
              ? `${result.pages} 页 · 正文 ${result.fontSize} pt`
              : "等待正文"}
        </span>
      </div>
      {error && <p className="notice error">{error}</p>}
      {result?.pages > 1 && (
        <p className="notice error">
          正文超过一页，请精简后导出。没有隐藏或截断内容。
          {result.pages > 3 ? "预览仅显示前 3 页。" : ""}
        </p>
      )}
      <div className="actual-pages" ref={host} />
      {result?.pages === 1 && (
        <p className="hint">
          已验证一页 A4。Word 与 PDF 来自同一次排版；其他电脑的 Word
          重新排版可能受字体影响。
        </p>
      )}
    </div>
  );
}
