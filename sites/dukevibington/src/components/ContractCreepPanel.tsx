import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  TrendingUp,
  FileText,
  Building2,
  Landmark,
  Search,
  X,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  ShieldAlert,
  Percent,
  Globe,
  Clock,
  Briefcase,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { CivicEdgeApiClient } from '../services/civicEdgeApiClient';
import { civicCache, CACHE_TTL } from '../services/civicCacheService';

/* ========================================================================= */
/* 1. TYPES & INTERFACES                                                     */
/* ========================================================================= */

export interface JurisdictionGeoProps {
  level: 'federal' | 'state' | 'county' | 'local';
  stateCode?: string;
  stateName?: string;
  countyFips?: string;
  countyName?: string;
  districtNumber?: string;
  city?: string;
  onAnalyticsLoaded?: (key: string, data: AuditedJurisdictionMetrics) => void;
}

export interface AuditedJurisdictionMetrics {
  initialObligation: number;
  currentObligation: number;
  dollarCreep: number;
  percentCreep: number;
  activeContractsCount: number;
  topOffenderName?: string;
  costPlusPct: number;
  capitalFlightPct: number;
  isLive: boolean;
}

export interface USAspendingTransactionItem {
  id?: string;
  action_date?: string;
  d?: string;
  federal_action_obligation?: number;
  o?: number;
  description?: string;
  desc?: string;
  modification_number?: string;
  mod?: string;
  action_type_description?: string;
}

export interface USAspendingAwardItem {
  generated_internal_id?: string;
  internal_id?: string;
  'Award ID'?: string;
  award_id_piid?: string;
  piid?: string;
  'Recipient Name'?: string;
  recipient_name?: string;
  recipientName?: string;
  parentName?: string;
  parent_recipient_name?: string;
  recipientState?: string;
  recipient_state?: string;
  agencyName?: string;
  awarding_agency?: string;
  officeName?: string;
  awarding_sub_agency?: string;
  pricingType?: string;
  pricing_type?: string;
  'Awarding Agency'?: string;
  'Awarding Sub Agency'?: string;
  'type_of_contract_pricing'?: string;
  'recipient_location_state_code'?: string;
  'parent_recipient_name'?: string;
  'Award Amount'?: number;
  current_obligation?: number;
  'Base and Exercised Options Value'?: number;
  'Base and All Options Value'?: number;
  award_ceiling?: number;
  'Initial Obligation'?: number;
  initial_obligation?: number;
  dollar_creep?: number;
  percent_creep?: number;
  Description?: string;
  description?: string;
  'Start Date'?: string;
  start_date?: string;
  'End Date'?: string;
  end_date?: string;
  initial_end_date?: string;
  'potential_end_date'?: string;
  'period_of_performance_current_end_date'?: string;
  'period_of_performance_start_date'?: string;
  transactions?: USAspendingTransactionItem[];
  isZombieContract?: boolean;
  scheduleDelayDays?: number;
  schedule_delay_days?: number;
  isSeptemberSpurt?: boolean;
  septemberFunding?: number;
}

export interface VendorAggregate {
  name: string;
  parentName: string;
  hqState: string;
  awards: USAspendingAwardItem[];
  totalInitial: number;
  totalCurrent: number;
  totalCreep: number;
  percentCreep: number;
  isOutState: boolean;
  costPlusCount: number;
}

export interface OfficeAggregate {
  name: string;
  agencyName: string;
  awards: USAspendingAwardItem[];
  totalInitial: number;
  totalCurrent: number;
  totalCreep: number;
  percentCreep: number;
}

export type ViewState = 'OVERVIEW' | 'CONTRACT_DETAIL' | 'VENDOR_DETAIL' | 'OFFICE_DETAIL';
export type SidebarTab = 'audit' | 'ledger';
export type LedgerCategory = 'contracts' | 'vendors' | 'offices';

/* ========================================================================= */
/* 2. GLOSSARY DEFINITIONS & PORTAL TOOLTIP                                  */
/* ========================================================================= */

export const GLOSSARY_DEFINITIONS = {
  'initial-obligation': {
    title: 'Initial Mod #0 Obligation (Definitive Baseline)',
    category: 'Baseline Accounting',
    description:
      'The legally binding public funding committed at contract inception (Modification 0). All taxpayer cost overrun math is measured against this real baseline.',
  },
  'current-total': {
    title: 'Current Total Obligated (Cumulative Award)',
    category: 'Procurement Accounting',
    description:
      'The cumulative taxpayer dollars obligated to date across all subsequent contract modifications, extensions, and scope increases.',
  },
  'taxpayer-overrun': {
    title: 'Taxpayer Dollar Creep (Net Budget Escalation)',
    category: 'Fiscal Escalation',
    description:
      'The net dollar expansion of a contract beyond its original Mod #0 baseline: Current Total Obligated minus Initial Baseline.',
  },
  'percent-creep': {
    title: 'Creep Rate (Budget Expansion Percentage)',
    category: 'Fiscal Escalation',
    description:
      'The percentage growth of a contract budget relative to its original inception value ((Current - Baseline) / Baseline * 100).',
  },
  'top-offender': {
    title: 'Top Overrun Contractor',
    category: 'Vendor Accountability',
    description:
      'The corporate parent contractor responsible for the largest absolute dollar escalation above original inception baselines in this jurisdiction.',
  },
  'cost-plus-multiplier': {
    title: 'Cost-Plus Creep Multiplier',
    category: 'Pricing Risk',
    description:
      'The ratio of cost escalation on Cost-Plus (reimbursement) contracts compared to Firm Fixed Price contracts. Quantifies how much faster cost-plus contracts balloon over baseline.',
  },
  'capital-flight': {
    title: 'Capital Flight (Out-of-State Contractors)',
    category: 'Local Economic Impact',
    description:
      'The percentage of prime federal procurement funding awarded to corporate contractors headquartered outside this state.',
  },
  'mega-contract-exposure': {
    title: 'Mega-Contract Exposure (> $1 Billion)',
    category: 'National Fiscal Concentration',
    description:
      'The share of total federal contract dollars tied up in individual mega-awards valued at $1 Billion or greater.',
  },
  'september-spurt': {
    title: 'September Spurt (FY-End Dump)',
    category: 'Fiscal Volatility',
    description:
      'The share of modification funding authorized in September (Q4 of the fiscal year), capturing the "use-it-or-lose-it" bureaucratic rush.',
  },
  'zombie-contracts': {
    title: 'Zombie Contracts (Chronic Schedule Extensions)',
    category: 'Project Execution',
    description:
      'Procurement projects suffering delivery extensions over 365 days past original Mod #0 target dates or requiring 8+ consecutive amendments.',
  },
  'hhi-monopoly': {
    title: 'Herfindahl-Hirschman Index (HHI)',
    category: 'Antitrust Telemetry',
    description:
      'The Department of Justice measure of market concentration (0–10,000). Scores above 2,500 indicate extreme monopoly capture by top prime contractors.',
  },
  'the-overruns': {
    title: 'The Overruns (Itemized Contracts)',
    category: 'Itemized Ledger',
    description:
      'All prime contracts awarded in this jurisdiction, ranked by total net taxpayer cost creep.',
  },
  'the-monopolies': {
    title: 'The Monopolies (Corporate Parents)',
    category: 'Market Concentration',
    description:
      'Corporate parent conglomerates aggregating prime awards, showing total capital captured and cumulative cost escalations.',
  },
  'the-bureaucrats': {
    title: 'The Bureaucrats (Awarding Agencies & Offices)',
    category: 'Procurement Oversight',
    description:
      'Federal and state procurement sub-agencies and contracting offices ranked by authorized dollars and contractor creep rates.',
  },
  'idv': {
    title: 'Indefinite Delivery Vehicle (IDV)',
    category: 'Contract Vehicle',
    description:
      'An umbrella contracting vehicle (IDIQ / BPA / GWAC) establishing terms for subsequent task orders without a single fixed ceiling.',
  },
  'definitive': {
    title: 'Definitive Contract',
    category: 'Contract Vehicle',
    description:
      'A standalone, legally binding procurement contract with a specific statement of work and explicit initial base commitment.',
  },
  'fixed-price': {
    title: 'Firm Fixed Price (FFP)',
    category: 'Pricing Structure',
    description:
      'A contract structure where the vendor assumes the financial risk of cost overruns unless the government modifies the scope.',
  },
  'cost-plus': {
    title: 'Cost-Reimbursement (Cost-Plus)',
    category: 'Pricing Structure',
    description:
      'A contract structure where the government pays allowable contractor costs plus a fee, transferring cost escalation risk entirely to taxpayers.',
  },
  'time-materials': {
    title: 'Time & Materials (T&M)',
    category: 'Pricing Structure',
    description:
      'A contract structure billed at fixed hourly labor rates plus material costs, prone to expansion when deliverables lack strict bounds.',
  },
};

