'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const FULL_REFRESH_MS = 10000;  // Full subscription table refresh every 10s
const GMP_REFRESH_MS = 5000;    // GMP tile refresh every 5s

function IpoDetailsContent() {
  const searchParams = useSearchParams();
  const path = searchParams.get('path');
  
  const [data, setData] = useState(null);
  const [gmpInfo, setGmpInfo] = useState(null);  // fast-updating GMP data
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [gmpLastUpdated, setGmpLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fullCountdown, setFullCountdown] = useState(FULL_REFRESH_MS / 1000);
  const [gmpCountdown, setGmpCountdown] = useState(GMP_REFRESH_MS / 1000);
  
  const fullIntervalRef = useRef(null);
  const gmpIntervalRef = useRef(null);
  const fullCountdownRef = useRef(null);
  const gmpCountdownRef = useRef(null);

  // ------ FULL PAGE DATA FETCH ------
  const fetchFull = async (isRefresh = false) => {
    if (!path) return;
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/scrape?path=${encodeURIComponent(path)}&t=${Date.now()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setLastUpdated(new Date());
        if (json.data.gmp) {
          setGmpInfo({
            gmp: json.data.gmp,
            gmpPct: json.data.gmpPct,
            priceBand: json.data.priceBand,
            lotSize: json.data.lotSize,
            allTiles: json.data.allTiles,
          });
          setGmpLastUpdated(new Date());
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  // ------ FAST GMP FETCH ------
  const fetchGmp = async () => {
    if (!path) return;
    try {
      const res = await fetch(`/api/gmp?link=${encodeURIComponent(path)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setGmpInfo(json.data);
        setGmpLastUpdated(new Date());
      }
    } catch { /* silent */ }
  };

  // Initial load
  useEffect(() => {
    fetchFull(false);
    fetchGmp();
  }, [path]);

  // Full refresh every 10s
  useEffect(() => {
    fullCountdownRef.current = setInterval(() => setFullCountdown(p => p <= 1 ? FULL_REFRESH_MS / 1000 : p - 1), 1000);
    fullIntervalRef.current = setInterval(() => { fetchFull(true); setFullCountdown(FULL_REFRESH_MS / 1000); }, FULL_REFRESH_MS);
    return () => { clearInterval(fullCountdownRef.current); clearInterval(fullIntervalRef.current); };
  }, [path]);

  // GMP refresh every 5s
  useEffect(() => {
    gmpCountdownRef.current = setInterval(() => setGmpCountdown(p => p <= 1 ? GMP_REFRESH_MS / 1000 : p - 1), 1000);
    gmpIntervalRef.current = setInterval(() => { fetchGmp(); setGmpCountdown(GMP_REFRESH_MS / 1000); }, GMP_REFRESH_MS);
    return () => { clearInterval(gmpCountdownRef.current); clearInterval(gmpIntervalRef.current); };
  }, [path]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '4rem', gap: '1.25rem' }}>
        <div className="loader" style={{ width: '38px', height: '38px', borderWidth: '3px' }}></div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>Fetching live IPO details & GMP…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', marginTop: '4rem', padding: '1rem' }}>
        <p style={{ color: '#ef4444' }}>Failed to load IPO details. Please try again.</p>
        <Link href="/" style={{ color: '#2563eb', display: 'inline-block', marginTop: '1rem', fontWeight: '600' }}>← Back to Dashboard</Link>
      </div>
    );
  }

  const gmp = gmpInfo?.gmp || data.gmp || 'N/A';
  const gmpPct = gmpInfo?.gmpPct || data.gmpPct || '';
  const priceBand = gmpInfo?.priceBand || data.priceBand || 'N/A';
  const lotSize = gmpInfo?.lotSize || data.lotSize || 'N/A';
  const tiles = gmpInfo?.allTiles || data.allTiles || {};

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Top Navigation Bar & Timers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <Link href="/" style={{ padding: '0.45rem 0.85rem', background: '#ffffff', borderRadius: '8px', color: 'var(--text-primary)', fontWeight: '600', border: '1px solid var(--surface-border)', fontSize: '0.85rem' }}>
          ← Dashboard
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {lastUpdated && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Updated: <strong>{lastUpdated.toLocaleTimeString()}</strong></span>}
          <div style={{ padding: '0.3rem 0.65rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', animation: 'livePulse 1.5s infinite' }}></div>
            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: '600' }}>Tables: {fullCountdown}s</span>
          </div>
          <div style={{ padding: '0.3rem 0.65rem', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#a855f7', animation: 'livePulse 1s infinite' }}></div>
            <span style={{ fontSize: '0.72rem', color: '#7e22ce', fontWeight: '600' }}>GMP: {gmpCountdown}s</span>
          </div>
          <button onClick={() => { fetchFull(true); fetchGmp(); setFullCountdown(FULL_REFRESH_MS / 1000); setGmpCountdown(GMP_REFRESH_MS / 1000); }}
            style={{ padding: '0.3rem 0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#2563eb', cursor: 'pointer', fontWeight: '600', fontSize: '0.78rem', fontFamily: 'inherit' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="glass-panel" style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: 'clamp(1.25rem, 3.5vw, 1.7rem)', fontWeight: '800', color: '#0f172a', marginBottom: '0.2rem' }}>
          {data.title}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          Live updates · Subscription tables refresh every 10s · GMP refreshes every 5s
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
        {/* GMP - highlighted with live indicator */}
        <div className="glass-panel" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: 'center', position: 'relative', overflow: 'hidden', padding: '1rem 0.75rem' }}>
          <div style={{ position: 'absolute', top: '6px', right: '8px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a', animation: 'livePulse 1s infinite' }}></div>
            <span style={{ fontSize: '0.6rem', color: '#16a34a', fontWeight: '700' }}>LIVE</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: '700' }}>GMP Rumors</div>
          <div style={{ fontSize: 'clamp(1.6rem, 5vw, 2.2rem)', fontWeight: '900', color: gmp !== 'N/A' ? '#15803d' : '#64748b', lineHeight: 1 }}>{gmp}</div>
          {gmpPct && <div style={{ fontSize: '0.82rem', color: '#166534', marginTop: '0.3rem', fontWeight: '700' }}>{gmpPct}</div>}
          {gmpLastUpdated && <div style={{ fontSize: '0.65rem', color: '#4b5563', marginTop: '0.3rem' }}>{gmpLastUpdated.toLocaleTimeString()}</div>}
        </div>

        {/* Price Band */}
        <div className="glass-panel" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', textAlign: 'center', padding: '1rem 0.75rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: '700' }}>Price Band</div>
          <div style={{ fontSize: 'clamp(1.2rem, 4vw, 1.7rem)', fontWeight: '800', color: '#1e3a8a' }}>{priceBand}</div>
          {tiles['Price Band']?.sub && <div style={{ fontSize: '0.72rem', color: '#3b82f6', marginTop: '0.2rem' }}>{tiles['Price Band'].sub}</div>}
        </div>

        {/* Lot Size */}
        <div className="glass-panel" style={{ background: '#faf5ff', border: '1px solid #e9d5ff', textAlign: 'center', padding: '1rem 0.75rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: '700' }}>Lot Size</div>
          <div style={{ fontSize: 'clamp(1.2rem, 4vw, 1.7rem)', fontWeight: '800', color: '#581c87' }}>{lotSize}</div>
          {data.lotSizeMin && <div style={{ fontSize: '0.72rem', color: '#7e22ce', marginTop: '0.2rem' }}>{data.lotSizeMin}</div>}
        </div>

        {/* Subscribed */}
        {tiles['Subscribed'] && (
          <div className="glass-panel" style={{ background: '#fffbeb', border: '1px solid #fef3c7', textAlign: 'center', padding: '1rem 0.75rem' }}>
            <div style={{ fontSize: '0.68rem', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: '700' }}>Subscribed</div>
            <div style={{ fontSize: 'clamp(1.2rem, 4vw, 1.7rem)', fontWeight: '800', color: '#b45309' }}>{tiles['Subscribed'].val}</div>
            {tiles['Subscribed'].sub && <div style={{ fontSize: '0.72rem', color: '#d97706', marginTop: '0.2rem' }}>{tiles['Subscribed'].sub}</div>}
          </div>
        )}

        {/* Extra tiles */}
        {Object.entries(tiles)
          .filter(([k]) => !['GMP Rumors','GMP','Price Band','Lot Size','Subscribed'].includes(k))
          .map(([label, {val, sub}]) => (
            <div key={label} className="glass-panel" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center', padding: '0.85rem 0.65rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem', fontWeight: '600' }}>{label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>{val || '—'}</div>
              {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{sub}</div>}
            </div>
          ))}
      </div>

      {/* Subscription Tables */}
      {data.tables && data.tables.filter(t => t.rows?.length > 1).map((table, tIdx) => (
        <div key={tIdx} className="glass-panel" style={{ marginBottom: '1.25rem', padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
            <h2 style={{ fontWeight: '700', fontSize: '0.88rem', color: '#1e293b', margin: 0 }}>
              📊 {table.caption || (tIdx === 0 ? 'Subscription Details' : `Table ${tIdx + 1}`)}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {refreshing && <div className="loader" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></div>}
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>refreshes in {fullCountdown}s</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {table.rows[0].map((th, i) => (
                    <th key={i} style={{ padding: '0.65rem 0.85rem', textAlign: i === 0 ? 'left' : 'right', fontWeight: '700', fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{th}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.slice(1).map((tr, rIdx) => (
                  <tr key={rIdx}
                    style={{ borderBottom: '1px solid #f1f5f9', background: rIdx % 2 ? '#f8fafc' : '#ffffff' }}
                  >
                    {tr.map((td, cIdx) => (
                      <td key={cIdx} style={{ padding: '0.65rem 0.85rem', textAlign: cIdx === 0 ? 'left' : 'right', fontSize: '0.82rem', fontWeight: cIdx === 0 ? '600' : '400', color: cIdx === tr.length - 1 ? '#d97706' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{td}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Additional Info */}
      {data.additionalInfo && Object.keys(data.additionalInfo).length > 0 && (
        <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontWeight: '700', fontSize: '0.9rem', color: '#1e293b', marginBottom: '0.85rem' }}>📋 Additional Information</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.4rem' }}>
            {Object.entries(data.additionalInfo).slice(0, 30).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0.75rem', background: '#f8fafc', borderRadius: '6px', gap: '0.75rem', border: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{key}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: '600', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.4); } }
      `}</style>
    </div>
  );
}

export default function IpoPage() {
  return (
    <main style={{ padding: '1rem', minHeight: '100vh', fontFamily: 'var(--font-sans)' }}>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}><div className="loader" style={{ width: '32px', height: '32px', borderWidth: '3px' }}></div></div>}>
        <IpoDetailsContent />
      </Suspense>
    </main>
  );
}
