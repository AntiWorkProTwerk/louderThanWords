import React from 'react';
import { VoteRecord } from '../../types/civic';
import { CheckCircle2, XCircle, AlertCircle, FileText, Calendar, ExternalLink } from 'lucide-react';

interface VotingRecordCardProps {
  vote: VoteRecord;
}

export const VotingRecordCard: React.FC<VotingRecordCardProps> = ({ vote }) => {
  const getVoteBadge = (v: string) => {
    switch (v.toLowerCase()) {
      case 'yea':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Voted Yea
          </span>
        );
      case 'nay':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Voted Nay
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            {v}
          </span>
        );
    }
  };

  const getResultBadge = (result: string) => {
    return (
      <span
        className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${
          result === 'Passed' || result === 'Enacted'
            ? 'bg-slate-800 text-emerald-300 border border-emerald-500/30'
            : 'bg-slate-800 text-rose-300 border border-rose-500/30'
        }`}
      >
        Outcome: {result}
      </span>
    );
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all duration-200">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded">
            {vote.billNumber}
          </span>
          <span className="text-xs text-slate-400 bg-slate-800/70 px-2 py-0.5 rounded">
            {vote.category}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {getResultBadge(vote.result)}
          {getVoteBadge(vote.vote)}
        </div>
      </div>

      <h4 className="text-base font-bold text-white mb-2 leading-snug">{vote.billTitle}</h4>

      <p className="text-sm text-slate-300 mb-3.5 leading-relaxed bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
        {vote.nonPartisanSummary}
      </p>

      {/* Roll Call breakdown */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-3 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-slate-400">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            {vote.date}
          </span>
          <span className="font-mono text-slate-400">
            Chamber Vote: <strong className="text-emerald-400">{vote.breakdown.yea} Yea</strong> /{' '}
            <strong className="text-rose-400">{vote.breakdown.nay} Nay</strong>
          </span>
        </div>

        <a
          href={vote.billUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          Full Roll Call & Text
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};
