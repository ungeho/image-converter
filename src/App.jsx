import { useEffect, useMemo, useRef, useState } from "react";

const FORMAT_OPTIONS = [
  { value: "image/png", label: "PNG", extension: "png" },
  { value: "image/jpeg", label: "JPEG", extension: "jpg" },
  { value: "image/webp", label: "WebP", extension: "webp" },
];

const DEFAULT_FORMAT = FORMAT_OPTIONS[0].value;

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve({ image, dataUrl: reader.result });
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

function getOutputName(name, extension) {
  const baseName = name.replace(/\.[^.]+$/, "") || "converted-image";
  return `${baseName}.${extension}`;
}

export default function App() {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [outputFormat, setOutputFormat] = useState(DEFAULT_FORMAT);
  const [quality, setQuality] = useState(0.92);
  const [convertedUrl, setConvertedUrl] = useState("");
  const [convertedBlob, setConvertedBlob] = useState(null);
  const [status, setStatus] = useState("画像をドロップ、選択、または貼り付けしてください。");
  const [isConverting, setIsConverting] = useState(false);

  const currentOption = useMemo(
    () => FORMAT_OPTIONS.find((option) => option.value === outputFormat) ?? FORMAT_OPTIONS[0],
    [outputFormat],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (convertedUrl) URL.revokeObjectURL(convertedUrl);
    };
  }, [previewUrl, convertedUrl]);

  useEffect(() => {
    if (!sourceFile) return;

    let isActive = true;

    async function convertImage() {
      setIsConverting(true);
      setStatus("画像を変換中です...");

      try {
        const { image } = await fileToImage(sourceFile);
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas が利用できません。");
        }

        if (outputFormat === "image/jpeg") {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
        }

        context.drawImage(image, 0, 0);
        const blob = await canvasToBlob(canvas, outputFormat, quality);
        const nextUrl = URL.createObjectURL(blob);

        if (!isActive) {
          URL.revokeObjectURL(nextUrl);
          return;
        }

        setConvertedBlob(blob);
        setConvertedUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          return nextUrl;
        });
        setStatus("変換が完了しました。ダウンロードできます。");
      } catch (error) {
        if (!isActive) return;
        setConvertedBlob(null);
        setConvertedUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          return "";
        });
        setStatus(error instanceof Error ? error.message : "変換に失敗しました。");
      } finally {
        if (isActive) {
          setIsConverting(false);
        }
      }
    }

    void convertImage();

    return () => {
      isActive = false;
    };
  }, [sourceFile, outputFormat, quality]);

  useEffect(() => {
    async function onPaste(event) {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      event.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) {
        setStatus("クリップボード内の画像を取得できませんでした。");
        return;
      }

      await loadSource(file, "クリップボード画像を読み込みました。");
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function loadSource(file, nextStatus = "画像を読み込みました。") {
    if (!file.type.startsWith("image/")) {
      setStatus("画像ファイルを選択してください。");
      return;
    }

    setConvertedBlob(null);
    setConvertedUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return "";
    });

    setPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return URL.createObjectURL(file);
    });
    setSourceFile(file);
    setStatus(nextStatus);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void loadSource(file, "ドラッグ＆ドロップで画像を読み込みました。");
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      void loadSource(file, "ファイル選択で画像を読み込みました。");
    }
  }

  const downloadName = sourceFile ? getOutputName(sourceFile.name, currentOption.extension) : "";

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Image Converter</p>
          <h1>ドラッグ＆ドロップと貼り付けで、すぐ画像変換。</h1>
          <p className="lead">
            PNG / JPEG / WebP に対応。画像をドロップするか、クリップボードの画像を
            <kbd>Ctrl</kbd>+<kbd>V</kbd>で貼り付けるだけで出力できます。
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
            onChange={handleFileChange}
          />
          <p className="dropzone-title">ここに画像をドロップ</p>
          <p className="dropzone-text">またはファイル選択 / クリップボード貼り付け</p>
          <div className="dropzone-actions">
            <button type="button" className="primary-button" onClick={() => inputRef.current?.click()}>
              画像を選択
            </button>
            <button type="button" className="ghost-button" onClick={() => window.focus()}>
              貼り付けを待つ
            </button>
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="panel controls-panel">
          <div className="panel-header">
            <h2>変換設定</h2>
            <p>{status}</p>
          </div>

          <label className="field">
            <span>出力形式</span>
            <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)}>
              {FORMAT_OPTIONS.map((option) => (
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

          <p className="hint">
            PNG は可逆圧縮のため品質設定は使われません。JPEG を選ぶと透明部分は白で埋めて出力します。
          </p>

          {convertedUrl && convertedBlob ? (
            <a className="primary-button download-button" href={convertedUrl} download={downloadName}>
              {isConverting ? "変換中..." : `${currentOption.label} をダウンロード`}
            </a>
          ) : (
            <div className="download-placeholder">変換後の画像がここに準備されます。</div>
          )}
        </div>

        <div className="panel preview-panel">
          <div className="preview-grid">
            <article className="preview-card">
              <div className="preview-header">
                <h2>元画像</h2>
                <p>{sourceFile ? `${sourceFile.name} / ${formatBytes(sourceFile.size)}` : "未選択"}</p>
              </div>
              {previewUrl ? (
                <img src={previewUrl} alt="元画像のプレビュー" className="preview-image" />
              ) : (
                <div className="empty-preview">画像を読み込むとここに表示されます。</div>
              )}
            </article>

            <article className="preview-card">
              <div className="preview-header">
                <h2>変換後</h2>
                <p>{convertedBlob ? `${currentOption.label} / ${formatBytes(convertedBlob.size)}` : "未生成"}</p>
              </div>
              {convertedUrl ? (
                <img src={convertedUrl} alt="変換後画像のプレビュー" className="preview-image" />
              ) : (
                <div className="empty-preview">出力プレビューがここに表示されます。</div>
              )}
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
