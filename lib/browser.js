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
    const puppeteerExtra = (await import('puppeteer-extra')).default;
    const StealthPlugin  = (await import('puppeteer-extra-plugin-stealth')).default;
    const chromium       = (await import('@sparticuz/chromium')).default;
    
    puppeteerExtra.use(StealthPlugin());
    chromium.setGraphicsMode = false;

    browser = await puppeteerExtra.launch({
      args:            chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath:  await chromium.executablePath(),
      headless:        chromium.headless,
    });
  } else {
    // ── Local dev ────────────────────────────────────────────────────────────
    const puppeteerExtra = (await import('puppeteer-extra')).default;
    const puppeteerBase  = (await import('puppeteer')).default;
    const StealthPlugin  = (await import('puppeteer-extra-plugin-stealth')).default;
    
    puppeteerExtra.use(StealthPlugin());
    const executablePath = await puppeteerBase.executablePath();
    
    browser = await puppeteerExtra.launch({
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
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2500));

    return await page.content();
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
