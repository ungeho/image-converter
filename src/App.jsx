import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BASE_FORMAT_OPTIONS,
  DEFAULT_FORMAT,
  DEFAULT_PRESET,
  DEFAULT_TRANSFORM,
  PRESET_OPTIONS,
  RESIZE_MODE_OPTIONS,
  buildManifest,
  canEncodeMimeType,
  convertEntryOnMainThread,
  copyBlobToClipboard,
  createWorker,
  fileToImage,
  formatBytes,
  formatDimensions,
  getCompressionLabel,
  getExifOrientation,
  getOutputName,
  readFileAsArrayBuffer,
} from "./conversion";
import { buildHtmlReport } from "./report";

function mergeConvertedEntries(previousEntries, incomingEntries) {
  const nextById = new Map(previousEntries.map((entry) => [entry.id, entry]));
  for (const entry of incomingEntries) {
    const previous = nextById.get(entry.id);
    if (previous?.url && previous.url !== entry.url) URL.revokeObjectURL(previous.url);
    nextById.set(entry.id, entry);
  }
  return Array.from(nextById.values());
}

function moveItem(list, from, to) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function App() {
  const inputRef = useRef(null);
  const workerRef = useRef(null);
  const convertedEntriesRef = useRef([]);
  const sourceEntriesRef = useRef([]);
  const [isDragging, setIsDragging] = useState(false);
  const [sourceEntries, setSourceEntries] = useState([]);
  const [convertedEntries, setConvertedEntries] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [outputFormat, setOutputFormat] = useState(DEFAULT_FORMAT);
  const [quality, setQuality] = useState(0.92);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [resizeMode, setResizeMode] = useState("contain");
  const [keepAspect, setKeepAspect] = useState(true);
  const [resizeWidth, setResizeWidth] = useState("");
  const [resizeHeight, setResizeHeight] = useState("");
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [status, setStatus] = useState("画像をドロップ、選択、または貼り付けしてください。");
  const [isConverting, setIsConverting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [avifSupported, setAvifSupported] = useState(false);
  const [conversionEngine, setConversionEngine] = useState("main-thread");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [conversionTrigger, setConversionTrigger] = useState({ mode: "all", nonce: 0 });
  const [comparePosition, setComparePosition] = useState(50);

  const formatOptions = useMemo(
    () => BASE_FORMAT_OPTIONS.filter((option) => option.value !== "image/avif" || avifSupported),
    [avifSupported],
  );
  const availablePresets = useMemo(
    () =>
      PRESET_OPTIONS.filter((option) => {
        if (!option.requires) return true;
        return formatOptions.some((format) => format.value === option.requires);
      }),
    [formatOptions],
  );
  const currentOption = useMemo(
    () => formatOptions.find((option) => option.value === outputFormat) ?? formatOptions[0],
    [formatOptions, outputFormat],
  );
  const currentPreset = useMemo(
    () => availablePresets.find((option) => option.value === preset) ?? availablePresets[0],
    [availablePresets, preset],
  );
  const selectedSource = useMemo(
    () => sourceEntries.find((entry) => entry.id === selectedId) ?? sourceEntries[0] ?? null,
    [selectedId, sourceEntries],
  );
  const selectedConverted = useMemo(
    () => convertedEntries.find((entry) => entry.id === selectedSource?.id) ?? null,
    [convertedEntries, selectedSource],
  );
  const failedEntries = useMemo(() => convertedEntries.filter((entry) => entry.error), [convertedEntries]);

  useEffect(() => {
    setAvifSupported(canEncodeMimeType("image/avif"));
    workerRef.current = createWorker();
    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (!formatOptions.some((option) => option.value === outputFormat)) setOutputFormat(DEFAULT_FORMAT);
  }, [formatOptions, outputFormat]);

  useEffect(() => {
    if (!availablePresets.some((option) => option.value === preset)) setPreset(DEFAULT_PRESET);
  }, [availablePresets, preset]);

  useEffect(() => {
    sourceEntriesRef.current = sourceEntries;
  }, [sourceEntries]);

  useEffect(() => {
    const previous = convertedEntriesRef.current;
    const nextUrls = new Set(convertedEntries.map((entry) => entry.url).filter(Boolean));
    for (const entry of previous) {
      if (entry.url && !nextUrls.has(entry.url)) URL.revokeObjectURL(entry.url);
    }
    convertedEntriesRef.current = convertedEntries;
  }, [convertedEntries]);

  useEffect(() => {
    return () => {
      for (const entry of sourceEntriesRef.current) URL.revokeObjectURL(entry.sourceUrl);
      for (const entry of convertedEntriesRef.current) {
        if (entry.url) URL.revokeObjectURL(entry.url);
      }
    };
  }, []);

  useEffect(() => {
    if (preset === "custom") return;
    const presetOption = availablePresets.find((option) => option.value === preset);
    if (!presetOption?.settings) return;
    setOutputFormat(presetOption.settings.outputFormat);
    setQuality(presetOption.settings.quality);
    setResizeEnabled(presetOption.settings.resizeEnabled);
    setResizeMode(presetOption.settings.resizeMode ?? "contain");
    setKeepAspect(presetOption.settings.keepAspect);
    setResizeWidth(presetOption.settings.resizeWidth);
    setResizeHeight(presetOption.settings.resizeHeight);
  }, [availablePresets, preset]);

  useEffect(() => {
    setConversionTrigger((previous) => ({ mode: "all", nonce: previous.nonce + 1 }));
  }, [sourceEntries, outputFormat, quality, resizeEnabled, resizeMode, keepAspect, resizeWidth, resizeHeight, currentOption.extension]);

  useEffect(() => {
    if (!sourceEntries.length) {
      setConvertedEntries([]);
      setProgress({ completed: 0, total: 0 });
      return;
    }

    const targetEntries =
      conversionTrigger.mode === "failed"
        ? sourceEntries.filter((entry) => convertedEntriesRef.current.find((item) => item.id === entry.id)?.error)
        : sourceEntries;
    if (!targetEntries.length) return;

    let isActive = true;
    const options = {
      outputFormat,
      quality,
      resizeConfig: {
        enabled: resizeEnabled,
        mode: resizeMode,
        keepAspect,
        width: resizeWidth,
        height: resizeHeight,
      },
    };

    async function convertWithWorker(extension) {
      const worker = workerRef.current;
      if (!worker) throw new Error("No worker");

      const payloadEntries = await Promise.all(
        targetEntries.map(async (entry) => ({
          id: entry.id,
          fileName: entry.file.name,
          fileType: entry.file.type,
          transform: entry.transform,
          buffer: await readFileAsArrayBuffer(entry.file),
        })),
      );

      return await new Promise((resolve, reject) => {
        const onMessage = (event) => {
          if (event.data?.type === "progress") {
            setProgress({ completed: event.data.completed, total: event.data.total });
            setStatus(`${event.data.completed} / ${event.data.total} 件を変換中です...`);
            return;
          }
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          if (event.data?.type !== "complete") {
            reject(new Error(event.data?.message ?? "Worker conversion failed"));
            return;
          }
          resolve(
            event.data.entries.map((entry) => {
              const blob = entry.buffer ? new Blob([entry.buffer], { type: outputFormat }) : null;
              return {
                id: entry.id,
                blob,
                url: blob ? URL.createObjectURL(blob) : "",
                outputName: entry.outputName,
                width: entry.width,
                height: entry.height,
                error: entry.error,
                engine: "worker",
                orientation: entry.orientation,
              };
            }),
          );
        };
        const onError = (event) => {
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          reject(event.error ?? new Error("Worker での変換に失敗しました。"));
        };
        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onError);
        worker.postMessage(
          { type: "convert", outputFormat, quality, extension, resizeConfig: options.resizeConfig, entries: payloadEntries },
          payloadEntries.map((entry) => entry.buffer),
        );
      });
    }

    async function convertOnMainThread(extension) {
      const nextEntries = [];
      for (let index = 0; index < targetEntries.length; index += 1) {
        const entry = targetEntries[index];
        setProgress({ completed: index, total: targetEntries.length });
        setStatus(`${index} / ${targetEntries.length} 件を変換中です...`);
        try {
          const converted = await convertEntryOnMainThread(entry, options, extension);
          nextEntries.push({ ...converted, url: URL.createObjectURL(converted.blob) });
        } catch (error) {
          nextEntries.push({
            id: entry.id,
            blob: null,
            url: "",
            outputName: getOutputName(entry.file.name, extension),
            width: 0,
            height: 0,
            error: error instanceof Error ? error.message : "変換に失敗しました。",
            engine: "main-thread",
            orientation: entry.orientation ?? 1,
          });
        }
        setProgress({ completed: index + 1, total: targetEntries.length });
      }
      return nextEntries;
    }

    async function runConversion() {
      setIsConverting(true);
      setProgress({ completed: 0, total: targetEntries.length });
      setStatus(
        conversionTrigger.mode === "failed"
          ? `${targetEntries.length}件の失敗画像を再試行しています...`
          : `${targetEntries.length}件の画像を変換中です...`,
      );
      const extension = currentOption.extension;

      try {
        let nextEntries;
        try {
          nextEntries = await convertWithWorker(extension);
          setConversionEngine("worker");
        } catch {
          nextEntries = await convertOnMainThread(extension);
          setConversionEngine("main-thread");
        }

        if (!isActive) {
          for (const entry of nextEntries) {
            if (entry.url) URL.revokeObjectURL(entry.url);
          }
          return;
        }

        setConvertedEntries((previous) => (conversionTrigger.mode === "failed" ? mergeConvertedEntries(previous, nextEntries) : nextEntries));

        const merged = conversionTrigger.mode === "failed" ? mergeConvertedEntries(convertedEntriesRef.current, nextEntries) : nextEntries;
        const failCount = merged.filter((entry) => entry.error).length;
        const successCount = merged.filter((entry) => !entry.error).length;
        setStatus(failCount ? `${successCount}件成功、${failCount}件失敗しました。失敗分だけ再試行できます。` : `${successCount}件の画像変換が完了しました。`);
      } finally {
        if (isActive) setIsConverting(false);
      }
    }

    void runConversion();
    return () => {
      isActive = false;
    };
  }, [conversionTrigger, currentOption.extension, keepAspect, outputFormat, quality, resizeEnabled, resizeHeight, resizeMode, resizeWidth, sourceEntries]);

  useEffect(() => {
    function onPaste(event) {
      const imageFiles = Array.from(event.clipboardData?.items ?? [])
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
        const [image, buffer] = await Promise.all([fileToImage(file), readFileAsArrayBuffer(file)]);
        return {
          id: crypto.randomUUID(),
          file,
          sourceUrl: URL.createObjectURL(file),
          width: image.naturalWidth,
          height: image.naturalHeight,
          orientation: getExifOrientation(buffer),
          transform: { ...DEFAULT_TRANSFORM },
        };
      }),
    );

    setSourceEntries((previous) => [...previous, ...nextEntries]);
    setSelectedId((previous) => previous || nextEntries[0].id);
    setStatus(nextStatus ?? `${imageFiles.length}件の画像を追加しました。`);
  }

  function removeEntry(id) {
    setSourceEntries((previous) => {
      const target = previous.find((entry) => entry.id === id);
      if (target) URL.revokeObjectURL(target.sourceUrl);
      const filtered = previous.filter((entry) => entry.id !== id);
      if (!filtered.length) setSelectedId("");
      else if (selectedId === id) setSelectedId(filtered[0].id);
      return filtered;
    });
    setConvertedEntries((previous) => previous.filter((entry) => entry.id !== id));
  }

  function clearAll() {
    for (const entry of sourceEntriesRef.current) URL.revokeObjectURL(entry.sourceUrl);
    setSourceEntries([]);
    setConvertedEntries([]);
    setSelectedId("");
    setStatus("画像をドロップ、選択、または貼り付けしてください。");
    setProgress({ completed: 0, total: 0 });
  }

  function updateSelectedTransform(nextTransform) {
    if (!selectedId) return;
    setSourceEntries((previous) =>
      previous.map((entry) =>
        entry.id === selectedId
          ? { ...entry, transform: { ...entry.transform, ...nextTransform } }
          : entry,
      ),
    );
  }

  function moveEntry(id, direction) {
    setSourceEntries((previous) => {
      const index = previous.findIndex((entry) => entry.id === id);
      if (index < 0) return previous;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= previous.length) return previous;
      return moveItem(previous, index, nextIndex);
    });
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

  function touchCustomPreset() {
    setPreset("custom");
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

  function handleRetryFailed() {
    if (!failedEntries.length || isConverting) return;
    setConversionTrigger((previous) => ({ mode: "failed", nonce: previous.nonce + 1 }));
  }

  function handleDownloadAll() {
    sourceEntries
      .map((source) => convertedEntries.find((entry) => entry.id === source.id))
      .filter((entry) => entry?.url && !entry.error)
      .forEach((entry, index) => {
        window.setTimeout(() => {
          const link = document.createElement("a");
          link.href = entry.url;
          link.download = entry.outputName;
          link.click();
        }, index * 150);
      });
  }

  async function handleDownloadZip() {
    const downloadableEntries = sourceEntries
      .map((source) => convertedEntries.find((entry) => entry.id === source.id))
      .filter((entry) => entry?.blob && !entry.error);
    if (!downloadableEntries.length) return;

    try {
      setIsZipping(true);
      setStatus(`${downloadableEntries.length}件の画像を ZIP にまとめています...`);
      const zip = new JSZip();
      downloadableEntries.forEach((entry) => zip.file(entry.outputName, entry.blob));
      const manifest = buildManifest(
        downloadableEntries,
        sourceEntries,
        { preset, outputFormat, quality, resizeEnabled, resizeMode, keepAspect, resizeWidth, resizeHeight },
        conversionEngine,
      );
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      zip.file("report.html", await buildHtmlReport(downloadableEntries, sourceEntries, manifest));

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      link.href = zipUrl;
      link.download = `converted-images-${stamp}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
      setStatus("manifest.json と report.html を含む ZIP をダウンロードしました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ZIP の作成に失敗しました。");
    } finally {
      setIsZipping(false);
    }
  }

  const sourceCount = sourceEntries.length;
  const successCount = convertedEntries.filter((entry) => entry.blob).length;
  const progressPercent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const selectedTransform = selectedSource?.transform ?? DEFAULT_TRANSFORM;

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Image Converter</p>
          <h1>複数画像をまとめて変換し、そのまま貼り直せます。</h1>
          <p className="lead">並び替え、回転・反転、比較スライダー、ZIP レポート、PWA 対応までブラウザ上で完結します。</p>
        </div>

        <div
          className={`dropzone ${isDragging ? "dragging" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          <input ref={inputRef} className="sr-only" type="file" accept="image/*" multiple onChange={handleFileChange} />
          <p className="dropzone-title">画像をまとめてドロップ</p>
          <p className="dropzone-text">複数選択にも対応。スクリーンショットを貼り付けて追加することもできます。</p>
          <div className="dropzone-actions">
            <button type="button" className="primary-button" onClick={() => inputRef.current?.click()}>画像を選択</button>
            <button type="button" className="ghost-button" onClick={() => window.focus()}>貼り付けを待つ</button>
            <button type="button" className="ghost-button" onClick={clearAll} disabled={!sourceCount}>すべてクリア</button>
          </div>
          <div className="summary-strip">
            <div><strong>{sourceCount}</strong><span>読み込み済み</span></div>
            <div><strong>{successCount}</strong><span>変換済み</span></div>
          </div>
        </div>
      </section>

      <section className="workspace expanded-workspace">
        <div className="panel controls-panel">
          <div className="panel-header">
            <h2>変換設定</h2>
            <p>{status}</p>
          </div>

          <div className="progress-card">
            <div className="progress-row">
              <span>進捗</span>
              <strong>{progress.total ? `${progress.completed} / ${progress.total}` : "待機中"}</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <label className="field">
            <span>プリセット</span>
            <select value={preset} onChange={(event) => setPreset(event.target.value)}>
              {availablePresets.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <p className="preset-note">{currentPreset?.description}</p>

          <label className="field">
            <span>出力形式</span>
            <select value={outputFormat} onChange={(event) => { touchCustomPreset(); setOutputFormat(event.target.value); }}>
              {formatOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className="field">
            <span>品質 ({Math.round(quality * 100)}%)</span>
            <input type="range" min="0.4" max="1" step="0.01" value={quality} onChange={(event) => { touchCustomPreset(); setQuality(Number(event.target.value)); }} disabled={outputFormat === "image/png"} />
          </label>

          <div className="field checkbox-field">
            <label>
              <input type="checkbox" checked={resizeEnabled} onChange={(event) => { touchCustomPreset(); setResizeEnabled(event.target.checked); }} />
              <span>リサイズを有効にする</span>
            </label>
          </div>

          {resizeEnabled ? (
            <div className="resize-panel">
              <label className="field">
                <span>リサイズモード</span>
                <select value={resizeMode} onChange={(event) => { touchCustomPreset(); setResizeMode(event.target.value); }}>
                  {RESIZE_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <div className="field-grid">
                <label className="field">
                  <span>{resizeMode === "scale" ? "倍率(%)" : "幅 / 基準値"}</span>
                  <input type="number" min="1" placeholder="例: 1200" value={resizeWidth} onChange={(event) => { touchCustomPreset(); setResizeWidth(event.target.value); }} />
                </label>
                <label className="field">
                  <span>{resizeMode === "contain" || resizeMode === "exact" ? "高さ" : "予備"}</span>
                  <input type="number" min="1" placeholder="例: 800" value={resizeHeight} disabled={!(resizeMode === "contain" || resizeMode === "exact")} onChange={(event) => { touchCustomPreset(); setResizeHeight(event.target.value); }} />
                </label>
              </div>

              {(resizeMode === "contain" || resizeMode === "exact") ? (
                <div className="field checkbox-field">
                  <label>
                    <input type="checkbox" checked={keepAspect} disabled={resizeMode === "exact"} onChange={(event) => { touchCustomPreset(); setKeepAspect(event.target.checked); }} />
                    <span>縦横比を維持する</span>
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="transform-card">
            <div className="progress-row">
              <span>選択中の画像調整</span>
              <strong>{selectedSource ? "有効" : "未選択"}</strong>
            </div>
            <div className="mini-actions">
              <button type="button" className="ghost-button mini-button" disabled={!selectedSource} onClick={() => updateSelectedTransform({ rotation: (selectedTransform.rotation + 270) % 360 })}>左回転</button>
              <button type="button" className="ghost-button mini-button" disabled={!selectedSource} onClick={() => updateSelectedTransform({ rotation: (selectedTransform.rotation + 90) % 360 })}>右回転</button>
              <button type="button" className="ghost-button mini-button" disabled={!selectedSource} onClick={() => updateSelectedTransform({ flipH: !selectedTransform.flipH })}>左右反転</button>
              <button type="button" className="ghost-button mini-button" disabled={!selectedSource} onClick={() => updateSelectedTransform({ flipV: !selectedTransform.flipV })}>上下反転</button>
            </div>
          </div>

          <div className="engine-note"><span>変換エンジン</span><strong>{conversionEngine === "worker" ? "Web Worker" : "Main Thread"}</strong></div>
          <div className="engine-note"><span>失敗画像</span><strong>{failedEntries.length}件</strong></div>
          <p className="hint">ZIP 保存時には `manifest.json` に加えて `report.html` も同梱されます。JPEG の EXIF 向きは自動補正します。</p>

          <div className="stacked-actions">
            {selectedConverted?.url ? (
              <a className="primary-button download-button" href={selectedConverted.url} download={selectedConverted.outputName}>
                {isConverting ? "変換中..." : "選択中の画像をダウンロード"}
              </a>
            ) : <div className="download-placeholder">選択中の画像を変換するとここから保存できます。</div>}

            <button type="button" className="ghost-button wide-button" onClick={handleRetryFailed} disabled={!failedEntries.length || isConverting}>失敗画像だけ再試行</button>
            <button type="button" className="ghost-button wide-button" onClick={handleDownloadAll} disabled={!successCount}>変換済みを個別に一括ダウンロード</button>
            <button type="button" className="ghost-button wide-button" onClick={handleDownloadZip} disabled={!successCount || isZipping}>{isZipping ? "ZIP を作成中..." : "manifest と HTML レポート付き ZIP を保存"}</button>
            <button type="button" className="ghost-button wide-button" onClick={handleCopySelected} disabled={!selectedConverted?.blob}>変換後をクリップボードにコピー</button>
          </div>
        </div>

        <div className="panel preview-panel">
          <div className="preview-grid">
            <article className="preview-card">
              <div className="preview-header">
                <h2>元画像</h2>
                <p>{selectedSource ? `${selectedSource.file.name} / ${formatBytes(selectedSource.file.size)} / ${formatDimensions(selectedSource.width, selectedSource.height)} / EXIF:${selectedSource.orientation ?? 1}` : "未選択"}</p>
              </div>
              {selectedSource ? <img src={selectedSource.sourceUrl} alt="元画像のプレビュー" className="preview-image" /> : <div className="empty-preview">画像を読み込むとここに表示されます。</div>}
            </article>

            <article className="preview-card">
              <div className="preview-header">
                <h2>変換後</h2>
                <p>{selectedConverted?.blob ? `${currentOption.label} / ${formatBytes(selectedConverted.blob.size)} / ${formatDimensions(selectedConverted.width, selectedConverted.height)}` : "未生成"}</p>
              </div>
              {selectedConverted?.url ? <img src={selectedConverted.url} alt="変換後画像のプレビュー" className="preview-image" /> : <div className="empty-preview">{selectedConverted?.error || "出力プレビューがここに表示されます。"}</div>}
            </article>
          </div>

          <div className="comparison-card">
            <h2>比較スライダー</h2>
            {selectedSource && selectedConverted?.url ? (
              <>
                <div className="compare-stage">
                  <img src={selectedSource.sourceUrl} alt="元画像比較" className="compare-image" />
                  <div className="compare-overlay" style={{ width: `${comparePosition}%` }}>
                    <img src={selectedConverted.url} alt="変換後比較" className="compare-image" />
                  </div>
                  <div className="compare-handle" style={{ left: `${comparePosition}%` }} />
                </div>
                <input className="compare-range" type="range" min="0" max="100" value={comparePosition} onChange={(event) => setComparePosition(Number(event.target.value))} />
              </>
            ) : <div className="download-placeholder">元画像と変換後画像が揃うと比較できます。</div>}
          </div>

          <div className="comparison-card">
            <h2>サイズ比較</h2>
            {selectedSource && selectedConverted?.blob ? (
              <div className="comparison-grid">
                <div className="metric-card"><span>元サイズ</span><strong>{formatBytes(selectedSource.file.size)}</strong></div>
                <div className="metric-card"><span>変換後</span><strong>{formatBytes(selectedConverted.blob.size)}</strong></div>
                <div className="metric-card"><span>差分</span><strong>{getCompressionLabel(selectedSource.file.size, selectedConverted.blob.size)}</strong></div>
                <div className="metric-card"><span>解像度</span><strong>{formatDimensions(selectedSource.width, selectedSource.height)} → {formatDimensions(selectedConverted.width, selectedConverted.height)}</strong></div>
              </div>
            ) : <div className="download-placeholder">画像を選ぶと圧縮率と解像度差を確認できます。</div>}
          </div>

          <div className="gallery-card">
            <div className="gallery-header">
              <h2>画像一覧</h2>
              <p>{sourceCount ? `${sourceCount}件の画像を管理中` : "まだ画像はありません"}</p>
            </div>
            <div className="gallery-list">
              {sourceEntries.length ? sourceEntries.map((entry, index) => {
                const converted = convertedEntries.find((item) => item.id === entry.id);
                const isSelected = selectedSource?.id === entry.id;
                return (
                  <button key={entry.id} type="button" className={`gallery-item ${isSelected ? "selected" : ""}`} onClick={() => setSelectedId(entry.id)}>
                    <img src={entry.sourceUrl} alt="" className="gallery-thumb" />
                    <div className="gallery-meta">
                      <strong>{entry.file.name}</strong>
                      <span>{formatBytes(entry.file.size)}</span>
                      <span>{converted?.blob ? `${currentOption.label} / ${formatBytes(converted.blob.size)} / ${converted.engine === "worker" ? "Worker" : "Main"}` : converted?.error || "変換待ち"}</span>
                    </div>
                    <span className={`gallery-badges ${converted?.error ? "error" : ""}`}>{converted?.blob ? "Ready" : converted?.error ? "Error" : isConverting ? "..." : "Pending"}</span>
                    <div className="list-controls">
                      <span className="order-chip" onClick={(event) => { event.stopPropagation(); moveEntry(entry.id, "up"); }}>{index === 0 ? "-" : "↑"}</span>
                      <span className="order-chip" onClick={(event) => { event.stopPropagation(); moveEntry(entry.id, "down"); }}>{index === sourceEntries.length - 1 ? "-" : "↓"}</span>
                      <span className="remove-chip" onClick={(event) => { event.stopPropagation(); removeEntry(entry.id); }}>削除</span>
                    </div>
                  </button>
                );
              }) : <div className="empty-gallery">複数画像を追加すると、ここから個別に確認できます。</div>}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
