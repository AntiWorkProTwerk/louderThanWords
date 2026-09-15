import React from 'react';
import { GovernmentBuilding } from '../../types/buildings';
import { BoardGamePiece } from '../pieces/BoardGamePiece';
import {
  Building2,
  MapPin,
  Clock,
  Phone,
  Globe,
  ExternalLink,
  Users,
  CheckCircle2,
  Calendar,
  X,
  Navigation,
} from 'lucide-react';

interface BuildingInspectorCardProps {
  building: GovernmentBuilding;
  onClose: () => void;
}

export const BuildingInspectorCard: React.FC<BuildingInspectorCardProps> = ({
  building,
  onClose,
}) => {
  return (
    <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-5 shadow-2xl relative animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        title="Close Inspector"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header with Board Game Token Thumbnail */}
      <div className="flex items-start gap-4 pr-8 mb-4">
        <div className="p-1 bg-slate-950/80 rounded-xl border border-slate-800 flex-shrink-0 shadow-inner">
          <BoardGamePiece type={building.type} size={54} showPedestal={false} isSelected={true} />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono font-semibold uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60">
              {building.typeLabel}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Level: {building.jurisdictionLevel.toUpperCase()}
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white leading-snug">{building.name}</h3>
        </div>
      </div>

      {/* 3D Piece lore / game piece description tag */}
      <div className="text-[11px] text-indigo-300/90 bg-indigo-950/40 border border-indigo-900/50 p-2.5 rounded-lg mb-4 font-mono">
        🎲 <strong>Board Game Token:</strong> {building.boardGamePieceDescription}
      </div>

      {/* Address & Hours */}
      <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          <span>{building.address}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <span>{building.hours}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <a href={`tel:${building.phone}`} className="hover:text-indigo-400 transition-colors">
            {building.phone}
          </a>
        </div>
      </div>

      {/* Upcoming Hearing Spotlight if any */}
      {building.upcomingHearing && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-3 mb-4 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-amber-300 mb-1">
            <Calendar className="w-3.5 h-3.5" />
            Upcoming Scheduled Public Hearing
          </div>
          <div className="text-slate-200 font-semibold">{building.upcomingHearing.title}</div>
          <div className="text-slate-400 text-[11px] mt-0.5">
            {building.upcomingHearing.time} · {building.upcomingHearing.room}
          </div>
        </div>
      )}

      {/* Government Departments / Occupants */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-indigo-400" />
          Key Departments & Official Chambers
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-300">
          {building.occupants.map((occ, idx) => (
            <div key={idx} className="bg-slate-950/40 px-2.5 py-1.5 rounded-lg border border-slate-800/80 flex items-start gap-1.5">
              <span className="text-indigo-400 font-bold">•</span>
              <span className="truncate">{occ}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Public Counter Services */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Public Walk-in Services Available:
        </div>
        <div className="space-y-1 text-xs text-slate-300">
          {building.publicServices.map((svc, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>{svc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800 text-xs">
        <a
          href={building.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3.5 py-1.5 rounded-lg transition-colors shadow-md shadow-indigo-600/20"
        >
          <Globe className="w-3.5 h-3.5" />
          Visit Official Portal
          <ExternalLink className="w-3 h-3" />
        </a>

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
            `${building.name}, ${building.address}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 py-1.5 px-2.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <Navigation className="w-3.5 h-3.5 text-indigo-400" />
          Get Directions ↗
        </a>
      </div>
    </div>
  );
};
