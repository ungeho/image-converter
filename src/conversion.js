export const BASE_FORMAT_OPTIONS = [
  { value: "image/png", label: "PNG", extension: "png" },
  { value: "image/jpeg", label: "JPEG", extension: "jpg" },
  { value: "image/webp", label: "WebP", extension: "webp" },
  { value: "image/avif", label: "AVIF", extension: "avif" },
];

export const RESIZE_MODE_OPTIONS = [
  { value: "contain", label: "枠内に収める" },
  { value: "exact", label: "正確なサイズ" },
  { value: "long-edge", label: "長辺基準" },
  { value: "short-edge", label: "短辺基準" },
  { value: "scale", label: "倍率指定" },
];

export const PRESET_OPTIONS = [
  { value: "custom", label: "カスタム", description: "現在の設定をそのまま使います。" },
  {
    value: "web-light",
    label: "Web用に軽量化",
    description: "WebP 変換 + 長辺 1600px 相当で軽めに出力します。",
    settings: {
      outputFormat: "image/webp",
      quality: 0.82,
      resizeEnabled: true,
      resizeMode: "long-edge",
      keepAspect: true,
      resizeWidth: "1600",
      resizeHeight: "",
    },
  },
  {
    value: "social-post",
    label: "SNS投稿向け",
    description: "JPEG 変換 + 1200px ベースで扱いやすいサイズにします。",
    settings: {
      outputFormat: "image/jpeg",
      quality: 0.88,
      resizeEnabled: true,
      resizeMode: "contain",
      keepAspect: true,
      resizeWidth: "1200",
      resizeHeight: "1200",
    },
  },
  {
    value: "archive-avif",
    label: "AVIF圧縮",
    description: "AVIF が使える環境で、保存サイズを重視して出力します。",
    requires: "image/avif",
    settings: {
      outputFormat: "image/avif",
      quality: 0.76,
      resizeEnabled: false,
      resizeMode: "contain",
      keepAspect: true,
      resizeWidth: "",
      resizeHeight: "",
    },
  },
];

export const DEFAULT_FORMAT = BASE_FORMAT_OPTIONS[0].value;
export const DEFAULT_PRESET = PRESET_OPTIONS[0].value;
export const DEFAULT_TRANSFORM = { rotation: 0, flipH: false, flipV: false };

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDimensions(width, height) {
  if (!width || !height) return "-";
  return `${width} x ${height}`;
}

export function normalizeDimension(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

export function getOutputName(name, extension) {
  const baseName = name.replace(/\.[^.]+$/, "") || "converted-image";
  return `${baseName}.${extension}`;
}

export function getRotatedSize(width, height, rotation) {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

export function getTargetSize(width, height, resizeConfig) {
  if (!resizeConfig.enabled) return { width, height };

  const targetWidth = normalizeDimension(resizeConfig.width);
  const targetHeight = normalizeDimension(resizeConfig.height);
  const mode = resizeConfig.mode ?? "contain";

  if (mode === "exact" && targetWidth && targetHeight) {
    return { width: targetWidth, height: targetHeight };
  }

  if (mode === "scale" && targetWidth) {
    const scale = targetWidth / 100;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  if (mode === "long-edge" && targetWidth) {
    const longEdge = Math.max(width, height);
    const scale = targetWidth / longEdge;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  if (mode === "short-edge" && targetWidth) {
    const shortEdge = Math.min(width, height);
    const scale = targetWidth / shortEdge;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

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
      return { width: targetWidth, height: Math.max(1, Math.round(height * scale)) };
    }
    if (targetHeight) {
      const scale = targetHeight / height;
      return { width: Math.max(1, Math.round(width * scale)), height: targetHeight };
    }
  }

  if (targetWidth && targetHeight) return { width: targetWidth, height: targetHeight };
  return { width, height };
}

export function getCompressionLabel(sourceSize, convertedSize) {
  if (!sourceSize || !convertedSize) return "-";
  const delta = convertedSize - sourceSize;
  const ratio = (convertedSize / sourceSize) * 100;
  if (delta === 0) return `同サイズ (${ratio.toFixed(1)}%)`;
  return `${delta > 0 ? "+" : ""}${formatBytes(delta)} (${ratio.toFixed(1)}%)`;
}

export function canEncodeMimeType(type) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL(type).startsWith(`data:${type}`);
  } catch {
    return false;
  }
}

export async function copyBlobToClipboard(blob) {
  if (!navigator.clipboard || typeof window.ClipboardItem === "undefined") {
    throw new Error("このブラウザは画像のクリップボード書き込みに対応していません。");
  }
  await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
}

export async function readFileAsArrayBuffer(file) {
  return file.arrayBuffer();
}

export async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Blob の読み込みに失敗しました。"));
    reader.readAsDataURL(blob);
  });
}

