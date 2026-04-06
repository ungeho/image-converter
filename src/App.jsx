import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState } from "react";

const BASE_FORMAT_OPTIONS = [
  { value: "image/png", label: "PNG", extension: "png" },
  { value: "image/jpeg", label: "JPEG", extension: "jpg" },
  { value: "image/webp", label: "WebP", extension: "webp" },
  { value: "image/avif", label: "AVIF", extension: "avif" },
];

const DEFAULT_FORMAT = BASE_FORMAT_OPTIONS[0].value;

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatDimensions(width, height) {
  if (!width || !height) return "-";
  return `${width} x ${height}`;
}

function getOutputName(name, extension) {
  const baseName = name.replace(/\.[^.]+$/, "") || "converted-image";
  return `${baseName}.${extension}`;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("この形式への変換に失敗しました。"));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function normalizeDimension(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

function getTargetSize(width, height, resizeConfig) {
  if (!resizeConfig.enabled) {
    return { width, height };
  }

  const targetWidth = normalizeDimension(resizeConfig.width);
  const targetHeight = normalizeDimension(resizeConfig.height);

  if (resizeConfig.keepAspect) {
    if (targetWidth && targetHeight) {
      const scale = Math.min(targetWidth / width, targetHeight / height);
      return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      };
    }

    if (targetWidth) {
      const scale = targetWidth / width;
      return {
        width: targetWidth,
        height: Math.max(1, Math.round(height * scale)),
      };
    }

    if (targetHeight) {
      const scale = targetHeight / height;
      return {
        width: Math.max(1, Math.round(width * scale)),
        height: targetHeight,
      };
    }

    return { width, height };
  }

  if (targetWidth && targetHeight) {
    return { width: targetWidth, height: targetHeight };
  }

  return { width, height };
}

