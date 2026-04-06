import {
  applyTransformToCanvas,
  DEFAULT_TRANSFORM,
  getExifOrientation,
  getFinalTargetSize,
  renderOrientedCanvas,
} from "./conversion.js";

async function convertOne(entry, options) {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    throw new Error("Worker canvas conversion is not supported.");
  }

  const orientation = getExifOrientation(entry.buffer);
  const sourceBlob = new Blob([entry.buffer], { type: entry.fileType });
  const bitmap = await createImageBitmap(sourceBlob);
  const orientedCanvas = await renderOrientedCanvas(bitmap, orientation);
  bitmap.close();

  const transform = entry.transform ?? DEFAULT_TRANSFORM;
  const targetSize = getFinalTargetSize(orientedCanvas.width, orientedCanvas.height, 1, transform, options.resizeConfig);
  const canvas = new OffscreenCanvas(targetSize.width, targetSize.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Worker canvas context is unavailable.");

  applyTransformToCanvas(
    context,
    orientedCanvas,
    transform,
    targetSize.width,
    targetSize.height,
    options.outputFormat === "image/jpeg",
  );

  const convertedBlob = await canvas.convertToBlob({ type: options.outputFormat, quality: options.quality });
  const buffer = await convertedBlob.arrayBuffer();

  return {
    id: entry.id,
    outputName: `${entry.fileName.replace(/\.[^.]+$/, "") || "converted-image"}.${options.extension}`,
    width: canvas.width,
    height: canvas.height,
    buffer,
    orientation,
    error: "",
  };
}

self.addEventListener("message", async (event) => {
  if (event.data?.type !== "convert") return;

  const { entries, outputFormat, quality, extension, resizeConfig } = event.data;

  try {
    const converted = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      try {
        converted.push(await convertOne(entry, { outputFormat, quality, extension, resizeConfig }));
      } catch (error) {
        converted.push({
          id: entry.id,
          outputName: `${entry.fileName.replace(/\.[^.]+$/, "") || "converted-image"}.${extension}`,
          width: 0,
          height: 0,
          buffer: null,
          orientation: 1,
          error: error instanceof Error ? error.message : "変換に失敗しました。",
        });
      }

      self.postMessage({
        type: "progress",
        completed: index + 1,
        total: entries.length,
        currentId: entry.id,
      });
    }

    self.postMessage(
      { type: "complete", entries: converted },
      converted.map((entry) => entry.buffer).filter(Boolean),
    );
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Worker conversion failed." });
  }
});
