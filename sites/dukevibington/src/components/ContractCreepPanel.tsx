import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  TrendingUp,
  Search,
  X,
  Building2,
  Landmark,
  FileText,
  ExternalLink,
  Percent,
  Globe,
  ChevronRight,
  Info,
} from 'lucide-react';
import { civicCache, CACHE_TTL } from '../services/civicCacheService';

// =============================================================================
// FEDERAL PROCUREMENT GLOSSARY & TOOLTIP SYSTEM
// =============================================================================
export const GLOSSARY_DEFINITIONS: Record<
  string,
  { title: string; category: string; description: string }
> = {
  'cost-plus': {
    title: 'Cost-Plus (Cost-Reimbursement)',
    category: 'High-Risk Pricing',
    description:
      'The government reimburses all allowable contractor costs plus a guaranteed profit fee. Contractors bear minimal financial penalty for cost overruns or schedule slips, making these contracts structurally prone to budget creep.',
  },
  'fixed-price': {
    title: 'Firm Fixed Price (FFP)',
    category: 'Low-Risk Pricing',
    description:
      'The vendor agrees to deliver specified products or services for a set lump sum. The contractor absorbs cost overruns unless formal contract modifications are approved by the government.',
  },
  'time-materials': {
    title: 'Time & Materials / Labor Hours',
    category: 'Moderate-to-High Risk',
    description:
      'The government pays agreed hourly billing rates plus direct materials costs. Carries cost expansion risks if labor hours and deliverables are not strictly capped.',
  },
  'definitive': {
    title: 'Definitive Contract',
    category: 'Award Structure',
    description:
      'A standalone, binding federal procurement contract with agreed specifications, milestones, and defined initial obligations executed directly with a prime contractor.',
  },
  'idv': {
    title: 'Indefinite Delivery Vehicle (IDV)',
    category: 'Umbrella Vehicle',
    description:
      'A master umbrella contract (IDIQ, BPA, BOA, GWAC) allowing federal agencies to issue recurring delivery and task orders against an authorized ceiling over time.',
  },
  'taxpayer-overrun': {
    title: 'Taxpayer Overrun (Creep)',
    category: 'Forensic Accounting',
    description:
      'The net dollar growth between the original initial award baseline (Mod #0) and the cumulative total funded through contract modifications and amendments.',
  },
  'top-offender': {
    title: 'Top Offender (Vendor)',
    category: 'Contractor Audit',
    description:
      'The corporate parent entity or prime contractor responsible for the largest aggregate dollar increase over original baselines across all active state awards.',
  },
  'cost-plus-exposure': {
    title: 'Cost-Plus Exposure Ratio',
    category: 'Risk Telemetry',
    description:
      'The percentage of total state procurement funding committed to cost-reimbursement contracts, which carry the highest historical risk of budget creep.',
  },
  'capital-flight': {
    title: 'Capital Flight (Out-of-State HQ)',
    category: 'Economic Telemetry',
    description:
      'The portion of federal procurement dollars awarded to vendors whose corporate headquarters reside outside this state, shifting public investment out of the local economy.',
  },
  'capital-export': {
    title: 'Capital Export (Out-of-State HQ)',
    category: 'Vendor Status',
    description:
      'Taxpayer dollars awarded to a company registered and headquartered in another state.',
  },
  'initial-obligation': {
    title: 'Initial Obligation (Mod #0 Baseline)',
    category: 'Budget Baseline',
    description:
      'The baseline funding committed in the original award document before subsequent amendments, scope expansions, or cost adjustments.',
  },
  'current-total': {
    title: 'Current Total (Cumulative Obligation)',
    category: 'Cumulative Funding',
    description:
      'The total cumulative taxpayer dollars obligated across all administrative actions, option exercises, and funding revisions to date.',
  },
  'base-options': {
    title: 'Base & Exercised Options Ceiling',
    category: 'Contract Ceiling',
    description:
      'The maximum authorized expenditure ceiling if all option renewal periods and negotiated contract expansions are exercised.',
  },
  'the-overruns': {
    title: 'The Overruns (Contracts)',
    category: 'Investigative Tab',
    description:
      'Individual prime federal contracts audited for budget growth from Mod #0 baseline to present.',
  },
  'the-monopolies': {
    title: 'The Monopolies (Corporate Parents)',
    category: 'Investigative Tab',
    description:
      'Parent conglomerate corporations ranked by total state procurement revenue and aggregate cost creep.',
  },
  'the-bureaucrats': {
    title: 'The Bureaucrats (Procurement Offices)',
    category: 'Investigative Tab',
    description:
      'Federal awarding sub-agencies and contracting commands ranked by authorized spending and cost volatility.',
  },
  'creep-rate': {
    title: 'Creep Rate (Budget Growth %)',
    category: 'Percentage Metric',
    description:
      'The percentage expansion in contract funding compared to the original baseline commitment: (Total Creep / Initial Baseline) × 100.',
  },
};

interface TermTooltipProps {
  termKey?: keyof typeof GLOSSARY_DEFINITIONS;
  title?: string;
  category?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
  align?: 'center' | 'left' | 'right';
}

