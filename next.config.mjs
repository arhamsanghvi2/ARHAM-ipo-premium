/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'puppeteer',
    'puppeteer-core',
    'puppeteer-extra',
    'puppeteer-extra-plugin-stealth',
    'puppeteer-extra-plugin',
    '@sparticuz/chromium',
    'clone-deep',
    'merge-deep',
    'is-plain-object',
    'better-sqlite3',
    'jsonwebtoken',
  ],
};

export default nextConfig;