function getCompressionLabel(sourceSize, convertedSize) {
  if (!sourceSize || !convertedSize) return "-";
  const delta = convertedSize - sourceSize;
  const ratio = (convertedSize / sourceSize) * 100;

  if (delta === 0) {
    return `同サイズ (${ratio.toFixed(1)}%)`;
  }

  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatBytes(delta)} (${ratio.toFixed(1)}%)`;
}

async function copyBlobToClipboard(blob) {
  if (!navigator.clipboard || typeof window.ClipboardItem === "undefined") {
    throw new Error("このブラウザは画像のクリップボード書き込みに対応していません。");
  }

  await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
}

function canEncodeMimeType(type) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL(type).startsWith(`data:${type}`);
  } catch {
    return false;
  }
}

export default function App() {
  const inputRef = useRef(null);
  const convertedEntriesRef = useRef([]);
  const sourceEntriesRef = useRef([]);
  const [isDragging, setIsDragging] = useState(false);
  const [sourceEntries, setSourceEntries] = useState([]);
  const [convertedEntries, setConvertedEntries] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [outputFormat, setOutputFormat] = useState(DEFAULT_FORMAT);
  const [quality, setQuality] = useState(0.92);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [keepAspect, setKeepAspect] = useState(true);
  const [resizeWidth, setResizeWidth] = useState("");
  const [resizeHeight, setResizeHeight] = useState("");
  const [status, setStatus] = useState("画像をドロップ、選択、または貼り付けしてください。");
  const [isConverting, setIsConverting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [avifSupported, setAvifSupported] = useState(false);

  const formatOptions = useMemo(() => {
    return BASE_FORMAT_OPTIONS.filter((option) => option.value !== "image/avif" || avifSupported);
  }, [avifSupported]);

  const currentOption = useMemo(
    () => formatOptions.find((option) => option.value === outputFormat) ?? formatOptions[0],
    [formatOptions, outputFormat],
  );

  const selectedSource = useMemo(
    () => sourceEntries.find((entry) => entry.id === selectedId) ?? sourceEntries[0] ?? null,
    [selectedId, sourceEntries],
  );

  const selectedConverted = useMemo(
    () => convertedEntries.find((entry) => entry.id === selectedSource?.id) ?? null,
    [convertedEntries, selectedSource],
  );

  useEffect(() => {
    setAvifSupported(canEncodeMimeType("image/avif"));
  }, []);

  useEffect(() => {
    if (!formatOptions.some((option) => option.value === outputFormat)) {
      setOutputFormat(DEFAULT_FORMAT);
    }
  }, [formatOptions, outputFormat]);

  useEffect(() => {
    sourceEntriesRef.current = sourceEntries;
  }, [sourceEntries]);

  useEffect(() => {
    const previous = convertedEntriesRef.current;
    const nextUrls = new Set(convertedEntries.map((entry) => entry.url).filter(Boolean));

    for (const entry of previous) {
      if (entry.url && !nextUrls.has(entry.url)) {
        URL.revokeObjectURL(entry.url);
      }
    }

    convertedEntriesRef.current = convertedEntries;
  }, [convertedEntries]);

  useEffect(() => {
    return () => {
      for (const entry of sourceEntriesRef.current) {
        URL.revokeObjectURL(entry.sourceUrl);
      }

      for (const entry of convertedEntriesRef.current) {
        if (entry.url) {
          URL.revokeObjectURL(entry.url);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!sourceEntries.length) {
      setConvertedEntries([]);
      return;
    }

    let isActive = true;

    async function convertAll() {
      setIsConverting(true);
      setStatus(`${sourceEntries.length}件の画像を変換中です...`);

      try {
        const nextEntries = [];

        for (const entry of sourceEntries) {
          try {
            const image = await fileToImage(entry.file);
            const targetSize = getTargetSize(image.naturalWidth, image.naturalHeight, {
              enabled: resizeEnabled,
              keepAspect,
              width: resizeWidth,
              height: resizeHeight,
            });

            const canvas = document.createElement("canvas");
            canvas.width = targetSize.width;
            canvas.height = targetSize.height;

            const context = canvas.getContext("2d");
            if (!context) {
              throw new Error("Canvas が利用できません。");
            }

            if (outputFormat === "image/jpeg") {
              context.fillStyle = "#ffffff";
              context.fillRect(0, 0, canvas.width, canvas.height);
            }

            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const blob = await canvasToBlob(canvas, outputFormat, quality);

            nextEntries.push({
              id: entry.id,
              blob,
              url: URL.createObjectURL(blob),
              outputName: getOutputName(entry.file.name, currentOption.extension),
              width: canvas.width,
              height: canvas.height,
              error: "",
            });
          } catch (error) {
            nextEntries.push({
              id: entry.id,
              blob: null,
              url: "",
              outputName: getOutputName(entry.file.name, currentOption.extension),
              width: 0,
              height: 0,
              error: error instanceof Error ? error.message : "変換に失敗しました。",
            });
          }
        }

        if (!isActive) {
          for (const entry of nextEntries) {
            if (entry.url) {
              URL.revokeObjectURL(entry.url);
            }
          }
          return;
        }

        setConvertedEntries(nextEntries);
        const successCount = nextEntries.filter((entry) => !entry.error).length;
        setStatus(`${successCount}件の画像変換が完了しました。`);
      } finally {
        if (isActive) {
          setIsConverting(false);
        }
      }
    }

    void convertAll();

    return () => {
      isActive = false;
    };
  }, [sourceEntries, outputFormat, quality, resizeEnabled, keepAspect, resizeWidth, resizeHeight, currentOption.extension]);

  useEffect(() => {
    function onPaste(event) {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageFiles = items
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter(Boolean);

      if (!imageFiles.length) return;

      event.preventDefault();
      void appendFiles(imageFiles, "クリップボード画像を追加しました。");
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function appendFiles(fileList, nextStatus) {
    const imageFiles = Array.from(fileList).filter((file) => file && file.type.startsWith("image/"));
    if (!imageFiles.length) {
      setStatus("画像ファイルを選択してください。");
      return;
    }

    const nextEntries = await Promise.all(
      imageFiles.map(async (file) => {
        const image = await fileToImage(file);
        return {
          id: crypto.randomUUID(),
          file,
          sourceUrl: URL.createObjectURL(file),
          width: image.naturalWidth,
          height: image.naturalHeight,
        };
      }),
    );

    setSourceEntries((previous) => {
      const merged = [...previous, ...nextEntries];
      return merged;
    });
    setSelectedId((previous) => previous || nextEntries[0].id);
    setStatus(nextStatus ?? `${imageFiles.length}件の画像を追加しました。`);
  }

  function removeEntry(id) {
    setSourceEntries((previous) => {
      const target = previous.find((entry) => entry.id === id);
      if (target) {
        URL.revokeObjectURL(target.sourceUrl);
      }

      const filtered = previous.filter((entry) => entry.id !== id);
      if (!filtered.length) {
        setSelectedId("");
      } else if (selectedId === id) {
        setSelectedId(filtered[0].id);
      }
      return filtered;
    });
  }

  function clearAll() {
    for (const entry of sourceEntriesRef.current) {
      URL.revokeObjectURL(entry.sourceUrl);
    }
    setSourceEntries([]);
    setConvertedEntries([]);
    setSelectedId("");
    setStatus("画像をドロップ、選択、または貼り付けしてください。");
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files?.length) {
      void appendFiles(event.dataTransfer.files, `${event.dataTransfer.files.length}件の画像を追加しました。`);
    }
  }

  function handleFileChange(event) {
    if (event.target.files?.length) {
      void appendFiles(event.target.files, `${event.target.files.length}件の画像を追加しました。`);
      event.target.value = "";
    }
  }

  async function handleCopySelected() {
    if (!selectedConverted?.blob) return;

    try {
      await copyBlobToClipboard(selectedConverted.blob);
      setStatus("変換後画像をクリップボードにコピーしました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "クリップボードへのコピーに失敗しました。");
    }
  }

  function handleDownloadAll() {
    const downloadableEntries = convertedEntries.filter((entry) => entry.url && !entry.error);
    downloadableEntries.forEach((entry, index) => {
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = entry.url;
        link.download = entry.outputName;
        link.click();
      }, index * 150);
    });
  }

  async function handleDownloadZip() {
    const downloadableEntries = convertedEntries.filter((entry) => entry.blob && !entry.error);
    if (!downloadableEntries.length) return;

    try {
      setIsZipping(true);
      setStatus(`${downloadableEntries.length}件の画像を ZIP にまとめています...`);

      const zip = new JSZip();
      downloadableEntries.forEach((entry) => {
        zip.file(entry.outputName, entry.blob);
      });

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      link.href = zipUrl;
      link.download = `converted-images-${stamp}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
      setStatus("ZIP を作成してダウンロードしました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ZIP の作成に失敗しました。");
    } finally {
      setIsZipping(false);
    }
  }

  const sourceCount = sourceEntries.length;
  const successCount = convertedEntries.filter((entry) => entry.blob).length;

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Image Converter</p>
          <h1>複数画像をまとめて変換し、そのまま貼り直せます。</h1>
          <p className="lead">
            ドラッグ＆ドロップ、ファイル選択、クリップボード貼り付けに対応。リサイズ、サイズ比較、
            一括ダウンロード、変換後画像のクリップボード再コピーまでブラウザ上で完結します。
          </p>
        </div>

        <div
          className={`dropzone ${isDragging ? "dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) {
              setIsDragging(false);
            }
          }}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
          />
          <p className="dropzone-title">画像をまとめてドロップ</p>
          <p className="dropzone-text">複数選択にも対応。スクリーンショットを貼り付けて追加することもできます。</p>
          <div className="dropzone-actions">
            <button type="button" className="primary-button" onClick={() => inputRef.current?.click()}>
              画像を選択
            </button>
            <button type="button" className="ghost-button" onClick={() => window.focus()}>
              貼り付けを待つ
            </button>
            <button type="button" className="ghost-button" onClick={clearAll} disabled={!sourceCount}>
              すべてクリア
            </button>
          </div>
          <div className="summary-strip">
            <div>
              <strong>{sourceCount}</strong>
              <span>読み込み済み</span>
            </div>
            <div>
              <strong>{successCount}</strong>
              <span>変換済み</span>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace expanded-workspace">
        <div className="panel controls-panel">
          <div className="panel-header">
            <h2>変換設定</h2>
            <p>{status}</p>
          </div>

          <label className="field">
            <span>出力形式</span>
            <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)}>
              {formatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>品質 ({Math.round(quality * 100)}%)</span>
            <input
              type="range"
              min="0.4"
              max="1"
              step="0.01"
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              disabled={outputFormat === "image/png"}
            />
          </label>

          <div className="field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={resizeEnabled}
                onChange={(event) => setResizeEnabled(event.target.checked)}
              />
              <span>リサイズを有効にする</span>
            </label>
          </div>

          {resizeEnabled ? (
            <div className="resize-panel">
              <div className="field-grid">
                <label className="field">
                  <span>幅</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="例: 1200"
                    value={resizeWidth}
                    onChange={(event) => setResizeWidth(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>高さ</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="例: 800"
                    value={resizeHeight}
                    onChange={(event) => setResizeHeight(event.target.value)}
                  />
                </label>
              </div>

              <div className="field checkbox-field">
                <label>
                  <input
                    type="checkbox"
                    checked={keepAspect}
                    onChange={(event) => setKeepAspect(event.target.checked)}
                  />
                  <span>縦横比を維持する</span>
                </label>
              </div>
            </div>
          ) : null}

          <p className="hint">
            PNG は品質設定を使いません。縦横比維持時は、指定サイズの枠に収まるように各画像をリサイズします。
          </p>

          <div className="stacked-actions">
            {selectedConverted?.url ? (
              <a className="primary-button download-button" href={selectedConverted.url} download={selectedConverted.outputName}>
                {isConverting ? "変換中..." : "選択中の画像をダウンロード"}
              </a>
            ) : (
              <div className="download-placeholder">選択中の画像を変換するとここから保存できます。</div>
            )}

            <button
              type="button"
              className="ghost-button wide-button"
              onClick={handleDownloadAll}
              disabled={!successCount}
            >
              変換済みを個別に一括ダウンロード
            </button>
            <button
              type="button"
              className="ghost-button wide-button"
              onClick={handleDownloadZip}
              disabled={!successCount || isZipping}
            >
              {isZipping ? "ZIP を作成中..." : "変換済みを ZIP で保存"}
            </button>
            <button
              type="button"
              className="ghost-button wide-button"
              onClick={handleCopySelected}
              disabled={!selectedConverted?.blob}
            >
              変換後をクリップボードにコピー
            </button>
          </div>
        </div>

        <div className="panel preview-panel">
          <div className="preview-grid">
            <article className="preview-card">
              <div className="preview-header">
                <h2>元画像</h2>
                <p>
                  {selectedSource
                    ? `${selectedSource.file.name} / ${formatBytes(selectedSource.file.size)} / ${formatDimensions(
                        selectedSource.width,
                        selectedSource.height,
                      )}`
                    : "未選択"}
                </p>
              </div>
              {selectedSource ? (
                <img src={selectedSource.sourceUrl} alt="元画像のプレビュー" className="preview-image" />
              ) : (
                <div className="empty-preview">画像を読み込むとここに表示されます。</div>
              )}
            </article>

            <article className="preview-card">
              <div className="preview-header">
                <h2>変換後</h2>
                <p>
                  {selectedConverted?.blob
                    ? `${currentOption.label} / ${formatBytes(selectedConverted.blob.size)} / ${formatDimensions(
                        selectedConverted.width,
                        selectedConverted.height,
                      )}`
                    : "未生成"}
                </p>
              </div>
              {selectedConverted?.url ? (
                <img src={selectedConverted.url} alt="変換後画像のプレビュー" className="preview-image" />
              ) : (
                <div className="empty-preview">
                  {selectedConverted?.error || "出力プレビューがここに表示されます。"}
                </div>
              )}
            </article>
          </div>

          <div className="comparison-card">
            <h2>サイズ比較</h2>
            {selectedSource && selectedConverted?.blob ? (
              <div className="comparison-grid">
                <div className="metric-card">
                  <span>元サイズ</span>
                  <strong>{formatBytes(selectedSource.file.size)}</strong>
                </div>
                <div className="metric-card">
                  <span>変換後</span>
                  <strong>{formatBytes(selectedConverted.blob.size)}</strong>
                </div>
                <div className="metric-card">
                  <span>差分</span>
                  <strong>{getCompressionLabel(selectedSource.file.size, selectedConverted.blob.size)}</strong>
                </div>
                <div className="metric-card">
                  <span>解像度</span>
                  <strong>
                    {formatDimensions(selectedSource.width, selectedSource.height)} →{" "}
                    {formatDimensions(selectedConverted.width, selectedConverted.height)}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="download-placeholder">画像を選ぶと圧縮率と解像度差を確認できます。</div>
            )}
          </div>

          <div className="gallery-card">
            <div className="gallery-header">
              <h2>画像一覧</h2>
              <p>{sourceCount ? `${sourceCount}件の画像を管理中` : "まだ画像はありません"}</p>
            </div>
            <div className="gallery-list">
              {sourceEntries.length ? (
                sourceEntries.map((entry) => {
                  const converted = convertedEntries.find((item) => item.id === entry.id);
                  const isSelected = selectedSource?.id === entry.id;

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`gallery-item ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedId(entry.id)}
                    >
                      <img src={entry.sourceUrl} alt="" className="gallery-thumb" />
                      <div className="gallery-meta">
                        <strong>{entry.file.name}</strong>
                        <span>{formatBytes(entry.file.size)}</span>
                        <span>
                          {converted?.blob
                            ? `${currentOption.label} / ${formatBytes(converted.blob.size)}`
                            : converted?.error || "変換待ち"}
                        </span>
                      </div>
                      <span className="gallery-badges">
                        {converted?.blob ? "Ready" : isConverting ? "..." : "Pending"}
                      </span>
                      <span
                        className="remove-chip"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeEntry(entry.id);
                        }}
                      >
                        削除
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="empty-gallery">複数画像を追加すると、ここから個別に確認できます。</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
