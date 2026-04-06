import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const workspace = process.cwd();
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:4173";
const outputDir = path.join(workspace, "docs", "readme");
const sampleDir = path.join(workspace, "docs", "sample-inputs");

const files = [
  path.join(sampleDir, "sample-landscape.svg"),
  path.join(sampleDir, "sample-card.svg"),
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitForConversion(page) {
  await page.waitForTimeout(2500);
}

async function screenshot(page, fileName, clip = null) {
  const target = path.join(outputDir, fileName);
  await page.screenshot({
    path: target,
    ...(clip ? { clip } : { fullPage: true }),
  });
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function captureFrame(page, framesDir, index) {
  const framePath = path.join(framesDir, `frame-${String(index).padStart(3, "0")}.png`);
  await page.screenshot({
    path: framePath,
    clip: { x: 40, y: 20, width: 1320, height: 920 },
  });
}

async function createWorkflowGif(page) {
  const framesDir = path.join(outputDir, ".workflow-frames");
  const palettePath = path.join(outputDir, "workflow-palette.png");
  const gifPath = path.join(outputDir, "workflow.gif");
  await fs.rm(framesDir, { recursive: true, force: true });
  await ensureDir(framesDir);

  let frameIndex = 0;
  await captureFrame(page, framesDir, frameIndex += 1);
  await page.setInputFiles('input[type="file"]', files);
  await waitForConversion(page);
  await captureFrame(page, framesDir, frameIndex += 1);
  await page.locator("select").nth(1).selectOption("image/webp");
  await page.getByLabel("リサイズを有効にする").check();
  await page.locator('input[placeholder="例: 1200"]').first().fill("960");
  await page.locator('input[placeholder="例: 800"]').first().fill("640");
  await waitForConversion(page);
  await captureFrame(page, framesDir, frameIndex += 1);
  await page.locator(".gallery-item").first().click();
  await page.waitForTimeout(600);
  await captureFrame(page, framesDir, frameIndex += 1);
  await page.getByRole("button", { name: "manifest と HTML レポート付き ZIP を保存" }).hover();
  await page.waitForTimeout(400);
  await captureFrame(page, framesDir, frameIndex += 1);

  await runCommand("ffmpeg", [
    "-y",
    "-framerate",
    "1.2",
    "-i",
    path.join(framesDir, "frame-%03d.png"),
    "-vf",
    "fps=10,scale=1100:-1:flags=lanczos,palettegen",
    palettePath,
  ]);

  await runCommand("ffmpeg", [
    "-y",
    "-framerate",
    "1.2",
    "-i",
    path.join(framesDir, "frame-%03d.png"),
    "-i",
    palettePath,
    "-lavfi",
    "fps=10,scale=1100:-1:flags=lanczos[x];[x][1:v]paletteuse",
    gifPath,
  ]);

  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.rm(palettePath, { force: true });
}

async function main() {
  await ensureDir(outputDir);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1600, height: 1450 },
    deviceScaleFactor: 1,
  });

  await page.goto(appUrl, { waitUntil: "load", timeout: 60000 });
  await screenshot(page, "step-01-empty.png");

  await page.setInputFiles('input[type="file"]', files);
  await waitForConversion(page);
  await page.screenshot({ path: path.join(outputDir, "step-02-loaded.png"), fullPage: true });

  await page.locator("select").nth(1).selectOption("image/webp");
  await waitForConversion(page);
  await page.getByLabel("リサイズを有効にする").check();
  await page.locator('input[placeholder="例: 1200"]').first().fill("960");
  await page.locator('input[placeholder="例: 800"]').first().fill("640");
  await waitForConversion(page);
  await screenshot(page, "step-03-settings.png");

  await screenshot(page, "step-04-actions.png");
  await screenshot(page, "overview.png");
  await page.goto(appUrl, { waitUntil: "load", timeout: 60000 });
  await createWorkflowGif(page);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  process.exit(process.exitCode ?? 0);
});
