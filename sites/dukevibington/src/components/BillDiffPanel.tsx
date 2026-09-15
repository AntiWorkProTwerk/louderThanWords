import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  FileCode,
  Search,
  TrendingUp,
  AlertCircle,
  GitCompare,
  Layers,
  Sparkles,
  BookOpen,
  Loader2,
} from 'lucide-react';
import { JurisdictionGeoProps } from './ContractCreepPanel';
import {
  BillMetadataItem,
  BillVersionItem,
  BillDiffChunk,
  LegislativeStage,
} from '../types/dossier';
import {
  generateStateDelegationBills,
  computeSectionMyersDiff,
  PRESET_TEST_BILLS,
} from '../services/billDiffService';
import { formatCompactNumber } from '../services/stateBillData';

export type BillSortOption =
  | 'volatility-desc'
  | 'volatility-asc'
  | 'delta-desc'
  | 'delta-asc'
  | 'date-desc'
  | 'date-asc';

export const BillDiffPanel: React.FC<JurisdictionGeoProps> = ({
  level,
  stateCode,
  stateName = 'State',
  countyFips,
  countyName,
  districtNumber,
  city,
}) => {
  // Selected Bill for Detail Inspector
  const [selectedBill, setSelectedBill] = useState<BillMetadataItem | null>(null);

  // Redline Comparison Version Milestones
  const [baseStageIndex, setBaseStageIndex] = useState<number>(0);
  const [compareStageIndex, setCompareStageIndex] = useState<number>(1);

  // Sorting
  const [sortOption, setSortOption] = useState<BillSortOption>('volatility-desc');

  // Dev / Test Search
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isDiffComputing, setIsDiffComputing] = useState<boolean>(false);

  // Delegation Bills for the active jurisdiction (State, County, or Local)
  const bills = useMemo(() => {
    return generateStateDelegationBills(
      stateCode,
      stateName,
      level,
      countyName,
      city,
      districtNumber
    );
  }, [stateCode, stateName, level, countyName, city, districtNumber]);

  // Sorted Bill List
  const sortedBills = useMemo(() => {
    switch (sortOption) {
      case 'volatility-desc':
        return [...bills].sort((a, b) => b.volatilityScore - a.volatilityScore);
      case 'volatility-asc':
        return [...bills].sort((a, b) => a.volatilityScore - b.volatilityScore);
      case 'delta-desc':
        return [...bills].sort(
          (a, b) => b.wordsAdded + b.wordsDeleted - (a.wordsAdded + a.wordsDeleted)
        );
      case 'delta-asc':
        return [...bills].sort(
          (a, b) => a.wordsAdded + a.wordsDeleted - (b.wordsAdded + b.wordsDeleted)
        );
      case 'date-desc':
        return [...bills].sort(
          (a, b) => new Date(b.introducedDate).getTime() - new Date(a.introducedDate).getTime()
        );
      case 'date-asc':
        return [...bills].sort(
          (a, b) => new Date(a.introducedDate).getTime() - new Date(b.introducedDate).getTime()
        );
      default:
        return bills;
    }
  }, [bills, sortOption]);

  // Handle Selecting a Bill
  const handleSelectBill = (bill: BillMetadataItem) => {
    setIsDiffComputing(true);
    setSelectedBill(bill);
    setBaseStageIndex(0);
    setCompareStageIndex(Math.max(1, bill.versions.length - 1));
    setTimeout(() => setIsDiffComputing(false), 120);
  };

  const handleStageChange = (type: 'base' | 'compare', val: number) => {
    setIsDiffComputing(true);
    if (type === 'base') setBaseStageIndex(val);
    else setCompareStageIndex(val);
    setTimeout(() => setIsDiffComputing(false), 100);
  };

  // Compute Active Diff Chunks
  const diffChunks: BillDiffChunk[] = useMemo(() => {
    if (!selectedBill || selectedBill.versions.length === 0) return [];
    const baseVer = selectedBill.versions[baseStageIndex] || selectedBill.versions[0];
    const compVer =
      selectedBill.versions[compareStageIndex] ||
      selectedBill.versions[selectedBill.versions.length - 1];

    return computeSectionMyersDiff(baseVer.fullText || '', compVer.fullText || '');
  }, [selectedBill, baseStageIndex, compareStageIndex]);

  // Search Handler
  const handleSearch = (customQuery?: string) => {
    const q = (customQuery || searchInput).trim().toLowerCase();
    if (!q) return;

    setIsSearching(true);
    setSearchFeedback(null);

    setTimeout(() => {
      // Check presets first
      const preset = Object.values(PRESET_TEST_BILLS).find(
        (p) =>
          p.displayNumber.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.shortTitle.toLowerCase().includes(q)
      );

      if (preset) {
        handleSelectBill(preset);
        setIsSearching(false);
        return;
      }

      const match = bills.find(
        (b) =>
          b.displayNumber.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q) ||
          b.shortTitle.toLowerCase().includes(q) ||
          b.sponsorName.toLowerCase().includes(q)
      );

      if (match) {
        handleSelectBill(match);
      } else {
        setSearchFeedback(`No sponsored bill record found matching "${q}".`);
      }
      setIsSearching(false);
    }, 150);
  };

  return (
    <div className="flex flex-col h-full bg-white text-stone-900 border-l border-stone-200">
      {/* 1. Header Toolbar */}
      <div className="p-5 pb-4 border-b border-stone-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedBill && (
              <button
                onClick={() => setSelectedBill(null)}
                className="p-1 -ml-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-sm transition-colors cursor-pointer"
                title="Back to bill list"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-lg font-bold text-stone-900 tracking-tight">
                  Bill Diff & Volatility
                </h1>
                <span className="text-[10px] font-sans uppercase tracking-wider font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xs">
                  {level.toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-stone-500 mt-0.5">
                {city
                  ? `${city}, ${stateCode}`
                  : countyName
                  ? `${countyName}, ${stateCode}`
                  : countyFips
                  ? `County FIPS ${countyFips}, ${stateCode}`
                  : districtNumber
                  ? `District ${districtNumber}, ${stateCode}`
                  : `${stateName} (${stateCode})`}
                {' · '}
                <span className="font-medium text-stone-600">Congressional Delegation</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Scrollable Body Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* ======================= STATE 1: BILL LIST VIEW ======================= */}
        {!selectedBill && (
          <div className="space-y-4">
            {/* Dev / Test Specific Bill Search Bar with Presets */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-stone-500" />
                  Direct Bill Redline Lookup
                </span>
                <span className="text-[10px] font-mono text-stone-400">GovInfo USLM</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch();
                  }}
                  placeholder="Paste Bill # (e.g. H.R. 5376, S. 2226)..."
                  className="flex-1 px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-xs font-mono text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800"
                />
                <button
                  onClick={() => handleSearch()}
                  disabled={isSearching || !searchInput.trim()}
                  className="px-3 py-1 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white font-medium text-xs rounded-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-white" />
                      <span>Inspecting</span>
                    </>
                  ) : (
                    'Inspect'
                  )}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-stone-500">
                <span>Historic Presets:</span>
                <button
                  type="button"
                  onClick={() => handleSearch('H.R. 5376')}
                  className="font-mono text-emerald-900 hover:underline cursor-pointer font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-xs border border-emerald-200"
                  title="Inflation Reduction Act (Reconciliation Redline)"
                >
                  H.R. 5376 (Inflation Reduction)
                </button>
                <button
                  type="button"
                  onClick={() => handleSearch('H.R. 4346')}
                  className="font-mono text-emerald-900 hover:underline cursor-pointer font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-xs border border-emerald-200"
                  title="CHIPS Act (Shell Bill Substitution)"
                >
                  H.R. 4346 (CHIPS Act)
                </button>
              </div>
              {searchFeedback && (
                <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-xs">
                  {searchFeedback}
                </div>
              )}
            </div>

            {/* Sorting Controls & Header Toolbar */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-200">
              <span className="text-stone-500 text-[11px] uppercase tracking-wider font-semibold">
                Sponsored Bills ({sortedBills.length})
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                  Sort:
                </span>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as BillSortOption)}
                  aria-label="Sort bills by"
                  className="text-xs bg-stone-50 border border-stone-200 rounded px-2 py-0.5 font-medium text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-800 cursor-pointer"
                >
                  <option value="volatility-desc">Rewrite Index: High to Low (↓)</option>
                  <option value="volatility-asc">Rewrite Index: Low to High (↑)</option>
                  <option value="delta-desc">Word Churn Delta: High to Low (↓)</option>
                  <option value="delta-asc">Word Churn Delta: Low to High (↑)</option>
                  <option value="date-desc">Date: Newest First (↓)</option>
                  <option value="date-asc">Date: Oldest First (↑)</option>
                </select>
              </div>
            </div>

            {/* Bill List */}
            <div className="divide-y divide-stone-100 -mx-5 px-5">
              {sortedBills.map((bill) => (
                <div
                  key={bill.id}
                  onClick={() => handleSelectBill(bill)}
                  className="py-4 hover:bg-stone-50/80 transition-colors cursor-pointer group px-2 -mx-2 rounded-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-stone-900 text-sm group-hover:text-emerald-900 transition-colors line-clamp-1">
                        {bill.shortTitle || bill.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-stone-500">
                        <span className="font-mono bg-stone-100 text-stone-800 px-1.5 py-0.5 rounded-xs text-[11px] font-medium">
                          {bill.displayNumber}
                        </span>
                        <span>·</span>
                        <span className="text-stone-700 font-medium">
                          {bill.sponsorName} ({bill.sponsorParty}-{bill.sponsorState}
                          {bill.sponsorDistrict ? `-${bill.sponsorDistrict}` : ''})
                        </span>
                        <span>·</span>
                        <span>{bill.policyArea}</span>
                      </div>
                    </div>

                    {/* Volatility Badge */}
                    <div className="text-right flex flex-col items-end flex-shrink-0">
                      <div className="font-mono text-xs font-semibold text-stone-800">
                        {formatCompactNumber(bill.currentWordCount)} words
                      </div>
                      <div className="mt-1">
                        {bill.volatilityScore <= 15 ? (
                          <span className="font-mono text-[10px] font-medium bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-xs border border-stone-200">
                            Pristine ({bill.volatilityScore.toFixed(0)}%)
                          </span>
                        ) : bill.volatilityScore >= 75 ? (
                          <span className="font-mono text-[11px] font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded-xs border border-red-300">
                            +{bill.volatilityScore.toFixed(1)}% Rewritten
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] font-bold bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded-xs border border-amber-200">
                            +{bill.volatilityScore.toFixed(1)}% Modified
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-stone-600 line-clamp-2 mt-2 leading-relaxed font-normal">
                    {bill.latestActionText}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================= STATE 2: DETAIL / REDLINE DIFF VIEW ======================= */}
        {selectedBill && (
          <div className="space-y-5">
            {/* Overview Card */}
            <div className="space-y-2 pb-4 border-b border-stone-200">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500">
                Legislative Dossier
              </div>
              <h2 className="font-serif text-lg font-bold text-stone-900 leading-snug">
                {selectedBill.shortTitle || selectedBill.title}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600 pt-0.5">
                <span className="font-mono bg-stone-100 text-stone-800 px-2 py-0.5 rounded-xs font-medium">
                  {selectedBill.displayNumber}
                </span>
                <span className="text-stone-300">|</span>
                <span>Sponsor: {selectedBill.sponsorName} ({selectedBill.sponsorParty}-{selectedBill.sponsorState})</span>
                <span className="text-stone-300">|</span>
                <span>Introduced: {selectedBill.introducedDate}</span>
              </div>
              <p className="text-xs text-stone-700 leading-relaxed pt-2 font-normal">
                {selectedBill.title}
              </p>
            </div>

            {/* Volatility Telemetry Bar (3 Columns) */}
            <div className="grid grid-cols-3 gap-2 p-3.5 bg-stone-50 border border-stone-200 rounded-sm text-center">
              <div className="space-y-1">
                <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">
                  Original Length
                </div>
                <div className="font-mono text-xs font-semibold text-stone-800">
                  {formatCompactNumber(selectedBill.initialWordCount)} words
                </div>
              </div>

              <div className="space-y-1 border-x border-stone-200 px-1">
                <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">
                  Final Enacted
                </div>
                <div className="font-mono text-xs font-semibold text-stone-800">
                  {formatCompactNumber(selectedBill.currentWordCount)} words
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">
                  Rewrite Index
                </div>
                <div className="font-mono text-xs font-bold text-red-700">
                  +{selectedBill.volatilityScore.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Interactive Version Stepper & Comparison Selector */}
            <div className="space-y-2 p-3.5 bg-stone-50 border border-stone-200 rounded-sm">
              <div className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <GitCompare className="w-3.5 h-3.5 text-emerald-800" />
                  Redline Version Comparison
                </span>
                <span className="text-[10px] font-mono text-stone-500">
                  {selectedBill.versions.length} Version Milestones
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] uppercase font-semibold text-stone-500 block mb-1">
                    Base Version (Left)
                  </label>
                  <select
                    value={baseStageIndex}
                    onChange={(e) => handleStageChange('base', Number(e.target.value))}
                    aria-label="Select base version"
                    className="w-full text-xs bg-white border border-stone-300 rounded px-2 py-1 font-medium text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-800 cursor-pointer"
                  >
                    {selectedBill.versions.map((ver, idx) => (
                      <option key={`base-${idx}`} value={idx}>
                        {ver.versionCode}: {ver.stageName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-stone-500 block mb-1">
                    Target Version (Right)
                  </label>
                  <select
                    value={compareStageIndex}
                    onChange={(e) => handleStageChange('compare', Number(e.target.value))}
                    aria-label="Select target comparison version"
                    className="w-full text-xs bg-white border border-stone-300 rounded px-2 py-1 font-medium text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-800 cursor-pointer"
                  >
                    {selectedBill.versions.map((ver, idx) => (
                      <option key={`comp-${idx}`} value={idx}>
                        {ver.versionCode}: {ver.stageName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Redline Diff Viewer (Editorial Serif Typography) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-stone-500" />
                  Statutory Redline Text
                </span>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-emerald-200 border border-emerald-400 rounded-xs inline-block" />
                    <span className="text-emerald-900 font-medium">Added</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-red-200 border border-red-400 rounded-xs inline-block" />
                    <span className="text-red-900 font-medium">Deleted</span>
                  </span>
                </div>
              </div>

              {isDiffComputing ? (
                <div className="py-16 text-center space-y-2 bg-stone-50 border border-stone-200 rounded-sm">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin text-emerald-800" />
                  <div className="text-xs font-serif italic text-stone-600">
                    Computing statutory Myers token diff...
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-stone-200 rounded-sm p-4 font-serif text-sm leading-relaxed text-stone-800 space-y-3 max-h-[420px] overflow-y-auto">
                  {diffChunks.map((chunk, idx) => {
                  if (chunk.type === 'added') {
                    return (
                      <div
                        key={`chunk-${idx}`}
                        className="bg-emerald-50 text-emerald-950 px-2 py-1.5 rounded-xs border-l-2 border-emerald-600 text-xs font-mono whitespace-pre-wrap leading-normal"
                      >
                        <span className="font-bold text-emerald-800 text-[10px] uppercase tracking-wider block mb-0.5">
                          + Added in {selectedBill.versions[compareStageIndex]?.versionCode}
                        </span>
                        {chunk.text}
                      </div>
                    );
                  }
                  if (chunk.type === 'deleted') {
                    return (
                      <div
                        key={`chunk-${idx}`}
                        className="bg-red-50 text-red-950 px-2 py-1.5 rounded-xs border-l-2 border-red-600 text-xs font-mono line-through decoration-red-500 whitespace-pre-wrap leading-normal opacity-75"
                      >
                        <span className="font-bold text-red-800 text-[10px] uppercase tracking-wider block mb-0.5">
                          − Stripped from {selectedBill.versions[baseStageIndex]?.versionCode}
                        </span>
                        {chunk.text}
                      </div>
                    );
                  }
                  return (
                    <p key={`chunk-${idx}`} className="text-stone-700 whitespace-pre-wrap">
                      {chunk.text}
                    </p>
                  );
                })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
