'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/* ─── Types ─── */
interface ScrapeResult {
    site: string;
    gmp: string;
    url: string;
}

interface IpoItem {
    name: string;
    link: string;
    priceBand: string;
    gmp: string;
    gmpPct: string;
    status: 'open' | 'upcoming' | 'closed';
    dateRange: string;
    type: 'Mainboard' | 'SME';
}

interface SelectedIpoData {
    ipo: IpoItem;
    gmpResults: ScrapeResult[] | null;
    loading: boolean;
}

/* ─── Site metadata ─── */
interface SourceItem {
    name: string;
    icon: string;
    domain: string;
}

const INITIAL_SOURCES: SourceItem[] = [
    { name: 'IPO Trend', icon: '📈', domain: 'ipo-trend.com' },
    { name: 'IPO Watch', icon: '👁️', domain: 'ipowatch.in' },
    { name: 'Chittorgarh', icon: '🏰', domain: 'chittorgarh.com' },
    { name: 'IPO Ji', icon: '📊', domain: 'ipoji.com' },
    { name: 'IPO Corner', icon: '🏛️', domain: 'ipocornerr.com' },
    { name: 'IPO Premium', icon: '⭐', domain: 'ipopremium.in' },
];

/* ─── Helpers ─── */
function StatusBadge({ status }: { status: IpoItem['status'] }) {
    if (status === 'open') return (
        <span className="badge badge-green">
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a', display: 'inline-block', animation: 'livePulse 1.5s infinite' }}></span>
            Open
        </span>
    );
    if (status === 'upcoming') return <span className="badge badge-blue">Upcoming</span>;
    return <span className="badge badge-gray">Closed</span>;
}

function GmpCell({ gmp }: { gmp: string }) {
    if (!gmp || gmp === 'Loading...') {
        return <div className="loader" style={{ width: '14px', height: '14px', borderWidth: '2px', display: 'inline-block' }}></div>;
    }
    const isValid = gmp !== 'N/A' && gmp !== 'Fetch Error' && gmp !== 'IPO Not Listed';
    if (!isValid) return <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>—</span>;

    // Detect direction before stripping arrows
    const hasDown = gmp.includes('↓') || gmp.toLowerCase().includes('down') || gmp.startsWith('-') || gmp.includes('(-') || gmp.includes('-₹');
    const hasUp = gmp.includes('↑') || gmp.toLowerCase().includes('up');
    
    // If explicitly has down arrow or negative sign, mark red; otherwise green
    const isNeg = hasDown && !hasUp;

    // Clean arrows and trailing movement counts (e.g., "2 ↓ / 3 ↑")
    let cleanGmp = gmp
        .replace(/[↓↑]/g, '')
        .replace(/\d+\s*\/\s*\d+/g, '') // remove trailing counters like "2 / 3"
        .replace(/\s{2,}/g, ' ')
        .trim();

    return (
        <span style={{
            fontWeight: '800',
            fontSize: '1.15rem',
            color: isNeg ? '#dc2626' : '#16a34a',
            letterSpacing: '0.01em',
        }}>
            {cleanGmp}
        </span>
    );
}

