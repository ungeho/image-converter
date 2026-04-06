import path from "node:path";
import { chromium } from "playwright-core";

const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:4173";
const workspace = process.cwd();

async function main() {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
  });

  await page.goto(appUrl, { waitUntil: "load", timeout: 60000 });

  await page.setInputFiles('input[type="file"]', [
    path.join(workspace, "docs", "sample-inputs", "sample-landscape.svg"),
    path.join(workspace, "docs", "sample-inputs", "sample-card.svg"),
  ]);

  await page.waitForTimeout(2500);
  await page.locator("select").nth(0).selectOption("web-light");
  await page.waitForTimeout(2000);
  await page.getByText("右回転").click();
  await page.waitForTimeout(1500);

  const retryButton = page.getByRole("button", { name: "失敗画像だけ再試行" });
  const zipButton = page.getByRole("button", { name: /ZIP/ });
  const gallery = page.locator(".gallery-item");

  if ((await gallery.count()) < 2) {
    throw new Error("Expected at least two gallery items.");
  }

  if (!(await zipButton.isVisible())) {
    throw new Error("ZIP button is not visible.");
  }

  if (!(await retryButton.isVisible())) {
    throw new Error("Retry button is not visible.");
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
