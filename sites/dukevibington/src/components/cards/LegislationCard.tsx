import React from 'react';
import { SponsoredBill } from '../../types/civic';
import { ScrollText, Calendar, Users, ExternalLink, Bookmark } from 'lucide-react';

interface LegislationCardProps {
  bill: SponsoredBill;
}

export const LegislationCard: React.FC<LegislationCardProps> = ({ bill }) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Enacted':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Passed Chamber':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'In Committee':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all duration-200">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-2.5 py-0.5 rounded">
            {bill.billNumber}
          </span>
          <span className="text-xs text-slate-400 bg-slate-800/70 px-2 py-0.5 rounded">
            {bill.policyArea}
          </span>
        </div>

        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${getStatusBadge(bill.status)}`}>
          {bill.status}
        </span>
      </div>

      <h4 className="text-base font-bold text-white mb-2 leading-snug">{bill.title}</h4>

      <p className="text-sm text-slate-300 mb-3.5 leading-relaxed bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
        {bill.summary}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-3 border-t border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bookmark className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-300">Primary Sponsor: <strong>{bill.primarySponsor}</strong></span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Introduced: {bill.introducedDate}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              {bill.coSponsorsCount} Co-sponsors
            </span>
          </div>
        </div>

        <a
          href={bill.fullTextUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
        >
          <ScrollText className="w-3.5 h-3.5" />
          View Legislation
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};
