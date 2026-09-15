import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  ArrowLeft,
  ChevronRight,
  TrendingUp,
  Award,
  DollarSign,
  ShieldCheck,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ExternalLink,
  Layers,
  Sparkles,
  Building2,
  Landmark,
  Loader2,
  MapPin,
  Info,
} from 'lucide-react';
import {
  PoliticianWithMetrics,
  PoliticianContractLink,
  queryPoliticians,
  fetchPoliticians,
  getBioguidePhotoUrl,
} from '../services/politicianService';
import { JurisdictionGeoProps } from './ContractCreepPanel';

export type PoliticianSortMetric =
  | 'dollarCreep'
  | 'percentCreep'
  | 'initialValue'
  | 'pacDonor'
  | 'earmarkTotal';

export type SortDirection = 'desc' | 'asc';

// Currency formatter utility
function formatCurrency(amount: number, compact = false): string {
  if (isNaN(amount)) return '$0.00';
  if (compact) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Party pill styling helper
function getPartyBadge(party: string, stateCode: string, district?: string) {
  const code = district ? `${party[0]}-${stateCode}-${district}` : `${party[0]}-${stateCode}`;
  if (party === 'Democrat') {
    return {
      label: code,
      badgeClass: 'bg-blue-50 text-blue-900 border-blue-200 font-semibold',
      pillClass: 'bg-blue-600',
    };
  }
  if (party === 'Republican') {
    return {
      label: code,
      badgeClass: 'bg-red-50 text-red-900 border-red-200 font-semibold',
      pillClass: 'bg-red-600',
    };
  }
  return {
    label: code,
    badgeClass: 'bg-stone-100 text-stone-800 border-stone-300 font-semibold',
    pillClass: 'bg-stone-500',
  };
}

// Creep color styling helper
function getCreepColorClass(percent: number) {
  if (percent >= 75) return { text: 'text-red-900', bg: 'bg-red-100 border-red-300 text-red-950 font-bold' };
  if (percent >= 36) return { text: 'text-red-700', bg: 'bg-red-50 border-red-200 text-red-800 font-bold' };
  if (percent >= 16) return { text: 'text-orange-700', bg: 'bg-orange-50 border-orange-200 text-orange-800 font-semibold' };
  if (percent > 0) return { text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200 text-amber-800 font-medium' };
  return { text: 'text-stone-600', bg: 'bg-stone-100 border-stone-200 text-stone-700' };
}

export function PoliticianCreepPanel({
  level,
  stateCode,
  stateName,
  countyFips,
  countyName,
  city,
  districtNumber,
}: JurisdictionGeoProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<PoliticianSortMetric>('dollarCreep');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedPoliticianId, setSelectedPoliticianId] = useState<string | null>(null);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [politicians, setPoliticians] = useState<PoliticianWithMetrics[]>(() =>
    queryPoliticians(stateCode, countyFips, countyName, city, districtNumber)
  );

  // Live Query Effect: Asynchronously load full 539 sitting members of Congress
  React.useEffect(() => {
    let isMounted = true;
    setSelectedPoliticianId(null);
    setSearchQuery('');

    // Instant local sync populate
    const immediate = queryPoliticians(stateCode, countyFips, countyName, city, districtNumber);
    setPoliticians(immediate);

    setIsLoading(true);
    fetchPoliticians(stateCode, countyFips, countyName, city, districtNumber)
      .then((data) => {
        if (isMounted) {
          setPoliticians(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch live politicians:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [stateCode, countyFips, countyName, city, districtNumber, level]);

  // 2. Filter & Sort politicians
  const sortedPoliticians = useMemo(() => {
    let list = [...politicians];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.officialRole.toLowerCase().includes(q) ||
          p.linkedContracts.some((c) => c.recipientName.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;

      switch (sortBy) {
        case 'dollarCreep':
          valA = a.metrics.totalDollarCreep;
          valB = b.metrics.totalDollarCreep;
          break;
        case 'percentCreep':
          valA = a.metrics.aggregatePercentCreep;
          valB = b.metrics.aggregatePercentCreep;
          break;
        case 'initialValue':
          valA = a.metrics.totalInitialObligation;
          valB = b.metrics.totalInitialObligation;
          break;
        case 'pacDonor':
          valA = a.metrics.pacDonorTotal;
          valB = b.metrics.pacDonorTotal;
          break;
        case 'earmarkTotal':
          valA = a.metrics.directEarmarksTotal;
          valB = b.metrics.directEarmarksTotal;
          break;
      }

      if (sortDirection === 'asc') return valA - valB;
      return valB - valA;
    });

    return list;
  }, [politicians, searchQuery, sortBy, sortDirection]);

  // Active selected politician for detail inspection
  const activePolitician = useMemo(() => {
    if (!selectedPoliticianId) return null;
    return politicians.find((p) => p.id === selectedPoliticianId) || null;
  }, [selectedPoliticianId, politicians]);

  // Aggregate stats across current delegation
  const delegationTotals = useMemo(() => {
    let initial = 0;
    let current = 0;
    let dollarCreep = 0;
    let earmarks = 0;
    let pacTotal = 0;

    for (const p of politicians) {
      initial += p.metrics.totalInitialObligation;
      current += p.metrics.totalCurrentObligation;
      dollarCreep += p.metrics.totalDollarCreep;
      earmarks += p.metrics.directEarmarksTotal;
      pacTotal += p.metrics.pacDonorTotal;
    }

    const percentCreep = initial > 0 ? (dollarCreep / initial) * 100 : 0;
    return { initial, current, dollarCreep, percentCreep, earmarks, pacTotal };
  }, [politicians]);

  // Handle Sort Click
  const handleSortToggle = (metric: PoliticianSortMetric) => {
    if (sortBy === metric) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(metric);
      setSortDirection('desc');
    }
  };

  return (
    <div className="flex flex-col h-full bg-stone-50 font-sans text-stone-900 overflow-hidden">
      {/* 1. Slim Aggregate Rollup Ticker */}
      <div className="bg-stone-100/80 border-b border-stone-200 px-3.5 py-1.5 flex items-center justify-between text-[11px] text-stone-600 shrink-0">
        <div className="flex items-center gap-1.5">
          <span>Total Taxpayer Bloat:</span>
          <strong className="text-red-700 font-bold tabular-nums">
            +{formatCurrency(delegationTotals.dollarCreep, true)} (+{delegationTotals.percentCreep.toFixed(1)}%)
          </strong>
        </div>
        <div className="flex items-center gap-1.5">
          <span>Corporate PACs:</span>
          <strong className="text-blue-900 font-bold tabular-nums">
            {formatCurrency(delegationTotals.pacTotal, true)}
          </strong>
        </div>
      </div>

      {/* 2. Compact Search & Filter Row */}
      <div className="bg-white border-b border-stone-200 px-3 py-1.5 shrink-0 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Filter representatives or contractors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-xs bg-stone-50 border border-stone-200 rounded focus:bg-white focus:border-stone-400 focus:outline-none placeholder-stone-400"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as PoliticianSortMetric);
              setSortDirection('desc');
            }}
            aria-label="Sort elected officials by"
            className="text-xs bg-stone-50 border border-stone-200 rounded px-2 py-1 font-medium text-stone-800 focus:outline-none cursor-pointer"
          >
            <option value="dollarCreep">Bloat ($) ↓</option>
            <option value="percentCreep">Creep (%) ↓</option>
            <option value="initialValue">Budget ($) ↓</option>
            <option value="pacDonor">PAC ($) ↓</option>
          </select>
        </div>
      </div>

      {/* 3. Main Politician Card Feed / Detail Drawer */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {isLoading ? (
          <div className="py-24 text-center space-y-3">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-900" />
            <div className="space-y-1">
              <div className="text-xs font-serif font-bold text-stone-800">
                Resolving 118th Congress official delegation roster...
              </div>
              <div className="text-[11px] text-stone-500 font-sans">
                Connecting Bioguide identifiers, district representation & committee oversight
              </div>
            </div>
          </div>
        ) : selectedPoliticianId && activePolitician ? (
          /* Politician Detail Drawer View */
          <div className="bg-white border border-stone-300 rounded-sm shadow-sm p-4 space-y-4">
            <button
              onClick={() => setSelectedPoliticianId(null)}
              className="flex items-center gap-1.5 text-xs text-blue-900 hover:underline font-semibold cursor-pointer mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Representatives List
            </button>

            {/* Profile Header */}
            <div className="flex gap-3.5 items-start border-b border-stone-200 pb-3">
              <div className="relative shrink-0 w-16 h-20 bg-stone-100 border border-stone-300 rounded overflow-hidden shadow-2xs">
                {!imageErrorMap[activePolitician.id] ? (
                  <img
                    src={activePolitician.photoUrl}
                    alt={activePolitician.name}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    loading="eager"
                    onError={() =>
                      setImageErrorMap((prev) => ({ ...prev, [activePolitician.id]: true }))
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 bg-stone-100">
                    <User className="w-8 h-8" />
                  </div>
                )}
                <div
                  className={`absolute bottom-0 inset-x-0 h-1 ${
                    getPartyBadge(activePolitician.party, activePolitician.stateCode).pillClass
                  }`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-serif text-lg font-bold text-stone-900 leading-tight">
                    {activePolitician.name}
                  </h3>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      getPartyBadge(
                        activePolitician.party,
                        activePolitician.stateCode,
                        activePolitician.district
                      ).badgeClass
                    }`}
                  >
                    {getPartyBadge(
                      activePolitician.party,
                      activePolitician.stateCode,
                      activePolitician.district
                    ).label}
                  </span>
                </div>
                <div className="text-xs text-stone-600 font-medium mt-0.5">
                  {activePolitician.officialRole}
                </div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  In Office: {activePolitician.termsInOffice}
                </div>
                {activePolitician.committees && activePolitician.committees.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {activePolitician.committees.map((c, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Plain English Constituent Accountability Summary */}
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-sm p-3 text-xs text-stone-800 space-y-1">
              <div className="font-bold text-stone-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-800" />
                Constituent Accountability Check
              </div>
              <p className="text-[11px] text-stone-700 leading-relaxed">
                During their tenure, contracts within {activePolitician.name}&apos;s oversight expanded by{' '}
                <strong className="text-red-700 font-bold tabular-nums">
                  +{formatCurrency(activePolitician.metrics.totalDollarCreep, true)} (+{activePolitician.metrics.aggregatePercentCreep.toFixed(1)}%)
                </strong>
                . Over this period, linked corporate contractors contributed{' '}
                <strong className="text-blue-900 font-bold tabular-nums">
                  {formatCurrency(activePolitician.metrics.pacDonorTotal, true)}
                </strong>{' '}
                in political PAC campaign funds.
              </p>
            </div>

            {/* Official Metrics Ledger Rollup */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-stone-50 border border-stone-200 rounded p-3 text-center">
              <div>
                <div className="text-[9px] uppercase font-medium text-stone-500">Promised Budget</div>
                <div className="text-xs font-bold text-stone-800 tabular-nums">
                  {formatCurrency(activePolitician.metrics.totalInitialObligation, true)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-medium text-stone-500">Current Cost</div>
                <div className="text-xs font-bold text-stone-900 tabular-nums">
                  {formatCurrency(activePolitician.metrics.totalCurrentObligation, true)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-medium text-stone-500">Taxpayer Bloat</div>
                <div className="text-xs font-bold text-red-700 tabular-nums">
                  +{formatCurrency(activePolitician.metrics.totalDollarCreep, true)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-medium text-stone-500">Creep %</div>
                <div className="text-xs font-bold text-red-800 tabular-nums">
                  +{activePolitician.metrics.aggregatePercentCreep.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Linked Contract Receipts */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-stone-200 pb-1">
                <span className="text-xs uppercase tracking-wider font-bold text-stone-700 font-sans">
                  Benefiting Contractors & Projects ({activePolitician.linkedContracts.length})
                </span>
                <span className="text-[10px] text-stone-500 font-medium">Public Records</span>
              </div>

              {activePolitician.linkedContracts.map((link, idx) => {
                const color = getCreepColorClass(link.percentCreep);
                return (
                  <div
                    key={idx}
                    className="p-3 bg-stone-50 hover:bg-white border border-stone-200 rounded transition-colors space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-stone-900 font-serif leading-snug">
                        {link.recipientName}
                      </div>
                      <span
                        className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded border shrink-0 ${color.bg}`}
                      >
                        +{link.percentCreep.toFixed(1)}%
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-600 leading-tight">
                      {link.description}
                    </div>

                    {/* Link Reason / Accountability Tag */}
                    <div className="flex items-center gap-1.5 text-[10px] text-stone-700 bg-white border border-stone-200 px-2 py-1 rounded">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="font-semibold text-stone-900">
                        {link.linkType === 'EARMARK_SPONSOR'
                          ? 'Direct Community Earmark'
                          : link.linkType === 'DISTRICT_REP'
                          ? 'District Mandate'
                          : 'Committee Oversight'}:
                      </span>
                      <span className="truncate">{link.linkReason}</span>
                    </div>

                    {/* Financial Rollup */}
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-stone-200 text-center text-[11px]">
                      <div>
                        <div className="text-[9px] text-stone-500 font-medium">Promised</div>
                        <div className="tabular-nums font-medium">{formatCurrency(link.initialObligation, true)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-stone-500 font-medium">Billed</div>
                        <div className="tabular-nums font-medium">{formatCurrency(link.currentObligation, true)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-stone-500 font-medium">Cost Bloat</div>
                        <div className="font-bold text-red-700 tabular-nums">
                          +{formatCurrency(link.dollarCreep, true)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Politician Cards Feed */
          (() => {
            const isSubStateView = Boolean(countyName || countyFips || city || districtNumber);

            const renderPoliticianCard = (p: PoliticianWithMetrics, isStateWideScope: boolean = false) => {
              const party = getPartyBadge(p.party, p.stateCode, p.district);
              const color = getCreepColorClass(p.metrics.aggregatePercentCreep);

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPoliticianId(p.id)}
                  className="bg-white border border-stone-200 hover:border-blue-900/50 hover:shadow-xs rounded-sm p-3 transition-all cursor-pointer space-y-2 group"
                >
                  {/* Header: Photo + Name + Party + Role */}
                  <div className="flex items-center gap-2.5">
                    <div className="relative shrink-0 w-10 h-12 bg-stone-100 border border-stone-300 rounded overflow-hidden shadow-2xs">
                      {!imageErrorMap[p.id] ? (
                        <img
                          src={p.photoUrl}
                          alt={p.name}
                          referrerPolicy="no-referrer"
                          crossOrigin="anonymous"
                          loading="lazy"
                          onError={() => setImageErrorMap((prev) => ({ ...prev, [p.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 bg-stone-100">
                          <User className="w-5 h-5" />
                        </div>
                      )}
                      <div className={`absolute bottom-0 inset-x-0 h-0.5 ${party.pillClass}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h4 className="font-serif font-bold text-stone-900 group-hover:text-blue-900 transition-colors text-sm tracking-tight truncate">
                            {p.name}
                          </h4>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded border shrink-0 ${party.badgeClass}`}
                          >
                            {party.label}
                          </span>
                          {isSubStateView && (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded border shrink-0 ${
                                isStateWideScope
                                  ? 'bg-stone-100 text-stone-600 border-stone-200'
                                  : 'bg-blue-50 text-blue-900 border-blue-200 font-semibold'
                              }`}
                            >
                              {isStateWideScope ? 'State' : 'District'}
                            </span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-blue-900 transition-colors shrink-0" />
                      </div>

                      <div className="text-[11px] text-stone-600 truncate mt-0.5 flex items-center gap-1.5">
                        <span className="font-medium text-stone-700">{p.officialRole}</span>
                        <span className="text-stone-300">·</span>
                        <span className="text-stone-500 tabular-nums">{p.metrics.linkedContractsCount} Linked Awards</span>
                      </div>
                    </div>
                  </div>

                  {/* Compact High-Density Financial Strip */}
                  <div className="flex items-center justify-between bg-stone-50 border border-stone-200/80 rounded px-2.5 py-1.5 text-xs">
                    <div className="flex items-center gap-1.5 text-stone-600 font-medium">
                      <span className="text-[10px] text-stone-500">Budget:</span>
                      <span className="tabular-nums text-stone-700">{formatCurrency(p.metrics.totalInitialObligation, true)}</span>
                      <span className="text-stone-300">→</span>
                      <span className="tabular-nums text-stone-900 font-semibold">{formatCurrency(p.metrics.totalCurrentObligation, true)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-stone-500 font-medium">Bloat:</span>
                      <span className="font-bold text-red-700 tabular-nums">
                        +{formatCurrency(p.metrics.totalDollarCreep, true)}
                      </span>
                      <span
                        className={`text-[10px] tabular-nums px-1.5 py-0.2 rounded font-semibold border ${color.bg}`}
                      >
                        +{p.metrics.aggregatePercentCreep.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Corporate Beneficiary vs PAC Money Strip */}
                  <div className="flex items-center justify-between text-[11px] text-stone-600 pt-0.5">
                    <div className="truncate pr-2">
                      <span className="text-stone-500">Beneficiary:</span>{' '}
                      <span className="font-medium text-stone-800">{p.metrics.topRecipient}</span>
                    </div>
                    {p.metrics.pacDonorTotal > 0 && (
                      <span className="tabular-nums text-blue-900 font-semibold shrink-0 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-[10px]">
                        PAC: {formatCurrency(p.metrics.pacDonorTotal, true)}
                      </span>
                    )}
                  </div>
                </div>
              );
            };

            if (sortedPoliticians.length === 0) {
              return (
                <div className="text-center py-10 text-stone-400 space-y-2">
                  <User className="w-8 h-8 mx-auto text-stone-300" />
                  <p className="text-xs font-medium">No elected officials found for this query.</p>
                </div>
              );
            }

            // Sub-State view with 2 tiers
            if (isSubStateView) {
              const directOfficials = sortedPoliticians.filter(
                (p) =>
                  p.jurisdictionLevel === 'local' ||
                  p.jurisdictionLevel === 'county' ||
                  (p.jurisdictionLevel === 'federal' && Boolean(p.district))
              );
              const stateWideOfficials = sortedPoliticians.filter(
                (p) =>
                  p.jurisdictionLevel === 'state' ||
                  (p.jurisdictionLevel === 'federal' && !p.district)
              );

              return (
                <div className="space-y-4">
                  {/* Tier 1: Direct Local / District Representatives */}
                  {directOfficials.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between border-b border-stone-200 pb-1.5 pt-0.5">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-blue-900" />
                          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-800 font-sans">
                            Direct District & Local Representatives
                          </span>
                        </div>
                        <span className="text-[10px] bg-blue-50 text-blue-900 border border-blue-200 px-1.5 py-0.5 rounded font-medium">
                          Direct Mandate ({directOfficials.length})
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 leading-tight">
                        Elected officials with direct constituent representation over {city || countyName || districtNumber}.
                      </p>
                      <div className="space-y-3">
                        {directOfficials.map((p) => renderPoliticianCard(p, false))}
                      </div>
                    </div>
                  )}

                  {/* Tier 2: State-Wide Concurrent Oversight */}
                  {stateWideOfficials.length > 0 && (
                    <div className="space-y-2.5 pt-3 border-t border-stone-200">
                      <div className="flex items-center justify-between border-b border-stone-200 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Landmark className="w-3.5 h-3.5 text-stone-600" />
                          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-700 font-sans">
                            State-Wide Delegation & Senate Leadership
                          </span>
                        </div>
                        <span className="text-[10px] bg-stone-100 text-stone-700 border border-stone-200 px-1.5 py-0.5 rounded font-medium">
                          Concurrent Oversight ({stateWideOfficials.length})
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 leading-tight">
                        U.S. Senators and State Executives carrying concurrent statutory oversight over all {stateName || stateCode} jurisdictions.
                      </p>
                      <div className="space-y-3">
                        {stateWideOfficials.map((p) => renderPoliticianCard(p, true))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // Standard Unified List for National/State Views
            return sortedPoliticians.map((p) => renderPoliticianCard(p, false));
          })()
        )}
      </div>
    </div>
  );
}
