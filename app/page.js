'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const GMP_POLL_MS = 5000;    // Poll GMP from fast cache every 5s

export default function Dashboard() {
  const router = useRouter();
  const [ipos, setIpos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIpos, setSelectedIpos] = useState([]);
  const [liveData, setLiveData] = useState({});   // link -> full scraped data
  const [gmpData, setGmpData] = useState({});     // link -> fast GMP data
  const gmpIntervalRef = useRef(null);
  const watchlistSaveRef = useRef(null);

  // ------ AUTH: logout ------
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // ------ LOAD IPO LIST ------
  useEffect(() => {
    async function fetchIpos() {
      try {
        const res = await fetch('/api/scrape?path=/');
        const json = await res.json();
        if (json.success && json.data.ipos) setIpos(json.data.ipos);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    fetchIpos();
  }, []);

  // ------ LOAD SAVED WATCHLIST from DB ------
  useEffect(() => {
    async function loadWatchlist() {
      try {
        const res = await fetch('/api/watchlist');
        if (res.status === 401) { router.push('/login'); return; }
        const json = await res.json();
        if (json.success && json.watchlist) {
          setSelectedIpos(json.watchlist);
        }
      } catch (e) { console.error('Watchlist load error', e); }
    }
    loadWatchlist();
  }, []);

  // ------ SAVE WATCHLIST to DB (debounced 500ms) ------
  const saveWatchlist = useCallback((items) => {
    clearTimeout(watchlistSaveRef.current);
    watchlistSaveRef.current = setTimeout(async () => {
      try {
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ watchlist: items }),
        });
      } catch (e) { console.error('Watchlist save error', e); }
    }, 500);
  }, []);

  // ------ FAST GMP POLLING every 5s ------
  const pollGmp = useCallback(async () => {
    if (selectedIpos.length === 0) return;
    for (const ipo of selectedIpos) {
      if (!ipo.link || ipo.link === 'undefined') continue; // skip invalid items
      try {
        const res = await fetch(`/api/gmp?link=${encodeURIComponent(ipo.link)}`);
        const json = await res.json();
        if (json.success && json.data) {
          setGmpData(prev => ({ ...prev, [ipo.link]: json.data }));
        }
      } catch { /* silent */ }
    }
  }, [selectedIpos]);

  useEffect(() => {
    pollGmp(); // immediate
    gmpIntervalRef.current = setInterval(pollGmp, GMP_POLL_MS);
    return () => clearInterval(gmpIntervalRef.current);
  }, [pollGmp]);

  // ------ FULL DETAIL FETCH (for subscription tables) ------
  useEffect(() => {
    selectedIpos.forEach(ipo => {
      if (!ipo.link || ipo.link === 'undefined') return; // skip invalid items
      if (!liveData[ipo.link] && !liveData[`${ipo.link}-loading`]) {
        setLiveData(prev => ({ ...prev, [`${ipo.link}-loading`]: true }));
        fetch(`/api/scrape?path=${encodeURIComponent(ipo.link)}`)
          .then(r => r.json())
          .then(json => {
            if (json.success) {
              setLiveData(prev => ({ ...prev, [ipo.link]: json.data, [`${ipo.link}-loading`]: false }));
              if (json.data.gmp) {
                setGmpData(prev => ({ ...prev, [ipo.link]: {
                  gmp: json.data.gmp,
                  gmpPct: json.data.gmpPct,
                  priceBand: json.data.priceBand,
                  lotSize: json.data.lotSize,
                  openDate: json.data.openDate,
                  closeDate: json.data.closeDate,
                  allTiles: json.data.allTiles,
                }}));
              }
            }
          })
          .catch(() => setLiveData(prev => ({ ...prev, [`${ipo.link}-loading`]: false })));
      }
    });
  }, [selectedIpos]);

  // ------ TOGGLE SELECTION ------
  const toggleSelection = (ipo) => {
    setSelectedIpos(prev => {
      const exists = prev.find(i => i.link === ipo.link);
      const updated = exists ? prev.filter(i => i.link !== ipo.link) : [...prev, ipo];
      saveWatchlist(updated);
      return updated;
    });
  };

  const removeIpo = (ipo) => {
    setSelectedIpos(prev => {
      const updated = prev.filter(i => i.link !== ipo.link);
      saveWatchlist(updated);
      return updated;
    });
  };

  const filteredIpos = ipos.filter(ipo =>
    (ipo.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ------ TABLE ROWS ------
  const rows = [
    {
      key: 'dates', label: '🗓 Dates',
      render: (d, ipo) => {
        const isLoading = liveData[`${ipo.link}-loading`];
        const data = liveData[ipo.link];
        const g = gmpData[ipo.link];
        if (isLoading && !data && !g) return <Spinner />;
        const open  = data?.openDate  || g?.openDate;
        const close = data?.closeDate || g?.closeDate;
        if (!open && !close) return <span style={{ color: '#94a3b8' }}>—</span>;
        return (
          <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: '500', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
            <div style={{ color: '#16a34a' }}>O: {open || 'N/A'}</div>
            <div style={{ color: '#dc2626' }}>C: {close || 'N/A'}</div>
          </div>
        );
      }
    },
    {
      key: 'gmp', label: '📈 GMP',
      render: (_, ipo) => {
        const g = gmpData[ipo.link];
        const isLoading = !g;
        if (isLoading) return <Spinner />;
        return g.gmp && g.gmp !== 'N/A'
          ? <><span style={{ color: '#16a34a', fontWeight: '800', fontSize: '1.1rem' }}>{g.gmp}</span>{g.gmpPct && <span style={{ display: 'block', fontSize: '0.7rem', color: '#15803d', fontWeight: '600' }}>{g.gmpPct}</span>}</>
          : <span style={{ color: '#94a3b8' }}>—</span>;
      }
    },
    {
      key: 'priceBand', label: '💰 Price Band',
      render: (_, ipo) => {
        const g = gmpData[ipo.link];
        return g?.priceBand && g.priceBand !== 'N/A'
          ? <span style={{ fontWeight: '700', color: '#1d4ed8', fontSize: '0.85rem' }}>{g.priceBand}</span>
          : <span style={{ color: '#94a3b8' }}>—</span>;
      }
    },
    {
      key: 'lotSize', label: '📦 Lot Size',
      render: (_, ipo) => {
        const g = gmpData[ipo.link];
        return g?.lotSize && g.lotSize !== 'N/A'
          ? <span style={{ fontWeight: '600', color: '#0f172a', fontSize: '0.85rem' }}>{g.lotSize}</span>
          : <span style={{ color: '#94a3b8' }}>—</span>;
      }
    },
    {
      key: 'subscribed', label: '🔥 Subscribed',
      render: (d, ipo) => {
        const g = gmpData[ipo.link];
        const sub = g?.allTiles?.['Subscribed'];
        return sub
          ? <><span style={{ color: '#d97706', fontWeight: '800', fontSize: '1.05rem' }}>{sub.val}</span>{sub.sub && <span style={{ display: 'block', fontSize: '0.7rem', color: '#b45309', fontWeight: '600' }}>{sub.sub}</span>}</>
          : <span style={{ color: '#94a3b8' }}>—</span>;
      }
    },
    {
      key: 'table', label: '📊 Top Sub',
      render: (d, ipo) => {
        const isLoading = liveData[`${ipo.link}-loading`];
        const data = liveData[ipo.link];
        if (isLoading) return <Spinner />;
        if (!data?.tables?.length || !data.tables[0]?.rows?.length) return <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No data</span>;
        const t = data.tables[0];
        return (
          <div style={{ fontSize: '0.7rem', overflowX: 'auto', width: '100%', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ borderCollapse: 'collapse', width: 'max-content', margin: '0 auto' }}>
              <thead>
                <tr>{t.rows[0].map((h, i) => <th key={i} style={{ padding: '2px 4px', color: '#64748b', textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {t.rows.slice(1, 5).map((r, ri) => (
                  <tr key={ri} style={{ borderTop: '1px solid #e2e8f0' }}>
                    {r.map((c, ci) => <td key={ci} style={{ padding: '2px 4px', textAlign: ci === 0 ? 'left' : 'right', color: ci === r.length - 1 ? '#d97706' : 'var(--text-primary)', fontWeight: ci === 0 ? '600' : 'normal', whiteSpace: 'nowrap' }}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    },
    {
      key: 'actions', label: '🔗 Actions',
      render: (_, ipo) => (
        <Link
          href={`/ipo?path=${encodeURIComponent(ipo.link)}`}
          style={{ display: 'inline-block', padding: '0.35rem 0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#2563eb', fontWeight: '600', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
        >
          Full Details ↗
        </Link>
      )
    },
  ];

  return (
    <main style={{ padding: '1rem', fontFamily: 'var(--font-sans)', minHeight: '100vh', maxWidth: '1240px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: '800', color: '#0f172a', marginBottom: '0.15rem' }}>
            📈 IPO Premium Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            GMP auto-updates every 5s · Watchlist saved to database
          </p>
        </div>
        <button onClick={logout} style={{ padding: '0.45rem 0.9rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem', fontFamily: 'inherit', marginLeft: 'auto' }}>
          Sign Out
        </button>
      </div>

      {/* IPO Directory Selector */}
      <div className="portal-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <h2 style={{ fontWeight: '700', fontSize: '0.95rem', margin: 0 }}>IPO Directory</h2>
          <input
            type="text"
            placeholder="🔍 Search by name..."
            className="input-field"
            style={{ maxWidth: '240px', padding: '0.45rem 0.8rem', fontSize: '0.85rem', flexGrow: 1 }}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {selectedIpos.length > 0 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', width: '100%', smWidth: 'auto' }}>
              {selectedIpos.length} selected · saved to database
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1.25rem' }}><Spinner /></div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingRight: '2px' }}>
            {filteredIpos.map((ipo, idx) => {
              const isSelected = selectedIpos.some(i => i.link === ipo.link);
              return (
                <button key={idx} onClick={() => toggleSelection(ipo)} style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: '20px',
                  fontSize: '0.78rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: isSelected ? '#eff6ff' : '#ffffff',
                  border: isSelected ? '1px solid #2563eb' : '1px solid #cbd5e1',
                  color: isSelected ? '#2563eb' : 'var(--text-primary)',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}>
                  {isSelected ? '✓ ' : '+ '}{ipo.name || '(unnamed)'}
                </button>
              );
            })}
            {filteredIpos.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No IPOs found for "{searchTerm}"</p>}
          </div>
        )}
      </div>

      {/* Comparison Table */}
      {selectedIpos.length === 0 ? (
        <div className="portal-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📊</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '0.35rem' }}>Your watchlist is empty</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Search and click any IPO above to add it to your live comparison matrix.</p>
        </div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflow: 'hidden', borderRadius: '10px' }}>
          {/* Live indicator */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>Comparison Matrix</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a', animation: 'livePulse 1.5s infinite' }}></div>
              <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: '600' }}>GMP LIVE — updating every 5s</span>
            </div>
          </div>

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <table style={{ width: '100%', minWidth: `${Math.max(600, selectedIpos.length * 150 + 100)}px`, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', fontWeight: '700', color: '#334155', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '100px', borderRight: '1px solid #e2e8f0', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 10 }}>
                    Metric
                  </th>
                  {selectedIpos.map(ipo => (
                    <th key={ipo.link} style={{ padding: '0.6rem 0.35rem', textAlign: 'center', position: 'relative', borderRight: '1px solid #e2e8f0', overflow: 'hidden', width: '150px' }}>
                      <div style={{ fontWeight: '700', fontSize: '0.78rem', color: 'var(--text-primary)', lineHeight: '1.25', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '12px' }}>
                        {(ipo.name || '').replace(/\s*\(.*?\)\s*/g, '').trim()}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: '400', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(ipo.name || '').match(/\(([^)]+)\)/)?.[1] || ''}
                      </div>
                      <button onClick={() => removeIpo(ipo)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', zIndex: 2, padding: '2px 4px' }} title="Remove">×</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={row.key} style={{ borderBottom: '1px solid #e2e8f0', background: rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: '600', color: '#334155', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em', borderRight: '1px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc', zIndex: 10, overflow: 'hidden' }}>
                      {row.label}
                    </td>
                    {selectedIpos.map(ipo => (
                      <td key={ipo.link} style={{ padding: '0.5rem 0.35rem', textAlign: 'center', borderRight: '1px solid #e2e8f0', verticalAlign: 'middle', overflow: 'hidden' }}>
                        {row.render(liveData[ipo.link], ipo)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </main>
  );
}

function Spinner() {
  return <div className="loader" style={{ width: '16px', height: '16px', borderWidth: '2px', display: 'inline-block' }}></div>;
}
