import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Edit3, ShieldAlert, CheckCircle2, Eye, Zap } from 'lucide-react';
import { createBuggyApiClient, createFixedApiClient } from '../api/apiClient';

export function DataTable({ mode, auth, log, onBackendUpdate, serverConfig }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [lastUpdatedBackendItem, setLastUpdatedBackendItem] = useState(null);

  const apiClient = useMemo(() => {
    return mode === 'buggy'
      ? createBuggyApiClient(auth, log)
      : createFixedApiClient(auth, log);
  }, [mode, auth, log]);

  // Query configuration:
  // Both modes have refetchOnWindowFocus: true (as in user's original app!)
  const {
    data: queryResult,
    isLoading,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ['items'],
    queryFn: (context) => apiClient.fetchItems(context),
    // In buggy mode: no AbortSignal or vulnerable to HTTP cache
    // In fixed mode: AbortSignal connected and Cache-Control: no-store
    refetchOnWindowFocus: true,
    staleTime: 0,
    enabled: mode === 'buggy' ? auth.isAuthenticated : auth.hasSession
  });

  const items = queryResult?.items || [];

  // =========================================================================
  // Mutation
  // =========================================================================
  const mutation = useMutation({
    // In fixed mode: cancel any in-flight queries BEFORE mutating to avoid race condition!
    onMutate: async () => {
      if (mode === 'fixed') {
        log(`[MUTATION-FIX] 🛡️ Canceling any in-flight queries before mutation...`, 'tanstack');
        await queryClient.cancelQueries({ queryKey: ['items'] });
      }
    },
    mutationFn: apiClient.updateItem,
    onSuccess: (data) => {
      log(`[MUTATION] ✅ Backend persisted item #${data.item.id} as "${data.item.name}" (v${data.item.version})`, 'success');
      log(`[TANSTACK] 📣 Calling queryClient.invalidateQueries({ queryKey: ['items'] })...`, 'tanstack');

      setLastUpdatedBackendItem(data.item);
      if (onBackendUpdate) onBackendUpdate(data.item);

      // Invalidate to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['items'] });
    }
  });

  const handleEditClick = (item) => {
    setEditingId(item.id);
    setEditName(item.name + ' (Updated)');
  };

  const handleSave = (item) => {
    mutation.mutate({
      id: item.id,
      name: editName,
      category: item.category,
      priority: item.priority
    });
    setEditingId(null);
  };

  // Simulate tab switch: dispatches window focus event!
  const triggerWindowFocus = () => {
    log(`[TAB-SWITCH] 🔄 Switching tab back to application window -> Triggering window 'focus' event!`, 'warning');
    window.dispatchEvent(new Event('focus'));
  };

  // Check divergence between Backend Database and Table
  const staleDivergence = useMemo(() => {
    if (!lastUpdatedBackendItem) return null;
    const renderedItem = items.find(i => i.id === lastUpdatedBackendItem.id);
    if (!renderedItem) return null;

    if (lastUpdatedBackendItem.version > renderedItem.version) {
      return {
        id: lastUpdatedBackendItem.id,
        backendVersion: lastUpdatedBackendItem.version,
        backendName: lastUpdatedBackendItem.name,
        tableVersion: renderedItem.version,
        tableName: renderedItem.name
      };
    }
    return null;
  }, [items, lastUpdatedBackendItem]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Application Data Table
            {isFetching && (
              <span className="badge badge-yellow" style={{ fontSize: 11 }}>
                <RefreshCw size={12} className="spin" /> Refetching in background...
              </span>
            )}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            <span>TanStack Query: <code>refetchOnWindowFocus: true</code></span>
            <span style={{ margin: '0 8px' }}>•</span>
            <span>Server Cache-Control: <code style={{ color: serverConfig?.cacheHeaderMode === 'browser-cache' ? '#f87171' : '#34d399' }}>{serverConfig?.cacheHeaderMode}</code></span>
            {serverConfig?.getDelayMs > 0 && (
              <span style={{ marginLeft: 8, color: '#fbbf24' }}>
                (Latency: {serverConfig.getDelayMs}ms)
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-warning"
            onClick={triggerWindowFocus}
            title="Simulates switching to another tab and switching back"
          >
            <Eye size={14} /> Simulate Tab Switch (Focus Refetch)
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={14} /> Refetch
          </button>
        </div>
      </div>

      {/* DIVERGENCE ALERT BANNER */}
      {staleDivergence && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '2px solid #ef4444',
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12
        }}>
          <ShieldAlert size={24} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h4 style={{ color: '#fca5a5', fontSize: 15, fontWeight: 700, margin: 0 }}>
              STALE DATA IN NETWORK RESPONSE & TABLE DETECTED!
            </h4>
            <p style={{ color: '#fecaca', fontSize: 13, margin: '4px 0 0 0' }}>
              The backend database actually contains item #{staleDivergence.id} as <strong>"{staleDivergence.backendName}" (Version {staleDivergence.backendVersion})</strong>.
              However, the fetch request returned and the table rendered <strong>"{staleDivergence.tableName}" (Version {staleDivergence.tableVersion})</strong>!
            </p>
            <p style={{ color: '#fecaca', fontSize: 12, margin: '6px 0 0 0', opacity: 0.9 }}>
              <strong>Why this occurred:</strong>
              {serverConfig?.cacheHeaderMode === 'browser-cache' ? (
                <span> The browser cached the GET response in HTTP disk cache because the server sent <code>Cache-Control: max-age</code> without <code>no-store</code>. On tab switch, the browser served the cached response without hitting the server!</span>
              ) : (
                <span> A race condition occurred where an in-flight window focus refetch started before the mutation completed, arrived late, and clobbered the cache with the old database snapshot!</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* SYNC SUCCESS BANNER */}
      {!staleDivergence && lastUpdatedBackendItem && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid #10b981',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <CheckCircle2 size={20} color="#10b981" />
          <span style={{ color: '#6ee7b7', fontSize: 13, fontWeight: 500 }}>
            Table is perfectly in sync with backend database! Item #{lastUpdatedBackendItem.id} is at version {lastUpdatedBackendItem.version}.
          </span>
        </div>
      )}

      {/* TABLE */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          Loading table data from backend...
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>ID</th>
              <th>Task / System Name</th>
              <th>Category</th>
              <th>Priority</th>
              <th style={{ width: '100px' }}>DB Version</th>
              <th>Last Updated</th>
              <th style={{ width: '180px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isStaleRow = lastUpdatedBackendItem && lastUpdatedBackendItem.id === item.id && lastUpdatedBackendItem.version > item.version;
              const isEditing = editingId === item.id;

              return (
                <tr key={item.id} style={{ background: isStaleRow ? 'rgba(239, 68, 68, 0.12)' : 'transparent' }}>
                  <td><strong>#{item.id}</strong></td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{
                          background: '#0f172a',
                          border: '1px solid #38bdf8',
                          color: '#fff',
                          padding: '4px 8px',
                          borderRadius: 4,
                          width: '100%'
                        }}
                        autoFocus
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{item.name}</span>
                        {isStaleRow && (
                          <span className="badge badge-red" title="Table shows old version!">
                            STALE DATA
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td><span className="badge badge-blue">{item.category}</span></td>
                  <td>
                    <span className={`badge ${item.priority === 'Critical' ? 'badge-red' : item.priority === 'High' ? 'badge-yellow' : 'badge-green'}`}>
                      {item.priority}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: isStaleRow ? '#f87171' : '#34d399' }}>
                      v{item.version}
                    </span>
                  </td>
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>
                    {item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString() : 'N/A'}
                  </td>
                  <td>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-success"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => handleSave(item)}
                          disabled={mutation.isPending}
                        >
                          Save
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => handleEditClick(item)}
                        disabled={mutation.isPending}
                      >
                        <Edit3 size={12} /> Quick Update
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