export const TermTooltip: React.FC<{
  termKey?: keyof typeof GLOSSARY_DEFINITIONS;
  title?: string;
  category?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
  align?: 'center' | 'left' | 'right';
}> = ({ termKey, title, category, description, children, className = '', showIcon = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number; isAbove: boolean } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const def = termKey ? GLOSSARY_DEFINITIONS[termKey] : undefined;
  const tooltipTitle = title || def?.title;
  const tooltipCat = category || def?.category;
  const tooltipDesc = description || def?.description;

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const isAbove = spaceBelow < 160 && rect.top > 160;

    let x = rect.left + rect.width / 2 - tooltipWidth / 2;
    if (x < 12) x = 12;
    if (x + tooltipWidth > window.innerWidth - 12) {
      x = window.innerWidth - tooltipWidth - 12;
    }

    const y = isAbove ? rect.top - 8 : rect.bottom + 8;
    setCoords({ x, y, isAbove });
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`inline-flex items-center gap-1 cursor-help group ${className}`}
      >
        {children}
        {showIcon && (
          <HelpCircle className="w-3 h-3 text-stone-400 group-hover:text-stone-700 dark:text-zinc-500 dark:group-hover:text-zinc-300 transition-colors shrink-0" />
        )}
      </span>

      {isOpen &&
        coords &&
        tooltipTitle &&
        typeof document !== 'undefined' &&
        ReactDOM.createPortal(
          <div
            style={{
              position: 'fixed',
              top: coords.y,
              left: coords.x,
              transform: coords.isAbove ? 'translateY(-100%)' : 'none',
              zIndex: 99999,
              width: 280,
            }}
            className="p-3 bg-stone-900 text-stone-100 rounded-sm shadow-xl border border-stone-700 text-xs font-sans pointer-events-none transition-opacity duration-150 animate-in fade-in-50"
          >
            {tooltipCat && (
              <div className="text-[10px] font-mono uppercase text-red-400 font-bold mb-0.5 tracking-wider">
                {tooltipCat}
              </div>
            )}
            <div className="font-serif font-bold text-stone-100 text-xs mb-1.5 leading-snug">
              {tooltipTitle}
            </div>
            {tooltipDesc && (
              <div className="text-stone-300 text-[11px] leading-relaxed font-normal">
                {tooltipDesc}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

/* ========================================================================= */
/* 3. UTILITY FORMATTERS & BADGES                                            */
/* ========================================================================= */

export const formatCurrency = (val?: number, compact = false): string => {
  if (val === undefined || val === null || isNaN(val)) return '$0.00';
  if (compact) {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

export const normalizePricingType = (
  raw?: string,
  desc?: string,
  recipient?: string
): string => {
  const r = (raw || '').toUpperCase();
  const d = (desc || '').toUpperCase();
  const rec = (recipient || '').toUpperCase();

  // 1. Direct field match
  if (
    r.includes('COST') ||
    r.includes('REIMBURSEMENT') ||
    r.includes('CPFF') ||
    r.includes('CPIF') ||
    r.includes('CPAF')
  ) {
    return 'COST-PLUS';
  }
  if (
    r.includes('TIME') ||
    r.includes('MATERIAL') ||
    r.includes('T&M') ||
    r.includes('LABOR HOUR') ||
    r.includes('LABOR')
  ) {
    return 'TIME & MATERIALS';
  }
  if (r.includes('FIXED') || r.includes('FIRM') || r.includes('FFP')) {
    return 'FIXED PRICE';
  }

  // 2. Legacy FPDS token inspection in description (e.g. !R!, !U!, !V!, !S!, !T!, !Y!, !Z!, !J!, !K!, !L!)
  if (
    /(?:!|\||\s)(?:R|U|V|S|T)(?:!|\||\s)/.test(d) ||
    d.includes('!U!R!') ||
    d.includes('!R!') ||
    d.includes('!U!')
  ) {
    return 'COST-PLUS';
  }
  if (
    /(?:!|\||\s)(?:Y|Z)(?:!|\||\s)/.test(d) ||
    d.includes('!Y!') ||
    d.includes('!Z!') ||
    d.includes('T&M') ||
    d.includes('TIME AND MATERIAL')
  ) {
    return 'TIME & MATERIALS';
  }

  // 3. Keywords in description
  if (
    d.includes('COST PLUS') ||
    d.includes('COST-PLUS') ||
    d.includes('COST REIMBURSE') ||
    d.includes('CPFF') ||
    d.includes('CPIF') ||
    d.includes('CPAF')
  ) {
    return 'COST-PLUS';
  }
  if (
    d.includes('MANAGEMENT AND OPERATION') ||
    d.includes('MANAGEMENT & OPERATION') ||
    d.includes('M&O CONTRACT') ||
    d.includes('NATIONAL LABORATORY') ||
    d.includes('ACCELERATOR LABORATORY')
  ) {
    return 'COST-PLUS'; // DOE National Lab M&O contracts are Cost-Reimbursement / Cost-Plus Award Fee
  }
  if (d.includes('TIME AND MATERIAL') || d.includes('LABOR HOUR')) {
    return 'TIME & MATERIALS';
  }
  if (d.includes('FIRM FIXED') || d.includes('FIXED PRICE') || d.includes('FFP')) {
    return 'FIXED PRICE';
  }

  // 4. Recipient heuristic for DOE Lab M&O LLCs
  if (
    rec.includes('ARGONNE') ||
    rec.includes('FERMI RESEARCH') ||
    rec.includes('BATTELLE') ||
    rec.includes('LOS ALAMOS') ||
    rec.includes('LAWRENCE LIVERMORE') ||
    rec.includes('SANDIA') ||
    rec.includes('OAK RIDGE')
  ) {
    return 'COST-PLUS';
  }

  return 'FIXED PRICE';
};

export const PricingBadge: React.FC<{
  pricingType?: string;
  description?: string;
  recipientName?: string;
}> = ({ pricingType, description, recipientName }) => {
  const norm = normalizePricingType(pricingType, description, recipientName);
  let badgeClass = 'bg-stone-100 dark:bg-[#18191c] text-stone-700 dark:text-zinc-300';
  let termKey: keyof typeof GLOSSARY_DEFINITIONS = 'fixed-price';

  if (norm === 'COST-PLUS') {
    badgeClass =
      'bg-red-100 dark:bg-rose-950/80 text-red-900 dark:text-rose-300 border border-red-300 dark:border-rose-800/60 font-bold';
    termKey = 'cost-plus';
  } else if (norm === 'TIME & MATERIALS') {
    badgeClass =
      'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 font-bold';
    termKey = 'time-materials';
  }

  return (
    <TermTooltip termKey={termKey} align="right">
      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs uppercase tracking-wide ${badgeClass}`}>
        {norm}
      </span>
    </TermTooltip>
  );
};

export const StateHqBadge: React.FC<{ hqState?: string; isOutState?: boolean }> = ({
  hqState,
  isOutState,
}) => {
  if (!hqState) return null;
  return (
    <span
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-xs font-bold uppercase ${
        isOutState
          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
          : 'bg-stone-100 text-stone-700 dark:bg-[#18191c] dark:text-zinc-300'
      }`}
    >
      HQ: {hqState} {isOutState && '· OUT-OF-STATE'}
    </span>
  );
};

export const calculateContractSplitTrackCreep = (
  award: USAspendingAwardItem,
  transactions: USAspendingTransactionItem[] = []
) => {
  const piid = award['Award ID'] || award.award_id_piid || award.piid || award.generated_internal_id || '';
  const isTrackIdv = Boolean(
    piid.startsWith('IDV') ||
      award.generated_internal_id?.startsWith('CONT_IDV') ||
      award.pricingType?.includes('IDV') ||
      award.pricing_type?.includes('IDV')
  );

  let initialValue = 0;
  let currentValue = 0;

  if (transactions && transactions.length > 0) {
    const sortedTxs = [...transactions].sort((a, b) => {
      const da = new Date(a.action_date || a.d || 0).getTime();
      const db = new Date(b.action_date || b.d || 0).getTime();
      return da - db;
    });

    const mod0 = sortedTxs.find((t) => (t.modification_number || t.mod || '').trim() === '0') || sortedTxs[0];
    initialValue = Number(mod0.federal_action_obligation ?? mod0.o ?? award.initial_obligation ?? award['Initial Obligation'] ?? 0);

    const netCumulative = sortedTxs.reduce(
      (sum, t) => sum + Number(t.federal_action_obligation ?? t.o ?? 0),
      0
    );
    currentValue = Math.max(
      netCumulative,
      Number(award.current_obligation ?? award['Award Amount'] ?? award['Base and All Options Value'] ?? 0)
    );
  } else {
    initialValue = Number(
      award.initial_obligation ??
        award['Initial Obligation'] ??
        award['Base and Exercised Options Value'] ??
        award['Base and All Options Value'] ??
        award.current_obligation ??
        award['Award Amount'] ??
        0
    );
    currentValue = Number(
      award.current_obligation ??
        award['Award Amount'] ??
        award['Base and All Options Value'] ??
        award['Base and Exercised Options Value'] ??
        initialValue
    );
  }

  const dollarCreep =
    award.dollar_creep !== undefined
      ? Number(award.dollar_creep)
      : Math.max(0, currentValue - initialValue);
  const percentCreep =
    award.percent_creep !== undefined
      ? Number(award.percent_creep)
      : initialValue > 0
      ? (dollarCreep / initialValue) * 100
      : 0;

  return {
    initialValue,
    currentValue,
    dollarCreep,
    percentCreep,
    isTrackIdv,
    initialLabel: isTrackIdv ? 'Ceiling Baseline' : 'Mod #0 Initial Baseline',
    currentLabel: 'Current Obligated',
  };
};

/* ========================================================================= */
/* 4. SUB-COMPONENT: EXECUTIVE AUDIT VIEW                                    */
/* ========================================================================= */

interface ExecutiveAuditViewProps {
  contracts: USAspendingAwardItem[];
  analytics: {
    totalBaseline: number;
    totalCurrent: number;
    totalTaxpayerOverrun: number;
    percentOverrun: number;
    costPlusPct: number;
    costPlusMultiplier: number;
    capitalFlightPct: number;
    megaAwardPct: number;
    septemberSpurtPct: number;
    hhiScore: number;
    avgDelayDays: number;
    zombieCount: number;
    topOffender: VendorAggregate | null;
    vendorsList: VendorAggregate[];
    officesList: OfficeAggregate[];
  };
  isNationalFederal: boolean;
  onSelectVendor: (v: VendorAggregate) => void;
  onSelectOffice: (o: OfficeAggregate) => void;
  onJumpToLedger: () => void;
}

const ExecutiveAuditView: React.FC<ExecutiveAuditViewProps> = ({
  contracts,
  analytics,
  isNationalFederal,
  onSelectVendor,
  onSelectOffice,
  onJumpToLedger,
}) => {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 font-sans">
      {/* 1. Header Banner */}
      <div className="flex items-center justify-between pb-1.5 border-b border-stone-200/80 dark:border-[#2e313a]">
        <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-red-600 dark:text-rose-400" />
          Forensic Procurement Summary
        </span>
        <span className="text-xs font-mono font-semibold text-stone-500 dark:text-zinc-400">
          {contracts.length} AUDITED PRIME AWARDS
        </span>
      </div>

      {/* Zero Contract Notice Banner when local municipality has 0 direct prime awards */}
      {contracts.length === 0 && (
        <div className="p-3.5 bg-stone-100/70 dark:bg-[#1f2127] border border-stone-200 dark:border-[#2e313a] rounded-xs space-y-1.5 font-sans">
          <div className="flex items-center gap-1.5 font-bold text-stone-900 dark:text-zinc-100 text-xs uppercase tracking-wide font-mono">
            <ShieldAlert className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
            No Direct Prime Awards in this Sector
          </div>
          <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
            No federal prime contracts are registered with direct place of performance in this specific municipal boundary. Public funding in this area is managed at the county/state level.
          </p>
        </div>
      )}

      {/* 2. Primary 4-in-a-Row Financial Creep Ledger (2x2 Balanced Grid) */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Metric 1: Total Initial Obligation */}
        <div className="p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs flex flex-col justify-between shadow-2xs">
          <TermTooltip termKey="initial-obligation" showIcon align="left" className="w-full justify-between">
            <span className="text-[11px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide truncate">
              Initial Baseline
            </span>
          </TermTooltip>
          <div className="text-base sm:text-lg font-bold font-mono text-stone-900 dark:text-zinc-100 tabular-nums my-1">
            {formatCurrency(analytics.totalBaseline, true)}
          </div>
          <div className="text-[10px] text-stone-400 dark:text-zinc-500 font-sans truncate">
            Mod #0 original
          </div>
        </div>

        {/* Metric 2: Current Total Obligation */}
        <div className="p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs flex flex-col justify-between shadow-2xs">
          <TermTooltip termKey="current-total" showIcon align="left" className="w-full justify-between">
            <span className="text-[11px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide truncate">
              Current Total
            </span>
          </TermTooltip>
          <div className="text-base sm:text-lg font-bold font-mono text-stone-900 dark:text-zinc-100 tabular-nums my-1">
            {formatCurrency(analytics.totalCurrent, true)}
          </div>
          <div className="text-[10px] text-stone-400 dark:text-zinc-500 font-sans truncate">
            Total obligated
          </div>
        </div>

        {/* Metric 3: Dollar Creep */}
        <div className="p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs flex flex-col justify-between shadow-2xs">
          <TermTooltip termKey="taxpayer-overrun" showIcon align="left" className="w-full justify-between">
            <span className="text-[11px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide truncate">
              Dollar Creep
            </span>
          </TermTooltip>
          <div
            className={`text-base sm:text-lg font-bold font-mono tabular-nums my-1 ${
              analytics.totalTaxpayerOverrun > 0
                ? 'text-red-700 dark:text-rose-400'
                : 'text-stone-700 dark:text-zinc-300'
            }`}
          >
            {analytics.totalTaxpayerOverrun > 0
              ? `+${formatCurrency(analytics.totalTaxpayerOverrun, true)}`
              : '$0.00'}
          </div>
          <div className="text-[10px] text-stone-400 dark:text-zinc-500 font-sans truncate">
            {analytics.totalTaxpayerOverrun > 0 ? 'Net taxpayer overrun' : 'No overrun'}
          </div>
        </div>

        {/* Metric 4: Percent Creep */}
        <div className="p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs flex flex-col justify-between shadow-2xs">
          <TermTooltip termKey="percent-creep" showIcon align="left" className="w-full justify-between">
            <span className="text-[11px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide truncate">
              Percent Creep
            </span>
          </TermTooltip>
          <div
            className={`text-base sm:text-lg font-bold font-mono tabular-nums my-1 ${
              analytics.percentOverrun > 0
                ? 'text-red-700 dark:text-rose-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {analytics.percentOverrun > 0 ? `+${analytics.percentOverrun.toFixed(1)}%` : '0.0%'}
          </div>
          <div className="text-[10px] text-stone-400 dark:text-zinc-500 font-sans truncate">
            {analytics.percentOverrun > 0 ? 'Budget escalation' : 'On baseline budget'}
          </div>
        </div>
      </div>

      {/* 3. Secondary Exposure & Contractor Indicators (3-in-a-Row) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* Top Offender */}
        <div
          onClick={() => analytics.topOffender && onSelectVendor(analytics.topOffender)}
          className={`p-2.5 sm:p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs flex flex-col justify-between ${
            analytics.topOffender
              ? 'cursor-pointer hover:border-stone-900 dark:hover:border-white transition-colors'
              : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <TermTooltip termKey="top-offender" showIcon align="left" className="truncate">
              <span className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide truncate">
                Top Offender
              </span>
            </TermTooltip>
            {analytics.topOffender && (
              <ChevronRight className="w-3.5 h-3.5 text-stone-400 dark:text-zinc-500 flex-shrink-0" />
            )}
          </div>
          <div
            className="text-xs sm:text-sm font-bold text-stone-900 dark:text-zinc-100 truncate my-1"
            title={analytics.topOffender?.parentName}
          >
            {analytics.topOffender ? analytics.topOffender.parentName : 'None Identified'}
          </div>
          <div className="text-[10px] font-mono text-red-700 dark:text-rose-400 font-semibold tabular-nums truncate">
            {analytics.topOffender && analytics.topOffender.totalCreep > 0
              ? `+${formatCurrency(analytics.topOffender.totalCreep, true)} creep`
              : `${analytics.topOffender?.awards.length || 0} prime awards`}
          </div>
        </div>

        {/* Cost-Plus Exposure */}
        <div className="p-2.5 sm:p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs flex flex-col justify-between">
          <TermTooltip termKey="cost-plus-multiplier" showIcon align="center" className="w-full justify-between">
            <span className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-1 truncate">
              <Percent className="w-3 h-3 text-stone-400 dark:text-zinc-500 flex-shrink-0" />
              <span className="truncate">Cost-Plus Exp.</span>
            </span>
          </TermTooltip>
          <div className="text-xs sm:text-sm font-bold font-mono text-stone-800 dark:text-zinc-100 tabular-nums my-1 flex items-center gap-1.5">
            <span>{analytics.costPlusPct.toFixed(1)}%</span>
            {analytics.costPlusMultiplier > 1 && (
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded border border-amber-300 dark:border-amber-800">
                {analytics.costPlusMultiplier}x creep
              </span>
            )}
          </div>
          <div className="text-[10px] text-stone-400 dark:text-zinc-500 font-sans truncate">
            Cost-reimbursement
          </div>
        </div>

        {/* Capital Flight or Mega-Awards */}
        <div className="p-2.5 sm:p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs flex flex-col justify-between">
          {isNationalFederal ? (
            <TermTooltip termKey="mega-contract-exposure" showIcon align="right" className="w-full justify-between">
              <span className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-1 truncate">
                <Landmark className="w-3 h-3 text-stone-400 dark:text-zinc-500 flex-shrink-0" />
                <span className="truncate">Mega-Awards</span>
              </span>
            </TermTooltip>
          ) : (
            <TermTooltip termKey="capital-flight" showIcon align="right" className="w-full justify-between">
              <span className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-1 truncate">
                <Globe className="w-3 h-3 text-stone-400 dark:text-zinc-500 flex-shrink-0" />
                <span className="truncate">Capital Flight</span>
              </span>
            </TermTooltip>
          )}
          <div className="text-xs sm:text-sm font-bold font-mono text-stone-800 dark:text-zinc-100 tabular-nums my-1">
            {isNationalFederal
              ? `${analytics.megaAwardPct.toFixed(1)}%`
              : `${analytics.capitalFlightPct.toFixed(1)}%`}
          </div>
          <div className="text-[10px] text-stone-400 dark:text-zinc-500 font-sans truncate">
            {isNationalFederal ? 'Awards > $1 Billion' : 'Out-of-state HQ'}
          </div>
        </div>
      </div>

      {/* 4. Advanced Forensic Telemetry (3-in-a-Row) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* September Spurt */}
        <div className="p-2.5 sm:p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs flex flex-col justify-between">
          <TermTooltip termKey="september-spurt" showIcon align="left" className="w-full justify-between">
            <span className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide truncate">
              September Spurt
            </span>
          </TermTooltip>
          <div className="text-xs sm:text-sm font-bold font-mono text-amber-700 dark:text-amber-400 tabular-nums my-1">
            {analytics.septemberSpurtPct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-stone-400 dark:text-zinc-500 font-sans truncate">
            FY-end budget dump
          </div>
        </div>

        {/* Monopoly Capture (HHI) */}
        <div className="p-2.5 sm:p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs flex flex-col justify-between">
          <TermTooltip termKey="hhi-monopoly" showIcon align="center" className="w-full justify-between">
            <span className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide truncate">
              Monopoly HHI
            </span>
          </TermTooltip>
          <div className="text-xs sm:text-sm font-bold font-mono text-stone-800 dark:text-zinc-100 tabular-nums my-1 flex items-center gap-1.5">
            <span>{analytics.hhiScore.toLocaleString()}</span>
            <span
              className={`text-[8px] font-mono px-1 py-0.2 rounded font-bold uppercase ${
                analytics.hhiScore >= 2500
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : analytics.hhiScore >= 1500
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}
            >
              {analytics.hhiScore >= 2500 ? 'Captured' : analytics.hhiScore >= 1500 ? 'Moderate' : 'Competitive'}
            </span>
          </div>
          <div className="text-[10px] text-stone-400 dark:text-zinc-500 font-sans truncate">
            Vendor concentration
          </div>
        </div>

        {/* Zombie Projects */}
        <div className="p-2.5 sm:p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs flex flex-col justify-between">
          <TermTooltip termKey="zombie-contracts" showIcon align="right" className="w-full justify-between">
            <span className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide truncate">
              Zombie Projects
            </span>
          </TermTooltip>
          <div className="text-xs sm:text-sm font-bold font-mono text-stone-800 dark:text-zinc-100 tabular-nums my-1">
            {analytics.zombieCount} {analytics.zombieCount === 1 ? 'Award' : 'Awards'}
          </div>
          <div className="text-[10px] text-stone-400 dark:text-zinc-500 font-sans truncate">
            {analytics.avgDelayDays > 0 ? `Avg. ${analytics.avgDelayDays}d delay` : 'On-schedule delivery'}
          </div>
        </div>
      </div>

      {/* 5. Top Prime Contractors Concentration */}
      {analytics.vendorsList.length > 0 && (
        <div className="bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] p-4 rounded-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-stone-500 dark:text-zinc-400" />
              Top Prime Contractors & Conglomerates
            </span>
            <span className="text-xs font-mono font-bold text-stone-500 dark:text-zinc-400">
              RANKED BY OVERRUN
            </span>
          </div>

          <div className="space-y-2">
            {analytics.vendorsList.slice(0, 3).map((v, i) => (
              <div
                key={v.parentName}
                onClick={() => onSelectVendor(v)}
                className="flex items-center justify-between p-2.5 bg-stone-50 dark:bg-[#18191c] rounded-xs border border-stone-100 dark:border-[#2e313a] hover:border-stone-400 hover:dark:border-[#3e434f] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <span className="text-xs font-mono font-bold text-stone-400 dark:text-zinc-500">
                    #{i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-zinc-100 truncate">
                      {v.parentName}
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-zinc-400 truncate flex items-center gap-1.5">
                      <span>
                        {v.awards.length} {v.awards.length === 1 ? 'prime award' : 'prime awards'}
                      </span>
                      <span>·</span>
                      <span>HQ: {v.hqState}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs sm:text-sm font-mono font-bold text-stone-900 dark:text-zinc-100">
                    {formatCurrency(v.totalCurrent, true)}
                  </div>
                  <div className="text-[10px] font-mono text-red-700 dark:text-rose-400 font-semibold">
                    +{formatCurrency(v.totalCreep, true)} creep
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Top Procurement Bureaus */}
      {analytics.officesList.length > 0 && (
        <div className="bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] p-4 rounded-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-stone-500 dark:text-zinc-400" />
              Awarding Bureaus & Oversight
            </span>
            <span className="text-xs font-mono font-bold text-stone-500 dark:text-zinc-400">
              RANKED BY OVERRUN
            </span>
          </div>

          <div className="space-y-2">
            {analytics.officesList.slice(0, 3).map((o, i) => (
              <div
                key={`${o.name}::${o.agencyName}`}
                onClick={() => onSelectOffice(o)}
                className="flex items-center justify-between p-2.5 bg-stone-50 dark:bg-[#18191c] rounded-xs border border-stone-100 dark:border-[#2e313a] hover:border-stone-400 hover:dark:border-[#3e434f] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <span className="text-xs font-mono font-bold text-stone-400 dark:text-zinc-500">
                    #{i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-zinc-100 truncate">
                      {o.name}
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-zinc-400 truncate">
                      {o.agencyName} · {o.awards.length} awards
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs sm:text-sm font-mono font-bold text-stone-900 dark:text-zinc-100">
                    {formatCurrency(o.totalCurrent, true)}
                  </div>
                  <div className="text-[10px] font-mono text-red-700 dark:text-rose-400 font-semibold">
                    +{formatCurrency(o.totalCreep, true)} creep
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Action Banner to Explore Contract Ledger */}
      <button
        onClick={onJumpToLedger}
        className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-stone-900 rounded-sm font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
      >
        <FileText className="w-4 h-4" />
        <span>Explore All {contracts.length} Contracts & Monopolies in Ledger</span>
        <ChevronRight className="w-4 h-4 ml-auto" />
      </button>
    </div>
  );
};

/* ========================================================================= */
/* 5. SUB-COMPONENT: ITEMIZED LEDGER VIEW                                    */
/* ========================================================================= */

interface ItemizedLedgerViewProps {
  contracts: USAspendingAwardItem[];
  filteredContracts: USAspendingAwardItem[];
  filteredVendors: VendorAggregate[];
  filteredOffices: OfficeAggregate[];
  filterQuery: string;
  setFilterQuery: (q: string) => void;
  activeCategory: LedgerCategory;
  setActiveCategory: (cat: LedgerCategory) => void;
  isNationalFederal: boolean;
  stateCode?: string;
  onSelectContract: (a: USAspendingAwardItem) => void;
  onSelectVendor: (v: VendorAggregate) => void;
  onSelectOffice: (o: OfficeAggregate) => void;
}

const ItemizedLedgerView: React.FC<ItemizedLedgerViewProps> = ({
  contracts,
  filteredContracts,
  filteredVendors,
  filteredOffices,
  filterQuery,
  setFilterQuery,
  activeCategory,
  setActiveCategory,
  isNationalFederal,
  stateCode,
  onSelectContract,
  onSelectVendor,
  onSelectOffice,
}) => {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden font-sans">
      {/* 1. Search Bar & 3 Category Tabs Header */}
      <div className="px-4 pt-3 sm:px-5 bg-white dark:bg-[#22242a] space-y-2.5 border-b border-stone-200 dark:border-[#2e313a] flex-shrink-0">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400 dark:text-zinc-500" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter by vendor, office, or contract ID..."
            className="w-full pl-9 pr-9 py-1.5 bg-stone-50/70 dark:bg-[#18191c] border border-stone-200 dark:border-[#2e313a] rounded-xs text-xs sm:text-sm text-stone-900 dark:text-zinc-100 placeholder-stone-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-white focus:border-stone-400 dark:focus:border-white font-sans"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-3 top-2 text-stone-400 hover:text-stone-600 dark:hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 3 Investigative Category Switcher */}
        <div className="flex border-b border-stone-200 dark:border-[#2e313a] text-xs sm:text-sm font-medium">
          <button
            onClick={() => setActiveCategory('contracts')}
            className={`flex-1 py-2.5 px-2 text-center font-bold transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer select-none ${
              activeCategory === 'contracts'
                ? 'border-stone-900 dark:border-white text-stone-900 dark:text-white bg-stone-100/50 dark:bg-[#2c2f38]'
                : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200 hover:bg-stone-50/50 dark:hover:bg-[#252830]'
            }`}
          >
            <TermTooltip termKey="the-overruns" align="left">
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 shrink-0" />
                The Overruns
              </span>
            </TermTooltip>
            <span className="text-xs font-mono px-1.5 py-0.5 bg-stone-200/70 dark:bg-[#18191c] text-stone-700 dark:text-zinc-300 rounded-xs">
              {contracts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveCategory('vendors')}
            className={`flex-1 py-2.5 px-2 text-center font-bold transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer select-none ${
              activeCategory === 'vendors'
                ? 'border-stone-900 dark:border-white text-stone-900 dark:text-white bg-stone-100/50 dark:bg-[#2c2f38]'
                : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200 hover:bg-stone-50/50 dark:hover:bg-[#252830]'
            }`}
          >
            <TermTooltip termKey="the-monopolies" align="center">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 shrink-0" />
                The Monopolies
              </span>
            </TermTooltip>
            <span className="text-xs font-mono px-1.5 py-0.5 bg-stone-200/70 dark:bg-[#18191c] text-stone-700 dark:text-zinc-300 rounded-xs">
              {filteredVendors.length}
            </span>
          </button>

          <button
            onClick={() => setActiveCategory('offices')}
            className={`flex-1 py-2.5 px-2 text-center font-bold transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer select-none ${
              activeCategory === 'offices'
                ? 'border-stone-900 dark:border-white text-stone-900 dark:text-white bg-stone-100/50 dark:bg-[#2c2f38]'
                : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200 hover:bg-stone-50/50 dark:hover:bg-[#252830]'
            }`}
          >
            <TermTooltip termKey="the-bureaucrats" align="right">
              <span className="flex items-center gap-1.5">
                <Landmark className="w-4 h-4 shrink-0" />
                The Bureaucrats
              </span>
            </TermTooltip>
            <span className="text-xs font-mono px-1.5 py-0.5 bg-stone-200/70 dark:bg-[#18191c] text-stone-700 dark:text-zinc-300 rounded-xs">
              {filteredOffices.length}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Scrollable List Feed */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
        {/* Category A: Contracts (The Overruns) */}
        {activeCategory === 'contracts' && (
          <div className="space-y-3 pt-1">
            {filteredContracts.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-sm">
                <p className="text-xs text-stone-500 dark:text-zinc-400 font-serif italic">
                  No prime contract overruns match your search query.
                </p>
              </div>
            ) : (
              filteredContracts.map((award, idx) => {
                const stats = calculateContractSplitTrackCreep(award, award.transactions || []);
                const piid =
                  award['Award ID'] ||
                  award.award_id_piid ||
                  award.piid ||
                  award.internal_id ||
                  award.generated_internal_id ||
                  'N/A';
                const recipientName =
                  award['Recipient Name'] ||
                  award.recipient_name ||
                  award.recipientName ||
                  'Unknown Vendor';
                const parentName =
                  award.parentName ||
                  award.parent_recipient_name ||
                  award['parent_recipient_name'] ||
                  recipientName;
                const officeName =
                  award.officeName ||
                  award.awarding_sub_agency ||
                  award['Awarding Sub Agency'] ||
                  award.awarding_agency ||
                  award['Awarding Agency'] ||
                  'Procurement Bureau';
                const agencyName =
                  award.agencyName ||
                  award.awarding_agency ||
                  award['Awarding Agency'] ||
                  'Federal Government';
                const pricing =
                  award.pricingType ||
                  award.pricing_type ||
                  normalizePricingType(
                    award['type_of_contract_pricing'] || award.pricing_type,
                    award.Description || award.description,
                    recipientName
                  );
                const hq = (
                  award.recipient_state ||
                  award.recipientState ||
                  award['recipient_location_state_code'] ||
                  ''
                ).toUpperCase();
                const isOut = isNationalFederal ? false : Boolean(hq && stateCode && hq !== stateCode);
                const isIdv = stats.isTrackIdv;

                return (
                  <div
                    key={award.generated_internal_id || award.award_id_piid || award['Award ID'] || idx}
                    onClick={() => onSelectContract(award)}
                    className="bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] p-4 rounded-sm hover:border-stone-400 hover:dark:border-[#3e434f] hover:shadow-xs transition-all cursor-pointer space-y-3"
                  >
                    {/* Top Row: PIID + Badges */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs sm:text-sm font-bold text-stone-900 dark:text-zinc-100">
                          {piid}
                        </span>
                        <TermTooltip termKey={isIdv ? 'idv' : 'definitive'} align="left">
                          <span
                            className={`text-[10px] sm:text-xs font-mono px-2 py-0.5 rounded-xs font-bold uppercase ${
                              isIdv
                                ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300 border dark:border-purple-800/60'
                                : 'bg-stone-100 dark:bg-[#18191c] text-stone-700 dark:text-zinc-300'
                            }`}
                          >
                            {isIdv ? 'IDV VEHICLE' : 'DEFINITIVE'}
                          </span>
                        </TermTooltip>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {award.isZombieContract && (
                          <TermTooltip termKey="zombie-contracts" align="left">
                            <span className="text-[10px] sm:text-xs font-mono px-1.5 py-0.5 rounded-xs font-bold uppercase bg-red-100 dark:bg-rose-950/80 text-red-900 dark:text-rose-300 border border-red-300 dark:border-rose-800/60">
                              ZOMBIE{' '}
                              {award.scheduleDelayDays && award.scheduleDelayDays > 0
                                ? `(+${award.scheduleDelayDays}d)`
                                : ''}
                            </span>
                          </TermTooltip>
                        )}
                        {award.isSeptemberSpurt && (
                          <TermTooltip termKey="september-spurt" align="left">
                            <span className="text-[10px] sm:text-xs font-mono px-1.5 py-0.5 rounded-xs font-bold uppercase bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60">
                              SEPT DUMP
                            </span>
                          </TermTooltip>
                        )}
                        <PricingBadge pricingType={pricing} description={award.Description || award.description} recipientName={recipientName} />
                        <StateHqBadge hqState={hq} isOutState={isOut} />
                      </div>
                    </div>

                    {/* Recipient & Corporate Parent */}
                    <div>
                      <div className="text-base sm:text-[17px] font-bold text-stone-900 dark:text-zinc-100 leading-snug">
                        {recipientName}
                      </div>
                      {parentName !== recipientName && (
                        <div className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 font-sans flex items-center gap-1 mt-0.5">
                          <span className="text-stone-400 dark:text-zinc-500">Parent:</span> {parentName}
                        </div>
                      )}
                      <div className="text-xs sm:text-sm text-stone-600 dark:text-zinc-400 font-sans mt-0.5 truncate">
                        <span className="text-stone-400 dark:text-zinc-500">Bureau:</span> {officeName} ·{' '}
                        {agencyName}
                      </div>
                    </div>

                    {/* Financials & Red Overrun Math */}
                    <div className="bg-stone-50 dark:bg-[#18191c] p-3 rounded-xs border border-stone-100 dark:border-[#2e313a] flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide">
                          Mod #0 Initial
                        </div>
                        <div className="text-xs sm:text-sm font-mono font-bold text-stone-800 dark:text-zinc-200">
                          {formatCurrency(stats.initialValue, true)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide">
                          Current Total
                        </div>
                        <div className="text-xs sm:text-sm font-mono font-bold text-stone-900 dark:text-zinc-100">
                          {formatCurrency(stats.currentValue, true)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-red-700 dark:text-rose-400 uppercase tracking-wide">
                          Taxpayer Creep
                        </div>
                        <div
                          className={`text-xs sm:text-sm font-mono font-bold ${
                            stats.dollarCreep > 0
                              ? 'text-red-700 dark:text-rose-400'
                              : 'text-stone-700 dark:text-zinc-300'
                          }`}
                        >
                          {stats.dollarCreep > 0
                            ? `+${formatCurrency(stats.dollarCreep, true)}`
                            : '$0.00'}
                        </div>
                      </div>
                    </div>

                    {/* Description Snippet */}
                    {award.Description && (
                      <p className="text-xs sm:text-sm text-stone-600 dark:text-zinc-400 line-clamp-2 leading-relaxed font-sans pt-0.5">
                        {award.Description}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Category B: Vendors (The Monopolies) */}
        {activeCategory === 'vendors' && (
          <div className="space-y-3 pt-1">
            {filteredVendors.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-sm">
                <p className="text-sm text-stone-500 dark:text-zinc-400 italic">
                  No corporate monopolies match your search query.
                </p>
              </div>
            ) : (
              filteredVendors.map((vendor, idx) => (
                <div
                  key={vendor.parentName || idx}
                  onClick={() => onSelectVendor(vendor)}
                  className="bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] p-4 rounded-sm hover:border-stone-400 hover:dark:border-[#3e434f] hover:shadow-xs transition-all cursor-pointer space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base sm:text-[17px] font-bold text-stone-900 dark:text-zinc-100">
                        {vendor.parentName}
                      </div>
                      <div className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
                        <span>
                          {vendor.awards.length}{' '}
                          {vendor.awards.length === 1 ? 'Prime Award' : 'Prime Awards'}
                        </span>
                        <span>·</span>
                        <span>HQ: {vendor.hqState}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] sm:text-xs font-mono font-bold text-stone-400 dark:text-zinc-500">
                        RANK #{idx + 1}
                      </span>
                    </div>
                  </div>

                  <div className="bg-stone-50 dark:bg-[#18191c] p-3 rounded-xs border border-stone-100 dark:border-[#2e313a] grid grid-cols-3 gap-2 text-center">
                    <div>
                      <TermTooltip termKey="initial-obligation" showIcon align="left">
                        <span className="text-[11px] sm:text-xs text-stone-500 dark:text-zinc-400 font-bold uppercase">
                          Mod 0 Base
                        </span>
                      </TermTooltip>
                      <div className="text-sm sm:text-base font-mono font-bold text-stone-800 dark:text-zinc-200 tabular-nums mt-0.5">
                        {formatCurrency(vendor.totalInitial, true)}
                      </div>
                    </div>

                    <div>
                      <TermTooltip termKey="current-total" showIcon align="center">
                        <span className="text-[11px] sm:text-xs text-stone-500 dark:text-zinc-400 font-bold uppercase">
                          Current Total
                        </span>
                      </TermTooltip>
                      <div className="text-sm sm:text-base font-mono font-bold text-stone-900 dark:text-zinc-100 tabular-nums mt-0.5">
                        {formatCurrency(vendor.totalCurrent, true)}
                      </div>
                    </div>

                    <div className="pl-2 border-l border-stone-200 dark:border-[#2e313a]">
                      <TermTooltip termKey="taxpayer-overrun" showIcon align="right">
                        <span className="text-[11px] sm:text-xs font-bold text-red-700 dark:text-rose-400 uppercase">
                          Dollar Creep
                        </span>
                      </TermTooltip>
                      <div className="text-sm sm:text-base font-mono font-bold text-red-700 dark:text-rose-400 tabular-nums mt-0.5">
                        {vendor.totalCreep > 0
                          ? `+${formatCurrency(vendor.totalCreep, true)}`
                          : '$0.00'}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs sm:text-sm text-stone-800 dark:text-zinc-200 hover:text-stone-950 dark:hover:text-white font-semibold flex items-center gap-1 justify-end transition-colors">
                    <span>Inspect Contractor Portfolio</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Category C: Bureaus (The Bureaucrats) */}
        {activeCategory === 'offices' && (
          <div className="space-y-3 pt-1">
            {filteredOffices.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-sm">
                <p className="text-sm text-stone-500 dark:text-zinc-400 italic">
                  No awarding offices match your search query.
                </p>
              </div>
            ) : (
              filteredOffices.map((office, idx) => (
                <div
                  key={`${office.name}::${office.agencyName}`}
                  onClick={() => onSelectOffice(office)}
                  className="bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] p-4 rounded-sm hover:border-stone-400 hover:dark:border-[#3e434f] hover:shadow-xs transition-all cursor-pointer space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base sm:text-[17px] font-bold text-stone-900 dark:text-zinc-100">
                        {office.name}
                      </div>
                      <div className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
                        <span>Parent Agency: {office.agencyName}</span>
                        <span>·</span>
                        <span>
                          {office.awards.length}{' '}
                          {office.awards.length === 1 ? 'Contract' : 'Contracts'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] sm:text-xs font-mono font-bold text-stone-400 dark:text-zinc-500">
                        RANK #{idx + 1}
                      </span>
                    </div>
                  </div>

                  <div className="bg-stone-50 dark:bg-[#18191c] p-3 rounded-xs border border-stone-100 dark:border-[#2e313a] grid grid-cols-3 gap-2 text-center">
                    <div>
                      <TermTooltip termKey="current-total" showIcon align="left">
                        <span className="text-[11px] sm:text-xs text-stone-500 dark:text-zinc-400 font-bold uppercase">
                          Authorized
                        </span>
                      </TermTooltip>
                      <div className="text-sm sm:text-base font-mono font-bold text-stone-900 dark:text-zinc-100 tabular-nums mt-0.5">
                        {formatCurrency(office.totalCurrent, true)}
                      </div>
                    </div>

                    <div>
                      <TermTooltip termKey="taxpayer-overrun" showIcon align="center">
                        <span className="text-[11px] sm:text-xs text-red-700 dark:text-rose-400 font-bold uppercase">
                          Dollar Creep
                        </span>
                      </TermTooltip>
                      <div className="text-sm sm:text-base font-mono font-bold text-red-700 dark:text-rose-400 tabular-nums mt-0.5">
                        {office.totalCreep > 0
                          ? `+${formatCurrency(office.totalCreep, true)}`
                          : '$0.00'}
                      </div>
                    </div>

                    <div className="pl-2 border-l border-stone-200 dark:border-[#2e313a]">
                      <TermTooltip termKey="percent-creep" showIcon align="right">
                        <span className="text-[11px] sm:text-xs text-stone-500 dark:text-zinc-400 font-bold uppercase">
                          Overrun Rate
                        </span>
                      </TermTooltip>
                      <div className="text-sm sm:text-base font-mono font-bold text-red-700 dark:text-rose-400 tabular-nums mt-0.5">
                        {office.percentCreep > 0 ? `+${office.percentCreep.toFixed(1)}%` : '0.0%'}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs sm:text-sm text-stone-800 dark:text-zinc-200 hover:text-stone-950 dark:hover:text-white font-semibold flex items-center gap-1 justify-end transition-colors">
                    <span>Inspect Office Contracts</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ========================================================================= */
/* 6. SUB-COMPONENT: CONTRACT DETAIL VIEW                                    */
/* ========================================================================= */

interface ContractDetailViewProps {
  award: USAspendingAwardItem;
  transactions: USAspendingTransactionItem[];
  isLoadingTransactions: boolean;
  onBack: () => void;
  displayName: string;
}

const ContractDetailView: React.FC<ContractDetailViewProps> = ({
  award,
  transactions,
  isLoadingTransactions,
  onBack,
  displayName,
}) => {
  const stats = calculateContractSplitTrackCreep(award, transactions);
  const piid =
    award['Award ID'] ||
    award.award_id_piid ||
    award.piid ||
    award.internal_id ||
    award.generated_internal_id ||
    'N/A';
  const recipientName =
    award['Recipient Name'] ||
    award.recipient_name ||
    award.recipientName ||
    'Unknown Vendor';
  const parentName =
    award.parentName ||
    award.parent_recipient_name ||
    award['parent_recipient_name'] ||
    recipientName;
  const officeName =
    award.officeName ||
    award.awarding_sub_agency ||
    award['Awarding Sub Agency'] ||
    award.awarding_agency ||
    award['Awarding Agency'] ||
    'Procurement Bureau';
  const agencyName =
    award.agencyName ||
    award.awarding_agency ||
    award['Awarding Agency'] ||
    'Federal Government';
  const pricing =
    award.pricingType ||
    award.pricing_type ||
    normalizePricingType(
      award['type_of_contract_pricing'] || award.pricing_type,
      award.Description || award.description,
      recipientName
    );
  const isIdv = stats.isTrackIdv;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-[#18191c] font-sans">
      {/* Sticky Header with Back Button */}
      <div className="sticky top-0 z-20 bg-white dark:bg-[#22242a] border-b border-stone-200 dark:border-[#2e313a] px-4 py-3 flex items-center justify-between shadow-xs">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300 hover:text-blue-900 dark:hover:text-sky-400 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {displayName} Overview
        </button>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-[#18191c] text-stone-700 dark:text-zinc-300 font-bold">
          CONTRACT LEDGER
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Prime Contract Header */}
        <div className="space-y-2 pb-3 border-b border-stone-200 dark:border-[#2e313a]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm sm:text-base font-bold text-stone-900 dark:text-zinc-100">
              {piid}
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-[#22242a] text-stone-700 dark:text-zinc-300 font-bold uppercase">
              {isIdv ? 'IDV VEHICLE' : 'DEFINITIVE AWARD'}
            </span>
            <PricingBadge pricingType={pricing} description={award.Description || award.description} recipientName={recipientName} />
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-zinc-100 leading-tight">
            {recipientName}
          </h2>
          {parentName !== recipientName && (
            <div className="text-xs text-stone-500 dark:text-zinc-400">
              Holding Company: <span className="font-semibold text-stone-800 dark:text-zinc-200">{parentName}</span>
            </div>
          )}
          <div className="text-xs text-stone-500 dark:text-zinc-400">
            Awarding Office: <span className="font-semibold text-stone-800 dark:text-zinc-200">{officeName}</span> ({agencyName})
          </div>
        </div>

        {/* 3-Box Financial Micro-Dashboard */}
        <div className="bg-stone-50 dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] p-3.5 rounded-sm space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300">
            Forensic Budget Tracking
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-white dark:bg-[#18191c] border border-stone-200 dark:border-[#2e313a] rounded-xs">
              <TermTooltip termKey="initial-obligation" showIcon align="left">
                <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-bold uppercase">
                  {stats.initialLabel}
                </span>
              </TermTooltip>
              <div className="text-sm sm:text-base font-mono font-bold text-stone-900 dark:text-zinc-100 mt-0.5">
                {formatCurrency(stats.initialValue, true)}
              </div>
            </div>

            <div className="p-2 bg-white dark:bg-[#18191c] border border-stone-200 dark:border-[#2e313a] rounded-xs">
              <TermTooltip termKey="current-total" showIcon align="center">
                <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-bold uppercase">
                  {stats.currentLabel}
                </span>
              </TermTooltip>
              <div className="text-sm sm:text-base font-mono font-bold text-stone-900 dark:text-zinc-100 mt-0.5">
                {formatCurrency(stats.currentValue, true)}
              </div>
            </div>

            <div className="p-2 bg-white dark:bg-[#18191c] border border-stone-200 dark:border-[#2e313a] rounded-xs">
              <TermTooltip termKey="taxpayer-overrun" showIcon align="right">
                <span className="text-[10px] text-red-700 dark:text-rose-400 font-bold uppercase">
                  Taxpayer Creep
                </span>
              </TermTooltip>
              <div className="text-sm sm:text-base font-mono font-bold text-red-700 dark:text-rose-400 mt-0.5">
                {stats.dollarCreep > 0 ? `+${formatCurrency(stats.dollarCreep, true)}` : '$0.00'}
              </div>
              {stats.percentCreep > 0 && (
                <div className="text-[10px] font-mono text-red-700 dark:text-rose-400 font-semibold">
                  +{stats.percentCreep.toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contract Statement of Work */}
        {award.Description && (
          <div className="space-y-1 bg-white dark:bg-[#22242a] p-3 border border-stone-200 dark:border-[#2e313a] rounded-xs">
            <span className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wide">
              Official Statement of Work
            </span>
            <p className="text-xs text-stone-700 dark:text-zinc-300 leading-relaxed font-sans">
              {award.Description}
            </p>
          </div>
        )}

        {/* Transaction Lifecycle Timeline */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-stone-200 dark:border-[#2e313a] pb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300">
              Mod 0 → Mod N Transaction Stepper
            </span>
            <span className="text-xs font-mono font-semibold text-stone-500 dark:text-zinc-400">
              {transactions.length} ACTIONS
            </span>
          </div>

          {isLoadingTransactions ? (
            <div className="p-8 text-center bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-sm space-y-2">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-stone-600 dark:text-zinc-400" />
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                Fetching itemized modification history from USAspending...
              </p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-6 text-center bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-sm text-xs text-stone-500 dark:text-zinc-400 italic">
              No modification transactions recorded for this award.
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx, idx) => {
                const modNum = tx.modification_number ?? tx.mod ?? `${idx}`;
                const amt = Number(tx.federal_action_obligation ?? tx.o ?? 0);
                const date = tx.action_date || tx.d || '';
                const desc = tx.description || tx.desc || tx.action_type_description || 'Scope Action';

                return (
                  <div
                    key={tx.id || idx}
                    className="p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            modNum === '0'
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-300'
                              : 'bg-stone-100 dark:bg-[#18191c] text-stone-700 dark:text-zinc-300'
                          }`}
                        >
                          MOD #{modNum}
                        </span>
                        <span className="text-xs font-mono text-stone-500 dark:text-zinc-400">
                          {formatDate(date)}
                        </span>
                      </div>
                      <div
                        className={`text-xs sm:text-sm font-mono font-bold ${
                          amt > 0
                            ? 'text-red-700 dark:text-rose-400'
                            : amt < 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-stone-700 dark:text-zinc-300'
                        }`}
                      >
                        {amt > 0 ? `+${formatCurrency(amt, true)}` : formatCurrency(amt, true)}
                      </div>
                    </div>
                    <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed font-sans">
                      {desc}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ========================================================================= */
/* 7. SUB-COMPONENT: VENDOR DETAIL VIEW                                      */
/* ========================================================================= */

interface VendorDetailViewProps {
  vendor: VendorAggregate;
  onBack: () => void;
  onSelectContract: (a: USAspendingAwardItem) => void;
  displayName: string;
}

const VendorDetailView: React.FC<VendorDetailViewProps> = ({
  vendor,
  onBack,
  onSelectContract,
  displayName,
}) => {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-[#18191c] font-sans">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-[#22242a] border-b border-stone-200 dark:border-[#2e313a] px-4 py-3 flex items-center justify-between shadow-xs">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300 hover:text-blue-900 dark:hover:text-sky-400 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {displayName} Overview
        </button>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-[#18191c] text-stone-700 dark:text-zinc-300 font-bold">
          VENDOR DOSSIER
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Vendor Title */}
        <div className="space-y-1 pb-3 border-b border-stone-200 dark:border-[#2e313a]">
          <h2 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-zinc-100">
            {vendor.parentName}
          </h2>
          <div className="text-xs text-stone-500 dark:text-zinc-400">
            Headquarters: <span className="font-semibold text-stone-800 dark:text-zinc-200">{vendor.hqState}</span> ·{' '}
            {vendor.awards.length} prime awards
          </div>
        </div>

        {/* Micro-Dashboard */}
        <div className="bg-stone-50 dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] p-3.5 rounded-sm space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300">
            Contractor Performance Metrics
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-white dark:bg-[#18191c] border border-stone-200 dark:border-[#2e313a] rounded-xs">
              <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-bold uppercase">
                Mod 0 Base
              </span>
              <div className="text-sm sm:text-base font-mono font-bold text-stone-900 dark:text-zinc-100 mt-0.5">
                {formatCurrency(vendor.totalInitial, true)}
              </div>
            </div>

            <div className="p-2 bg-white dark:bg-[#18191c] border border-stone-200 dark:border-[#2e313a] rounded-xs">
              <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-bold uppercase">
                Total Obligated
              </span>
              <div className="text-sm sm:text-base font-mono font-bold text-stone-900 dark:text-zinc-100 mt-0.5">
                {formatCurrency(vendor.totalCurrent, true)}
              </div>
            </div>

            <div className="p-2 bg-white dark:bg-[#18191c] border border-stone-200 dark:border-[#2e313a] rounded-xs">
              <span className="text-[10px] text-red-700 dark:text-rose-400 font-bold uppercase">
                Dollar Creep
              </span>
              <div className="text-sm sm:text-base font-mono font-bold text-red-700 dark:text-rose-400 mt-0.5">
                {vendor.totalCreep > 0 ? `+${formatCurrency(vendor.totalCreep, true)}` : '$0.00'}
              </div>
            </div>
          </div>
        </div>

        {/* Awards list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-stone-200 dark:border-[#2e313a] pb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300">
              Prime Awards ({vendor.awards.length})
            </span>
          </div>

          <div className="space-y-2">
            {vendor.awards.map((award, idx) => {
              const stats = calculateContractSplitTrackCreep(award, award.transactions || []);
              return (
                <div
                  key={award.generated_internal_id || idx}
                  onClick={() => onSelectContract(award)}
                  className="p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs hover:border-stone-400 hover:dark:border-[#3e434f] transition-all cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-stone-900 dark:text-zinc-100">
                      {award['Award ID'] || award.piid}
                    </span>
                    <PricingBadge pricingType={award.pricingType} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500 dark:text-zinc-400">
                      Total: {formatCurrency(stats.currentValue, true)}
                    </span>
                    <span className="text-red-700 dark:text-rose-400 font-mono font-bold">
                      +{formatCurrency(stats.dollarCreep, true)} creep
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ========================================================================= */
/* 8. SUB-COMPONENT: OFFICE DETAIL VIEW                                      */
/* ========================================================================= */

interface OfficeDetailViewProps {
  office: OfficeAggregate;
  onBack: () => void;
  onSelectContract: (a: USAspendingAwardItem) => void;
  displayName: string;
}

const OfficeDetailView: React.FC<OfficeDetailViewProps> = ({
  office,
  onBack,
  onSelectContract,
  displayName,
}) => {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-[#18191c] font-sans">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-[#22242a] border-b border-stone-200 dark:border-[#2e313a] px-4 py-3 flex items-center justify-between shadow-xs">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300 hover:text-blue-900 dark:hover:text-sky-400 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {displayName} Overview
        </button>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-[#18191c] text-stone-700 dark:text-zinc-300 font-bold">
          OFFICE AUDIT
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Office Title */}
        <div className="space-y-1 pb-3 border-b border-stone-200 dark:border-[#2e313a]">
          <h2 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-zinc-100">
            {office.name}
          </h2>
          <div className="text-xs text-stone-500 dark:text-zinc-400">
            Parent Agency: <span className="font-semibold text-stone-800 dark:text-zinc-200">{office.agencyName}</span>
          </div>
        </div>

        {/* Micro-Dashboard */}
        <div className="bg-stone-50 dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] p-3.5 rounded-sm space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300">
            Procurement Accountability Metrics
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-white dark:bg-[#18191c] border border-stone-200 dark:border-[#2e313a] rounded-xs">
              <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-bold uppercase">
                Authorized
              </span>
              <div className="text-sm sm:text-base font-mono font-bold text-stone-900 dark:text-zinc-100 mt-0.5">
                {formatCurrency(office.totalCurrent, true)}
              </div>
            </div>

            <div className="p-2 bg-white dark:bg-[#18191c] border border-stone-200 dark:border-[#2e313a] rounded-xs">
              <span className="text-[10px] text-red-700 dark:text-rose-400 font-bold uppercase">
                Dollar Creep
              </span>
              <div className="text-sm sm:text-base font-mono font-bold text-red-700 dark:text-rose-400 mt-0.5">
                {office.totalCreep > 0 ? `+${formatCurrency(office.totalCreep, true)}` : '$0.00'}
              </div>
            </div>

            <div className="p-2 bg-white dark:bg-[#18191c] border border-stone-200 dark:border-[#2e313a] rounded-xs">
              <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-bold uppercase">
                Overrun Rate
              </span>
              <div className="text-sm sm:text-base font-mono font-bold text-red-700 dark:text-rose-400 mt-0.5">
                {office.percentCreep > 0 ? `+${office.percentCreep.toFixed(1)}%` : '0.0%'}
              </div>
            </div>
          </div>
        </div>

        {/* Awards list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-stone-200 dark:border-[#2e313a] pb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300">
              Contracts Managed by this Office ({office.awards.length})
            </span>
          </div>

          <div className="space-y-2">
            {office.awards.map((award, idx) => {
              const stats = calculateContractSplitTrackCreep(award, award.transactions || []);
              return (
                <div
                  key={award.generated_internal_id || idx}
                  onClick={() => onSelectContract(award)}
                  className="p-3 bg-white dark:bg-[#22242a] border border-stone-200 dark:border-[#2e313a] rounded-xs hover:border-stone-400 hover:dark:border-[#3e434f] transition-all cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-stone-900 dark:text-zinc-100">
                      {award['Award ID'] || award.piid}
                    </span>
                    <PricingBadge pricingType={award.pricingType} />
                  </div>
                  <div className="text-xs font-bold text-stone-800 dark:text-zinc-200 truncate">
                    {award['Recipient Name']}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500 dark:text-zinc-400">
                      Total: {formatCurrency(stats.currentValue, true)}
                    </span>
                    <span className="text-red-700 dark:text-rose-400 font-mono font-bold">
                      +{formatCurrency(stats.dollarCreep, true)} creep
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ========================================================================= */
/* 9. MAIN COMPONENT: CONTRACT CREEP PANEL                                    */
/* ========================================================================= */

export const ContractCreepPanel: React.FC<JurisdictionGeoProps> = ({
  level,
  stateCode,
  stateName,
  countyFips,
  countyName,
  districtNumber,
  city,
  onAnalyticsLoaded,
}) => {
  // Navigation & Drilldown State
  const [viewState, setViewState] = useState<ViewState>('OVERVIEW');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('audit');
  const [activeLedgerCategory, setActiveLedgerCategory] = useState<LedgerCategory>('contracts');

  // Selected Entities for Drill-Downs
  const [selectedAward, setSelectedAward] = useState<USAspendingAwardItem | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<VendorAggregate | null>(null);
  const [selectedOffice, setSelectedOffice] = useState<OfficeAggregate | null>(null);

  // Contracts Data
  const [contracts, setContracts] = useState<USAspendingAwardItem[]>([]);
  const [activeAwardTransactions, setActiveAwardTransactions] = useState<USAspendingTransactionItem[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState<boolean>(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState<boolean>(false);
  const [contractError, setContractError] = useState<string | null>(null);

  // Search filter
  const [filterQuery, setFilterQuery] = useState<string>('');

  const displayName = useMemo(() => {
    if (level === 'local' && city) {
      return `${city}, ${stateCode || 'USA'}`;
    }
    if (level === 'county' && countyName) {
      return `${countyName}, ${stateCode || 'USA'}`;
    }
    return stateName || stateCode || 'United States';
  }, [level, city, countyName, stateName, stateCode]);

  const isNationalFederal =
    level === 'federal' && (!stateCode || stateCode === 'US' || stateCode === 'ALL') && !districtNumber;

  // Fetch Contracts when State / Jurisdiction changes
  useEffect(() => {
    let isMounted = true;
    setIsLoadingContracts(true);
    setContracts([]);
    setContractError(null);
    setSelectedAward(null);
    setSelectedVendor(null);
    setSelectedOffice(null);
    setViewState('OVERVIEW');
    setActiveAwardTransactions([]);
    setFilterQuery('');

    const targetState = isNationalFederal ? 'US' : stateCode || 'US';

    const fetchEdgeData = async () => {
      try {
        let rawAwards: any[] = [];

        if (level === 'county' && countyFips) {
          const countyRes = await CivicEdgeApiClient.getCountyBundle(targetState, countyFips);
          rawAwards = countyRes?.awards || [];
          if (rawAwards.length === 0) {
            const stateRes = await CivicEdgeApiClient.getStateBundle(targetState);
            const stateAwards = stateRes?.topAwards || [];
            const cleanCounty = (countyName || '').toLowerCase().replace(/ county$/i, '').trim();
            const fipsTarget = countyFips.padStart(3, '0');
            const matched = stateAwards.filter((a: any) => {
              const aCounty = String(a.county_fips || a.countyFips || '').padStart(3, '0');
              const cName = (a.county_name || '').toLowerCase();
              const desc = (a.Description || a.description || '').toLowerCase();
              return (aCounty && aCounty === fipsTarget) || (cleanCounty && (cName.includes(cleanCounty) || desc.includes(cleanCounty)));
            });
            rawAwards = matched.length > 0 ? matched : stateAwards;
          }
        } else if (level === 'local' && city) {
          const rawCityLower = city.toLowerCase();
          const cleanCity = rawCityLower
            .replace(/^(city of |village of |town of |borough of |township of )/i, '')
            .replace(/\s+(twp|township|village|city|borough)$/i, '')
            .replace(/\s*\([^)]*\)/g, '')
            .trim();

          const searchTokens = [cleanCity];
          if (cleanCity.startsWith('st. ') || cleanCity.startsWith('st ')) {
            searchTokens.push(cleanCity.replace(/^st\.?\s+/i, 'saint '));
          } else if (cleanCity.startsWith('saint ')) {
            searchTokens.push(cleanCity.replace(/^saint\s+/i, 'st. '));
            searchTokens.push(cleanCity.replace(/^saint\s+/i, 'st '));
          }

          let candidateAwards: any[] = [];
          if (countyFips) {
            const countyRes = await CivicEdgeApiClient.getCountyBundle(targetState, countyFips);
            candidateAwards = countyRes?.awards || [];
          }
          if (candidateAwards.length === 0) {
            const stateRes = await CivicEdgeApiClient.getStateBundle(targetState);
            candidateAwards = stateRes?.topAwards || [];
          }

          const cityFiltered = candidateAwards.filter((a: any) => {
            const desc = (a.Description || a.description || '').toLowerCase();
            const rec = (a['Recipient Name'] || a.recipient_name || a.parentName || '').toLowerCase();
            const rCity = (a.recipient_city_name || a.recipient_city || a.city_name || a.city || '').toLowerCase();
            const pCity = (a.place_of_performance_city_name || a.pop_city || '').toLowerCase();
            const rAddr = (a.recipient_address_line_1 || '').toLowerCase();

            return searchTokens.some(
              (token) =>
                token.length >= 3 &&
                (rCity.includes(token) ||
                  pCity.includes(token) ||
                  desc.includes(token) ||
                  rec.includes(token) ||
                  rAddr.includes(token))
            );
          });

          if (cityFiltered.length > 0) {
            rawAwards = cityFiltered;
          } else {
            // Fallback to county-wide awards so we don't display a blank zero-result dead end
            rawAwards = candidateAwards;
          }
        } else {
          const stateRes = await CivicEdgeApiClient.getStateBundle(targetState);
          rawAwards = stateRes?.topAwards || [];
          if (rawAwards.length === 0) {
            const r2Res = await CivicEdgeApiClient.getR2StateBundle(targetState);
            rawAwards = r2Res?.awards || [];
          }
        }

        if (!isMounted) return;

        if (rawAwards.length === 0) {
          setContracts([]);
          setIsLoadingContracts(false);
          return;
        }

        const mappedAwards: USAspendingAwardItem[] = rawAwards.map((a: any) => {
          let txs = a.transactions;
          if (typeof a.transactions_json === 'string') {
            try {
              txs = JSON.parse(a.transactions_json);
            } catch {
              txs = [];
            }
          }
          if (!Array.isArray(txs)) txs = [];

          const delayDays = Number(a.schedule_delay_days || a.scheduleDelayDays || 0);
          const isZombie = a.isZombieContract ?? (delayDays >= 365 || txs.length >= 8);
          let septAmt = 0;
          for (const t of txs) {
            const d = t.action_date || t.d || '';
            if (d.includes('-09-') || d.endsWith('-09')) {
              septAmt += Number(t.federal_action_obligation ?? t.o ?? 0);
            }
          }

          return {
            generated_internal_id: a.generated_internal_id || a.id || `AWARD-${Math.random()}`,
            'Award ID': a['Award ID'] || a.award_id_piid || a.piid || a.generated_internal_id || 'N/A',
            piid: a.piid || a.award_id_piid || a['Award ID'] || 'N/A',
            'Recipient Name': a['Recipient Name'] || a.recipient_name || 'Unknown Vendor',
            parentName:
              a.parentName ||
              a.parent_recipient_name ||
              a['parent_recipient_name'] ||
              a['Recipient Name'] ||
              a.recipient_name ||
              'Unknown Vendor',
            recipientState: a.recipientState || a.recipient_state || a.recipient_location_state_code || '',
            agencyName: a.agencyName || a.awarding_agency || a['Awarding Agency'] || 'Federal Government',
            officeName:
              a.officeName ||
              a.awarding_sub_agency ||
              a['Awarding Sub Agency'] ||
              a['Awarding Agency'] ||
              'Procurement Bureau',
            pricingType: a.pricingType || a.pricing_type || a.type_of_contract_pricing || 'FIXED PRICE',
            'Award Amount': Number(a['Award Amount'] || a.current_obligation || a.current_total_value || 0),
            'Initial Obligation': Number(a['Initial Obligation'] || a.initial_obligation || a.base_exercised_options_val || 0),
            'Base and All Options Value': Number(a['Base and All Options Value'] || a.base_and_all_options_value || 0),
            Description: a.Description || a.description || '',
            'Start Date': a['Start Date'] || a.period_of_performance_start_date || '',
            'End Date': a['End Date'] || a.period_of_performance_current_end_date || '',
            transactions: txs,
            isZombieContract: isZombie,
            scheduleDelayDays: delayDays,
            isSeptemberSpurt: Boolean(a.isSeptemberSpurt || septAmt > 0),
            septemberFunding: septAmt,
          };
        });

        setContracts(mappedAwards);
        setIsLoadingContracts(false);
      } catch (err: any) {
        if (!isMounted) return;
        setContractError(err?.message || 'Failed to load federal contract data.');
        setIsLoadingContracts(false);
      }
    };

    fetchEdgeData();

    return () => {
      isMounted = false;
    };
  }, [level, stateCode, countyFips, countyName, city, isNationalFederal]);

  // Aggregate Forensic Analytics
  const analytics = useMemo(() => {
    let totalTaxpayerOverrun = 0;
    let totalBaseline = 0;
    let totalCurrent = 0;
    let totalContractDollars = 0;
    let costPlusDollars = 0;
    let capitalFlightDollars = 0;
    let megaAwardDollars = 0;
    let septemberSpurtDollars = 0;
    let costPlusCreep = 0;
    let costPlusBaseline = 0;
    let fixedPriceCreep = 0;
    let fixedPriceBaseline = 0;
    let zombieCount = 0;
    let delayedCount = 0;
    let totalDelayDays = 0;

    const vendorMap = new Map<string, VendorAggregate>();
    const officeMap = new Map<string, OfficeAggregate>();

    for (const award of contracts) {
      const stats = calculateContractSplitTrackCreep(award, award.transactions || []);
      const amt = stats.currentValue;
      const base = stats.initialValue;
      const creep = stats.dollarCreep;
      const pricing =
        award.pricingType ||
        normalizePricingType(
          award['type_of_contract_pricing'],
          award.Description || award.description,
          award['Recipient Name'] || award.recipientName || award.parentName
        );
      const hq = (award.recipientState || award['recipient_location_state_code'] || '').toUpperCase();
      const isOut = isNationalFederal ? false : Boolean(hq && stateCode && hq !== stateCode);

      totalBaseline += base;
      totalCurrent += amt;
      totalTaxpayerOverrun += creep;
      totalContractDollars += amt;

      if (pricing === 'COST-PLUS') {
        costPlusDollars += amt;
        costPlusCreep += creep;
        costPlusBaseline += base;
      } else if (pricing === 'FIXED PRICE') {
        fixedPriceCreep += creep;
        fixedPriceBaseline += base;
      }

      if (isOut) capitalFlightDollars += amt;
      if (amt >= 1e9) megaAwardDollars += amt;

      if (award.septemberFunding && award.septemberFunding > 0) {
        septemberSpurtDollars += award.septemberFunding;
      }
      if (award.isZombieContract) zombieCount++;
      if (award.scheduleDelayDays && award.scheduleDelayDays > 0) {
        delayedCount++;
        totalDelayDays += award.scheduleDelayDays;
      }

      // Aggregate by Corporate Parent Vendor
      const parentName = award.parentName || award['parent_recipient_name'] || award['Recipient Name'] || 'Unknown';
      if (!vendorMap.has(parentName)) {
        vendorMap.set(parentName, {
          name: award['Recipient Name'] || parentName,
          parentName,
          hqState: hq || 'US',
          awards: [],
          totalInitial: 0,
          totalCurrent: 0,
          totalCreep: 0,
          percentCreep: 0,
          isOutState: isOut,
          costPlusCount: 0,
        });
      }
      const v = vendorMap.get(parentName)!;
      v.awards.push(award);
      v.totalInitial += base;
      v.totalCurrent += amt;
      v.totalCreep += creep;
      if (pricing === 'COST-PLUS') v.costPlusCount++;

      // Aggregate by Awarding Office
      const officeName =
        award.officeName ||
        award['Awarding Sub Agency'] ||
        award['Awarding Agency'] ||
        'Procurement Bureau';
      const agencyName = award.agencyName || award['Awarding Agency'] || 'Federal Government';
      const officeKey = `${officeName}::${agencyName}`;
      if (!officeMap.has(officeKey)) {
        officeMap.set(officeKey, {
          name: officeName,
          agencyName,
          awards: [],
          totalInitial: 0,
          totalCurrent: 0,
          totalCreep: 0,
          percentCreep: 0,
        });
      }
      const o = officeMap.get(officeKey)!;
      o.awards.push(award);
      o.totalInitial += base;
      o.totalCurrent += amt;
      o.totalCreep += creep;
    }

    const vendorsList = Array.from(vendorMap.values()).map((v) => ({
      ...v,
      percentCreep: v.totalInitial > 0 ? (v.totalCreep / v.totalInitial) * 100 : 0,
    }));
    vendorsList.sort((a, b) => b.totalCreep - a.totalCreep || b.totalCurrent - a.totalCurrent);

    const officesList = Array.from(officeMap.values()).map((o) => ({
      ...o,
      percentCreep: o.totalInitial > 0 ? (o.totalCreep / o.totalInitial) * 100 : 0,
    }));
    officesList.sort((a, b) => b.totalCreep - a.totalCreep || b.totalCurrent - a.totalCurrent);

    const percentOverrun = totalBaseline > 0 ? (totalTaxpayerOverrun / totalBaseline) * 100 : 0;
    const costPlusPct = totalContractDollars > 0 ? (costPlusDollars / totalContractDollars) * 100 : 0;
    const capitalFlightPct =
      totalContractDollars > 0 ? (capitalFlightDollars / totalContractDollars) * 100 : 0;
    const megaAwardPct = totalContractDollars > 0 ? (megaAwardDollars / totalContractDollars) * 100 : 0;
    const septemberSpurtPct =
      totalContractDollars > 0 ? (septemberSpurtDollars / totalContractDollars) * 100 : 0;
    const costPlusRate = costPlusBaseline > 0 ? (costPlusCreep / costPlusBaseline) * 100 : 0;
    const fixedRate = fixedPriceBaseline > 0 ? (fixedPriceCreep / fixedPriceBaseline) * 100 : 0;
    const costPlusMultiplier = fixedRate > 0 ? Number((costPlusRate / fixedRate).toFixed(1)) : 1.0;
    const avgDelayDays = delayedCount > 0 ? Math.round(totalDelayDays / delayedCount) : 0;

    let hhiIndex = 0;
    for (const v of vendorsList) {
      const share = totalContractDollars > 0 ? (v.totalCurrent / totalContractDollars) * 100 : 0;
      hhiIndex += Math.pow(share, 2);
    }
    const hhiScore = Math.round(hhiIndex);
    const topOffender = vendorsList.length > 0 ? vendorsList[0] : null;

    return {
      totalTaxpayerOverrun,
      totalBaseline,
      totalCurrent,
      percentOverrun,
      costPlusPct,
      costPlusMultiplier,
      capitalFlightPct,
      megaAwardPct,
      septemberSpurtPct,
      hhiScore,
      avgDelayDays,
      zombieCount,
      topOffender,
      vendorsList,
      officesList,
    };
  }, [contracts, stateCode, isNationalFederal]);

  // Synchronize Live Audited Jurisdictions with Map
  useEffect(() => {
    if (isLoadingContracts || contractError || !onAnalyticsLoaded) return;
    const metrics: AuditedJurisdictionMetrics = {
      initialObligation: analytics.totalBaseline,
      currentObligation: analytics.totalCurrent,
      dollarCreep: analytics.totalTaxpayerOverrun,
      percentCreep: analytics.percentOverrun,
      activeContractsCount: contracts.length,
      topOffenderName: analytics.topOffender?.parentName,
      costPlusPct: analytics.costPlusPct,
      capitalFlightPct: analytics.capitalFlightPct,
      isLive: true,
    };

    if (level === 'local' && city) {
      const rawClean = city
        .toLowerCase()
        .replace(/^(city of |village of |town of |borough of |township of )/i, '')
        .replace(/\s*\([^)]*\)/g, '')
        .trim();
      const cleanCity = rawClean.replace(/\s+(twp|township|village|city|borough)$/i, '').trim();
      const rawFips = countyFips ? (String(countyFips).length >= 5 ? String(countyFips).slice(2, 5) : String(countyFips).padStart(3, '0')) : '';

      onAnalyticsLoaded(`city_${stateCode}_${cleanCity}`, metrics);
      onAnalyticsLoaded(`city_${stateCode}_${rawClean}`, metrics);
      onAnalyticsLoaded(`city_${stateCode}_${city.toLowerCase()}`, metrics);
      if (rawFips) {
        onAnalyticsLoaded(`city_${stateCode}_${rawFips}_${cleanCity}`, metrics);
        onAnalyticsLoaded(`city_${stateCode}_${rawFips}_${rawClean}`, metrics);
        onAnalyticsLoaded(`city_${stateCode}_${rawFips}_${city.toLowerCase()}`, metrics);
      }
    } else if (level === 'county' && countyFips) {
      onAnalyticsLoaded(`county_${stateCode}_${countyFips.padStart(3, '0')}`, metrics);
      if (countyName) {
        const cleanCounty = countyName.toLowerCase().replace(/ county$/i, '').trim();
        onAnalyticsLoaded(`county_${stateCode}_${cleanCounty}`, metrics);
      }
    } else if (stateCode) {
      onAnalyticsLoaded(`state_${stateCode}`, metrics);
    }
  }, [
    analytics,
    isLoadingContracts,
    contractError,
    level,
    stateCode,
    countyFips,
    countyName,
    city,
    contracts.length,
    onAnalyticsLoaded,
  ]);

  // Filtered lists for Ledger view
  const filteredContracts = useMemo(() => {
    if (!filterQuery.trim()) return contracts;
    const q = filterQuery.toLowerCase();
    return contracts.filter(
      (c) =>
        c['Award ID']?.toLowerCase().includes(q) ||
        c['Recipient Name']?.toLowerCase().includes(q) ||
        c.parentName?.toLowerCase().includes(q) ||
        c.Description?.toLowerCase().includes(q) ||
        c.officeName?.toLowerCase().includes(q)
    );
  }, [contracts, filterQuery]);

  const filteredVendors = useMemo(() => {
    if (!filterQuery.trim()) return analytics.vendorsList;
    const q = filterQuery.toLowerCase();
    return analytics.vendorsList.filter(
      (v) =>
        v.parentName.toLowerCase().includes(q) ||
        v.name.toLowerCase().includes(q) ||
        v.hqState.toLowerCase().includes(q)
    );
  }, [analytics.vendorsList, filterQuery]);

  const filteredOffices = useMemo(() => {
    if (!filterQuery.trim()) return analytics.officesList;
    const q = filterQuery.toLowerCase();
    return analytics.officesList.filter(
      (o) => o.name.toLowerCase().includes(q) || o.agencyName.toLowerCase().includes(q)
    );
  }, [analytics.officesList, filterQuery]);

  // Drilldown Handlers
  const handleSelectContract = (award: USAspendingAwardItem) => {
    setSelectedAward(award);
    setActiveAwardTransactions(award.transactions || []);
    setViewState('CONTRACT_DETAIL');

    if (!award.transactions || award.transactions.length === 0) {
      setIsLoadingTransactions(true);
      civicCache
        .postCached<{ results?: USAspendingTransactionItem[] }>(
          'https://api.usaspending.gov/api/v2/transactions/',
          { award_id: award.generated_internal_id, limit: 100, sort: 'action_date', order: 'asc' },
          CACHE_TTL.API_TRANSACTIONS
        )
        .then((res) => {
          setActiveAwardTransactions(res?.results || []);
          setIsLoadingTransactions(false);
        })
        .catch(() => {
          setIsLoadingTransactions(false);
        });
    }
  };

  const handleSelectVendor = (vendor: VendorAggregate) => {
    setSelectedVendor(vendor);
    setViewState('VENDOR_DETAIL');
  };

  const handleSelectOffice = (office: OfficeAggregate) => {
    setSelectedOffice(office);
    setViewState('OFFICE_DETAIL');
  };

  const handleBackToOverview = () => {
    setViewState('OVERVIEW');
  };

  return (
    <div className="flex flex-col h-full bg-[#fafaf9] dark:bg-[#18191c] text-stone-900 dark:text-zinc-100 overflow-hidden font-sans border-l border-stone-200 dark:border-[#2e313a]">
      {/* 1. OVERVIEW VIEW */}
      {viewState === 'OVERVIEW' && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header Bar */}
          <div className="flex-shrink-0 bg-white dark:bg-[#22242a] border-b border-stone-200 dark:border-[#2e313a] z-10">
            <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-stone-100 dark:border-[#2e313a]">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
                  <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-400 font-mono">
                    CIVIC INTELLIGENCE DOSSIER
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-stone-100 dark:bg-[#18191c] text-stone-800 dark:text-zinc-200 border border-stone-200 dark:border-[#3a3e4a]">
                  {level.toUpperCase()} · {stateCode}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-zinc-100 tracking-tight leading-snug">
                Federal Contract Creep Audit
              </h1>
              <p className="text-xs sm:text-sm text-stone-600 dark:text-zinc-400 font-normal mt-0.5">
                Live USAspending forensic accounting for {displayName}.
              </p>
            </div>

            {/* Top 2-Tab Navigation Switcher */}
            {!isLoadingContracts && !contractError && (
              <div className="flex border-b border-stone-200 dark:border-[#2e313a] bg-stone-100/60 dark:bg-[#1c1d22] p-1.5 gap-1.5">
                <button
                  onClick={() => setSidebarTab('audit')}
                  className={`flex-1 py-2 px-3 text-center text-xs sm:text-sm font-bold rounded-xs transition-all flex items-center justify-center gap-2 cursor-pointer select-none ${
                    sidebarTab === 'audit'
                      ? 'bg-white dark:bg-[#2c2f38] text-stone-900 dark:text-white shadow-xs border border-stone-200/80 dark:border-[#3a3e4a]'
                      : 'text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200 hover:bg-white/50 dark:hover:bg-[#252830]'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>Executive Audit</span>
                </button>

                <button
                  onClick={() => setSidebarTab('ledger')}
                  className={`flex-1 py-2 px-3 text-center text-xs sm:text-sm font-bold rounded-xs transition-all flex items-center justify-center gap-2 cursor-pointer select-none ${
                    sidebarTab === 'ledger'
                      ? 'bg-white dark:bg-[#2c2f38] text-stone-900 dark:text-white shadow-xs border border-stone-200/80 dark:border-[#3a3e4a]'
                      : 'text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200 hover:bg-white/50 dark:hover:bg-[#252830]'
                  }`}
                >
                  <FileText className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
                  <span>Contract Ledger</span>
                  <span className="text-[11px] font-mono px-1.5 py-0.2 bg-stone-200/80 dark:bg-[#18191c] text-stone-700 dark:text-zinc-300 rounded font-semibold">
                    {contracts.length}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Loading Spinner */}
          {isLoadingContracts ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-[#18191c] space-y-4">
              <Loader2 className="w-8 h-8 text-stone-700 dark:text-sky-400 animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-serif font-bold text-stone-800 dark:text-zinc-200">
                  Querying Federal Award Ledgers & Telemetry
                </p>
                <p className="text-xs text-stone-500 dark:text-zinc-400 font-sans">
                  Calculating real Mod 0 baselines and taxpayer overrun for {displayName}...
                </p>
              </div>
            </div>
          ) : contractError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-[#18191c] space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-600 dark:text-rose-400" />
              <p className="text-sm font-serif font-bold text-stone-900 dark:text-zinc-100">
                {contractError}
              </p>
              <button
                onClick={() => setContracts([])}
                className="text-xs text-blue-900 dark:text-sky-400 underline font-medium"
              >
                Retry Query
              </button>
            </div>
          ) : sidebarTab === 'audit' ? (
            <ExecutiveAuditView
              contracts={contracts}
              analytics={analytics}
              isNationalFederal={isNationalFederal}
              onSelectVendor={handleSelectVendor}
              onSelectOffice={handleSelectOffice}
              onJumpToLedger={() => setSidebarTab('ledger')}
            />
          ) : (
            <ItemizedLedgerView
              contracts={contracts}
              filteredContracts={filteredContracts}
              filteredVendors={filteredVendors}
              filteredOffices={filteredOffices}
              filterQuery={filterQuery}
              setFilterQuery={setFilterQuery}
              activeCategory={activeLedgerCategory}
              setActiveCategory={setActiveLedgerCategory}
              isNationalFederal={isNationalFederal}
              stateCode={stateCode}
              onSelectContract={handleSelectContract}
              onSelectVendor={handleSelectVendor}
              onSelectOffice={handleSelectOffice}
            />
          )}
        </div>
      )}

      {/* 2. CONTRACT DETAIL VIEW */}
      {viewState === 'CONTRACT_DETAIL' && selectedAward && (
        <ContractDetailView
          award={selectedAward}
          transactions={activeAwardTransactions}
          isLoadingTransactions={isLoadingTransactions}
          onBack={handleBackToOverview}
          displayName={displayName}
        />
      )}

      {/* 3. VENDOR DETAIL VIEW */}
      {viewState === 'VENDOR_DETAIL' && selectedVendor && (
        <VendorDetailView
          vendor={selectedVendor}
          onBack={handleBackToOverview}
          onSelectContract={handleSelectContract}
          displayName={displayName}
        />
      )}

      {/* 4. OFFICE DETAIL VIEW */}
      {viewState === 'OFFICE_DETAIL' && selectedOffice && (
        <OfficeDetailView
          office={selectedOffice}
          onBack={handleBackToOverview}
          onSelectContract={handleSelectContract}
          displayName={displayName}
        />
      )}
    </div>
  );
};

export default ContractCreepPanel;
