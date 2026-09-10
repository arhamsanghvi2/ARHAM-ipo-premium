/**
 * Shared browser launcher.
 *
 * LOCAL  → uses full `puppeteer` (has bundled Chromium, just works)
 * VERCEL → uses `puppeteer-core` + `@sparticuz/chromium`
 */

export async function scrapeHtml(url) {
  let browser;

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // ── Vercel / serverless ──────────────────────────────────────────────────
    const puppeteerCore = (await import('puppeteer-core')).default;
    const chromium      = (await import('@sparticuz/chromium')).default;
    chromium.setGraphicsMode = false;

    browser = await puppeteerCore.launch({
      headless:       true,
      executablePath: await chromium.executablePath(),
      args:           chromium.args,
    });
  } else {
    // ── Local dev: use the full `puppeteer` bundle ───────────────────────────
    const puppeteer = (await import('puppeteer')).default;
    const executablePath = await puppeteer.executablePath();
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    // Use domcontentloaded + fixed wait — more reliable than networkidle2 on CF
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000)); // wait for CF challenge + JS render

    return await page.content();
  } finally {
    await browser.close();
  }
}
