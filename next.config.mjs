/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'puppeteer-extra',
    'puppeteer-extra-plugin-stealth',
    'puppeteer',
    'cheerio',
    'better-sqlite3',
    'jsonwebtoken',
  ],
};

export default nextConfig;
