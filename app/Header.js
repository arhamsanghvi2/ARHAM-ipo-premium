'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMenu = () => setMobileMenuOpen(prev => !prev);
  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="portal-header">
      <div className="portal-nav-container">
        <Link href="/" className="brand-logo" onClick={closeMenu}>
          <span>Arham IPO</span>
          <span className="badge-tag">PREMIUM</span>
        </Link>
        
        {/* Mobile Hamburger Toggle Button */}
        <button 
          className="mobile-menu-toggle" 
          onClick={toggleMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>

        <nav className={`nav-wrapper ${mobileMenuOpen ? 'open' : ''}`}>
          <ul className="nav-menu">
            <li><Link href="/" className="nav-link active" onClick={closeMenu}>Home</Link></li>
            <li><Link href="/" className="nav-link" onClick={closeMenu}>Mainline IPOs</Link></li>
            <li><Link href="/" className="nav-link" onClick={closeMenu}>SME IPOs</Link></li>
            <li><Link href="/" className="nav-link" onClick={closeMenu}>GMP Today</Link></li>
            <li><Link href="/" className="nav-link" onClick={closeMenu}>Subscription</Link></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