/* ─── Main Component ─── */
export default function Home() {
    const [ipoList, setIpoList] = useState<IpoItem[]>([]);
    const [selectedIpos, setSelectedIpos] = useState<SelectedIpoData[]>([]);
    const [listLoading, setListLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'upcoming' | 'closed'>('open');
    const [searchTerm, setSearchTerm] = useState('');

    const [sources, setSources] = useState<SourceItem[]>(INITIAL_SOURCES);
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

    const [loggedIn, setLoggedIn] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);

    /* ─── Auth check ─── */
    useEffect(() => {
        const hint = sessionStorage.getItem('arham_logged_in');
        setLoggedIn(hint === '1');
        setCheckingAuth(false);
    }, []);

    /* ─── Load saved sources order ─── */
    useEffect(() => {
        try {
            const saved = localStorage.getItem('arham_sources_order');
            if (saved) {
                const names: string[] = JSON.parse(saved);
                const reordered: SourceItem[] = [];
                names.forEach(name => {
                    const found = INITIAL_SOURCES.find(s => s.name === name);
                    if (found) reordered.push(found);
                });
                INITIAL_SOURCES.forEach(s => {
                    if (!reordered.some(r => r.name === s.name)) {
                        reordered.push(s);
                    }
                });
                if (reordered.length > 0) {
                    setSources(reordered);
                }
            }
        } catch {
            // ignore
        }
    }, []);

    const saveSourceOrder = (newSources: SourceItem[]) => {
        setSources(newSources);
        try {
            localStorage.setItem('arham_sources_order', JSON.stringify(newSources.map(s => s.name)));
        } catch {}
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIdx(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `${index}`);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverIdx !== index) {
            setDragOverIdx(index);
        }
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === dropIndex) {
            setDraggedIdx(null);
            setDragOverIdx(null);
            return;
        }
        const updated = [...sources];
        const [movedItem] = updated.splice(draggedIdx, 1);
        updated.splice(dropIndex, 0, movedItem);
        saveSourceOrder(updated);
        setDraggedIdx(null);
        setDragOverIdx(null);
    };

    const handleDragEnd = () => {
        setDraggedIdx(null);
        setDragOverIdx(null);
    };

    const moveSource = (fromIdx: number, toIdx: number) => {
        if (toIdx < 0 || toIdx >= sources.length) return;
        const updated = [...sources];
        const [movedItem] = updated.splice(fromIdx, 1);
        updated.splice(toIdx, 0, movedItem);
        saveSourceOrder(updated);
    };

    const resetSourceOrder = () => {
        saveSourceOrder(INITIAL_SOURCES);
    };

    const isCustomOrder = JSON.stringify(sources.map(s => s.name)) !== JSON.stringify(INITIAL_SOURCES.map(s => s.name));

    /* ─── Load IPO List & Pre-select first 2 open/upcoming IPOs ─── */
    useEffect(() => {
        async function load() {
            setListLoading(true);
            try {
                const res = await fetch('/api/list');
                const json = await res.json();
                if (json.success && Array.isArray(json.ipos) && json.ipos.length > 0) {
                    setIpoList(json.ipos);
                    
                    // Auto select top 2 active IPOs for comparison matrix
                    const active = json.ipos.filter((i: IpoItem) => i.status === 'open' || i.status === 'upcoming');
                    const initial = active.slice(0, 2);

                    const initialSelected: SelectedIpoData[] = initial.map((ipo: IpoItem) => ({
                        ipo,
                        gmpResults: null,
                        loading: true,
                    }));
                    setSelectedIpos(initialSelected);

                    // Fetch GMP for both
                    initial.forEach((ipo: IpoItem) => fetchIpoGmp(ipo));
                }
            } catch {
                // ignore
            } finally {
                setListLoading(false);
            }
        }
        load();
    }, []);

    const fetchIpoGmp = async (ipo: IpoItem) => {
        try {
            const res = await fetch(`/api/gmp?ipoName=${encodeURIComponent(ipo.name)}`);
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                setSelectedIpos(prev => prev.map(item => {
                    if (item.ipo.name === ipo.name) {
                        return { ...item, gmpResults: json.data, loading: false };
                    }
                    return item;
                }));
            }
        } catch {
            setSelectedIpos(prev => prev.map(item => {
                if (item.ipo.name === ipo.name) {
                    return { ...item, loading: false };
                }
                return item;
            }));
        }
    };

    const toggleIpoSelection = (ipo: IpoItem) => {
        const exists = selectedIpos.some(s => s.ipo.name === ipo.name);
        if (exists) {
            // Remove from matrix
            setSelectedIpos(prev => prev.filter(s => s.ipo.name !== ipo.name));
        } else {
            // Add to matrix
            const newItem: SelectedIpoData = { ipo, gmpResults: null, loading: true };
            setSelectedIpos(prev => [...prev, newItem]);
            fetchIpoGmp(ipo);
        }
    };

    const removeIpo = (ipoName: string) => {
        setSelectedIpos(prev => prev.filter(s => s.ipo.name !== ipoName));
    };

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        sessionStorage.removeItem('arham_logged_in');
        setLoggedIn(false);
    };

    // Filter directory chips
    const filteredDirectory = ipoList.filter(ipo => {
        const matchesStatus = filterStatus === 'all' || ipo.status === filterStatus;
        const matchesSearch = !searchTerm || ipo.name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: 'var(--font-sans)' }}>

            {/* ── Header ── */}
            <header className="portal-header">
                <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div className="brand-logo">
                        <span>📊</span>
                        <span>Arham IPO GMP Matrix</span>
                        <span className="badge badge-green" style={{ fontWeight: '700', fontSize: '0.62rem' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a', animation: 'livePulse 1.5s infinite', display: 'inline-block' }}></span>
                            LIVE SIDE-BY-SIDE
                        </span>
                    </div>
                    <nav style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Select multiple IPOs to compare</span>
                        {!checkingAuth && (
                            loggedIn ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>admin</span>
                                    <button
                                        onClick={handleLogout}
                                        className="btn btn-outline"
                                        style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem' }}
                                    >
                                        Logout
                                    </button>
                                </div>
                            ) : (
                                <Link href="/login" className="btn btn-primary" style={{ padding: '0.35rem 0.9rem', fontSize: '0.75rem' }}>
                                    Login →
                                </Link>
                            )
                        )}
                    </nav>
                </div>
            </header>

            <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.25rem 1rem' }}>

                {/* ── IPO Directory Selector Section ── */}
                <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                    
                    {/* Header Controls */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                        <div>
                            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                IPO Directory
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                Click chips to select/unselect IPOs ({selectedIpos.length} selected for side-by-side comparison matrix)
                            </div>
                        </div>

                        {/* Search & Filter */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                {(['open', 'upcoming', 'closed', 'all'] as const).map(st => (
                                    <button
                                        key={st}
                                        onClick={() => setFilterStatus(st)}
                                        className="btn"
                                        style={{
                                            padding: '0.25rem 0.65rem',
                                            fontSize: '0.7rem',
                                            background: filterStatus === st ? 'var(--accent-color)' : 'var(--bg-secondary)',
                                            color: filterStatus === st ? 'white' : 'var(--text-secondary)',
                                            border: `1px solid ${filterStatus === st ? 'var(--accent-color)' : 'var(--surface-border-dark)'}`,
                                            fontWeight: filterStatus === st ? '700' : '500',
                                        }}
                                    >
                                        {st === 'open' ? '🟢 Open' : st === 'upcoming' ? '🟡 Upcoming' : st === 'closed' ? '⚪ Closed' : 'All'}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search by name..."
                                className="input-field"
                                style={{ width: '170px', fontSize: '0.75rem', padding: '0.3rem 0.6rem', height: '30px' }}
                            />
                        </div>
                    </div>

                    {/* Chips Grid */}
                    {listLoading ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            <div className="loader" style={{ width: '14px', height: '14px', borderWidth: '2px', display: 'inline-block', marginRight: '0.4rem' }}></div>
                            Loading IPO directory...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                            {filteredDirectory.map((ipo, i) => {
                                const isSelected = selectedIpos.some(s => s.ipo.name === ipo.name);
                                const gmpVal = ipo.gmp && ipo.gmp !== 'N/A' ? ipo.gmp : null;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => toggleIpoSelection(ipo)}
                                        className="btn"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            padding: '0.35rem 0.8rem',
                                            borderRadius: '20px',
                                            fontSize: '0.85rem',
                                            background: isSelected ? '#eff6ff' : 'white',
                                            color: isSelected ? '#2563eb' : 'var(--text-primary)',
                                            border: `1.5px solid ${isSelected ? '#3b82f6' : '#cbd5e1'}`,
                                            fontWeight: isSelected ? '800' : '600',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        <span style={{ color: isSelected ? '#2563eb' : '#94a3b8', fontSize: '0.8rem', fontWeight: '800' }}>
                                            {isSelected ? '✓' : '+'}
                                        </span>
                                        <span>{ipo.name}</span>
                                        {gmpVal && (
                                            <span style={{
                                                background: isSelected ? '#dbeafe' : '#f0fdf4',
                                                color: isSelected ? '#1d4ed8' : '#16a34a',
                                                fontWeight: '800',
                                                fontSize: '0.78rem',
                                                padding: '0.12rem 0.5rem',
                                                borderRadius: '12px',
                                                marginLeft: '0.2rem'
                                            }}>
                                                ₹{gmpVal}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Side-by-Side Comparison Matrix Table ── */}
                <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '0.75rem 1.25rem', background: '#f8fafc', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                            <span style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                                Live GMP Comparison Matrix ({selectedIpos.length} IPOs Side-by-Side)
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                Live comparison across {sources.length} websites
                            </span>
                            {isCustomOrder && (
                                <button
                                    onClick={resetSourceOrder}
                                    title="Reset columns to default order"
                                    style={{
                                        background: 'none',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '4px',
                                        padding: '0.15rem 0.45rem',
                                        fontSize: '0.68rem',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                    }}
                                >
                                    ↺ Reset Column Order
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span>⠿</span> Drag headers to reorder
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a', animation: 'livePulse 1.5s infinite' }}></div>
                                <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: '600' }}>Live Scraping Active</span>
                            </div>
                        </div>
                    </div>

                    {selectedIpos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>📌</div>
                            No IPOs selected. Click any IPO chip from the Directory above to add it to the comparison matrix.
                        </div>
                    ) : (
                        <div className="portal-table-wrapper" style={{ border: 'none', borderRadius: '0', overflowX: 'auto' }}>
                            <table className="portal-table" style={{ width: '100%', minWidth: `${300 + sources.length * 150}px` }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '220px', minWidth: '220px', background: '#f8fafc', verticalAlign: 'middle', paddingLeft: '1rem', fontWeight: '800', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                            IPO NAME
                                        </th>
                                        {sources.map((source, sIdx) => {
                                            const isBeingDragged = draggedIdx === sIdx;
                                            const isOver = dragOverIdx === sIdx && draggedIdx !== sIdx;
                                            return (
                                                <th
                                                    key={source.name}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, sIdx)}
                                                    onDragOver={(e) => handleDragOver(e, sIdx)}
                                                    onDragEnter={(e) => { e.preventDefault(); setDragOverIdx(sIdx); }}
                                                    onDragLeave={(e) => {
                                                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                                        if (dragOverIdx === sIdx) setDragOverIdx(null);
                                                    }}
                                                    onDrop={(e) => handleDrop(e, sIdx)}
                                                    onDragEnd={handleDragEnd}
                                                    style={{
                                                        minWidth: '150px',
                                                        background: isOver ? '#e0f2fe' : (isBeingDragged ? '#e2e8f0' : '#f1f5f9'),
                                                        textAlign: 'center',
                                                        padding: '0.65rem 0.5rem',
                                                        borderLeft: isOver ? '2px solid #0284c7' : '1px solid #e2e8f0',
                                                        cursor: 'grab',
                                                        userSelect: 'none',
                                                        opacity: isBeingDragged ? 0.4 : 1,
                                                        transition: 'background 0.15s ease, border-color 0.15s ease',
                                                        position: 'relative'
                                                    }}
                                                    title="Drag and drop or use arrows to reorder this website column"
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem', padding: '0 0.1rem' }}>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); moveSource(sIdx, sIdx - 1); }}
                                                            disabled={sIdx === 0}
                                                            title="Move column left"
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: sIdx === 0 ? 'default' : 'pointer',
                                                                opacity: sIdx === 0 ? 0.15 : 0.6,
                                                                fontSize: '0.65rem',
                                                                padding: '1px 4px',
                                                                borderRadius: '3px',
                                                                color: 'var(--text-secondary)',
                                                                lineHeight: 1
                                                            }}
                                                        >
                                                            ◀
                                                        </button>
                                                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', cursor: 'grab' }} title="Drag column">
                                                            ⠿
                                                        </span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); moveSource(sIdx, sIdx + 1); }}
                                                            disabled={sIdx === sources.length - 1}
                                                            title="Move column right"
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: sIdx === sources.length - 1 ? 'default' : 'pointer',
                                                                opacity: sIdx === sources.length - 1 ? 0.15 : 0.6,
                                                                fontSize: '0.65rem',
                                                                padding: '1px 4px',
                                                                borderRadius: '3px',
                                                                color: 'var(--text-secondary)',
                                                                lineHeight: 1
                                                            }}
                                                        >
                                                            ▶
                                                        </button>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', marginBottom: '0.15rem' }}>
                                                        <span>{source.icon}</span>
                                                        <span style={{ color: 'var(--accent-color)', fontSize: '0.85rem', fontWeight: '800' }}>{source.name}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                        {source.domain}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedIpos.map((item, idx) => (
                                        <tr key={idx}>
                                            <td style={{ paddingLeft: '1rem', paddingRight: '2rem', paddingBottom: '0.75rem', paddingTop: '0.75rem', position: 'relative', background: '#fff' }}>
                                                <button
                                                    onClick={() => removeIpo(item.ipo.name)}
                                                    title="Remove from comparison"
                                                    style={{
                                                        position: 'absolute',
                                                        top: '50%',
                                                        right: '0.5rem',
                                                        transform: 'translateY(-50%)',
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#cbd5e1',
                                                        cursor: 'pointer',
                                                        fontSize: '0.95rem',
                                                        fontWeight: 'bold',
                                                        lineHeight: 1,
                                                        transition: 'color 0.2s'
                                                    }}
                                                    onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                                                    onMouseOut={(e) => e.currentTarget.style.color = '#cbd5e1'}
                                                >
                                                    ✕
                                                </button>
                                                <div style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '190px' }}>
                                                    {item.ipo.name}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.ipo.type}</span>
                                                    <span>•</span>
                                                    <StatusBadge status={item.ipo.status} />
                                                </div>
                                            </td>
                                            {sources.map((source, sIdx) => {
                                                const scrapedMatch = item.gmpResults?.find(r => r.site === source.name);
                                                const gmpVal = scrapedMatch ? scrapedMatch.gmp : (item.loading ? 'Loading...' : 'N/A');
                                                return (
                                                    <td key={sIdx} style={{ textAlign: 'center', borderLeft: '1px solid #e2e8f0', verticalAlign: 'middle', padding: '0.65rem' }}>
                                                        <GmpCell gmp={gmpVal} />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', borderTop: '1px solid var(--surface-border)', paddingTop: '0.85rem' }}>
                    IPO list sourced from{' '}
                    <a href="https://www.ipopremium.in" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', fontWeight: '600' }}>ipopremium.in</a>
                    {' '}· Scraped live from ipo-trend.com · ipowatch.in · chittorgarh.com · ipoji.com · ipocornerr.com
                    <br />
                    <span style={{ color: 'var(--text-muted)', marginTop: '0.3rem', display: 'inline-block' }}>Powered by <strong>Arham IPO Premium</strong></span>
                </div>

            </main>
        </div>
    );
}
