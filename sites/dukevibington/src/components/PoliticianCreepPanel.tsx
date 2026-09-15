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
      {/* 1. Header & Context */}
      <div className="bg-white border-b border-stone-200 p-4 shrink-0 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center p-1 bg-stone-100 rounded text-stone-700">
              <Landmark className="w-4 h-4 text-stone-800" />
            </span>
            <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500 font-mono">
              Accountability Index · Elected Officials
            </span>
          </div>
          <span className="text-xs font-mono font-bold bg-stone-100 px-2 py-0.5 rounded text-stone-700 border border-stone-200 flex items-center gap-1.5">
            {isLoading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-blue-900" />
                <span>Syncing Congress...</span>
              </>
            ) : (
              <span>{politicians.length} Officials Linked</span>
            )}
          </span>
        </div>

        <h2 className="text-xl font-serif font-bold text-stone-900 tracking-tight leading-snug">
          {level === 'federal' || stateCode === 'US' || !stateCode
            ? 'United States Congressional Leadership'
            : city
            ? `${city} & ${stateName || stateCode}`
            : countyName
            ? `${countyName} Delegation`
            : `${stateName || stateCode} Delegation`}
        </h2>
        <p className="text-xs text-stone-600 mt-0.5">
          Contract creep and Community Project Funding (CPF) earmark cost growth associated with sitting representatives.
        </p>

        {/* Aggregate Rollup Strip */}
        <div className="mt-3.5 grid grid-cols-3 gap-2 bg-stone-50 border border-stone-200 rounded p-2.5 text-center font-mono">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-stone-500 font-sans">
              Total Creep Growth
            </div>
            <div className="text-sm font-bold text-red-700">
              +{formatCurrency(delegationTotals.dollarCreep, true)}
            </div>
          </div>
          <div className="border-x border-stone-200">
            <div className="text-[9px] uppercase tracking-wider text-stone-500 font-sans">
              Delegation Creep %
            </div>
            <div className="text-sm font-bold text-stone-900">
              +{delegationTotals.percentCreep.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-stone-500 font-sans">
              PAC Donor Overlap
            </div>
            <div className="text-sm font-bold text-blue-900">
              {formatCurrency(delegationTotals.pacTotal, true)}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Controls Bar: Search & Multi-Metric Sorting */}
      <div className="bg-white border-b border-stone-200 px-4 py-2.5 shrink-0 space-y-2">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search elected official, contractor, or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded focus:bg-white focus:border-stone-400 focus:outline-none placeholder-stone-400"
          />
        </div>

        {/* Industry Standard 3-Metric Sorting Button Strip */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto text-[11px] pt-0.5">
          <span className="text-[10px] uppercase font-semibold text-stone-500 shrink-0 mr-1 flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3" /> Sort:
          </span>

          <button
            onClick={() => handleSortToggle('dollarCreep')}
            className={`px-2 py-1 rounded border text-xs font-mono transition-colors shrink-0 ${
              sortBy === 'dollarCreep'
                ? 'bg-stone-900 text-white border-stone-900 font-bold'
                : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            Dollar Creep {sortBy === 'dollarCreep' && (sortDirection === 'desc' ? '↓' : '↑')}
          </button>

          <button
            onClick={() => handleSortToggle('percentCreep')}
            className={`px-2 py-1 rounded border text-xs font-mono transition-colors shrink-0 ${
              sortBy === 'percentCreep'
                ? 'bg-stone-900 text-white border-stone-900 font-bold'
                : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            Creep % {sortBy === 'percentCreep' && (sortDirection === 'desc' ? '↓' : '↑')}
          </button>

          <button
            onClick={() => handleSortToggle('initialValue')}
            className={`px-2 py-1 rounded border text-xs font-mono transition-colors shrink-0 ${
              sortBy === 'initialValue'
                ? 'bg-stone-900 text-white border-stone-900 font-bold'
                : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            Total Award {sortBy === 'initialValue' && (sortDirection === 'desc' ? '↓' : '↑')}
          </button>

          <button
            onClick={() => handleSortToggle('pacDonor')}
            className={`px-2 py-1 rounded border text-xs font-mono transition-colors shrink-0 ${
              sortBy === 'pacDonor'
                ? 'bg-stone-900 text-white border-stone-900 font-bold'
                : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            PAC Donors {sortBy === 'pacDonor' && (sortDirection === 'desc' ? '↓' : '↑')}
          </button>
        </div>
      </div>

      {/* 3. Main Politician Card Feed / Detail Drawer */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {selectedPoliticianId && activePolitician ? (
          /* Politician Detail Drawer View */
          <div className="bg-white border border-stone-300 rounded shadow-sm p-4 space-y-4">
            <button
              onClick={() => setSelectedPoliticianId(null)}
              className="flex items-center gap-1.5 text-xs text-blue-900 hover:underline font-semibold cursor-pointer mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Official Leaderboard
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
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
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
                <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                  Terms: {activePolitician.termsInOffice}
                </div>
                {activePolitician.committees && activePolitician.committees.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {activePolitician.committees.map((c, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Official Metrics Ledger Rollup */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-stone-50 border border-stone-200 rounded p-3 text-center font-mono">
              <div>
                <div className="text-[9px] uppercase font-sans text-stone-500">Initial Obligation</div>
                <div className="text-xs font-bold text-stone-800">
                  {formatCurrency(activePolitician.metrics.totalInitialObligation, true)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-sans text-stone-500">Current Total</div>
                <div className="text-xs font-bold text-stone-900">
                  {formatCurrency(activePolitician.metrics.totalCurrentObligation, true)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-sans text-stone-500">Total Dollar Creep</div>
                <div className="text-xs font-bold text-red-700">
                  +{formatCurrency(activePolitician.metrics.totalDollarCreep, true)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-sans text-stone-500">Creep Growth %</div>
                <div className="text-xs font-bold text-red-800">
                  +{activePolitician.metrics.aggregatePercentCreep.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Linked Contract Receipts */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-stone-200 pb-1">
                <span className="text-xs uppercase tracking-wider font-bold text-stone-700 font-mono">
                  Linked Contract Receipts ({activePolitician.linkedContracts.length})
                </span>
                <span className="text-[10px] text-stone-500 font-mono">Verified Receipts</span>
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
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${color.bg}`}
                      >
                        +{link.percentCreep.toFixed(1)}%
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-600 leading-tight">
                      {link.description}
                    </div>

                    {/* Link Reason / Accountability Tag */}
                    <div className="flex items-center gap-1.5 text-[10px] text-stone-700 bg-white border border-stone-200 px-2 py-1 rounded">
                      <ShieldCheck className="w-3 h-3 text-emerald-700 shrink-0" />
                      <span className="font-semibold text-stone-900">
                        {link.linkType === 'EARMARK_SPONSOR'
                          ? 'Direct Earmark Request'
                          : link.linkType === 'DISTRICT_REP'
                          ? 'District Representation'
                          : 'Appropriations Authorizer'}:
                      </span>
                      <span className="truncate">{link.linkReason}</span>
                    </div>

                    {/* Financial Rollup */}
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-stone-200 text-center font-mono text-[11px]">
                      <div>
                        <div className="text-[9px] font-sans text-stone-500">Initial</div>
                        <div>{formatCurrency(link.initialObligation, true)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-sans text-stone-500">Current</div>
                        <div>{formatCurrency(link.currentObligation, true)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-sans text-stone-500">Dollar Growth</div>
                        <div className="font-bold text-red-700">
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
          sortedPoliticians.map((p) => {
            const party = getPartyBadge(p.party, p.stateCode, p.district);
            const color = getCreepColorClass(p.metrics.aggregatePercentCreep);

            return (
              <div
                key={p.id}
                onClick={() => setSelectedPoliticianId(p.id)}
                className="bg-white border border-stone-200 hover:border-stone-400 rounded-sm p-3.5 shadow-2xs hover:shadow-sm transition-all cursor-pointer space-y-3"
              >
                {/* Header: Photo + Name + Party + Role */}
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0 w-12 h-14 bg-stone-100 border border-stone-300 rounded-xs overflow-hidden shadow-2xs">
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
                        <User className="w-6 h-6" />
                      </div>
                    )}
                    <div className={`absolute bottom-0 inset-x-0 h-1 ${party.pillClass}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-serif font-bold text-stone-900 text-sm tracking-tight truncate">
                          {p.name}
                        </h4>
                        <span
                          className={`text-[9px] font-mono px-1 py-0.2 rounded border ${party.badgeClass}`}
                        >
                          {party.label}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                    </div>

                    <div className="text-[11px] text-stone-600 font-medium truncate mt-0.5">
                      {p.officialRole}
                    </div>

                    <div className="text-[10px] text-stone-500 font-mono mt-0.5">
                      {p.metrics.linkedContractsCount} Linked Awards · {p.termsInOffice}
                    </div>
                  </div>
                </div>

                {/* 4-Metric Data Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-stone-50 border border-stone-200 rounded-xs p-2 text-center font-mono">
                  <div>
                    <div className="text-[8px] uppercase tracking-wider text-stone-500 font-sans">
                      Initial Obligation
                    </div>
                    <div className="text-xs font-semibold text-stone-800">
                      {formatCurrency(p.metrics.totalInitialObligation, true)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[8px] uppercase tracking-wider text-stone-500 font-sans">
                      Current Total
                    </div>
                    <div className="text-xs font-semibold text-stone-900">
                      {formatCurrency(p.metrics.totalCurrentObligation, true)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[8px] uppercase tracking-wider text-stone-500 font-sans">
                      Dollar Creep
                    </div>
                    <div className="text-xs font-bold text-red-700">
                      +{formatCurrency(p.metrics.totalDollarCreep, true)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[8px] uppercase tracking-wider text-stone-500 font-sans">
                      Creep %
                    </div>
                    <div>
                      <span
                        className={`text-[10px] font-mono px-1 py-0.2 rounded border inline-block ${color.bg}`}
                      >
                        +{p.metrics.aggregatePercentCreep.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Receipt Highlight Strip */}
                <div className="flex items-center justify-between text-[10px] text-stone-500 pt-0.5 font-sans border-t border-stone-100">
                  <div className="truncate pr-2">
                    <span className="font-semibold text-stone-700">Top Linked:</span>{' '}
                    <span className="text-stone-600 font-medium">{p.metrics.topRecipient}</span>
                  </div>
                  {p.metrics.pacDonorTotal > 0 && (
                    <span className="font-mono text-blue-900 font-semibold shrink-0 bg-blue-50 border border-blue-200 px-1 py-0.2 rounded">
                      PAC: {formatCurrency(p.metrics.pacDonorTotal, true)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {sortedPoliticians.length === 0 && (
          <div className="text-center py-10 text-stone-400 space-y-2">
            <User className="w-8 h-8 mx-auto text-stone-300" />
            <p className="text-xs font-medium">No elected officials found for this query.</p>
          </div>
        )}
      </div>
    </div>
  );
}
