/** @type {import('next').NextConfig} */
const nextConfig = {
  // These packages are server-only and should NOT be bundled by webpack.
  // On Vercel: better-sqlite3 is skipped (IS_VERCEL flag in db.js),
  // puppeteer packages are never imported (browser.js uses curl).
  serverExternalPackages: [
    'puppeteer',
    'puppeteer-core',
    'puppeteer-extra',
    'puppeteer-extra-plugin-stealth',
    '@sparticuz/chromium',
    'better-sqlite3',
  ],
};

export default nextConfig;
