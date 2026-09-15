import React from 'react';
import { CivicBulletin } from '../../types/civic';
import { Bell, Calendar, ExternalLink, ShieldCheck, DollarSign, CheckCircle } from 'lucide-react';

interface CivicUpdatesCardProps {
  bulletin: CivicBulletin;
}

export const CivicUpdatesCard: React.FC<CivicUpdatesCardProps> = ({ bulletin }) => {
  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Campaign Finance':
        return {
          icon: <DollarSign className="w-3.5 h-3.5 text-emerald-400" />,
          style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
      case 'Audit / Inspection':
        return {
          icon: <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />,
          style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        };
      default:
        return {
          icon: <Bell className="w-3.5 h-3.5 text-amber-400" />,
          style: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        };
    }
  };

  const badge = getTypeBadge(bulletin.type);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all duration-200">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium border ${badge.style}`}
        >
          {badge.icon}
          {bulletin.type}
        </span>

        {bulletin.amountOrMetric && (
          <span className="font-mono text-xs font-bold text-slate-200 bg-slate-800 px-2.5 py-0.5 rounded border border-slate-700">
            {bulletin.amountOrMetric}
          </span>
        )}
      </div>

      <h4 className="text-base font-bold text-white mb-1.5 leading-snug">{bulletin.title}</h4>

      <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
        <span className="text-slate-300 font-medium">{bulletin.entity}</span>
        <span>•</span>
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3 text-slate-500" />
          {bulletin.date}
        </span>
      </div>

      <p className="text-sm text-slate-300 mb-3 leading-relaxed bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
        {bulletin.summary}
      </p>

      {bulletin.keyTakeaways.length > 0 && (
        <div className="space-y-1.5 mb-3.5">
          {bulletin.keyTakeaways.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-slate-800 text-xs">
        <a
          href={bulletin.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
        >
          View Official Filing & Open Records
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};