export function getExifOrientation(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 1 < view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    if (marker === 0xffe1) {
      offset += 2;
      if (view.getUint32(offset, false) !== 0x45786966) return 1;
      const tiffOffset = offset + 6;
      const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
      const firstIfdOffset = view.getUint32(tiffOffset + 4, littleEndian);
      let dirOffset = tiffOffset + firstIfdOffset;
      const entries = view.getUint16(dirOffset, littleEndian);
      dirOffset += 2;

      for (let index = 0; index < entries; index += 1) {
        const entryOffset = dirOffset + index * 12;
        if (view.getUint16(entryOffset, littleEndian) === 0x0112) {
          return view.getUint16(entryOffset + 8, littleEndian);
        }
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    offset += view.getUint16(offset, false);
  }

  return 1;
}

export function getOrientedSize(width, height, orientation) {
  if ([5, 6, 7, 8].includes(orientation)) return { width: height, height: width };
  return { width, height };
}

export function getFinalTargetSize(width, height, orientation, transform, resizeConfig) {
  const oriented = getOrientedSize(width, height, orientation);
  const rotated = getRotatedSize(oriented.width, oriented.height, transform.rotation ?? 0);
  return getTargetSize(rotated.width, rotated.height, resizeConfig);
}

export function drawImageWithOrientation(context, image, orientation, targetWidth, targetHeight, fillWhite) {
  if (fillWhite) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  }

  switch (orientation) {
    case 2:
      context.translate(targetWidth, 0);
      context.scale(-1, 1);
      break;
    case 3:
      context.translate(targetWidth, targetHeight);
      context.rotate(Math.PI);
      break;
    case 4:
      context.translate(0, targetHeight);
      context.scale(1, -1);
      break;
    case 5:
      context.rotate(0.5 * Math.PI);
      context.scale(1, -1);
      break;
    case 6:
      context.rotate(0.5 * Math.PI);
      context.translate(0, -targetHeight);
      break;
    case 7:
      context.rotate(0.5 * Math.PI);
      context.translate(targetWidth, -targetHeight);
      context.scale(-1, 1);
      break;
    case 8:
      context.rotate(-0.5 * Math.PI);
      context.translate(-targetWidth, 0);
      break;
    default:
      break;
  }

  const needsSwap = [5, 6, 7, 8].includes(orientation);
  context.drawImage(image, 0, 0, needsSwap ? targetHeight : targetWidth, needsSwap ? targetWidth : targetHeight);
}

export function applyTransformToCanvas(context, source, transform, targetWidth, targetHeight, fillWhite) {
  if (fillWhite) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  }

  const rotation = ((transform.rotation ?? 0) * Math.PI) / 180;
  const needsSwap = (transform.rotation ?? 0) % 180 !== 0;
  const drawWidth = needsSwap ? targetHeight : targetWidth;
  const drawHeight = needsSwap ? targetWidth : targetHeight;

  context.translate(targetWidth / 2, targetHeight / 2);
  context.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);
  context.rotate(rotation);
  context.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
}

export async function fileToImage(file) {
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

export async function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("この形式への変換に失敗しました。"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

export async function renderOrientedCanvas(image, orientation) {
  const oriented = getOrientedSize(image.naturalWidth ?? image.width, image.naturalHeight ?? image.height, orientation);
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(oriented.width, oriented.height) : document.createElement("canvas");
  canvas.width = oriented.width;
  canvas.height = oriented.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas が利用できません。");
  drawImageWithOrientation(context, image, orientation, oriented.width, oriented.height, false);
  return canvas;
}

export async function convertEntryOnMainThread(entry, options, extension) {
  const buffer = await readFileAsArrayBuffer(entry.file);
  const orientation = entry.orientation ?? getExifOrientation(buffer);
  const image = await fileToImage(entry.file);
  const orientedCanvas = await renderOrientedCanvas(image, orientation);
  const targetSize = getFinalTargetSize(image.naturalWidth, image.naturalHeight, orientation, entry.transform ?? DEFAULT_TRANSFORM, options.resizeConfig);
  const canvas = document.createElement("canvas");
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas が利用できません。");

  applyTransformToCanvas(
    context,
    orientedCanvas,
    entry.transform ?? DEFAULT_TRANSFORM,
    targetSize.width,
    targetSize.height,
    options.outputFormat === "image/jpeg",
  );

  const blob = await canvasToBlob(canvas, options.outputFormat, options.quality);
  return {
    id: entry.id,
    blob,
    width: canvas.width,
    height: canvas.height,
    outputName: getOutputName(entry.file.name, extension),
    error: "",
    engine: "main-thread",
    orientation,
  };
}

export function buildManifest(entries, sourceEntries, settings, engine) {
  return {
    generatedAt: new Date().toISOString(),
    engine,
    settings,
    items: entries.map((entry) => {
      const source = sourceEntries.find((item) => item.id === entry.id);
      return {
        sourceName: source?.file.name ?? "",
        outputName: entry.outputName,
        sourceType: source?.file.type ?? "",
        outputType: entry.blob?.type ?? "",
        sourceSize: source?.file.size ?? 0,
        outputSize: entry.blob?.size ?? 0,
        sourceWidth: source?.width ?? 0,
        sourceHeight: source?.height ?? 0,
        outputWidth: entry.width ?? 0,
        outputHeight: entry.height ?? 0,
        orientation: entry.orientation ?? source?.orientation ?? 1,
        transform: source?.transform ?? DEFAULT_TRANSFORM,
        compressionRatio: source?.file.size ? Number((entry.blob.size / source.file.size).toFixed(4)) : null,
      };
    }),
  };
}

export function createWorker() {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./imageConverter.worker.js", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}
