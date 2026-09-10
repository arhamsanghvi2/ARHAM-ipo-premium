import "./globals.css";
import Header from "./Header";

export const metadata = {
  title: "Arham IPO Premium - Live IPO GMP, Subscription & Allotment Status",
  description: "Track live IPO Grey Market Premium (GMP), real-time subscription status, price bands, and allotment details for Mainline & SME IPOs.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {/* Top Ticker Notification Ribbon */}
        <div className="ticker-bar">
          📢 <strong>Live Updates:</strong> Tracking Mainline & SME IPOs • Grey Market Premium (GMP) • Real-time Bidding Data
        </div>

        {/* Portal Header Navbar */}
        <Header />

        {/* Main Content Area */}
        <div style={{ flex: 1 }}>
          {children}
        </div>

        {/* Financial Portal Footer */}
        <footer className="portal-footer">
          <div className="portal-footer-inner">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
              <div>
                <strong style={{ color: '#0f172a', fontSize: '1.1rem' }}>Arham IPO Premium</strong>
                <p style={{ marginTop: '0.25rem', color: '#64748b' }}>India's premier IPO grey market premium & subscription analytics portal.</p>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
                <a href="/" style={{ color: '#2563eb', fontWeight: '500' }}>Privacy Policy</a>
                <a href="/" style={{ color: '#2563eb', fontWeight: '500' }}>Terms of Service</a>
                <a href="/" style={{ color: '#2563eb', fontWeight: '500' }}>Disclaimer</a>
                <a href="/" style={{ color: '#2563eb', fontWeight: '500' }}>Contact Us</a>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
              Disclaimer: Grey Market Premium (GMP) data provided on this platform is purely informational and gathered from informal market sources. We do not deal in or endorse grey market trading. Investing in stock markets involves financial risk; please consult a certified financial advisor before making investment decisions.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}


