import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Arham IPO GMP — Live Scraper',
    description: 'Live IPO Grey Market Premium from 6 trusted sources — powered by Arham IPO Premium',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
