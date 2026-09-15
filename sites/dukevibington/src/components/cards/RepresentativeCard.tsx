import React, { useState } from 'react';
import { Representative } from '../../types/civic';
import { createCivicPortraitSvg } from '../../services/headshotService';
import { Phone, Mail, Globe, MapPin, Calendar, Award, ChevronDown, ChevronUp, ExternalLink, CheckCircle2 } from 'lucide-react';

interface RepresentativeCardProps {
  rep: Representative;
}

export const RepresentativeCard: React.FC<RepresentativeCardProps> = ({ rep }) => {
  const [expanded, setExpanded] = useState(false);

  const getPartyBadgeClass = (party: string) => {
    switch (party.toLowerCase()) {
      case 'democratic':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'republican':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'independent':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all duration-200 shadow-sm">
      <div className="flex items-start gap-4">
        <img
          src={rep.photoUrl}
          alt={rep.name}
          className="w-16 h-16 rounded-full object-cover border border-slate-700 flex-shrink-0 shadow-inner bg-slate-950"
          onError={(e) => {
            // Elegant civic portrait SVG fallback if image fails
            (e.target as HTMLImageElement).src = createCivicPortraitSvg(rep.name, rep.party, rep.role);
          }}
        />


        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${getPartyBadgeClass(
                rep.party
              )}`}
            >
              {rep.party}
            </span>
            <span className="text-xs text-slate-400 font-mono bg-slate-800/80 px-2 py-0.5 rounded">
              {rep.role}
            </span>
          </div>

          <h3 className="text-lg font-bold text-white truncate tracking-tight">{rep.name}</h3>
          <p className="text-sm text-slate-300 font-medium mb-1.5">{rep.title}</p>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            Term: {rep.termStart.substring(0, 4)} – {rep.termEnd.substring(0, 4)} · Next Election: {rep.nextElection}
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 my-4 pt-3 border-t border-slate-800/80 text-center">
        <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/50">
          <div className="text-base font-bold text-slate-100 font-mono">{rep.sponsoredBillsCount}</div>
          <div className="text-[11px] text-slate-400">Bills Sponsored</div>
        </div>
        <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/50">
          <div className="text-base font-bold text-slate-100 font-mono">{rep.coSponsoredBillsCount}</div>
          <div className="text-[11px] text-slate-400">Co-Sponsored</div>
        </div>
        <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/50">
          <div className="text-base font-bold text-emerald-400 font-mono">{rep.votingAttendanceRate}%</div>
          <div className="text-[11px] text-slate-400">Vote Attendance</div>
        </div>
      </div>

      {/* Key Committees */}
      {rep.committeeAssignments.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-indigo-400" />
            Committees & Assignments
          </div>
          <div className="flex flex-wrap gap-1.5">
            {rep.committeeAssignments.map((comm, idx) => (
              <span
                key={idx}
                className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700/60"
              >
                {comm}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Accordion: Biography & Full Contact Details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-300 space-y-3">
          <div>
            <span className="font-semibold text-slate-200 block mb-1">Official Background:</span>
            <p className="text-slate-400 leading-relaxed">{rep.biography}</p>
          </div>

          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <div className="flex items-center gap-2 text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <span>{rep.officeAddress}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <a href={`tel:${rep.phone}`} className="hover:text-indigo-400 transition-colors">
                {rep.phone}
              </a>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <a href={`mailto:${rep.email}`} className="hover:text-indigo-400 transition-colors">
                {rep.email}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800/60">
        <a
          href={rep.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
        >
          <Globe className="w-3.5 h-3.5" />
          Official Portal
          <ExternalLink className="w-3 h-3 ml-0.5" />
        </a>

        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 font-medium py-1 px-2 rounded hover:bg-slate-800 transition-colors"
        >
          {expanded ? (
            <>
              Less Details <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Full Profile & Contact <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
