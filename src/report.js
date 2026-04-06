import { blobToDataUrl, formatBytes, formatDimensions } from "./conversion";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function buildHtmlReport(entries, sourceEntries, manifest) {
  const cards = await Promise.all(
    entries.map(async (entry) => {
      const source = sourceEntries.find((item) => item.id === entry.id);
      const preview = entry.blob ? await blobToDataUrl(entry.blob) : "";
      return `
        <article class="card">
          <img src="${preview}" alt="${escapeHtml(entry.outputName)}" />
          <h2>${escapeHtml(entry.outputName)}</h2>
          <p>元画像: ${escapeHtml(source?.file.name ?? "-")}</p>
          <p>元サイズ: ${escapeHtml(formatBytes(source?.file.size ?? 0))}</p>
          <p>変換後: ${escapeHtml(formatBytes(entry.blob?.size ?? 0))}</p>
          <p>解像度: ${escapeHtml(formatDimensions(entry.width, entry.height))}</p>
        </article>
      `;
    }),
  );

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Image Converter Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #0f1425; color: #f7f7f2; }
    h1 { margin-top: 0; }
    .meta { background: rgba(255,255,255,0.05); border-radius: 16px; padding: 16px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .card { background: rgba(255,255,255,0.05); border-radius: 16px; padding: 16px; }
    img { width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: rgba(255,255,255,0.08); border-radius: 12px; }
    p { margin: 8px 0 0; color: rgba(247,247,242,0.8); }
  </style>
</head>
<body>
  <h1>Image Converter Report</h1>
  <section class="meta">
    <p>生成日時: ${escapeHtml(manifest.generatedAt)}</p>
    <p>出力形式: ${escapeHtml(manifest.settings.outputFormat)}</p>
    <p>変換エンジン: ${escapeHtml(manifest.engine)}</p>
    <p>件数: ${manifest.items.length}</p>
  </section>
  <section class="grid">
    ${cards.join("\n")}
  </section>
</body>
</html>`;
}
