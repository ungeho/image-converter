import fs from "node:fs/promises";
import path from "node:path";
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
  await page.check('input[type="checkbox"]');
  await page.fill('input[placeholder="例: 1200"]', "960");
  await page.fill('input[placeholder="例: 800"]', "640");
  await waitForConversion(page);
  await screenshot(page, "step-03-settings.png");

  await screenshot(page, "step-04-actions.png");
  await screenshot(page, "overview.png");

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  process.exit(process.exitCode ?? 0);
});
