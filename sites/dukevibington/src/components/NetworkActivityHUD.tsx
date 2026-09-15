import React, { useState, useEffect, useMemo } from 'react';
import { networkLogger, NetworkLogEntry } from '../services/networkLogger';
import {
  Activity,
  X,
  Trash2,
  Download,
  Search,
  ChevronRight,
  Copy,
  Check,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export const NetworkActivityHUD: React.FC = () => {
  const [logs, setLogs] = useState<NetworkLogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedLog, setSelectedLog] = useState<NetworkLogEntry | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'CACHE_HIT' | 'ERROR'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = networkLogger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, []);

  const categories = [
    'ALL',
    'Google Civic API',
    'Census TIGERweb',
    'Nominatim Geocoding',
    'Google Maps',
    'Cache (Memory/Storage)',
    'Cloudflare D1',
    'External Network',
  ];

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchCategory = activeCategory === 'ALL' || log.category === activeCategory;
      const matchStatus = statusFilter === 'ALL' || log.status === statusFilter;
      const matchSearch =
        !searchQuery ||
        log.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.method && log.method.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCategory && matchStatus && matchSearch;
    });
  }, [logs, activeCategory, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = logs.length;
    const cacheHits = logs.filter((l) => l.status === 'CACHE_HIT').length;
    const errors = logs.filter((l) => l.status === 'ERROR').length;
    const completed = logs.filter((l) => typeof l.durationMs === 'number' && l.durationMs > 0);
    const avgLatency =
      completed.length > 0
        ? Math.round(completed.reduce((acc, curr) => acc + (curr.durationMs || 0), 0) / completed.length)
        : 0;
    const hitRate = total > 0 ? Math.round((cacheHits / total) * 100) : 0;
    return { total, cacheHits, errors, avgLatency, hitRate };
  }, [logs]);

  const handleCopyPayload = (payload: any, id: string) => {
    if (!payload) return;
    navigator.clipboard.writeText(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportLogs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `civicpulse-network-logs-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <>
      {/* 1. Floating Launcher Pill */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2.5 px-3 py-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white rounded-full border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 group text-xs font-medium cursor-pointer"
        title="Open Real-time Network Inspector"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <Activity className="w-3.5 h-3.5 text-indigo-400 group-hover:rotate-12 transition-transform" />
        <span className="font-mono font-semibold">
          Network <span className="text-slate-400">({logs.length})</span>
        </span>
        {stats.avgLatency > 0 && (
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 font-mono">
            {stats.avgLatency}ms
          </span>
        )}
      </button>

      {/* 2. Slide-Over Network Activity Modal / Inspector */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-stretch justify-end bg-slate-950/70 backdrop-blur-sm transition-opacity">
          <div
            className={`w-full ${
              isExpanded ? 'md:w-[85vw]' : 'md:w-[620px]'
            } h-[88vh] md:h-full bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl transition-all duration-200 overflow-hidden`}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-800/90 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Network Activity Inspector
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
                      LIVE
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Real-time trace of Google Civic, Census TIGERweb, OSM & D1 Cache
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="hidden md:flex p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  title={isExpanded ? 'Restore Size' : 'Expand Inspector'}
                >
                  {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => networkLogger.clear()}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Clear All Logs"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleExportLogs}
                  className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Export Logs (JSON)"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950/40 text-center text-xs py-2 px-3 divide-x divide-slate-800">
              <div>
                <span className="text-slate-400 text-[10px] block uppercase font-semibold">Total</span>
                <span className="font-mono font-bold text-slate-200">{stats.total}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block uppercase font-semibold">Cache Hits</span>
                <span className="font-mono font-bold text-emerald-400">
                  {stats.cacheHits} ({stats.hitRate}%)
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block uppercase font-semibold">Avg Latency</span>
                <span className="font-mono font-bold text-indigo-400">{stats.avgLatency}ms</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block uppercase font-semibold">Errors</span>
                <span className={`font-mono font-bold ${stats.errors > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {stats.errors}
                </span>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-900/50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by endpoint, query or keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-all cursor-pointer ${
                      activeCategory === cat
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content Area (Split if a log is selected) */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Request List */}
              <div
                className={`overflow-y-auto ${
                  selectedLog ? 'hidden md:block md:w-1/2 border-r border-slate-800' : 'w-full'
                } divide-y divide-slate-800/60`}
              >
                {filteredLogs.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="text-xs">No network activities recorded yet.</p>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Navigate the map or switch jurisdiction levels to see live API calls.
                    </p>
                  </div>
                ) : (
                  filteredLogs.map((log) => {
                    const isSelected = selectedLog?.id === log.id;
                    const isSuccess = log.status === 'SUCCESS';
                    const isCache = log.status === 'CACHE_HIT';
                    const isError = log.status === 'ERROR';

                    return (
                      <div
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className={`p-3 cursor-pointer transition-colors text-xs flex flex-col gap-1.5 ${
                          isSelected
                            ? 'bg-indigo-950/40 border-l-2 border-indigo-500'
                            : 'hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                log.method === 'GET'
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                  : log.method === 'POST'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              }`}
                            >
                              {log.method}
                            </span>
                            <span className="font-semibold text-slate-300 truncate max-w-[200px]">
                              {log.category}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] font-mono">
                            {isCache && (
                              <span className="text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">
                                CACHE HIT
                              </span>
                            )}
                            {isSuccess && (
                              <span className="text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">
                                {log.statusCode || 200}
                              </span>
                            )}
                            {isError && (
                              <span className="text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800/60 font-bold">
                                {log.statusCode || 'ERR'}
                              </span>
                            )}
                            {typeof log.durationMs === 'number' && (
                              <span className="text-slate-400">{log.durationMs}ms</span>
                            )}
                          </div>
                        </div>

                        <div className="text-[11px] font-mono text-slate-400 truncate" title={log.url}>
                          {log.url}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                          <span>{log.timestamp}</span>
                          <span className="flex items-center text-indigo-400 group">
                            Inspect <ChevronRight className="w-3 h-3 ml-0.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Inspector Pane */}
              {selectedLog && (
                <div className="w-full md:w-1/2 flex flex-col bg-slate-950/90 overflow-hidden">
                  <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">Payload Inspector</span>
                      <span className="text-[10px] font-mono text-slate-400">[{selectedLog.category}]</span>
                    </div>
                    <button
                      onClick={() => setSelectedLog(null)}
                      className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
                    {/* URL Details */}
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
                        Endpoint URL
                      </div>
                      <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-sky-400 break-all select-all">
                        {selectedLog.url}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 bg-slate-900 rounded border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">STATUS</span>
                        <span
                          className={`font-bold ${
                            selectedLog.status === 'ERROR'
                              ? 'text-rose-400'
                              : selectedLog.status === 'CACHE_HIT'
                              ? 'text-emerald-400'
                              : 'text-emerald-300'
                          }`}
                        >
                          {selectedLog.status} {selectedLog.statusCode ? `(${selectedLog.statusCode})` : ''}
                        </span>
                      </div>
                      <div className="p-2 bg-slate-900 rounded border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">DURATION</span>
                        <span className="font-bold text-indigo-300">
                          {selectedLog.durationMs !== undefined ? `${selectedLog.durationMs} ms` : 'In Progress'}
                        </span>
                      </div>
                    </div>

                    {/* Request Payload */}
                    {selectedLog.requestPayload && (
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
                          <span>Request Payload</span>
                          <button
                            onClick={() => handleCopyPayload(selectedLog.requestPayload, 'req')}
                            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 normal-case cursor-pointer"
                          >
                            {copiedId === 'req' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedId === 'req' ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <pre className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800 text-slate-300 text-[11px] overflow-x-auto max-h-40">
                          {typeof selectedLog.requestPayload === 'string'
                            ? selectedLog.requestPayload
                            : JSON.stringify(selectedLog.requestPayload, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Response Payload */}
                    {selectedLog.responsePayload && (
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
                          <span>Response Data</span>
                          <button
                            onClick={() => handleCopyPayload(selectedLog.responsePayload, 'res')}
                            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 normal-case cursor-pointer"
                          >
                            {copiedId === 'res' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedId === 'res' ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <pre className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800 text-emerald-300 text-[11px] overflow-x-auto max-h-60 select-all">
                          {typeof selectedLog.responsePayload === 'string'
                            ? selectedLog.responsePayload
                            : JSON.stringify(selectedLog.responsePayload, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Error Message */}
                    {selectedLog.errorMessage && (
                      <div>
                        <div className="text-[10px] text-rose-400 uppercase font-bold tracking-wider mb-1">
                          Error Details
                        </div>
                        <div className="p-2.5 bg-rose-950/40 border border-rose-800/80 rounded-lg text-rose-300 text-[11px]">
                          {selectedLog.errorMessage}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
