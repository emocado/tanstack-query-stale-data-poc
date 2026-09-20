import React, { useRef, useEffect } from 'react';
import { Terminal, Trash2 } from 'lucide-react';

export function EventLog({ logs, onClear }) {
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getTypeStyle = (type) => {
    switch (type) {
      case 'error': return '#f87171';
      case 'warning': return '#fbbf24';
      case 'success': return '#34d399';
      case 'auth': return '#a78bfa';
      case 'network': return '#38bdf8';
      case 'tanstack': return '#f43f5e';
      default: return '#94a3b8';
    }
  };

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal size={18} color="#60a5fa" />
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Real-Time Protocol & Invalidation Log</h3>
          <span className="badge badge-blue">{logs.length} events</span>
        </div>
        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onClear}>
          <Trash2 size={14} /> Clear Log
        </button>
      </div>

      <div className="log-viewer">
        {logs.length === 0 ? (
          <div style={{ color: '#64748b', fontStyle: 'italic', padding: 8 }}>
            No events logged yet. Interact with the table or simulate idle to see real-time execution.
          </div>
        ) : (
          logs.map((item, idx) => (
            <div key={idx} className="log-entry">
              <span className="log-time">[{item.time}]</span>
              <span style={{ color: getTypeStyle(item.type) }}>{item.message}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
