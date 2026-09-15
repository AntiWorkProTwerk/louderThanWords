import React from 'react';
import { BreadcrumbItem, JurisdictionLevel } from '../types/civic';
import { Building, MapPin, Landmark, Globe2, ChevronRight, Layers } from 'lucide-react';

interface JurisdictionLevelBarProps {
  activeLevel: JurisdictionLevel;
  onSelectLevel: (level: JurisdictionLevel) => void;
  breadcrumbs: BreadcrumbItem[];
}

export const JurisdictionLevelBar: React.FC<JurisdictionLevelBarProps> = ({
  activeLevel,
  onSelectLevel,
  breadcrumbs,
}) => {
  const levels: Array<{
    id: JurisdictionLevel;
    label: string;
    icon: React.ReactNode;
    scope: string;
  }> = [
    {
      id: 'local',
      label: 'Local / Municipal',
      icon: <Building className="w-3.5 h-3.5" />,
      scope: 'City Council · Ordinances · Infill Zoning · Public Works',
    },
    {
      id: 'county',
      label: 'County',
      icon: <MapPin className="w-3.5 h-3.5" />,
      scope: 'Board of Commissioners · Property Taxes · Sheriff · 911 Dispatch',
    },
    {
      id: 'state',
      label: 'State',
      icon: <Landmark className="w-3.5 h-3.5" />,
      scope: 'Governor · General Assembly · State Budget · Highways · Schools',
    },
    {
      id: 'federal',
      label: 'Federal',
      icon: <Globe2 className="w-3.5 h-3.5" />,
      scope: 'U.S. House & Senate · Federal Acts · FEC Campaign Filings',
    },
  ];

  const currentLevelData = levels.find((l) => l.id === activeLevel);

  return (
    <div className="bg-slate-900/90 border-b border-slate-800/80 px-4 sm:px-6 py-3 space-y-2.5">
      {/* Segmented Control Pill Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex bg-slate-950 p-1 rounded-xl border border-slate-800/90 shadow-inner w-full sm:w-auto overflow-x-auto">
          {levels.map((level) => {
            const isActive = activeLevel === level.id;
            return (
              <button
                key={level.id}
                onClick={() => onSelectLevel(level.id)}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {level.icon}
                <span>{level.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scope hint badge (hidden on very small screens) */}
        {currentLevelData && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800 font-mono">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>{currentLevelData.scope}</span>
          </div>
        )}
      </div>

      {/* Dynamic Breadcrumbs Hierarchy Bar */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 overflow-x-auto py-0.5 no-scrollbar">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
          Jurisdiction Chain:
        </span>
        {breadcrumbs.map((crumb, idx) => {
          const isSelected = crumb.level === activeLevel;
          return (
            <React.Fragment key={crumb.level}>
              {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />}
              <button
                onClick={() => onSelectLevel(crumb.level)}
                className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                  isSelected
                    ? 'bg-indigo-950/80 text-indigo-300 font-semibold border border-indigo-800/70'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span>{crumb.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
