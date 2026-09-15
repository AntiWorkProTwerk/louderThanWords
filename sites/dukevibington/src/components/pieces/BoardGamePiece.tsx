import React from 'react';
import { GovernmentBuildingType } from '../../types/buildings';

interface BoardGamePieceProps {
  type: GovernmentBuildingType;
  isSelected?: boolean;
  size?: number;
  showPedestal?: boolean;
  className?: string;
}

export const BoardGamePiece: React.FC<BoardGamePieceProps> = ({
  type,
  isSelected = false,
  size = 48,
  showPedestal = true,
  className = '',
}) => {
  // Theme gradients & color palettes for each piece type
  const getGradients = () => {
    switch (type) {
      case 'city_hall':
        return {
          primaryGrad: ['#f59e0b', '#d97706', '#78350f'],
          highlight: '#fde68a',
          baseColor: '#b45309',
          shadow: '#451a03',
          roof: '#fbbf24',
          accent: '#ffffff',
        };
      case 'courthouse':
        return {
          primaryGrad: ['#d97706', '#b45309', '#78350f'],
          highlight: '#fed7aa',
          baseColor: '#9a3412',
          shadow: '#431407',
          roof: '#f97316',
          accent: '#fef08a',
        };
      case 'state_capitol':
        return {
          primaryGrad: ['#6366f1', '#4f46e5', '#312e81'],
          highlight: '#c7d2fe',
          baseColor: '#4338ca',
          shadow: '#1e1b4b',
          roof: '#818cf8',
          accent: '#fbbf24',
        };
      case 'federal_building':
        return {
          primaryGrad: ['#0284c7', '#0369a1', '#0c4a6e'],
          highlight: '#bae6fd',
          baseColor: '#075985',
          shadow: '#082f49',
          roof: '#38bdf8',
          accent: '#e0f2fe',
        };
      case 'public_safety':
        return {
          primaryGrad: ['#e11d48', '#be123c', '#881337'],
          highlight: '#fecdd3',
          baseColor: '#9f1239',
          shadow: '#4c0519',
          roof: '#fb7185',
          accent: '#fef08a',
        };
      case 'library':
        return {
          primaryGrad: ['#059669', '#047857', '#064e3b'],
          highlight: '#a7f3d0',
          baseColor: '#065f46',
          shadow: '#022c22',
          roof: '#34d399',
          accent: '#ffffff',
        };
    }
  };

  const theme = getGradients();
  const pieceId = `piece-${type}`;

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative flex items-center justify-center transition-all duration-300 ${
        isSelected
          ? '-translate-y-2.5 scale-110 drop-shadow-[0_16px_12px_rgba(0,0,0,0.8)]'
          : 'hover:-translate-y-1.5 hover:scale-105 drop-shadow-[0_8px_6px_rgba(0,0,0,0.5)]'
      } ${className}`}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="overflow-visible"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id={`${pieceId}-body`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={theme.primaryGrad[0]} />
            <stop offset="50%" stopColor={theme.primaryGrad[1]} />
            <stop offset="100%" stopColor={theme.primaryGrad[2]} />
          </linearGradient>

          <linearGradient id={`${pieceId}-roof`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={theme.highlight} />
            <stop offset="100%" stopColor={theme.roof} />
          </linearGradient>

          <radialGradient id={`${pieceId}-pedestal`} cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor={theme.baseColor} />
            <stop offset="100%" stopColor={theme.shadow} />
          </radialGradient>

          <filter id={`${pieceId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor={theme.shadow} floodOpacity="0.6" />
          </filter>
        </defs>

        {/* 1. Base Pedestal (Board Game Token Base) */}
        {showPedestal && (
          <g transform="translate(0, 10)">
            <ellipse cx="50" cy="80" rx="42" ry="14" fill="#000000" opacity="0.4" />
            <ellipse cx="50" cy="76" rx="38" ry="12" fill={theme.shadow} />
            <path
              d="M 12 76 C 12 84, 88 84, 88 76 L 88 72 C 88 80, 12 80, 12 72 Z"
              fill={theme.shadow}
            />
            <ellipse cx="50" cy="72" rx="36" ry="10" fill={`url(#${pieceId}-pedestal)`} stroke={theme.highlight} strokeWidth="1.5" />
            <ellipse cx="50" cy="72" rx="31" ry="8" fill="none" stroke={theme.highlight} strokeWidth="0.75" strokeDasharray="3,2" opacity="0.8" />
          </g>
        )}

        {/* 2. Distinct 3D Board Game Token Sculptures */}

        {/* CITY HALL (Classic Neoclassical Monopoly Town Hall with Clock Tower) */}
        {type === 'city_hall' && (
          <g filter={`url(#${pieceId}-glow)`}>
            {/* Main Hall Facade */}
            <rect x="24" y="44" width="52" height="34" rx="2" fill={`url(#${pieceId}-body)`} stroke={theme.shadow} strokeWidth="1.5" />
            {/* Columns (4 fluted ionic columns) */}
            <rect x="28" y="48" width="4" height="28" rx="1" fill={theme.highlight} />
            <rect x="42" y="48" width="4" height="28" rx="1" fill={theme.highlight} />
            <rect x="54" y="48" width="4" height="28" rx="1" fill={theme.highlight} />
            <rect x="68" y="48" width="4" height="28" rx="1" fill={theme.highlight} />
            {/* Main Entrance Doorway */}
            <path d="M 46 76 L 46 62 A 4 4 0 0 1 54 62 L 54 76 Z" fill={theme.shadow} />
            {/* Classical Triangular Pediment */}
            <polygon points="20,44 50,28 80,44" fill={`url(#${pieceId}-roof)`} stroke={theme.shadow} strokeWidth="1.5" />
            <polygon points="26,42 50,30 74,42" fill={theme.highlight} opacity="0.6" />
            {/* Clock Tower Turret */}
            <rect x="42" y="16" width="16" height="14" rx="1" fill={`url(#${pieceId}-body)`} stroke={theme.shadow} strokeWidth="1.2" />
            <circle cx="50" cy="23" r="4.5" fill="#ffffff" stroke={theme.shadow} strokeWidth="1" />
            <line x1="50" y1="23" x2="50" y2="20.5" stroke={theme.shadow} strokeWidth="1" />
            <line x1="50" y1="23" x2="52.5" y2="23" stroke={theme.shadow} strokeWidth="1" />
            {/* Spire */}
            <polygon points="40,16 50,4 60,16" fill={theme.roof} stroke={theme.shadow} strokeWidth="1" />
            <circle cx="50" cy="4" r="1.5" fill="#fef08a" />
          </g>
        )}

        {/* COURTHOUSE (Scales of Justice & Classical Columns) */}
        {type === 'courthouse' && (
          <g filter={`url(#${pieceId}-glow)`}>
            {/* Main Building Block */}
            <rect x="22" y="46" width="56" height="32" rx="2" fill={`url(#${pieceId}-body)`} stroke={theme.shadow} strokeWidth="1.5" />
            {/* 6 Greek Columns */}
            <rect x="26" y="50" width="3.5" height="26" fill={theme.highlight} />
            <rect x="35" y="50" width="3.5" height="26" fill={theme.highlight} />
            <rect x="44" y="50" width="3.5" height="26" fill={theme.highlight} />
            <rect x="53" y="50" width="3.5" height="26" fill={theme.highlight} />
            <rect x="62" y="50" width="3.5" height="26" fill={theme.highlight} />
            <rect x="71" y="50" width="3.5" height="26" fill={theme.highlight} />
            {/* Pediment */}
            <polygon points="18,46 50,26 82,46" fill={`url(#${pieceId}-roof)`} stroke={theme.shadow} strokeWidth="1.5" />
            {/* Scales of Justice in Pediment */}
            <line x1="50" y1="32" x2="50" y2="40" stroke={theme.accent} strokeWidth="1.5" />
            <line x1="43" y1="34" x2="57" y2="34" stroke={theme.accent} strokeWidth="1.5" />
            <path d="M 40 37 A 3 3 0 0 0 46 37 Z" fill={theme.accent} />
            <path d="M 54 37 A 3 3 0 0 0 60 37 Z" fill={theme.accent} />
            {/* Eagle/Justice Finial */}
            <polygon points="46,26 50,18 54,26" fill={theme.highlight} />
          </g>
        )}

        {/* STATE CAPITOL (Grand Stepped Rotunda & Ribbed Dome) */}
        {type === 'state_capitol' && (
          <g filter={`url(#${pieceId}-glow)`}>
            {/* Wings */}
            <rect x="16" y="52" width="68" height="26" rx="2" fill={`url(#${pieceId}-body)`} stroke={theme.shadow} strokeWidth="1.5" />
            {/* Wing details */}
            <rect x="20" y="56" width="16" height="18" fill={theme.shadow} opacity="0.3" rx="1" />
            <rect x="64" y="56" width="16" height="18" fill={theme.shadow} opacity="0.3" rx="1" />
            {/* Center Drum */}
            <rect x="36" y="36" width="28" height="20" fill={`url(#${pieceId}-body)`} stroke={theme.shadow} strokeWidth="1.2" />
            {/* Colonnade */}
            <rect x="40" y="40" width="2.5" height="14" fill={theme.highlight} />
            <rect x="46" y="40" width="2.5" height="14" fill={theme.highlight} />
            <rect x="52" y="40" width="2.5" height="14" fill={theme.highlight} />
            <rect x="58" y="40" width="2.5" height="14" fill={theme.highlight} />
            {/* Magnificent Dome */}
            <path
              d="M 33 36 C 33 18, 67 18, 67 36 Z"
              fill={`url(#${pieceId}-roof)`}
              stroke={theme.shadow}
              strokeWidth="1.5"
            />
            {/* Dome Ribs */}
            <path d="M 50 18 L 50 36" stroke={theme.highlight} strokeWidth="1.2" />
            <path d="M 42 22 Q 43 30 42 36" stroke={theme.highlight} strokeWidth="1" opacity="0.8" />
            <path d="M 58 22 Q 57 30 58 36" stroke={theme.highlight} strokeWidth="1" opacity="0.8" />
            {/* Lantern / Spire & Gold Flag */}
            <rect x="47.5" y="12" width="5" height="7" rx="1" fill={theme.highlight} stroke={theme.shadow} strokeWidth="0.8" />
            <line x1="50" y1="12" x2="50" y2="4" stroke="#fbbf24" strokeWidth="1.5" />
            <polygon points="50,4 58,7 50,10" fill="#fbbf24" />
          </g>
        )}

        {/* FEDERAL BUILDING (Monumental Eagle Portico) */}
        {type === 'federal_building' && (
          <g filter={`url(#${pieceId}-glow)`}>
            {/* Base Block */}
            <rect x="22" y="40" width="56" height="38" rx="2" fill={`url(#${pieceId}-body)`} stroke={theme.shadow} strokeWidth="1.5" />
            {/* Windows Grid */}
            <rect x="28" y="46" width="6" height="8" rx="1" fill={theme.shadow} opacity="0.4" />
            <rect x="38" y="46" width="6" height="8" rx="1" fill={theme.shadow} opacity="0.4" />
            <rect x="56" y="46" width="6" height="8" rx="1" fill={theme.shadow} opacity="0.4" />
            <rect x="66" y="46" width="6" height="8" rx="1" fill={theme.shadow} opacity="0.4" />
            <rect x="28" y="58" width="6" height="8" rx="1" fill={theme.shadow} opacity="0.4" />
            <rect x="38" y="58" width="6" height="8" rx="1" fill={theme.shadow} opacity="0.4" />
            <rect x="56" y="58" width="6" height="8" rx="1" fill={theme.shadow} opacity="0.4" />
            <rect x="66" y="58" width="6" height="8" rx="1" fill={theme.shadow} opacity="0.4" />
            {/* Federal Portico Entrance */}
            <rect x="45" y="52" width="10" height="26" fill={theme.highlight} stroke={theme.shadow} strokeWidth="1" />
            <path d="M 47 78 L 47 66 A 3 3 0 0 1 53 66 L 53 78 Z" fill={theme.shadow} />
            {/* Parapet & Monumental Roof */}
            <rect x="18" y="34" width="64" height="8" rx="1" fill={`url(#${pieceId}-roof)`} stroke={theme.shadow} strokeWidth="1.2" />
            {/* Eagle Shield Emblem */}
            <circle cx="50" cy="26" r="9" fill={theme.highlight} stroke={theme.shadow} strokeWidth="1.2" />
            <path d="M 46 25 Q 50 20 54 25 Q 50 32 46 25 Z" fill={theme.baseColor} />
            <polygon points="50,14 47,20 53,20" fill={theme.roof} />
          </g>
        )}

        {/* PUBLIC SAFETY / SHERIFF HQ (Fortified Bastion Watchtower with Shield) */}
        {type === 'public_safety' && (
          <g filter={`url(#${pieceId}-glow)`}>
            {/* Octagonal Fortress Wall */}
            <polygon points="26,78 74,78 80,48 20,48" fill={`url(#${pieceId}-body)`} stroke={theme.shadow} strokeWidth="1.5" />
            {/* Crenellations (Battlements) */}
            <rect x="20" y="42" width="10" height="8" fill={`url(#${pieceId}-roof)`} stroke={theme.shadow} strokeWidth="1" />
            <rect x="36" y="42" width="10" height="8" fill={`url(#${pieceId}-roof)`} stroke={theme.shadow} strokeWidth="1" />
            <rect x="54" y="42" width="10" height="8" fill={`url(#${pieceId}-roof)`} stroke={theme.shadow} strokeWidth="1" />
            <rect x="70" y="42" width="10" height="8" fill={`url(#${pieceId}-roof)`} stroke={theme.shadow} strokeWidth="1" />
            {/* Central Lookout Tower */}
            <rect x="38" y="20" width="24" height="26" rx="2" fill={`url(#${pieceId}-body)`} stroke={theme.shadow} strokeWidth="1.2" />
            {/* Tower Conical Roof */}
            <polygon points="34,22 50,6 66,22" fill={`url(#${pieceId}-roof)`} stroke={theme.shadow} strokeWidth="1.5" />
            {/* Golden Sheriff Shield Crest */}
            <path
              d="M 50 54 L 59 58 C 59 66, 50 72, 50 72 C 50 72, 41 66, 41 58 Z"
              fill="#fbbf24"
              stroke={theme.shadow}
              strokeWidth="1.2"
            />
            <circle cx="50" cy="62" r="3" fill="#ffffff" />
          </g>
        )}

        {/* PUBLIC LIBRARY & ARCHIVES (Academy with Open Codex) */}
        {type === 'library' && (
          <g filter={`url(#${pieceId}-glow)`}>
            {/* Building Wings */}
            <rect x="22" y="46" width="56" height="32" rx="2" fill={`url(#${pieceId}-body)`} stroke={theme.shadow} strokeWidth="1.5" />
            {/* Tall Arched Windows */}
            <path d="M 28 72 L 28 56 A 4 4 0 0 1 36 56 L 36 72 Z" fill={theme.highlight} opacity="0.8" />
            <path d="M 64 72 L 64 56 A 4 4 0 0 1 72 56 L 72 72 Z" fill={theme.highlight} opacity="0.8" />
            {/* Central Portico */}
            <rect x="42" y="44" width="16" height="34" fill={`url(#${pieceId}-body)`} stroke={theme.shadow} strokeWidth="1.2" />
            <rect x="44" y="48" width="3" height="26" fill={theme.highlight} />
            <rect x="53" y="48" width="3" height="26" fill={theme.highlight} />
            {/* Classical Pediment */}
            <polygon points="20,46 50,32 80,46" fill={`url(#${pieceId}-roof)`} stroke={theme.shadow} strokeWidth="1.5" />
            {/* Open Book / Codex Emblem */}
            <g transform="translate(40, 16)">
              {/* Left page */}
              <path d="M 10 12 Q 2 9 0 12 L 0 4 Q 2 1 10 4 Z" fill="#ffffff" stroke={theme.shadow} strokeWidth="1" />
              {/* Right page */}
              <path d="M 10 12 Q 18 9 20 12 L 20 4 Q 18 1 10 4 Z" fill="#ffffff" stroke={theme.shadow} strokeWidth="1" />
              {/* Spine */}
              <line x1="10" y1="4" x2="10" y2="13" stroke="#d97706" strokeWidth="1.5" />
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};
