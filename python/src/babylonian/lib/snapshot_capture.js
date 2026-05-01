const { chromium } = require("@playwright/test");
const { pathToFileURL } = require("url");

async function waitForRenderedCanvas(page, timeoutMs) {
  await page.waitForSelector("canvas", {
    state: "attached",
    timeout: timeoutMs,
  });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector("canvas");
      if (!canvas) {
        return false;
      }
      if (!window.BABYLON) {
        return true;
      }
      const engines = BABYLON.Engine.Instances;
      if (!engines || !engines.length) {
        return false;
      }
      const engine = engines[0];
      return engine._frameId !== undefined ? engine._frameId > 2 : true;
    },
    { timeout: timeoutMs }
  );
}

async function main() {
  const [htmlPath, outPath, widthArg, heightArg, delayMsArg, timeoutMsArg] = process.argv.slice(2);
  if (!htmlPath || !outPath) {
    throw new Error(
      "Usage: node snapshot_capture.js <html_path> <output_path> [width] [height] [delay_ms] [timeout_ms]"
    );
  }

  const width = Number(widthArg) > 0 ? Number(widthArg) : 900;
  const height = Number(heightArg) > 0 ? Number(heightArg) : 700;
  const delayMs = Number(delayMsArg) >= 0 ? Number(delayMsArg) : 0;
  const timeoutMs = Number(timeoutMsArg) > 0 ? Number(timeoutMsArg) : 10000;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });

    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: timeoutMs });
    await waitForRenderedCanvas(page, timeoutMs);
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs);
    }

    const canvas = page.locator("canvas").first();
    await canvas.screenshot({
      path: outPath,
      animations: "disabled",
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
