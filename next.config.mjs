/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'puppeteer',
    'puppeteer-extra',
    'puppeteer-extra-plugin-stealth',
    'better-sqlite3',
    'jsonwebtoken',
  ],
};

export default nextConfig;
