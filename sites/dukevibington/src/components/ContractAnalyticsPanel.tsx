import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Landmark,
  Building2,
  Layers,
  ArrowUpDown,
  Filter,
  Info,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Award,
  User,
  Loader2,
} from 'lucide-react';
import {
  computeContractAnalytics,
  IndustrySectorStats,
  FullJurisdictionAnalytics,
} from '../services/contractAnalyticsService';
import { JurisdictionGeoProps, USAspendingAwardItem } from './ContractCreepPanel';

// Format compact large USD values
function formatCurrency(amount: number, compact = true): string {
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

// Party badge styling helper
function getPartyBadge(party: string, stateCode: string, district?: string) {
  const code = district ? `${party ? party[0] : 'I'}-${stateCode}-${district}` : `${party ? party[0] : 'I'}-${stateCode}`;
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

export interface ContractAnalyticsPanelProps extends JurisdictionGeoProps {
  contracts?: USAspendingAwardItem[];
  isLoading?: boolean;
}

export function ContractAnalyticsPanel(props: ContractAnalyticsPanelProps) {
  const { contracts, isLoading, ...geoProps } = props;
  const [selectedIndustryId, setSelectedIndustryId] = useState<string | null>(null);
  const [activeGraphTab, setActiveGraphTab] = useState<'all' | 'industries' | 'politicians' | 'contractors'>('all');

  const isSubState = Boolean(
    geoProps.countyName ||
      geoProps.countyFips ||
      geoProps.city ||
      geoProps.districtNumber ||
      geoProps.level === 'county' ||
      geoProps.level === 'local'
  );

  // Compute analytics dynamically based on active geographic jurisdiction and live contracts
  const analytics: FullJurisdictionAnalytics = useMemo(() => {
    return computeContractAnalytics(geoProps, contracts);
  }, [geoProps, contracts]);

  // Highlighted industry (if clicked)
  const activeIndustry = useMemo(() => {
    if (!selectedIndustryId) return null;
    return analytics.industries.find((i) => i.id === selectedIndustryId) || null;
  }, [selectedIndustryId, analytics]);

  return (
    <div className="flex flex-col h-full bg-stone-50 font-sans text-stone-900 overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="bg-white border-b border-stone-200 p-4 shrink-0 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center p-1 bg-stone-100 rounded text-stone-700">
              <BarChart3 className="w-4 h-4 text-blue-900" />
            </span>
            <span className="text-[11px] uppercase tracking-wider font-bold text-stone-500 font-mono">
              Contract Creep Visual Analytics Suite
            </span>
          </div>
          <span className="text-xs font-mono font-bold bg-blue-50 text-blue-950 px-2 py-0.5 rounded border border-blue-200">
            {isLoading ? 'Querying...' : `${analytics.activeContractsCount.toLocaleString()} Active Awards`}
          </span>
        </div>

        <div>
          <h2 className="text-xl font-serif font-bold text-stone-900 tracking-tight leading-snug">
            {analytics.jurisdictionTitle}
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Multi-dimensional cost growth breakdown across Industry Sectors, Congressional Sponsorship, and Contractor Concentration.
          </p>
        </div>

        {/* Global Metric Rollup */}
        <div className="grid grid-cols-3 gap-2 bg-stone-50 border border-stone-200 rounded p-2.5 text-center font-mono">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-stone-500 font-sans">
              Initial Baseline
            </div>
            <div className="text-sm font-semibold text-stone-800">
              {isLoading ? (
                <span className="text-stone-400 font-sans text-xs italic">Loading...</span>
              ) : (
                formatCurrency(analytics.totalInitial, true)
              )}
            </div>
          </div>
          <div className="border-x border-stone-200">
            <div className="text-[9px] uppercase tracking-wider text-stone-500 font-sans">
              Dollar Creep Overrun
            </div>
            <div className="text-sm font-bold text-red-700">
              {isLoading ? (
                <span className="text-stone-400 font-sans text-xs italic">Loading...</span>
              ) : (
                `+${formatCurrency(analytics.totalDollarCreep, true)}`
              )}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-stone-500 font-sans">
              Avg Cost Escalation
            </div>
            <div className="text-sm font-bold text-red-800">
              {isLoading ? (
                <span className="text-stone-400 font-sans text-xs italic">Loading...</span>
              ) : (
                `+${analytics.aggregatePercentCreep.toFixed(1)}%`
              )}
            </div>
          </div>
        </div>

        {/* Sub-Tabs Selector */}
        <div className="flex items-center gap-1.5 pt-0.5 overflow-x-auto text-[11px]">
          <button
            onClick={() => setActiveGraphTab('all')}
            className={`px-2.5 py-1 rounded-xs border font-medium transition-colors shrink-0 cursor-pointer ${
              activeGraphTab === 'all'
                ? 'bg-stone-900 text-white border-stone-900 font-bold'
                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            Overview (All Graphs)
          </button>
          <button
            onClick={() => setActiveGraphTab('industries')}
            className={`px-2.5 py-1 rounded-xs border font-medium transition-colors shrink-0 cursor-pointer ${
              activeGraphTab === 'industries'
                ? 'bg-stone-900 text-white border-stone-900 font-bold'
                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            Industry Sectors
          </button>
          <button
            onClick={() => setActiveGraphTab('politicians')}
            className={`px-2.5 py-1 rounded-xs border font-medium transition-colors shrink-0 cursor-pointer ${
              activeGraphTab === 'politicians'
                ? 'bg-stone-900 text-white border-stone-900 font-bold'
                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            Politicians vs Industry
          </button>
          <button
            onClick={() => setActiveGraphTab('contractors')}
            className={`px-2.5 py-1 rounded-xs border font-medium transition-colors shrink-0 cursor-pointer ${
              activeGraphTab === 'contractors'
                ? 'bg-stone-900 text-white border-stone-900 font-bold'
                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            Contractor Pareto
          </button>
        </div>
      </div>

      {/* 2. Main Visual Charts Body */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 bg-stone-50">
          <Loader2 className="w-8 h-8 animate-spin text-blue-900 mx-auto" />
          <div className="space-y-1">
            <div className="text-sm font-serif font-bold text-stone-900">
              Aggregating live federal procurement ledgers...
            </div>
            <div className="text-xs text-stone-500 font-sans">
              Synthesizing sector distributions, contractor concentration & oversight metrics for {analytics.jurisdictionTitle}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ========================================================================= */}
        {/* GRAPH 1: INDUSTRY SECTOR BREAKDOWN (DUAL BARS: BASELINE VS OVERRUN)     */}
        {/* ========================================================================= */}
        {(activeGraphTab === 'all' || activeGraphTab === 'industries') && (
          <div className="bg-white border border-stone-200 rounded-sm p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2 flex-wrap gap-1">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-stone-700" />
                <h3 className="font-serif font-bold text-stone-900 text-sm">
                  1. Contract Creep by Industry Sector (NAICS)
                </h3>
              </div>
              <span className="text-[10px] text-stone-600 font-mono bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded">
                {isSubState ? '📍 Local Sector Volume' : '📍 State Sector Volume'}
              </span>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Comparison of initial contracted baseline obligation vs. cumulative cost overrun across primary commercial sectors active in this jurisdiction.
            </p>

            {/* Horizontal Dual Bar Chart */}
            <div className="space-y-3 pt-1">
              {analytics.industries.map((ind) => {
                const maxInitial = Math.max(...analytics.industries.map((i) => i.currentObligation));
                const initBarWidth = Math.max(8, (ind.initialObligation / maxInitial) * 100);
                const creepBarWidth = Math.max(8, (ind.currentObligation / maxInitial) * 100);
                const isSelected = selectedIndustryId === ind.id;

                return (
                  <div
                    key={ind.id}
                    onClick={() => setSelectedIndustryId(isSelected ? null : ind.id)}
                    className={`p-2.5 rounded transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-stone-50 border-stone-400 shadow-xs ring-1 ring-stone-400'
                        : 'hover:bg-stone-50 border-stone-100 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs mb-1">
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: ind.color }}
                        />
                        <span className="font-bold text-stone-900 font-serif truncate">
                          {ind.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-mono">
                        <span className="text-stone-500 text-[11px]">
                          +{formatCurrency(ind.dollarCreep, true)}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.2 rounded font-bold text-white"
                          style={{ backgroundColor: ind.color }}
                        >
                          +{ind.percentCreep}%
                        </span>
                      </div>
                    </div>

                    {/* Dual Stacked / Overlap Bar Graphic */}
                    <div className="space-y-1">
                      {/* Current Total Bar with Creep Highlight */}
                      <div className="w-full bg-stone-100 rounded-xs h-3.5 relative overflow-hidden flex">
                        <div
                          className="h-full bg-stone-300 transition-all duration-500"
                          style={{ width: `${initBarWidth}%` }}
                          title={`Initial: ${formatCurrency(ind.initialObligation, true)}`}
                        />
                        <div
                          className="h-full transition-all duration-500 opacity-90"
                          style={{
                            width: `${creepBarWidth - initBarWidth}%`,
                            backgroundColor: ind.color,
                          }}
                          title={`Creep Overrun: +${formatCurrency(ind.dollarCreep, true)}`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-stone-500 font-mono">
                        <span>Base: {formatCurrency(ind.initialObligation, true)}</span>
                        <span>Current: {formatCurrency(ind.currentObligation, true)}</span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-2 pt-2 border-t border-stone-200 text-xs text-stone-700 bg-white p-2 rounded-xs space-y-1">
                        <div className="font-semibold text-stone-900">Sector Key Insights:</div>
                        <p className="text-[11px] text-stone-600">{ind.description}</p>
                        <div className="text-[11px] text-stone-500">
                          <span className="font-medium text-stone-700">Top Prime Awardee:</span>{' '}
                          {ind.topRecipient}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* GRAPH 2: POLITICIAN <-> INDUSTRY MATRIX (STACKED SPONSORSHIP SHARE)      */}
        {/* ========================================================================= */}
        {(activeGraphTab === 'all' || activeGraphTab === 'politicians') && (
          <div className="bg-white border border-stone-200 rounded-sm p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2 flex-wrap gap-1">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-stone-700" />
                <h3 className="font-serif font-bold text-stone-900 text-sm">
                  2. Politician ↔ Industry Creep Distribution
                </h3>
              </div>
              <span className="text-[10px] text-stone-600 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded font-medium">
                🏛️ Legislative & Executive Sponsoring
              </span>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Cost overrun magnitude attributed to each sitting official, categorized across key commercial sectors under their committee oversight.
            </p>

            <div className="space-y-3 pt-1">
              {(() => {
                const pols = (analytics.politicians || []).slice(0, 6);
                const totalGroupCreep = pols.reduce((sum, p) => sum + p.totalDollarCreep, 0) || 1;

                return pols.map((p) => {
                  const industries = p.industries || [];
                  const party = getPartyBadge(p.party, p.stateCode, p.district);
                  const shareOfGroup = ((p.totalDollarCreep / totalGroupCreep) * 100).toFixed(0);

                  return (
                    <div
                      key={p.politicianId}
                      className="p-3 bg-stone-50 hover:bg-white border border-stone-200 rounded transition-all space-y-2.5 group"
                    >
                      {/* Politician Profile Header - THE WHO */}
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0 w-10 h-12 bg-stone-100 border border-stone-300 rounded overflow-hidden shadow-2xs">
                            <img
                              src={p.photoUrl}
                              alt={p.name}
                              referrerPolicy="no-referrer"
                              crossOrigin="anonymous"
                              loading="lazy"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className={`absolute bottom-0 inset-x-0 h-0.5 ${party.pillClass}`} />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h4 className="font-serif font-bold text-stone-900 text-sm tracking-tight truncate">
                                {p.name}
                              </h4>
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded border shrink-0 ${party.badgeClass}`}
                              >
                                {party.label}
                              </span>
                            </div>

                            <div className="text-[11px] text-stone-600 truncate mt-0.5 flex items-center gap-1.5">
                              <span className="font-medium text-stone-700">{p.title}</span>
                              <span className="text-stone-300">·</span>
                              <span className="text-stone-500 tabular-nums">{shareOfGroup}% of Delegation Overrun</span>
                            </div>
                          </div>
                        </div>

                        {/* Top Right Bloat Figure */}
                        <div className="text-right shrink-0">
                          <div className="font-bold text-red-700 text-sm tabular-nums">
                            +{formatCurrency(p.totalDollarCreep, true)}
                          </div>
                          <div className="text-[10px] text-red-800 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded font-semibold inline-block tabular-nums mt-0.5">
                            +{p.aggregatePercentCreep.toFixed(1)}% Creep
                          </div>
                        </div>
                      </div>

                      {/* Visual Industry Breakdown Track */}
                      <div className="space-y-1.5">
                        {/* Segmented Bar */}
                        <div className="w-full bg-stone-200 rounded-xs h-3 overflow-hidden flex shadow-2xs">
                          {industries.map((sec, sIdx) => {
                            if (sec.percentShare <= 0) return null;
                            return (
                              <div
                                key={sIdx}
                                style={{
                                  width: `${sec.percentShare}%`,
                                  backgroundColor: sec.color,
                                }}
                                className="h-full transition-all duration-300 hover:opacity-85 border-r border-white/20 last:border-0"
                                title={`${sec.industryName}: ${sec.percentShare}% (${formatCurrency(sec.amount, true)})`}
                              />
                            );
                          })}
                        </div>

                        {/* Detailed Sector Pills Grid */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {industries.map((sec, sIdx) => {
                            if (sec.percentShare <= 0) return null;
                            return (
                              <div
                                key={sIdx}
                                className="flex items-center gap-1.5 bg-white border border-stone-200 rounded px-2 py-0.5 text-[10px] text-stone-700 shadow-2xs"
                              >
                                <div
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: sec.color }}
                                />
                                <span className="font-medium text-stone-800">
                                  {sec.shortName || sec.industryName}:
                                </span>
                                <span className="tabular-nums font-semibold text-stone-900">
                                  {formatCurrency(sec.amount, true)}
                                </span>
                                <span className="text-stone-400 tabular-nums">
                                  ({sec.percentShare}%)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* GRAPH 3: TOP CONTRACTOR CONCENTRATION (PARETO 80/20 POWER LAW)            */}
        {/* ========================================================================= */}
        {(activeGraphTab === 'all' || activeGraphTab === 'contractors') && (
          <div className="bg-white border border-stone-200 rounded-sm p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2 flex-wrap gap-1">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-stone-700" />
                <h3 className="font-serif font-bold text-stone-900 text-sm">
                  3. Contractor Concentration & Pareto Curve
                </h3>
              </div>
              <span className="text-[10px] text-stone-600 font-mono bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded">
                🏢 Top Prime Recipients
              </span>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Cumulative share of cost overruns driven by top defense and infrastructure mega-primes receiving federal funding in this area.
            </p>

            <div className="space-y-2 pt-1 font-mono text-xs">
              {analytics.topContractorsPareto.slice(0, 6).map((c) => (
                <div
                  key={c.rank}
                  className="p-2.5 bg-stone-50 border border-stone-200 rounded flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-stone-200 text-stone-800 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {c.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="font-serif font-bold text-stone-900 text-xs truncate">
                        {c.contractorName}
                      </div>
                      <div className="text-[10px] text-stone-500">
                        Initial: {formatCurrency(c.initialObligation, true)} → Current: {formatCurrency(c.currentObligation, true)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold text-red-700 text-xs">
                      +{formatCurrency(c.dollarCreep, true)}
                    </div>
                    <div className="text-[10px] text-stone-500">
                      +{c.percentCreep}% Overrun
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* GRAPH 4: EARMARKS (CPF) VS OPEN COMPETITION                               */}
        {/* ========================================================================= */}
        {activeGraphTab === 'all' && (
          <div className="bg-white border border-stone-200 rounded-sm p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2 flex-wrap gap-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-700" />
                <h3 className="font-serif font-bold text-stone-900 text-sm">
                  4. Earmarks (CPF) vs. Open Competitive Bidding
                </h3>
              </div>
              <span className="text-[10px] text-purple-900 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded font-mono font-semibold">
                📜 Federal CPF Model
              </span>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Comparison of cost escalation on politically designated Federal Community Project Funding (CPF) earmarks directed into this region vs. open competitive awards.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Earmarks Card */}
              <div className="p-3 bg-purple-50/60 border border-purple-200 rounded space-y-2">
                <div className="text-[11px] font-bold text-purple-950 uppercase tracking-wider font-sans">
                  Direct Earmarks (CPF)
                </div>
                <div className="font-mono text-xl font-bold text-purple-900">
                  +{analytics.earmarkComparison.earmarkAvgCreepPct}%
                </div>
                <div className="text-[10px] text-purple-800 leading-tight font-sans">
                  Average cost escalation on politically designated Community Project Funding requests.
                </div>
                <div className="font-mono text-xs text-purple-900 pt-1 border-t border-purple-200">
                  Total Creep: <strong>+{formatCurrency(analytics.earmarkComparison.earmarkDollarCreep, true)}</strong>
                </div>
              </div>

              {/* Competitive Card */}
              <div className="p-3 bg-stone-100 border border-stone-200 rounded space-y-2">
                <div className="text-[11px] font-bold text-stone-700 uppercase tracking-wider font-sans">
                  Open Competitive Bidding
                </div>
                <div className="font-mono text-xl font-bold text-stone-900">
                  +{analytics.earmarkComparison.competitiveAvgCreepPct}%
                </div>
                <div className="text-[10px] text-stone-600 leading-tight font-sans">
                  Average cost escalation on standard agency-awarded competitive procurements.
                </div>
                <div className="font-mono text-xs text-stone-800 pt-1 border-t border-stone-200">
                  Total Creep: <strong>+{formatCurrency(analytics.earmarkComparison.competitiveDollarCreep, true)}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* GRAPH 5: MODIFICATION VELOCITY CURVE                                     */}
        {/* ========================================================================= */}
        {activeGraphTab === 'all' && (
          <div className="bg-white border border-stone-200 rounded-sm p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-stone-700" />
                <h3 className="font-serif font-bold text-stone-900 text-sm">
                  5. Contract Modification Lifecycle & Escalation Milestones
                </h3>
              </div>
              <span className="text-[10px] text-stone-500 font-mono">Mod Timeline</span>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Step escalation of contract obligations from initial award signing through consecutive modifications and option exercises.
            </p>

            <div className="space-y-2 pt-1 font-mono text-xs">
              {analytics.modificationVelocity.map((m, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded border border-stone-100 bg-stone-50"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-4 h-4 rounded-xs bg-stone-300 text-stone-800 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {m.modNumber}
                    </span>
                    <span className="text-stone-800 font-medium truncate font-sans text-xs">
                      {m.stage}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-stone-900 font-bold">
                      {formatCurrency(m.avgObligation, true)}
                    </span>
                    <span className="text-red-700 font-bold text-[11px]">
                      +{m.pctIncrease}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
