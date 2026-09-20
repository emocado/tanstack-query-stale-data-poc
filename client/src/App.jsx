import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from './auth/AuthContext';
import { DataTable } from './components/DataTable';
import { EventLog } from './components/EventLog';
import axios from 'axios';
import {
  Clock,
  RotateCcw,
  Zap,
  Info,
  Bug,
  CheckCircle,
  RefreshCw,
  Server,
  Layers,
  Globe,
  Sliders
} from 'lucide-react';

export function App() {
  const auth = useAuth();
  const [mode, setMode] = useState('buggy'); // 'buggy' | 'fixed'
  const [serverConfig, setServerConfig] = useState({
    cacheHeaderMode: 'browser-cache',
    getDelayMs: 0
  });
  const [logs, setLogs] = useState([]);

  const addLog = useCallback((message, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-100), { time, message, type }]);
  }, []);

  // Fetch initial server config
  useEffect(() => {
    axios.get('/api/config')
      .then(res => setServerConfig(res.data))
      .catch(err => console.error('Failed to load server config', err));
  }, []);

  const updateServerConfig = async (newConfig) => {
    try {
      const res = await axios.post('/api/config', newConfig);
      setServerConfig(res.data.config);
      addLog(`[CONFIG] Server config updated: CacheHeader=${res.data.config.cacheHeaderMode}, Latency=${res.data.config.getDelayMs}ms`, 'auth');
    } catch (err) {
      addLog(`[CONFIG] ❌ Failed to update server config: ${err.message}`, 'error');
    }
  };

  const handleResetDb = async () => {
    try {
      await axios.post('/api/reset');
      addLog(`[DB] 🔄 Backend database reset to default items.`, 'success');
      window.location.reload();
    } catch (err) {
      addLog(`[DB] ❌ Failed to reset database: ${err.message}`, 'error');
    }
  };

  const handleSimulateF5 = () => {
    addLog(`[BROWSER] 🔄 Simulating Page Reload (F5)...`, 'warning');
    window.location.reload();
  };

  return (
    <div className="container">
      {/* HEADER */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#38bdf8' }}>TanStack Query</span> + Tab Switch Stale Data Lab
            </h1>
            <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>
              Demonstrating why <code>refetchOnWindowFocus</code> / tab-switching returns stale data and how to fix it.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={handleResetDb} title="Reset backend database items">
              <RotateCcw size={14} /> Reset DB
            </button>
            <button className="btn btn-secondary" onClick={handleSimulateF5} title="Simulate full browser refresh">
              <RefreshCw size={14} /> Simulate F5 Refresh
            </button>
          </div>
        </div>
      </header>

      {/* MODE SWITCHER */}
      <div className="card" style={{ background: mode === 'buggy' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)', borderColor: mode === 'buggy' ? '#ef4444' : '#10b981' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: mode === 'buggy' ? '#f87171' : '#34d399' }}>
              Execution Mode
            </span>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>
              {mode === 'buggy' ? '🔴 Buggy Mode (Original Problem)' : '🟢 Fixed Mode (Production Solution)'}
            </h3>
            <p style={{ color: '#cbd5e1', fontSize: 13, marginTop: 2 }}>
              {mode === 'buggy'
                ? 'Original behavior: Server sends HTTP Cache-Control headers without no-store, and queryFn omits AbortSignal. On tab switch, the browser serves stale cached data or in-flight races clobber state.'
                : 'Fixed behavior: Backend sends Cache-Control: no-store, queryFn attaches AbortSignal, and useMutation cancels in-flight queries onMutate. Table refetches 100% fresh data on every tab switch.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn ${mode === 'buggy' ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => {
                setMode('buggy');
                updateServerConfig({ cacheHeaderMode: 'browser-cache' });
                addLog(`[SYSTEM] Switched to BUGGY MODE (Browser HTTP Cache enabled).`, 'warning');
              }}
            >
              <Bug size={16} /> Buggy Mode
            </button>
            <button
              className={`btn ${mode === 'fixed' ? 'btn-success' : 'btn-secondary'}`}
              onClick={() => {
                setMode('fixed');
                updateServerConfig({ cacheHeaderMode: 'no-store' });
                addLog(`[SYSTEM] Switched to FIXED MODE (Cache-Control: no-store & AbortSignal enabled).`, 'success');
              }}
            >
              <CheckCircle size={16} /> Fixed Mode
            </button>
          </div>
        </div>
      </div>

      {/* DIAGNOSTIC CONTROLS: HTTP CACHING & SERVER LATENCY */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Sliders size={18} color="#38bdf8" />
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Network & HTTP Cache Diagnostics</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {/* Backend HTTP Cache Header Toggle */}
          <div style={{ background: '#0f172a', padding: 14, borderRadius: 8, border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Globe size={16} color="#60a5fa" />
              <strong style={{ fontSize: 13 }}>Backend Cache-Control Header:</strong>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
              Controls whether the browser caches <code>GET /api/items</code> in HTTP disk/memory cache.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`btn ${serverConfig.cacheHeaderMode === 'browser-cache' ? 'btn-danger' : 'btn-secondary'}`}
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => updateServerConfig({ cacheHeaderMode: 'browser-cache' })}
              >
                Browser Cache ON (Buggy)
              </button>
              <button
                className={`btn ${serverConfig.cacheHeaderMode === 'no-store' ? 'btn-success' : 'btn-secondary'}`}
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => updateServerConfig({ cacheHeaderMode: 'no-store' })}
              >
                no-store (Fixed)
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
              Header: <code>{serverConfig.cacheHeaderMode === 'browser-cache' ? 'public, max-age=120' : 'no-store, no-cache, max-age=0'}</code>
            </div>
          </div>

          {/* Latency / Race Condition Toggle */}
          <div style={{ background: '#0f172a', padding: 14, borderRadius: 8, border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Clock size={16} color="#fbbf24" />
              <strong style={{ fontSize: 13 }}>Server Latency (Race Condition Simulation):</strong>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
              Simulates slow network/DB response to test in-flight query races during tab switch.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`btn ${serverConfig.getDelayMs === 0 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => updateServerConfig({ getDelayMs: 0 })}
              >
                0ms (Fast)
              </button>
              <button
                className={`btn ${serverConfig.getDelayMs === 800 ? 'btn-warning' : 'btn-secondary'}`}
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => updateServerConfig({ getDelayMs: 800 })}
              >
                800ms (Race Condition Test)
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
              Current GET delay: <strong>{serverConfig.getDelayMs}ms</strong>
            </div>
          </div>
        </div>
      </div>

      {/* DETAILED EXPLANATION OF WHY NETWORK TAB SHOWED OLD DATA */}
      <div className="card" style={{ background: '#111e38', borderColor: '#1e3a8a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Info size={18} color="#60a5fa" />
          <h4 style={{ fontSize: 15, fontWeight: 600, color: '#93c5fd' }}>
            Why Did the Network Tab Show a Fetch with Old Data When You Switched Tabs?
          </h4>
        </div>
        <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 }}>
          <p>
            When you switch to another browser tab and switch back, TanStack Query's <code>refetchOnWindowFocus: true</code> triggers a <code>fetch('/api/items')</code>. In Chrome DevTools, you see the fetch request appear, yet the response payload contains the <strong>old stale data</strong> without your change. There are two primary technical reasons:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 6, marginBottom: 6 }}>
            <li>
              <strong>1. Browser HTTP Cache (The Collection Cache Miss):</strong> In HTTP (RFC 7234), modifying a single record with <code>PUT /api/items/1</code> only invalidates the cache for that specific item URL (<code>/api/items/1</code>). It <em>does not</em> invalidate the cache for the collection list (<code>GET /api/items</code>)! If your server did not send <code>Cache-Control: no-store</code>, the browser satisfies the window-focus refetch with its cached snapshot (status <code>200 OK (from disk cache)</code>), returning old data directly from browser memory!
            </li>
            <li>
              <strong>2. Window Focus In-Flight Race Condition:</strong> When switching tabs back to the app, <code>window.focus</code> immediately fires a GET request. If you update a row right after refocusing, the mutation updates the database in 100ms. However, if the earlier GET request was still in flight and your <code>queryFn</code> did not propagate <code>signal</code> to abort it, that earlier GET completes <em>after</em> the mutation and overwrites TanStack Query's cache with the old database snapshot!
            </li>
          </ul>
        </div>
      </div>

      {/* CORE DATA TABLE */}
      <DataTable
        mode={mode}
        auth={auth}
        log={addLog}
        serverConfig={serverConfig}
      />

      {/* REAL-TIME EVENT LOG */}
      <EventLog logs={logs} onClear={() => setLogs([])} />
    </div>
  );
}