export const TermTooltip: React.FC<TermTooltipProps> = ({
  termKey,
  title,
  category,
  description,
  children,
  className = '',
  showIcon = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{
    x: number;
    y: number;
    isAbove: boolean;
    arrowLeft: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const def = termKey ? GLOSSARY_DEFINITIONS[termKey] : undefined;
  const tooltipTitle = title || def?.title;
  const tooltipCat = category || def?.category;
  const tooltipDesc = description || def?.description;

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = Math.min(320, window.innerWidth - 24);
    const halfWidth = tooltipWidth / 2;
    const margin = 12;

    const centerX = rect.left + rect.width / 2;
    const clampedX = Math.max(
      halfWidth + margin,
      Math.min(centerX, window.innerWidth - halfWidth - margin)
    );

    // Dynamic arrow position pointing directly to the trigger center
    const tooltipLeftEdge = clampedX - halfWidth;
    const arrowLeft = Math.max(14, Math.min(centerX - tooltipLeftEdge, tooltipWidth - 14));

    // If there is enough clearance above (> 135px), place above; otherwise place below
    const isAbove = rect.top > 135;
    const topY = isAbove ? rect.top - 8 : rect.bottom + 8;

    setCoords({ x: clampedX, y: topY, isAbove, arrowLeft, width: tooltipWidth });
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  if (!tooltipTitle && !tooltipDesc) return <>{children}</>;

  return (
    <>
      <span
        ref={triggerRef}
        className={`relative inline-flex items-center group cursor-help ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {children}
        {showIcon && (
          <Info className="w-2.5 h-2.5 text-stone-400 ml-0.5 inline-block opacity-60 group-hover:opacity-100 group-hover:text-stone-700 transition-all flex-shrink-0" />
        )}
      </span>

      {isOpen &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: `${coords.x}px`,
              top: `${coords.y}px`,
              width: `${coords.width}px`,
              transform: `translate(-50%, ${coords.isAbove ? '-100%' : '0'})`,
              zIndex: 999999,
              pointerEvents: 'none',
            }}
            className="p-3 bg-stone-900 text-stone-100 rounded-sm shadow-2xl text-left border border-stone-700 animate-in fade-in zoom-in-95 duration-75"
          >
            <div className="flex items-start justify-between gap-2 pb-1.5 mb-1.5 border-b border-stone-800 text-[10px]">
              <div className="font-serif font-bold text-xs text-stone-100 flex items-start gap-1.5 leading-snug flex-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1" />
                <span className="break-words">{tooltipTitle}</span>
              </div>
              {tooltipCat && (
                <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-stone-800 text-amber-300/90 font-semibold flex-shrink-0 whitespace-nowrap mt-0.5">
                  {tooltipCat}
                </span>
              )}
            </div>
            {tooltipDesc && (
              <p className="text-[11px] text-stone-300 font-sans leading-relaxed font-normal">
                {tooltipDesc}
              </p>
            )}
            {/* Pointer arrow dynamically tracked to trigger center */}
            <div
              style={{ left: `${coords.arrowLeft}px` }}
              className={`absolute -translate-x-1/2 w-0 h-0 border-4 border-transparent ${
                coords.isAbove
                  ? 'top-full -mt-px border-t-stone-900'
                  : 'bottom-full -mb-px border-b-stone-900'
              }`}
            />
          </div>,
          document.body
        )}
    </>
  );
};

export interface JurisdictionGeoProps {
  level: 'local' | 'county' | 'state' | 'federal';
  stateCode: string; // e.g., "IL"
  stateName?: string; // e.g., "Illinois"
  countyFips?: string; // e.g., "019" (3-digit code)
  countyName?: string; // e.g., "Champaign County"
  districtNumber?: string; // e.g., "13" (for Congressional District)
  city?: string; // e.g., "Champaign"
}

export interface USAspendingAwardItem {
  internal_id?: number;
  id?: number | string;
  'Award ID': string;
  piid?: string;
  'Recipient Name': string;
  recipient_name?: string;
  'Award Amount': number;
  award_amount?: number;
  'Start Date'?: string;
  start_date?: string;
  'End Date'?: string;
  end_date?: string;
  'Period of Performance Start Date'?: string;
  'Period of Performance Current End Date'?: string;
  Description: string;
  description?: string;
  generated_internal_id: string;
  generated_unique_award_id?: string;
  'Contract Award Type'?: string;
  'Award Type'?: string;
  type?: string;
  type_description?: string;
  category?: string;
  award_type_code?: string;
  'Base and All Options Value'?: number;
  base_and_all_options_value?: number;
  base_and_all_options?: number;
  base_exercised_options?: number;
  'Total Obligation'?: number;
  total_obligation?: number;
  parent_recipient_name?: string;
  recipient_parent_name?: string;
  'Parent Recipient Name'?: string;
  recipient_location_state_code?: string;
  recipient_state_code?: string;
  recipient_state?: string;
  awarding_agency_name?: string;
  'Awarding Agency'?: string;
  'Awarding Agency Name'?: string;
  awarding_office_name?: string;
  'Awarding Sub Agency'?: string;
  'Awarding Office'?: string;
  'Awarding Office Name'?: string;
  office_agency_name?: string;
  type_of_contract_pricing?: string;
  'Type of Contract Pricing'?: string;
  initialObligation?: number;
  currentObligation?: number;
  dollarCreep?: number;
  percentCreep?: number;
  pricingType?: string;
  parentName?: string;
  officeName?: string;
  agencyName?: string;
  recipientState?: string;
  transactions?: USAspendingTransactionItem[];
}

export interface USAspendingTransactionItem {
  id?: string | number;
  action_date?: string;
  'Action Date'?: string;
  federal_action_obligation?: number;
  'Transaction Amount'?: number;
  'Federal Action Obligation'?: number;
  base_and_all_options_value?: number;
  'Base and All Options Value'?: number;
  modification_number?: string;
  'Modification Number'?: string;
  action_type_description?: string;
  'Action Type'?: string;
  description?: string;
  'Description'?: string;
}

export interface CreepStats {
  isTrackIdv: boolean;
  initialLabel: string;
  currentLabel: string;
  initialValue: number;
  currentValue: number;
  dollarCreep: number;
  percentCreep: number;
  hasCreep: boolean;
  isZeroCeilingIdv: boolean;
  sortedTransactions: USAspendingTransactionItem[];
}

export type ViewState = 'OVERVIEW' | 'CONTRACT_DETAIL' | 'VENDOR_DETAIL' | 'OFFICE_DETAIL';
export type InvestigativeTab = 'contracts' | 'vendors' | 'offices';

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

// Utility: format large currency values
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

// Utility: format raw ISO dates
function formatDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// Utility: Deduplicate awards list by generated_internal_id or Award ID
function deduplicateAwards(awards: USAspendingAwardItem[]): USAspendingAwardItem[] {
  const seen = new Set<string>();
  const uniqueAwards: USAspendingAwardItem[] = [];

  for (const award of awards) {
    const key =
      award.generated_internal_id ||
      award.generated_unique_award_id ||
      award['Award ID'] ||
      (award.internal_id ? String(award.internal_id) : '');

    if (key && !seen.has(key)) {
      seen.add(key);
      uniqueAwards.push(award);
    }
  }

  return uniqueAwards;
}

// Helper: Normalize pricing structure string
function normalizePricingType(raw?: string): string {
  if (!raw) return 'DEFINITIVE';
  const u = raw.toUpperCase();
  if (u.includes('COST') || u.includes('CPFF') || u.includes('CPAF') || u.includes('CPIF')) {
    return 'COST-PLUS';
  }
  if (u.includes('TIME') || u.includes('MATERIALS') || u.includes('T&M')) {
    return 'TIME & MATERIALS';
  }
  if (u.includes('FIXED') || u.includes('FFP') || u.includes('FIRM')) {
    return 'FIXED PRICE';
  }
  return raw;
}

// Helper: Check if an award is an IDV
function checkIsIdv(award: USAspendingAwardItem): boolean {
  const generatedId = (award.generated_internal_id || award.generated_unique_award_id || '').toUpperCase();
  const awardType = (award['Award Type'] || award['Contract Award Type'] || award.type || '').toUpperCase();
  return generatedId.includes('CONT_IDV') || generatedId.includes('IDV') || awardType.includes('IDV') || award.category === 'idv';
}

// Helper: Find initial baseline obligation from chronological transactions
function findInitialObligation(
  sorted: USAspendingTransactionItem[],
  currentAmt: number,
  awardCeiling: number = 0
): number {
  if (!sorted || sorted.length === 0) {
    return awardCeiling > 0 && awardCeiling < currentAmt ? awardCeiling : currentAmt;
  }

  // 1. Check if first transaction has positive obligation
  const firstTx = sorted[0];
  const firstAmt = firstTx.federal_action_obligation ?? firstTx['Federal Action Obligation'] ?? 0;
  if (firstAmt > 0 && firstAmt < currentAmt) {
    return firstAmt;
  }

  // 2. If first transaction was $0 or administrative, find first positive funding transaction
  const firstPositive = sorted.find(
    (t) => (t.federal_action_obligation ?? t['Federal Action Obligation'] ?? 0) > 0
  );
  if (firstPositive) {
    const posAmt = firstPositive.federal_action_obligation ?? firstPositive['Federal Action Obligation'] ?? 0;
    if (posAmt < currentAmt) {
      return posAmt;
    }
  }

  // 3. Check base and all options value from first transaction
  const firstBase = firstTx.base_and_all_options_value ?? firstTx['Base and All Options Value'] ?? 0;
  if (firstBase > 0 && firstBase < currentAmt) {
    return firstBase;
  }

  // 4. Fallback if legitimately fixed-price or single tx
  return firstAmt > 0 ? firstAmt : currentAmt;
}

// Helper: Find initial baseline ceiling for IDVs
function findInitialCeiling(
  sorted: USAspendingTransactionItem[],
  currentCeiling: number,
  awardCeiling: number = 0
): number {
  if (!sorted || sorted.length === 0) {
    return awardCeiling > 0 ? awardCeiling : currentCeiling;
  }

  const firstTx = sorted[0];
  const firstCeiling = firstTx.base_and_all_options_value ?? firstTx['Base and All Options Value'] ?? 0;
  if (firstCeiling > 0 && firstCeiling < currentCeiling) {
    return firstCeiling;
  }

  const firstPositive = sorted.find(
    (t) => (t.base_and_all_options_value ?? t['Base and All Options Value'] ?? 0) > 0
  );
  if (firstPositive) {
    const posCeiling = firstPositive.base_and_all_options_value ?? firstPositive['Base and All Options Value'] ?? 0;
    if (posCeiling < currentCeiling) {
      return posCeiling;
    }
  }

  return firstCeiling > 0 ? firstCeiling : awardCeiling > 0 ? awardCeiling : currentCeiling;
}

// Split-Track Calculation: IDVs (Ceiling Math) vs Definitive Contracts (Obligation Math)
function calculateContractSplitTrackCreep(
  award: USAspendingAwardItem,
  rawTransactions: USAspendingTransactionItem[]
): CreepStats {
  const isTrackIdv = checkIsIdv(award);
  const awardAmt = award['Award Amount'] ?? award.award_amount ?? award.total_obligation ?? 0;
  const awardCeiling =
    award.base_and_all_options ??
    award['Base and All Options Value'] ??
    award.base_and_all_options_value ??
    0;

  const sorted =
    rawTransactions && rawTransactions.length > 0
      ? [...rawTransactions].sort((a, b) => {
          const dateA = new Date(a.action_date || a['Action Date'] || 0).getTime();
          const dateB = new Date(b.action_date || b['Action Date'] || 0).getTime();
          if (dateA !== dateB) return dateA - dateB;

          const modA = String(a.modification_number ?? a['Modification Number'] ?? '');
          const modB = String(b.modification_number ?? b['Modification Number'] ?? '');
          return modA.localeCompare(modB, undefined, { numeric: true });
        })
      : [];

  if (isTrackIdv) {
    const lastTx = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    let currentCeiling = lastTx
      ? (lastTx.base_and_all_options_value ?? lastTx['Base and All Options Value'] ?? awardCeiling)
      : awardCeiling;
    if (currentCeiling === 0) currentCeiling = awardAmt;

    let initialCeiling =
      award.initialObligation !== undefined && award.initialObligation < currentCeiling
        ? award.initialObligation
        : findInitialCeiling(sorted, currentCeiling, awardCeiling);

    if (initialCeiling === 0 && currentCeiling > 0) {
      initialCeiling = currentCeiling;
    }

    const isZeroCeilingIdv = initialCeiling === 0 && currentCeiling === 0;
    const dollarCreep = isZeroCeilingIdv ? 0 : Math.max(0, currentCeiling - initialCeiling);
    const percentCreep =
      !isZeroCeilingIdv && initialCeiling > 0 ? (dollarCreep / initialCeiling) * 100 : 0;

    return {
      isTrackIdv: true,
      initialLabel: 'INITIAL CEILING',
      currentLabel: 'CURRENT CEILING',
      initialValue: initialCeiling,
      currentValue: currentCeiling,
      dollarCreep,
      percentCreep,
      hasCreep: dollarCreep > 0,
      isZeroCeilingIdv,
      sortedTransactions: sorted,
    };
  } else {
    const currentObligation = awardAmt;
    let initialObligation =
      award.initialObligation !== undefined && award.initialObligation < currentObligation
        ? award.initialObligation
        : findInitialObligation(sorted, currentObligation, awardCeiling);

    const dollarCreep = Math.max(0, currentObligation - initialObligation);
    const percentCreep =
      initialObligation > 0 ? (dollarCreep / initialObligation) * 100 : 0;

    return {
      isTrackIdv: false,
      initialLabel: 'INITIAL OBLIGATION',
      currentLabel: 'CURRENT TOTAL',
      initialValue: initialObligation,
      currentValue: currentObligation,
      dollarCreep,
      percentCreep,
      hasCreep: dollarCreep > 0,
      isZeroCeilingIdv: false,
      sortedTransactions: sorted,
    };
  }
}

export const ContractCreepPanel: React.FC<JurisdictionGeoProps> = ({
  level,
  stateCode,
  stateName,
  countyFips,
  districtNumber,
  city,
}) => {
  // 1. Progressive Disclosure View State
  const [viewState, setViewState] = useState<ViewState>('OVERVIEW');
  const [activeTab, setActiveTab] = useState<InvestigativeTab>('contracts');

  // Selected Entities for Drill-Downs
  const [selectedAward, setSelectedAward] = useState<USAspendingAwardItem | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<VendorAggregate | null>(null);
  const [selectedOffice, setSelectedOffice] = useState<OfficeAggregate | null>(null);

  // Enriched Contracts Data
  const [contracts, setContracts] = useState<USAspendingAwardItem[]>([]);
  const [activeAwardTransactions, setActiveAwardTransactions] = useState<USAspendingTransactionItem[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState<boolean>(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState<boolean>(false);
  const [contractError, setContractError] = useState<string | null>(null);

  // Search filter
  const [filterQuery, setFilterQuery] = useState<string>('');

  const displayName = stateName || stateCode || 'United States';

  // Fetch & Enrich Contracts when State / Jurisdiction changes
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

    const locationsFilter: any[] = [];
    if (level === 'local' && city) {
      locationsFilter.push({ country: 'USA', state: stateCode, city: city.toUpperCase() });
    } else if (level === 'county' && countyFips) {
      locationsFilter.push({ country: 'USA', state: stateCode, county: countyFips.padStart(3, '0') });
    } else if (level === 'federal' && districtNumber) {
      locationsFilter.push({ country: 'USA', state: stateCode, district_current: districtNumber.padStart(2, '0') });
    } else {
      locationsFilter.push({ country: 'USA', state: stateCode });
    }

    const baseFields = [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Description',
      'generated_internal_id',
      'Awarding Agency',
      'Awarding Sub Agency',
      'recipient_location_state_code',
      'Contract Award Type',
      'Period of Performance Start Date',
      'Period of Performance Current End Date',
    ];
    const timePeriod = [{ start_date: '2018-10-01', end_date: '2026-09-30' }];

    const contractsPayload = {
      filters: {
        award_type_codes: ['D'],
        place_of_performance_locations: locationsFilter,
        time_period: timePeriod,
      },
      fields: baseFields,
      limit: 15,
      sort: 'Award Amount',
      order: 'desc',
    };

    const idvsPayload = {
      filters: {
        award_type_codes: ['IDV_A', 'IDV_B', 'IDV_B_A', 'IDV_B_B', 'IDV_B_C', 'IDV_C', 'IDV_D', 'IDV_E'],
        place_of_performance_locations: locationsFilter,
        time_period: timePeriod,
      },
      fields: baseFields,
      limit: 15,
      sort: 'Award Amount',
      order: 'desc',
    };

    const fetchContracts = civicCache
      .postCached<{ results?: USAspendingAwardItem[] }>(
        'https://api.usaspending.gov/api/v2/search/spending_by_award/',
        contractsPayload,
        CACHE_TTL.API_AWARDS
      )
      .catch(() => ({ results: [] }));

    const fetchIdvs = civicCache
      .postCached<{ results?: USAspendingAwardItem[] }>(
        'https://api.usaspending.gov/api/v2/search/spending_by_award/',
        idvsPayload,
        CACHE_TTL.API_AWARDS
      )
      .catch(() => ({ results: [] }));

    Promise.all([fetchContracts, fetchIdvs])
      .then(async ([contractsData, idvsData]) => {
        if (!isMounted) return;
        const contractsList: USAspendingAwardItem[] = contractsData?.results || [];
        const idvsList: USAspendingAwardItem[] = idvsData?.results || [];
        let combined = deduplicateAwards([...contractsList, ...idvsList]);

        // Fallback for local municipal boundaries
        if (combined.length === 0 && level === 'local' && countyFips) {
          try {
            const countyLocation = [{ country: 'USA', state: stateCode, county: countyFips.padStart(3, '0') }];
            const fallbackRes = await civicCache.postCached<{ results?: USAspendingAwardItem[] }>(
              'https://api.usaspending.gov/api/v2/search/spending_by_award/',
              { ...contractsPayload, filters: { ...contractsPayload.filters, place_of_performance_locations: countyLocation } },
              CACHE_TTL.API_AWARDS
            );
            combined = deduplicateAwards(fallbackRes?.results || []);
          } catch {
            // ignore
          }
        }

        combined.sort((a, b) => (b['Award Amount'] ?? 0) - (a['Award Amount'] ?? 0));
        const topAwards = combined.slice(0, 15);

        // Batch enrich with transactions & overview telemetry to calculate accurate non-zero creep
        const enrichedAwards = await Promise.all(
          topAwards.map(async (award) => {
            const internalId = award.generated_internal_id;
            if (!internalId) return award;

            try {
              // 1. Fetch transactions (Mod 0 baseline)
              const txRes = await civicCache.postCached<{ results?: USAspendingTransactionItem[] }>(
                'https://api.usaspending.gov/api/v2/transactions/',
                { award_id: internalId, limit: 100, sort: 'action_date', order: 'asc' },
                CACHE_TTL.API_TRANSACTIONS
              );
              const txs = txRes?.results || [];

              // 2. Fetch award overview (pricing, corporate parent, agency hierarchy)
              const overview = await civicCache.fetchCached(
                `award_overview:${internalId}`,
                async () => {
                  const r = await fetch(`https://api.usaspending.gov/api/v2/awards/${encodeURIComponent(internalId)}/`);
                  return r.ok ? r.json() : null;
                },
                CACHE_TTL.API_TRANSACTIONS
              );

              // 3. Compute accurate creep math
              const currentAmt = award['Award Amount'] ?? overview?.total_obligation ?? 0;
              const awardCeiling = overview?.base_and_all_options ?? award['Base and All Options Value'] ?? 0;

              const isIdv = checkIsIdv(award);
              const initialAmt = isIdv
                ? findInitialCeiling(txs, currentAmt, awardCeiling)
                : findInitialObligation(txs, currentAmt, awardCeiling);

              const dollarCreep = Math.max(0, currentAmt - initialAmt);
              const percentCreep = initialAmt > 0 ? (dollarCreep / initialAmt) * 100 : 0;

              const pricingRaw =
                overview?.latest_transaction_contract_data?.type_of_contract_pricing_description ||
                overview?.pricing_type ||
                award['type_of_contract_pricing'] ||
                '';
              const pricingType = normalizePricingType(pricingRaw);

              const officeName =
                overview?.awarding_agency?.office_agency?.name ||
                overview?.awarding_agency?.subtier_agency?.name ||
                award['Awarding Sub Agency'] ||
                award['Awarding Agency'] ||
                'Procurement Bureau';

              const agencyName =
                overview?.awarding_agency?.toptier_agency?.name ||
                award['Awarding Agency'] ||
                'Federal Government';

              const parentName =
                overview?.recipient?.parent_recipient_name ||
                award['parent_recipient_name'] ||
                award['Recipient Name'];

              const recipientState =
                overview?.recipient?.location?.state_code ||
                award['recipient_location_state_code'] ||
                '';

              return {
                ...award,
                initialObligation: initialAmt,
                currentObligation: currentAmt,
                dollarCreep,
                percentCreep,
                pricingType,
                officeName,
                agencyName,
                parentName,
                recipientState,
                transactions: txs,
                'Start Date': award['Period of Performance Start Date'] || award['Start Date'] || overview?.period_of_performance?.start_date,
                'End Date': award['Period of Performance Current End Date'] || award['End Date'] || overview?.period_of_performance?.current_end_date,
                Description: award.Description || overview?.description || '',
              };
            } catch {
              return award;
            }
          })
        );

        if (isMounted) {
          // Sort by dollar overrun descending so highest cost bloat projects float to top
          enrichedAwards.sort((a, b) => (b.dollarCreep ?? 0) - (a.dollarCreep ?? 0) || (b['Award Amount'] ?? 0) - (a['Award Amount'] ?? 0));
          setContracts(enrichedAwards);
          setIsLoadingContracts(false);
        }
      })
      .catch((err) => {
        console.warn('USAspending query error:', err);
        if (isMounted) {
          setContractError('Unable to load federal contracts for this region.');
          setIsLoadingContracts(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [level, stateCode, countyFips, districtNumber, city]);

  // Aggregate Computation for Executive Summary, Vendors, and Offices
  const analytics = useMemo(() => {
    let totalTaxpayerOverrun = 0;
    let totalBaseline = 0;
    let totalCurrent = 0;
    let costPlusDollars = 0;
    let totalContractDollars = 0;
    let capitalFlightDollars = 0;

    const vendorMap = new Map<string, VendorAggregate>();
    const officeMap = new Map<string, OfficeAggregate>();

    for (const award of contracts) {
      const stats = calculateContractSplitTrackCreep(award, award.transactions || []);
      const amt = stats.currentValue;
      const base = stats.initialValue;
      const creep = Math.max(0, stats.dollarCreep);

      totalTaxpayerOverrun += creep;
      totalBaseline += base;
      totalCurrent += amt;
      totalContractDollars += amt;

      const pricing = award.pricingType || normalizePricingType(award['type_of_contract_pricing']);
      if (pricing === 'COST-PLUS') {
        costPlusDollars += amt;
      }

      const hq = (award.recipientState || award['recipient_location_state_code'] || '').toUpperCase();
      const isOut = Boolean(hq && hq !== stateCode);
      if (isOut) {
        capitalFlightDollars += amt;
      }

      // Aggregate by Vendor Parent
      const parentName = award.parentName || award['parent_recipient_name'] || award['Recipient Name'] || 'Unknown Vendor';
      if (!vendorMap.has(parentName)) {
        vendorMap.set(parentName, {
          name: award['Recipient Name'] || parentName,
          parentName,
          hqState: hq || stateCode,
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
      const officeName = award.officeName || award['Awarding Sub Agency'] || award['Awarding Agency'] || 'Procurement Bureau';
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

    // Compute Vendor Percentages & Sort by dollar overrun
    const vendorsList = Array.from(vendorMap.values()).map((v) => ({
      ...v,
      percentCreep: v.totalInitial > 0 ? (v.totalCreep / v.totalInitial) * 100 : 0,
    }));
    vendorsList.sort((a, b) => b.totalCreep - a.totalCreep || b.totalCurrent - a.totalCurrent);

    // Compute Office Percentages & Sort by dollar overrun
    const officesList = Array.from(officeMap.values()).map((o) => ({
      ...o,
      percentCreep: o.totalInitial > 0 ? (o.totalCreep / o.totalInitial) * 100 : 0,
    }));
    officesList.sort((a, b) => b.totalCreep - a.totalCreep || b.totalCurrent - a.totalCurrent);

    const percentOverrun = totalBaseline > 0 ? (totalTaxpayerOverrun / totalBaseline) * 100 : 0;
    const costPlusPct = totalContractDollars > 0 ? (costPlusDollars / totalContractDollars) * 100 : 0;
    const capitalFlightPct = totalContractDollars > 0 ? (capitalFlightDollars / totalContractDollars) * 100 : 0;

    const topOffender = vendorsList.length > 0 ? vendorsList[0] : null;

    return {
      totalTaxpayerOverrun,
      totalBaseline,
      totalCurrent,
      percentOverrun,
      costPlusPct,
      capitalFlightPct,
      topOffender,
      vendorsList,
      officesList,
    };
  }, [contracts, stateCode]);

  // Filtered Lists based on Search Query
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
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.agencyName.toLowerCase().includes(q)
    );
  }, [analytics.officesList, filterQuery]);

  // Handler: Drill down into contract detail
  const handleSelectContract = (award: USAspendingAwardItem) => {
    setSelectedAward(award);
    setActiveAwardTransactions(award.transactions || []);
    setViewState('CONTRACT_DETAIL');

    // If transactions not already loaded, fetch on the fly
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

  // Handler: Drill down into vendor detail
  const handleSelectVendor = (vendor: VendorAggregate) => {
    setSelectedVendor(vendor);
    setViewState('VENDOR_DETAIL');
  };

  // Handler: Drill down into office detail
  const handleSelectOffice = (office: OfficeAggregate) => {
    setSelectedOffice(office);
    setViewState('OFFICE_DETAIL');
  };

  // Back to overview
  const handleBackToOverview = () => {
    setViewState('OVERVIEW');
  };

  // Current contract stats when in CONTRACT_DETAIL view
  const currentCreepStats = useMemo(() => {
    if (!selectedAward) return null;
    return calculateContractSplitTrackCreep(selectedAward, activeAwardTransactions);
  }, [selectedAward, activeAwardTransactions]);

  return (
    <div className="flex flex-col h-full bg-[#fafaf9] text-stone-900 overflow-hidden font-sans border-l border-stone-200">
      {/* ========================================================================= */}
      {/* 1. PROGRESSIVE DISCLOSURE VIEW ROUTER                                     */}
      {/* ========================================================================= */}

      {/* VIEW 1: OVERVIEW PANEL */}
      {viewState === 'OVERVIEW' && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* FIXED / STICKY TOP SECTION: Header + 4-in-a-Row Audit + Search + 3 Tabs */}
          <div className="flex-shrink-0 bg-white border-b border-stone-200 z-10">
            {/* Header Bar */}
            <div className="px-3.5 py-2 sm:px-4 sm:py-2.5 border-b border-stone-100">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500 font-mono">
                    CIVIC INTELLIGENCE DOSSIER
                  </span>
                </div>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                  {level.toUpperCase()} · {stateCode}
                </span>
              </div>
              <h1 className="font-serif text-base sm:text-lg font-bold text-stone-900 tracking-tight leading-tight">
                Federal Contract Creep Audit
              </h1>
              <p className="text-[11px] text-stone-500 font-serif italic">
                Live USAspending forensic accounting for {displayName}.
              </p>
            </div>

            {/* Compact 4-in-a-Row Executive Summary (When not loading / error) */}
            {!isLoadingContracts && !contractError && (
              <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-stone-50/80 border-b border-stone-200">
                <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-stone-200/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-700 font-sans flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-red-700" />
                    Executive Procurement Audit
                  </span>
                  <span className="text-[9px] font-mono text-stone-500">
                    {contracts.length} AUDITED PRIME AWARDS
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                  {/* Metric 1: Total Taxpayer Overrun */}
                  <div className="p-1.5 sm:p-2 bg-white border border-stone-200 rounded-xs flex flex-col justify-between">
                    <TermTooltip termKey="taxpayer-overrun" showIcon align="left" className="w-full justify-between">
                      <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider truncate">
                        Taxpayer Overrun
                      </span>
                    </TermTooltip>
                    <div className="text-xs sm:text-sm font-bold font-mono text-red-700 tabular-nums truncate my-0.5">
                      {analytics.totalTaxpayerOverrun > 0
                        ? `+${formatCurrency(analytics.totalTaxpayerOverrun, true)}`
                        : '$0.00'}
                    </div>
                    <div className="text-[8px] sm:text-[9px] text-stone-500 font-mono truncate">
                      {analytics.percentOverrun > 0
                        ? `+${analytics.percentOverrun.toFixed(1)}% creep`
                        : 'On baseline budget'}
                    </div>
                  </div>

                  {/* Metric 2: Top Offender */}
                  <div
                    onClick={() => analytics.topOffender && handleSelectVendor(analytics.topOffender)}
                    className={`p-1.5 sm:p-2 bg-white border border-stone-200 rounded-xs flex flex-col justify-between ${
                      analytics.topOffender ? 'cursor-pointer hover:border-blue-900 transition-colors' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <TermTooltip termKey="top-offender" showIcon align="left" className="truncate">
                        <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider truncate">Top Offender</span>
                      </TermTooltip>
                      {analytics.topOffender && (
                        <ChevronRight className="w-2.5 h-2.5 text-stone-400 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-[10px] sm:text-xs font-bold font-serif text-stone-900 truncate my-0.5" title={analytics.topOffender?.parentName}>
                      {analytics.topOffender ? analytics.topOffender.parentName : 'None Identified'}
                    </div>
                    <div className="text-[8px] sm:text-[9px] font-mono text-red-700 font-semibold tabular-nums truncate">
                      {analytics.topOffender && analytics.topOffender.totalCreep > 0
                        ? `+${formatCurrency(analytics.topOffender.totalCreep, true)} creep`
                        : `${analytics.topOffender?.awards.length || 0} prime awards`}
                    </div>
                  </div>

                  {/* Metric 3: Cost-Plus Exposure */}
                  <div className="p-1.5 sm:p-2 bg-white border border-stone-200 rounded-xs flex flex-col justify-between">
                    <TermTooltip termKey="cost-plus-exposure" showIcon align="center" className="w-full justify-between">
                      <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1 truncate">
                        <Percent className="w-2.5 h-2.5 text-stone-400 flex-shrink-0" />
                        <span className="truncate">Cost-Plus Exp.</span>
                      </span>
                    </TermTooltip>
                    <div className="text-xs sm:text-sm font-bold font-mono text-stone-800 tabular-nums my-0.5">
                      {analytics.costPlusPct.toFixed(1)}%
                    </div>
                    <div className="text-[8px] sm:text-[9px] text-stone-500 font-sans truncate">
                      Cost-reimbursement
                    </div>
                  </div>

                  {/* Metric 4: Capital Flight */}
                  <div className="p-1.5 sm:p-2 bg-white border border-stone-200 rounded-xs flex flex-col justify-between">
                    <TermTooltip termKey="capital-flight" showIcon align="right" className="w-full justify-between">
                      <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1 truncate">
                        <Globe className="w-2.5 h-2.5 text-stone-400 flex-shrink-0" />
                        <span className="truncate">Capital Flight</span>
                      </span>
                    </TermTooltip>
                    <div className="text-xs sm:text-sm font-bold font-mono text-stone-800 tabular-nums my-0.5">
                      {analytics.capitalFlightPct.toFixed(1)}%
                    </div>
                    <div className="text-[8px] sm:text-[9px] text-stone-500 font-sans truncate">
                      Out-of-state HQ
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Search Bar & 3 Investigative Tabs */}
            {!isLoadingContracts && !contractError && (
              <div className="px-3 pt-2 sm:px-4 bg-white space-y-2">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2 text-stone-400" />
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Filter by vendor, office, or contract..."
                    className="w-full pl-8 pr-8 py-1 bg-stone-50/60 border border-stone-200 rounded-xs text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400 font-sans"
                  />
                  {filterQuery && (
                    <button
                      onClick={() => setFilterQuery('')}
                      className="absolute right-2.5 top-1.5 text-stone-400 hover:text-stone-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 3 Investigative Tabs */}
                <div className="flex border-b border-stone-200 text-xs font-serif">
                  <button
                    onClick={() => setActiveTab('contracts')}
                    className={`flex-1 py-1.5 px-2 text-center font-bold transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeTab === 'contracts'
                        ? 'border-stone-900 text-stone-900 bg-stone-100/50'
                        : 'border-transparent text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <TermTooltip termKey="the-overruns" align="left">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        The Overruns
                      </span>
                    </TermTooltip>
                    <span className="text-[10px] font-mono px-1 bg-stone-200/70 text-stone-700 rounded-xs">
                      {contracts.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('vendors')}
                    className={`flex-1 py-1.5 px-2 text-center font-bold transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeTab === 'vendors'
                        ? 'border-stone-900 text-stone-900 bg-stone-100/50'
                        : 'border-transparent text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <TermTooltip termKey="the-monopolies" align="center">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        The Monopolies
                      </span>
                    </TermTooltip>
                    <span className="text-[10px] font-mono px-1 bg-stone-200/70 text-stone-700 rounded-xs">
                      {analytics.vendorsList.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('offices')}
                    className={`flex-1 py-1.5 px-2 text-center font-bold transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeTab === 'offices'
                        ? 'border-stone-900 text-stone-900 bg-stone-100/50'
                        : 'border-transparent text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <TermTooltip termKey="the-bureaucrats" align="right">
                      <span className="flex items-center gap-1">
                        <Landmark className="w-3.5 h-3.5" />
                        The Bureaucrats
                      </span>
                    </TermTooltip>
                    <span className="text-[10px] font-mono px-1 bg-stone-200/70 text-stone-700 rounded-xs">
                      {analytics.officesList.length}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Full-Section Loading / Stale Data Clearing */}
          {isLoadingContracts ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white space-y-4">
              <Loader2 className="w-8 h-8 text-stone-700 animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-serif font-bold text-stone-800">
                  Querying Federal Award Ledgers & Telemetry
                </p>
                <p className="text-xs text-stone-500 font-sans">
                  Calculating real Mod 0 baselines and taxpayer overrun for {displayName}...
                </p>
              </div>
            </div>
          ) : contractError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-600" />
              <p className="text-sm font-serif font-bold text-stone-900">{contractError}</p>
              <button
                onClick={() => setContracts([])}
                className="text-xs text-blue-900 underline font-medium"
              >
                Retry Query
              </button>
            </div>
          ) : (
            /* SCROLLABLE LIST OF ITEMS (Only this area scrolls) */
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
              {/* C. TAB 1: [ THE OVERRUNS ] (Contracts) */}
              {activeTab === 'contracts' && (
                <div className="space-y-3 pt-1">
                  {filteredContracts.length === 0 ? (
                    <div className="p-8 text-center bg-white border border-stone-200 rounded-sm">
                      <p className="text-xs text-stone-500 font-serif italic">
                        No prime contract overruns match your search query.
                      </p>
                    </div>
                  ) : (
                    filteredContracts.map((award, idx) => {
                      const stats = calculateContractSplitTrackCreep(award, award.transactions || []);
                      const parentName = award.parentName || award['parent_recipient_name'] || award['Recipient Name'];
                      const recipientName = award['Recipient Name'] || 'Unknown Vendor';
                      const officeName = award.officeName || award['Awarding Sub Agency'] || award['Awarding Agency'] || 'Procurement Bureau';
                      const agencyName = award.agencyName || award['Awarding Agency'] || 'Federal Government';
                      const pricing = award.pricingType || normalizePricingType(award['type_of_contract_pricing']);
                      const hq = (award.recipientState || award['recipient_location_state_code'] || '').toUpperCase();
                      const isOut = Boolean(hq && hq !== stateCode);
                      const isIdv = stats.isTrackIdv;

                      return (
                        <div
                          key={award.generated_internal_id || award['Award ID'] || idx}
                          onClick={() => handleSelectContract(award)}
                          className="bg-white border border-stone-200 p-3.5 rounded-sm hover:border-stone-400 hover:shadow-xs transition-all cursor-pointer space-y-2.5"
                        >
                          {/* Top Row: PIID + Badges */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-stone-900">
                                {award['Award ID'] || award.piid || 'N/A'}
                              </span>
                              <TermTooltip termKey={isIdv ? 'idv' : 'definitive'} align="left">
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded-xs font-bold uppercase ${
                                    isIdv
                                      ? 'bg-purple-100 text-purple-900'
                                      : 'bg-stone-100 text-stone-700'
                                  }`}
                                >
                                  {isIdv ? 'IDV VEHICLE' : 'DEFINITIVE'}
                                </span>
                              </TermTooltip>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <TermTooltip
                                termKey={
                                  pricing === 'COST-PLUS'
                                    ? 'cost-plus'
                                    : pricing === 'FIXED PRICE'
                                    ? 'fixed-price'
                                    : pricing.includes('TIME')
                                    ? 'time-materials'
                                    : undefined
                                }
                                align="right"
                              >
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded-xs font-bold uppercase ${
                                    pricing === 'COST-PLUS'
                                      ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                      : 'bg-stone-100 text-stone-600'
                                  }`}
                                >
                                  {pricing}
                                </span>
                              </TermTooltip>
                              {isOut && (
                                <TermTooltip termKey="capital-export" align="right">
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-xs bg-rose-50 text-rose-800 border border-rose-200 font-bold">
                                    HQ: {hq}
                                  </span>
                                </TermTooltip>
                              )}
                            </div>
                          </div>

                          {/* Recipient & Corporate Parent */}
                          <div>
                            <div className="font-serif text-sm font-bold text-stone-900 leading-snug">
                              {recipientName}
                            </div>
                            {parentName !== recipientName && (
                              <div className="text-[11px] text-stone-500 font-sans flex items-center gap-1 mt-0.5">
                                <span className="text-stone-400">Parent:</span> {parentName}
                              </div>
                            )}
                            <div className="text-[11px] text-stone-600 font-sans mt-0.5 truncate">
                              <span className="text-stone-400">Bureau:</span> {officeName} · {agencyName}
                            </div>
                          </div>

                          {/* Financials & Red Overrun Math */}
                          <div className="bg-stone-50 p-2.5 rounded-xs border border-stone-100 flex items-center justify-between gap-3">
                            <div>
                              <TermTooltip termKey="initial-obligation" showIcon align="left">
                                <span className="text-[10px] text-stone-500 font-bold uppercase">
                                  {stats.initialLabel}
                                </span>
                              </TermTooltip>
                              <div className="text-xs font-mono text-stone-800 tabular-nums">
                                {formatCurrency(stats.initialValue, true)}
                              </div>
                            </div>

                            <div className="text-right">
                              <TermTooltip termKey="current-total" showIcon align="center">
                                <span className="text-[10px] text-stone-500 font-bold uppercase">
                                  {stats.currentLabel}
                                </span>
                              </TermTooltip>
                              <div className="text-xs font-mono font-bold text-stone-900 tabular-nums">
                                {formatCurrency(stats.currentValue, true)}
                              </div>
                            </div>

                            <div className="text-right pl-2 border-l border-stone-200">
                              <TermTooltip termKey="taxpayer-overrun" showIcon align="right">
                                <span className="text-[10px] font-bold text-red-700 uppercase">
                                  TAXPAYER CREEP
                                </span>
                              </TermTooltip>
                              <div className="text-xs font-mono font-bold text-red-700 tabular-nums">
                                {stats.dollarCreep > 0
                                  ? `+${formatCurrency(stats.dollarCreep, true)}`
                                  : '$0.00'}
                              </div>
                              {stats.percentCreep > 0 && (
                                <div className="text-[10px] font-mono text-red-700 font-semibold tabular-nums">
                                  +{stats.percentCreep.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Description Snippet */}
                          {award.Description && (
                            <p className="text-[11px] text-stone-600 line-clamp-2 leading-relaxed font-sans pt-0.5">
                              {award.Description}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* D. TAB 2: [ THE MONOPOLIES ] (Vendors) */}
              {activeTab === 'vendors' && (
                <div className="space-y-3 pt-1">
                  {filteredVendors.length === 0 ? (
                    <div className="p-8 text-center bg-white border border-stone-200 rounded-sm">
                      <p className="text-xs text-stone-500 font-serif italic">
                        No corporate monopolies match your search query.
                      </p>
                    </div>
                  ) : (
                    filteredVendors.map((vendor, idx) => (
                      <div
                        key={vendor.parentName || idx}
                        onClick={() => handleSelectVendor(vendor)}
                        className="bg-white border border-stone-200 p-3.5 rounded-sm hover:border-stone-400 hover:shadow-xs transition-all cursor-pointer space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-stone-400">
                                #{idx + 1}
                              </span>
                              <h3 className="font-serif text-sm font-bold text-stone-900">
                                {vendor.parentName}
                              </h3>
                            </div>
                            <div className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-2">
                              <span>HQ: {vendor.hqState}</span>
                              {vendor.isOutState && (
                                <TermTooltip termKey="capital-export" align="left">
                                  <span className="text-[9px] font-mono px-1 bg-rose-50 text-rose-800 border border-rose-200 rounded-xs font-bold">
                                    CAPITAL EXPORT
                                  </span>
                                </TermTooltip>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-800">
                              {vendor.awards.length} {vendor.awards.length === 1 ? 'Award' : 'Awards'}
                            </span>
                          </div>
                        </div>

                        {/* Financials */}
                        <div className="bg-stone-50 p-2.5 rounded-xs border border-stone-100 grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-[9px] text-stone-500 font-bold uppercase">
                              State Revenue
                            </div>
                            <div className="text-xs font-mono font-bold text-stone-800 tabular-nums">
                              {formatCurrency(vendor.totalCurrent, true)}
                            </div>
                          </div>

                          <div>
                            <TermTooltip termKey="taxpayer-overrun" showIcon align="center">
                              <span className="text-[9px] text-stone-500 font-bold uppercase">
                                Total Creep
                              </span>
                            </TermTooltip>
                            <div className="text-xs font-mono font-bold text-red-700 tabular-nums">
                              {vendor.totalCreep > 0
                                ? `+${formatCurrency(vendor.totalCreep, true)}`
                                : '$0.00'}
                            </div>
                          </div>

                          <div>
                            <TermTooltip termKey="creep-rate" showIcon align="right">
                              <span className="text-[9px] text-stone-500 font-bold uppercase">
                                Creep Rate
                              </span>
                            </TermTooltip>
                            <div className="text-xs font-mono font-bold text-red-700 tabular-nums">
                              {vendor.percentCreep > 0
                                ? `+${vendor.percentCreep.toFixed(1)}%`
                                : '0.0%'}
                            </div>
                          </div>
                        </div>

                        <div className="text-[11px] text-blue-900 font-serif font-semibold flex items-center gap-1 justify-end">
                          <span>Inspect Vendor Portfolio</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* E. TAB 3: [ THE BUREAUCRATS ] (Offices) */}
              {activeTab === 'offices' && (
                <div className="space-y-3 pt-1">
                  {filteredOffices.length === 0 ? (
                    <div className="p-8 text-center bg-white border border-stone-200 rounded-sm">
                      <p className="text-xs text-stone-500 font-serif italic">
                        No awarding procurement offices match your search query.
                      </p>
                    </div>
                  ) : (
                    filteredOffices.map((office, idx) => (
                      <div
                        key={`${office.name}-${office.agencyName}-${idx}`}
                        onClick={() => handleSelectOffice(office)}
                        className="bg-white border border-stone-200 p-3.5 rounded-sm hover:border-stone-400 hover:shadow-xs transition-all cursor-pointer space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-stone-400">
                                #{idx + 1}
                              </span>
                              <h3 className="font-serif text-sm font-bold text-stone-900">
                                {office.name}
                              </h3>
                            </div>
                            <div className="text-[11px] text-stone-500 mt-0.5">
                              {office.agencyName}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-800">
                              {office.awards.length} {office.awards.length === 1 ? 'Contract' : 'Contracts'}
                            </span>
                          </div>
                        </div>

                        {/* Financials */}
                        <div className="bg-stone-50 p-2.5 rounded-xs border border-stone-100 grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-[9px] text-stone-500 font-bold uppercase">
                              Authorized Total
                            </div>
                            <div className="text-xs font-mono font-bold text-stone-800 tabular-nums">
                              {formatCurrency(office.totalCurrent, true)}
                            </div>
                          </div>

                          <div>
                            <TermTooltip termKey="taxpayer-overrun" showIcon align="center">
                              <span className="text-[9px] text-stone-500 font-bold uppercase">
                                Dollar Overrun
                              </span>
                            </TermTooltip>
                            <div className="text-xs font-mono font-bold text-red-700 tabular-nums">
                              {office.totalCreep > 0
                                ? `+${formatCurrency(office.totalCreep, true)}`
                                : '$0.00'}
                            </div>
                          </div>

                          <div>
                            <TermTooltip termKey="creep-rate" showIcon align="right">
                              <span className="text-[9px] text-stone-500 font-bold uppercase">
                                Overrun Rate
                              </span>
                            </TermTooltip>
                            <div className="text-xs font-mono font-bold text-red-700 tabular-nums">
                              {office.percentCreep > 0
                                ? `+${office.percentCreep.toFixed(1)}%`
                                : '0.0%'}
                            </div>
                          </div>
                        </div>

                        <div className="text-[11px] text-blue-900 font-serif font-semibold flex items-center gap-1 justify-end">
                          <span>Inspect Office Contracts</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: CONTRACT DETAIL (Mod 0 → Mod N Stepper & Ledger)                   */}
      {/* ========================================================================= */}
      {viewState === 'CONTRACT_DETAIL' && selectedAward && (
        <div className="flex flex-col h-full overflow-hidden bg-white">
          {/* Sticky Header with Back Button */}
          <div className="sticky top-0 z-20 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between shadow-xs">
            <button
              onClick={handleBackToOverview}
              className="flex items-center gap-2 text-xs font-serif font-bold uppercase tracking-wider text-stone-700 hover:text-blue-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to {displayName} Overview
            </button>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-700">
              CONTRACT LEDGER
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Header Profile */}
            <div className="space-y-2 pb-3 border-b border-stone-200">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-stone-900">
                  {selectedAward['Award ID'] || selectedAward.piid || 'N/A'}
                </span>
                <div className="flex items-center gap-1.5">
                  <TermTooltip
                    termKey={
                      (selectedAward.pricingType || normalizePricingType(selectedAward['type_of_contract_pricing'])) === 'COST-PLUS'
                        ? 'cost-plus'
                        : (selectedAward.pricingType || normalizePricingType(selectedAward['type_of_contract_pricing'])) === 'FIXED PRICE'
                        ? 'fixed-price'
                        : undefined
                    }
                    align="right"
                  >
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-stone-100 text-stone-700 rounded-xs font-bold">
                      {selectedAward.pricingType || normalizePricingType(selectedAward['type_of_contract_pricing'])}
                    </span>
                  </TermTooltip>
                  {(selectedAward.recipientState || selectedAward['recipient_location_state_code']) && (
                    <TermTooltip termKey="capital-export" align="right">
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-stone-100 text-stone-700 rounded-xs font-semibold">
                        HQ: {(selectedAward.recipientState || selectedAward['recipient_location_state_code'] || '').toUpperCase()}
                      </span>
                    </TermTooltip>
                  )}
                </div>
              </div>

              <h2 className="font-serif text-base sm:text-lg font-bold text-stone-900 leading-snug">
                {selectedAward['Recipient Name']}
              </h2>

              {selectedAward.parentName &&
                selectedAward.parentName !== selectedAward['Recipient Name'] && (
                  <p className="text-xs text-stone-500 font-sans">
                    Parent Entity: <span className="text-stone-800 font-medium">{selectedAward.parentName}</span>
                  </p>
                )}

              <div className="text-xs text-stone-600 font-sans">
                Awarding Agency: <span className="font-medium text-stone-800">{selectedAward.officeName || selectedAward['Awarding Sub Agency'] || 'Bureau'} · {selectedAward.agencyName || selectedAward['Awarding Agency'] || 'Agency'}</span>
              </div>

              <div className="text-xs text-stone-500 font-sans">
                Period: <span className="font-mono text-stone-700">{formatDate(selectedAward['Start Date'] || selectedAward.start_date)}</span>
                {(selectedAward['End Date'] || selectedAward.end_date) && (
                  <span> → <span className="font-mono text-stone-700">{formatDate(selectedAward['End Date'] || selectedAward.end_date)}</span></span>
                )}
              </div>

              {selectedAward.Description && (
                <p className="text-xs text-stone-600 font-sans leading-relaxed pt-1 bg-stone-50 p-2.5 rounded-xs border border-stone-200">
                  {selectedAward.Description}
                </p>
              )}
            </div>

            {/* Financial Summary Card */}
            {currentCreepStats && (
              <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-sm space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-700 font-sans">
                  Forensic Budget Tracking
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-white border border-stone-200 rounded-xs">
                    <TermTooltip termKey="initial-obligation" showIcon align="left">
                      <span className="text-[9px] text-stone-500 font-bold uppercase">
                        {currentCreepStats.initialLabel}
                      </span>
                    </TermTooltip>
                    <div className="text-xs sm:text-sm font-mono font-bold text-stone-800 tabular-nums mt-0.5">
                      {formatCurrency(currentCreepStats.initialValue, true)}
                    </div>
                  </div>

                  <div className="p-2 bg-white border border-stone-200 rounded-xs">
                    <TermTooltip termKey="current-total" showIcon align="center">
                      <span className="text-[9px] text-stone-500 font-bold uppercase">
                        {currentCreepStats.currentLabel}
                      </span>
                    </TermTooltip>
                    <div className="text-xs sm:text-sm font-mono font-bold text-stone-900 tabular-nums mt-0.5">
                      {formatCurrency(currentCreepStats.currentValue, true)}
                    </div>
                  </div>

                  <div className="p-2 bg-white border border-stone-200 rounded-xs">
                    <TermTooltip termKey="taxpayer-overrun" showIcon align="right">
                      <span className="text-[9px] text-red-700 font-bold uppercase">
                        Overrun Creep
                      </span>
                    </TermTooltip>
                    <div className="text-xs sm:text-sm font-mono font-bold text-red-700 tabular-nums mt-0.5">
                      {currentCreepStats.dollarCreep > 0
                        ? `+${formatCurrency(currentCreepStats.dollarCreep, true)}`
                        : '$0.00'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modification Stepper & History */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-stone-200 text-stone-700 text-xs font-serif font-bold">
                <span>Budget Modification Sequence</span>
                <span className="font-mono text-[11px] font-normal text-stone-500">
                  {activeAwardTransactions.length} ACTIONS RECORDED
                </span>
              </div>

              {isLoadingTransactions ? (
                <div className="py-8 flex flex-col items-center justify-center space-y-2 text-stone-500">
                  <Loader2 className="w-5 h-5 animate-spin text-stone-700" />
                  <span className="text-xs font-serif italic">Loading modification ledger...</span>
                </div>
              ) : activeAwardTransactions.length === 0 ? (
                <div className="py-6 text-center text-stone-500 font-serif italic text-xs bg-stone-50 p-4 border border-stone-200 rounded-sm">
                  Initial award baseline only — no subsequent modifications recorded on USAspending.
                </div>
              ) : (
                <div className="relative border-l-2 border-stone-200 ml-3 pl-4 space-y-4 pt-1">
                  {activeAwardTransactions.map((tx, idx) => {
                    const delta =
                      tx.federal_action_obligation ??
                      tx['Federal Action Obligation'] ??
                      tx['Transaction Amount'] ??
                      tx.base_and_all_options_value ??
                      0;
                    const modNum = tx.modification_number ?? tx['Modification Number'] ?? `${idx}`;
                    const actionType =
                      tx.action_type_description ?? tx['Action Type'] ?? 'Budget Adjustment';
                    const txDate = tx.action_date ?? tx['Action Date'];
                    const isPositive = delta > 0;
                    const isNegative = delta < 0;

                    return (
                      <div key={tx.id || idx} className="relative group">
                        {/* Stepper Dot */}
                        <div
                          className={`absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white shadow-xs ${
                            idx === 0
                              ? 'bg-blue-900'
                              : isPositive
                              ? 'bg-rose-600'
                              : isNegative
                              ? 'bg-emerald-600'
                              : 'bg-stone-400'
                          }`}
                        />

                        {/* Transaction Card */}
                        <div className="bg-stone-50 border border-stone-200 p-3 rounded-xs space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-stone-500 font-mono text-[11px]">
                              {formatDate(txDate)}
                            </span>
                            <span className="bg-white border border-stone-200 text-stone-800 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                              MOD #{modNum}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="text-xs font-serif font-bold text-stone-900">
                              {actionType}
                            </span>
                            <span
                              className={`text-xs font-mono font-bold tabular-nums ${
                                idx === 0
                                  ? 'text-stone-900'
                                  : isPositive
                                  ? 'text-rose-700'
                                  : isNegative
                                  ? 'text-emerald-700'
                                  : 'text-stone-500'
                              }`}
                            >
                              {delta > 0 ? `+${formatCurrency(delta)}` : formatCurrency(delta)}
                            </span>
                          </div>

                          {tx.description && (
                            <p className="text-[11px] text-stone-600 leading-relaxed font-sans pt-1 border-t border-stone-200/60 mt-1">
                              {tx.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Direct USAspending Link Button */}
            <div className="pt-2">
              <a
                href={`https://www.usaspending.gov/award/${encodeURIComponent(
                  selectedAward.generated_unique_award_id ||
                    selectedAward.generated_internal_id ||
                    selectedAward['Award ID']
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-3 bg-stone-900 hover:bg-stone-800 text-white rounded-sm text-xs font-serif font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>View Official Record on USAspending.gov</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: VENDOR DETAIL (Corporate Micro-Dashboard & Subsidiary Awards)     */}
      {/* ========================================================================= */}
      {viewState === 'VENDOR_DETAIL' && selectedVendor && (
        <div className="flex flex-col h-full overflow-hidden bg-white">
          {/* Sticky Header with Back Button */}
          <div className="sticky top-0 z-20 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between shadow-xs">
            <button
              onClick={handleBackToOverview}
              className="flex items-center gap-2 text-xs font-serif font-bold uppercase tracking-wider text-stone-700 hover:text-blue-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to {displayName} Overview
            </button>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-700">
              VENDOR DOSSIER
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Corporate Profile Header */}
            <div className="space-y-1.5 pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-stone-700" />
                <h2 className="font-serif text-lg font-bold text-stone-900">
                  {selectedVendor.parentName}
                </h2>
              </div>
              <div className="text-xs text-stone-500 font-sans flex items-center gap-2">
                <span>Corporate HQ: <strong className="text-stone-800 font-mono">{selectedVendor.hqState}</strong></span>
                {selectedVendor.isOutState && (
                  <TermTooltip termKey="capital-export" align="left">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-xs font-bold">
                      OUT-OF-STATE HQ
                    </span>
                  </TermTooltip>
                )}
              </div>
            </div>

            {/* Micro-Dashboard */}
            <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-sm space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-stone-700 font-sans">
                State Procurement Footprint
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-white border border-stone-200 rounded-xs">
                  <div className="text-[9px] text-stone-500 font-bold uppercase">
                    Total State Revenue
                  </div>
                  <div className="text-sm font-mono font-bold text-stone-900 tabular-nums">
                    {formatCurrency(selectedVendor.totalCurrent, true)}
                  </div>
                </div>

                <div className="p-2.5 bg-white border border-stone-200 rounded-xs">
                  <TermTooltip termKey="taxpayer-overrun" showIcon align="right">
                    <span className="text-[9px] text-red-700 font-bold uppercase">
                      Total Overrun Creep
                    </span>
                  </TermTooltip>
                  <div className="text-sm font-mono font-bold text-red-700 tabular-nums">
                    {selectedVendor.totalCreep > 0
                      ? `+${formatCurrency(selectedVendor.totalCreep, true)}`
                      : '$0.00'}
                  </div>
                </div>

                <div className="p-2.5 bg-white border border-stone-200 rounded-xs">
                  <TermTooltip termKey="creep-rate" showIcon align="left">
                    <span className="text-[9px] text-stone-500 font-bold uppercase">
                      Average Creep Rate
                    </span>
                  </TermTooltip>
                  <div className="text-sm font-mono font-bold text-red-700 tabular-nums">
                    {selectedVendor.percentCreep > 0
                      ? `+${selectedVendor.percentCreep.toFixed(1)}%`
                      : '0.0%'}
                  </div>
                </div>

                <div className="p-2.5 bg-white border border-stone-200 rounded-xs">
                  <div className="text-[9px] text-stone-500 font-bold uppercase">
                    Active Contracts
                  </div>
                  <div className="text-sm font-mono font-bold text-stone-800 tabular-nums">
                    {selectedVendor.awards.length}
                  </div>
                </div>
              </div>
            </div>

            {/* List of Awards by this vendor */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs font-serif font-bold text-stone-800 pb-1 border-b border-stone-200">
                <span>Awarded Prime Contracts in {displayName}</span>
                <span className="font-mono text-[11px] text-stone-500">
                  {selectedVendor.awards.length} AWARDS
                </span>
              </div>

              {selectedVendor.awards.map((award, idx) => {
                const stats = calculateContractSplitTrackCreep(award, award.transactions || []);
                const pricing = award.pricingType || normalizePricingType(award['type_of_contract_pricing']);
                return (
                  <div
                    key={award.generated_internal_id || award['Award ID'] || idx}
                    onClick={() => handleSelectContract(award)}
                    className="bg-white border border-stone-200 p-3 rounded-xs hover:border-stone-400 hover:shadow-xs transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-stone-900">
                        {award['Award ID'] || award.piid || 'N/A'}
                      </span>
                      <TermTooltip
                        termKey={
                          pricing === 'COST-PLUS'
                            ? 'cost-plus'
                            : pricing === 'FIXED PRICE'
                            ? 'fixed-price'
                            : pricing.includes('TIME')
                            ? 'time-materials'
                            : undefined
                        }
                        align="right"
                      >
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-stone-100 text-stone-700 font-bold rounded-xs">
                          {pricing}
                        </span>
                      </TermTooltip>
                    </div>

                    <div className="text-xs text-stone-600 font-sans">
                      {award.officeName || award['Awarding Sub Agency']} · {award.agencyName || award['Awarding Agency']}
                    </div>

                    <div className="bg-stone-50 p-2 rounded-xs border border-stone-100 flex items-center justify-between text-xs">
                      <div>
                        <TermTooltip termKey="current-total" showIcon align="left">
                          <span className="text-stone-500 text-[10px] block font-bold">TOTAL OBLIGATION</span>
                        </TermTooltip>
                        <span className="font-mono font-bold text-stone-900">{formatCurrency(stats.currentValue, true)}</span>
                      </div>
                      <div className="text-right">
                        <TermTooltip termKey="taxpayer-overrun" showIcon align="right">
                          <span className="text-red-700 text-[10px] block font-bold">DOLLAR OVERRUN</span>
                        </TermTooltip>
                        <span className="font-mono font-bold text-red-700">
                          {stats.dollarCreep > 0 ? `+${formatCurrency(stats.dollarCreep, true)}` : '$0.00'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 4: OFFICE DETAIL (Bureaucracy Profile & Authorized Contracts)        */}
      {/* ========================================================================= */}
      {viewState === 'OFFICE_DETAIL' && selectedOffice && (
        <div className="flex flex-col h-full overflow-hidden bg-white">
          {/* Sticky Header with Back Button */}
          <div className="sticky top-0 z-20 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between shadow-xs">
            <button
              onClick={handleBackToOverview}
              className="flex items-center gap-2 text-xs font-serif font-bold uppercase tracking-wider text-stone-700 hover:text-blue-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to {displayName} Overview
            </button>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-700">
              OFFICE AUDIT
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Bureaucracy Profile Header */}
            <div className="space-y-1.5 pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-stone-700" />
                <h2 className="font-serif text-lg font-bold text-stone-900">
                  {selectedOffice.name}
                </h2>
              </div>
              <p className="text-xs text-stone-500 font-sans">
                Parent Agency: <span className="text-stone-800 font-medium">{selectedOffice.agencyName}</span>
              </p>
            </div>

            {/* Micro-Dashboard */}
            <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-sm space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-stone-700 font-sans">
                Procurement Accountability Metrics
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-white border border-stone-200 rounded-xs">
                  <div className="text-[9px] text-stone-500 font-bold uppercase">
                    Authorized Dollars
                  </div>
                  <div className="text-sm font-mono font-bold text-stone-900 tabular-nums">
                    {formatCurrency(selectedOffice.totalCurrent, true)}
                  </div>
                </div>

                <div className="p-2.5 bg-white border border-stone-200 rounded-xs">
                  <TermTooltip termKey="taxpayer-overrun" showIcon align="right">
                    <span className="text-[9px] text-red-700 font-bold uppercase">
                      Net Dollar Overrun
                    </span>
                  </TermTooltip>
                  <div className="text-sm font-mono font-bold text-red-700 tabular-nums">
                    {selectedOffice.totalCreep > 0
                      ? `+${formatCurrency(selectedOffice.totalCreep, true)}`
                      : '$0.00'}
                  </div>
                </div>

                <div className="p-2.5 bg-white border border-stone-200 rounded-xs">
                  <TermTooltip termKey="creep-rate" showIcon align="left">
                    <span className="text-[9px] text-stone-500 font-bold uppercase">
                      Office Overrun Rate
                    </span>
                  </TermTooltip>
                  <div className="text-sm font-mono font-bold text-red-700 tabular-nums">
                    {selectedOffice.percentCreep > 0
                      ? `+${selectedOffice.percentCreep.toFixed(1)}%`
                      : '0.0%'}
                  </div>
                </div>

                <div className="p-2.5 bg-white border border-stone-200 rounded-xs">
                  <div className="text-[9px] text-stone-500 font-bold uppercase">
                    Authorized Awards
                  </div>
                  <div className="text-sm font-mono font-bold text-stone-800 tabular-nums">
                    {selectedOffice.awards.length}
                  </div>
                </div>
              </div>
            </div>

            {/* List of Awards authorized by this office */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs font-serif font-bold text-stone-800 pb-1 border-b border-stone-200">
                <span>Contracts Managed by this Office</span>
                <span className="font-mono text-[11px] text-stone-500">
                  {selectedOffice.awards.length} AWARDS
                </span>
              </div>

              {selectedOffice.awards.map((award, idx) => {
                const stats = calculateContractSplitTrackCreep(award, award.transactions || []);
                const pricing = award.pricingType || normalizePricingType(award['type_of_contract_pricing']);
                return (
                  <div
                    key={award.generated_internal_id || award['Award ID'] || idx}
                    onClick={() => handleSelectContract(award)}
                    className="bg-white border border-stone-200 p-3 rounded-xs hover:border-stone-400 hover:shadow-xs transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-stone-900">
                        {award['Award ID'] || award.piid || 'N/A'}
                      </span>
                      <TermTooltip
                        termKey={
                          pricing === 'COST-PLUS'
                            ? 'cost-plus'
                            : pricing === 'FIXED PRICE'
                            ? 'fixed-price'
                            : pricing.includes('TIME')
                            ? 'time-materials'
                            : undefined
                        }
                        align="right"
                      >
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-stone-100 text-stone-700 font-bold rounded-xs">
                          {pricing}
                        </span>
                      </TermTooltip>
                    </div>

                    <div className="text-xs text-stone-800 font-serif font-bold">
                      {award['Recipient Name']}
                    </div>

                    <div className="bg-stone-50 p-2 rounded-xs border border-stone-100 flex items-center justify-between text-xs">
                      <div>
                        <TermTooltip termKey="current-total" showIcon align="left">
                          <span className="text-stone-500 text-[10px] block font-bold">TOTAL OBLIGATION</span>
                        </TermTooltip>
                        <span className="font-mono font-bold text-stone-900">{formatCurrency(stats.currentValue, true)}</span>
                      </div>
                      <div className="text-right">
                        <TermTooltip termKey="taxpayer-overrun" showIcon align="right">
                          <span className="text-red-700 text-[10px] block font-bold">DOLLAR OVERRUN</span>
                        </TermTooltip>
                        <span className="font-mono font-bold text-red-700">
                          {stats.dollarCreep > 0 ? `+${formatCurrency(stats.dollarCreep, true)}` : '$0.00'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer Data Provenance */}
      <div className="px-4 py-2.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500 flex-shrink-0">
        <span>USAspending Open Data · Prime Federal Awards</span>
        <span className="text-stone-400">Live Federal Query</span>
      </div>
    </div>
  );
};

export default ContractCreepPanel;


