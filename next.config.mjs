/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'puppeteer',
    'puppeteer-core',
    '@sparticuz/chromium',
    'better-sqlite3',
  ],
};

export default nextConfig;
