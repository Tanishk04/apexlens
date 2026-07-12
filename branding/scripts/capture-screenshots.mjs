// One-time real-screenshot capture for the Chrome Web Store listing. Not part
// of the app build. Requires the Vite dev server already running (npm run dev)
// and `puppeteer-core` installed ad-hoc (`npm install --no-save puppeteer-core`)
// — reuses the system's installed Chrome rather than downloading a bundled one.
//
// Usage: node branding/scripts/capture-screenshots.mjs <devServerPort>

import puppeteer from 'puppeteer-core';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = process.argv[2] ?? '5178';
const OUT_DIR = path.resolve(import.meta.dirname, '..', 'ApexLens', 'ChromeStore', 'screenshots');

async function clickTab(page, name) {
  await page.evaluate((label) => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === label,
    );
    if (btn) btn.click();
  }, name);
  await new Promise((r) => setTimeout(r, 500));
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/src/app/index.html?demo`, {
    waitUntil: 'networkidle0',
  });
  await new Promise((r) => setTimeout(r, 600));

  const shots = [
    { tab: 'Execution Tree', file: 'screenshot-1.png' },
    { tab: 'Execution Timeline', file: 'screenshot-2.png' },
    { tab: 'Governor', file: 'screenshot-3.png' },
    { tab: 'AI', file: 'screenshot-4.png' },
  ];

  for (const { tab, file } of shots) {
    await clickTab(page, tab);
    const outPath = path.join(OUT_DIR, file);
    await page.screenshot({ path: outPath });
    console.log('captured', tab, '->', outPath);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
