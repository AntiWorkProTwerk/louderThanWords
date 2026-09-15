import React from 'react';
import { TransparencyMetadata } from '../../types/civic';
import { ShieldCheck, Database, RefreshCw, ExternalLink, Code2 } from 'lucide-react';

interface DataTransparencyCardProps {
  transparency: TransparencyMetadata;
}

export const DataTransparencyCard: React.FC<DataTransparencyCardProps> = ({ transparency }) => {
  return (
    <div className="bg-slate-900/90 border border-indigo-900/40 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-indigo-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white">Public Data Provenance & Verification</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {transparency.dataAccuracyStatus}
              </span>
              <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                <RefreshCw className="w-3 h-3 text-slate-500" />
                Updated {new Date(transparency.lastUpdated).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800">
        {transparency.verificationNotes}
      </p>

      {/* Sourced Repositories / Public APIs */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          Open Government Data Sources ({transparency.primarySources.length})
        </div>
        <div className="space-y-2">
          {transparency.primarySources.map((source, idx) => (
            <div
              key={idx}
              className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-semibold text-slate-200">{source.name}</div>
                <div className="text-slate-400 text-[11px]">{source.agency} · {source.dataset}</div>
                <div className="text-slate-500 text-[10px] mt-0.5">Sync Frequency: {source.updateFrequency}</div>
              </div>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md border border-slate-700 transition-colors flex-shrink-0"
                title="Visit source portal"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Developer API endpoints */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5 text-indigo-400" />
          Underlying Open REST Endpoints
        </div>
        <div className="bg-slate-950 rounded-lg p-2.5 font-mono text-[11px] text-slate-400 border border-slate-800 space-y-1 overflow-x-auto">
          {transparency.apiEndpointsUsed.map((ep, idx) => (
            <div key={idx} className="text-slate-300">
              <span className="text-indigo-400 font-semibold">{ep.split(' ')[0]}</span>{' '}
              <span className="text-slate-400">{ep.substring(ep.indexOf(' ') + 1)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
