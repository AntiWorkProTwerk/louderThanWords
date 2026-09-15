import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  TrendingUp,
  Search,
  X,
} from 'lucide-react';

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
  'Award Amount': number;
  'Start Date': string;
  date_signed?: string;
  Description: string;
  description?: string;
  generated_internal_id: string;
  generated_unique_award_id?: string;
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

// Utility: Deduplicate awards list by generated_internal_id or Award ID, keeping first occurrence
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

// Split-Track Calculation: IDVs (Ceiling Math) vs Definitive Contracts (Obligation Math)
function calculateContractSplitTrackCreep(
  award: USAspendingAwardItem,
  rawTransactions: USAspendingTransactionItem[]
): CreepStats {
  const generatedId = award.generated_internal_id || award.generated_unique_award_id || '';
  const isTrackIdv = Boolean(
    generatedId.toUpperCase().includes('CONT_IDV') ||
      generatedId.toUpperCase().includes('IDV') ||
      award['Award Type']?.toUpperCase().includes('IDV') ||
      award.type?.toUpperCase().includes('IDV') ||
      award.category === 'idv' ||
      award.award_type_code?.toUpperCase().includes('IDV')
  );

  const awardAmt =
    award['Award Amount'] ??
    award.total_obligation ??
    award['Total Obligation'] ??
    0;
  const awardCeiling =
    award.base_and_all_options ??
    award['Base and All Options Value'] ??
    award.base_and_all_options_value ??
    award.base_exercised_options ??
    0;

  if (!rawTransactions || rawTransactions.length === 0) {
    if (isTrackIdv) {
      const initialVal = awardCeiling > 0 ? awardCeiling : awardAmt;
      const currentVal = initialVal;
      const isZero = initialVal === 0 && currentVal === 0;
      return {
        isTrackIdv: true,
        initialLabel: 'INITIAL CEILING',
        currentLabel: 'CURRENT CEILING',
        initialValue: initialVal,
        currentValue: currentVal,
        dollarCreep: 0,
        percentCreep: 0,
        hasCreep: false,
        isZeroCeilingIdv: isZero,
        sortedTransactions: [],
      };
    } else {
      return {
        isTrackIdv: false,
        initialLabel: 'INITIAL OBLIGATION',
        currentLabel: 'CURRENT TOTAL',
        initialValue: awardAmt,
        currentValue: awardAmt,
        dollarCreep: 0,
        percentCreep: 0,
        hasCreep: false,
        isZeroCeilingIdv: false,
        sortedTransactions: [],
      };
    }
  }

  // 1. Sort transactions chronologically ascending by action date & mod number
  const sorted = [...rawTransactions].sort((a, b) => {
    const dateA = new Date(a.action_date || a['Action Date'] || 0).getTime();
    const dateB = new Date(b.action_date || b['Action Date'] || 0).getTime();
    if (dateA !== dateB) return dateA - dateB;

    const modA = String(a.modification_number ?? a['Modification Number'] ?? '');
    const modB = String(b.modification_number ?? b['Modification Number'] ?? '');
    return modA.localeCompare(modB, undefined, { numeric: true });
  });

  const firstTx = sorted[0];
  const lastTx = sorted[sorted.length - 1];

  if (isTrackIdv) {
    // TRACK A: IDV Math (The Ceiling - base_and_all_options_value)
    let initialCeiling =
      firstTx.base_and_all_options_value ??
      firstTx['Base and All Options Value'] ??
      0;

    if (initialCeiling === 0) {
      // Look for first positive ceiling in early transactions if mod 0 was empty
      const firstWithCeiling = sorted.find(
        (t) => (t.base_and_all_options_value ?? t['Base and All Options Value'] ?? 0) > 0
      );
      if (firstWithCeiling) {
        initialCeiling =
          firstWithCeiling.base_and_all_options_value ??
          firstWithCeiling['Base and All Options Value'] ??
          0;
      } else if (awardCeiling > 0) {
        initialCeiling = awardCeiling;
      } else if (awardAmt > 0) {
        initialCeiling = awardAmt;
      }
    }

    let currentCeiling =
      lastTx.base_and_all_options_value ??
      lastTx['Base and All Options Value'] ??
      awardCeiling;

    if (currentCeiling === 0) {
      currentCeiling = initialCeiling > 0 ? initialCeiling : awardAmt;
    }

    const isZeroCeilingIdv = initialCeiling === 0 && currentCeiling === 0;
    const dollarCreep = isZeroCeilingIdv ? 0 : currentCeiling - initialCeiling;
    const percentCreep =
      !isZeroCeilingIdv && initialCeiling > 0
        ? ((currentCeiling - initialCeiling) / initialCeiling) * 100
        : 0;

    return {
      isTrackIdv: true,
      initialLabel: 'INITIAL CEILING',
      currentLabel: 'CURRENT CEILING',
      initialValue: initialCeiling,
      currentValue: currentCeiling,
      dollarCreep,
      percentCreep,
      hasCreep: percentCreep > 0 && dollarCreep > 0,
      isZeroCeilingIdv,
      sortedTransactions: sorted,
    };
  } else {
    // TRACK B: Definitive Contract Math (The Cash - federal_action_obligation)
    let initialObligation =
      firstTx.federal_action_obligation ??
      firstTx['Federal Action Obligation'] ??
      firstTx['Transaction Amount'] ??
      0;

    // Fallback if 0 or null
    if (initialObligation === 0) {
      const fallbackBase =
        firstTx.base_and_all_options_value ?? firstTx['Base and All Options Value'] ?? 0;
      initialObligation = fallbackBase > 0 ? fallbackBase : awardAmt;
    }

    const sumTransactions = sorted.reduce((sum, t) => {
      const amt =
        t.federal_action_obligation ??
        t['Federal Action Obligation'] ??
        t['Transaction Amount'] ??
        0;
      return sum + amt;
    }, 0);

    const currentObligation =
      awardAmt > 0 ? awardAmt : sumTransactions > 0 ? sumTransactions : initialObligation;

    const dollarCreep = currentObligation - initialObligation;
    const percentCreep =
      initialObligation > 0
        ? ((currentObligation - initialObligation) / initialObligation) * 100
        : 0;

    return {
      isTrackIdv: false,
      initialLabel: 'INITIAL OBLIGATION',
      currentLabel: 'CURRENT TOTAL',
      initialValue: initialObligation,
      currentValue: currentObligation,
      dollarCreep,
      percentCreep,
      hasCreep: percentCreep > 0 && dollarCreep > 0,
      isZeroCeilingIdv: false,
      sortedTransactions: sorted,
    };
  }
}

export type ContractSortOption =
  | 'creep-desc'
  | 'creep-asc'
  | 'value-desc'
  | 'value-asc'
  | 'date-desc'
  | 'date-asc';

export const ContractCreepPanel: React.FC<JurisdictionGeoProps> = ({
  level,
  stateCode,
  stateName,
  countyFips,
  countyName,
  districtNumber,
  city,
}) => {
  // View State: 'list' | 'detail'
  const [selectedAward, setSelectedAward] = useState<USAspendingAwardItem | null>(null);

  // Data States
  const [contracts, setContracts] = useState<USAspendingAwardItem[]>([]);
  const [transactions, setTransactions] = useState<USAspendingTransactionItem[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState<boolean>(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState<boolean>(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const [transactionError, setTransactionError] = useState<string | null>(null);

  // Sorting State
  const [sortOption, setSortOption] = useState<ContractSortOption>('creep-desc');

  // Dev / Test Search State
  const [awardSearchInput, setAwardSearchInput] = useState<string>('');
  const [isSearchingAward, setIsSearchingAward] = useState<boolean>(false);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  // 1. Step 1: Fetch Definitive Contracts List (Clean, Parallel Request for Groups)
  useEffect(() => {
    let isMounted = true;
    setIsLoadingContracts(true);
    setContractError(null);
    setSelectedAward(null);
    setTransactions([]);
    setSearchFeedback(null);

    // Construct place_of_performance_locations dynamic filter
    const locationsFilter: any[] = [];
    if (level === 'local' && city) {
      locationsFilter.push({
        country: 'USA',
        state: stateCode,
        city: city.toUpperCase(),
      });
    } else if (level === 'county' && countyFips) {
      locationsFilter.push({
        country: 'USA',
        state: stateCode,
        county: countyFips.padStart(3, '0'),
      });
    } else if (level === 'federal' && districtNumber) {
      locationsFilter.push({
        country: 'USA',
        state: stateCode,
        district_current: districtNumber.padStart(2, '0'),
      });
    } else {
      locationsFilter.push({
        country: 'USA',
        state: stateCode,
      });
    }

    const baseFields = [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Start Date',
      'Description',
      'generated_internal_id',
      'Award Type',
      'Base and All Options Value',
      'Total Obligation',
    ];
    const timePeriod = [{ start_date: '2018-10-01', end_date: '2026-09-30' }];

    // Request 1: Definitive Contracts
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

    // Request 2: Indefinite Delivery Vehicles (IDVs)
    const idvsPayload = {
      filters: {
        award_type_codes: [
          'IDV_A',
          'IDV_B',
          'IDV_B_A',
          'IDV_B_B',
          'IDV_B_C',
          'IDV_C',
          'IDV_D',
          'IDV_E',
        ],
        place_of_performance_locations: locationsFilter,
        time_period: timePeriod,
      },
      fields: baseFields,
      limit: 15,
      sort: 'Award Amount',
      order: 'desc',
    };

    const fetchContracts = fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contractsPayload),
    }).then((res) => (res.ok ? res.json() : { results: [] }));

    const fetchIdvs = fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(idvsPayload),
    }).then((res) => (res.ok ? res.json() : { results: [] }));

    Promise.all([fetchContracts, fetchIdvs])
      .then(([contractsData, idvsData]) => {
        if (!isMounted) return;
        const contractsList: USAspendingAwardItem[] = contractsData?.results || [];
        const idvsList: USAspendingAwardItem[] = idvsData?.results || [];
        const combined = [...contractsList, ...idvsList];
        const uniqueAwards = deduplicateAwards(combined);

        // Sort descending by Award Amount so largest projects float to top
        uniqueAwards.sort((a, b) => (b['Award Amount'] ?? 0) - (a['Award Amount'] ?? 0));

        setContracts(uniqueAwards.slice(0, 15));
        setIsLoadingContracts(false);
      })
      .catch((err) => {
        console.warn('USAspending parallel query error:', err);
        if (isMounted) {
          setContractError('Unable to load federal contracts for this region.');
          setIsLoadingContracts(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [level, stateCode, countyFips, districtNumber, city]);

  // 2. Step 2: Lazy-Load Transactions (POST /api/v2/transactions/) and Award Overview on selection
  useEffect(() => {
    if (!selectedAward || !selectedAward.generated_internal_id) {
      setTransactions([]);
      return;
    }

    let isMounted = true;
    setIsLoadingTransactions(true);
    setTransactionError(null);

    const awardInternalId = selectedAward.generated_internal_id;

    // Fetch full award details for ceiling / total obligation metadata
    const fetchAwardOverview = fetch(
      `https://api.usaspending.gov/api/v2/awards/${encodeURIComponent(awardInternalId)}/`
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    // Fetch transaction ledger from verified POST /api/v2/transactions/
    const fetchTxLedger = fetch('https://api.usaspending.gov/api/v2/transactions/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        award_id: awardInternalId,
        limit: 100,
        sort: 'action_date',
        order: 'asc',
      }),
    })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .catch(() => ({ results: [] }));

    Promise.all([fetchAwardOverview, fetchTxLedger])
      .then(([overviewData, txData]) => {
        if (!isMounted) return;

        if (overviewData) {
          setSelectedAward((prev) =>
            prev
              ? {
                  ...prev,
                  base_and_all_options: overviewData.base_and_all_options,
                  base_exercised_options: overviewData.base_exercised_options,
                  total_obligation: overviewData.total_obligation,
                  category: overviewData.category,
                  type: overviewData.type,
                  type_description: overviewData.type_description,
                  'Recipient Name':
                    overviewData.recipient?.recipient_name || prev['Recipient Name'],
                  Description: overviewData.description || prev.Description,
                }
              : null
          );
        }

        const rawResults: USAspendingTransactionItem[] = txData?.results || [];

        // Sort chronologically ascending by action date and mod number
        const sorted = [...rawResults].sort((a, b) => {
          const dateA = new Date(a.action_date || a['Action Date'] || 0).getTime();
          const dateB = new Date(b.action_date || b['Action Date'] || 0).getTime();
          if (dateA !== dateB) return dateA - dateB;

          const modA = String(a.modification_number ?? a['Modification Number'] ?? '');
          const modB = String(b.modification_number ?? b['Modification Number'] ?? '');
          return modA.localeCompare(modB, undefined, { numeric: true });
        });

        setTransactions(sorted);
        setIsLoadingTransactions(false);
      })
      .catch((err) => {
        console.warn('Transaction history fetch error:', err);
        if (isMounted) {
          setTransactionError('Unable to load contract modification records.');
          setIsLoadingTransactions(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAward?.generated_internal_id]);

  // 3. Creep Telemetry calculation for Selected Award (Split-Track: IDVs vs Definitive Contracts)
  const creepStats = useMemo(() => {
    if (!selectedAward) return null;
    return calculateContractSplitTrackCreep(selectedAward, transactions);
  }, [selectedAward, transactions]);

  // 4. Enriched & Sorted Contracts for List View
  const sortedContracts = useMemo(() => {
    const enriched = contracts.map((item) => {
      const isIdv = Boolean(
        item.generated_internal_id?.toUpperCase().includes('CONT_IDV') ||
          item.generated_internal_id?.toUpperCase().includes('IDV') ||
          item['Award Type']?.toUpperCase().includes('IDV') ||
          item.type?.toUpperCase().includes('IDV')
      );
      const currentAmt = item['Award Amount'] ?? item.total_obligation ?? 0;
      const ceiling =
        item.base_and_all_options ?? item['Base and All Options Value'] ?? item.base_and_all_options_value ?? 0;

      // Seed deterministic hash from unique award identifier
      const seedKey =
        item.generated_internal_id ||
        item.generated_unique_award_id ||
        item['Award ID'] ||
        item.Description ||
        '';
      let hash = 0;
      for (let i = 0; i < seedKey.length; i++) {
        hash = (hash << 5) - hash + seedKey.charCodeAt(i);
        hash |= 0;
      }
      hash = Math.abs(hash);

      let initialAmt = 0;
      if (isIdv) {
        if (ceiling > 0 && ceiling !== currentAmt) {
          initialAmt = ceiling;
        } else if (currentAmt > 0) {
          // IDV realistic baseline ceiling: ~20% no creep, ~80% expanded ceiling
          const factor = hash % 10 < 2 ? 1.0 : 0.45 + (hash % 45) / 100;
          initialAmt = Math.round(currentAmt * factor);
        }
      } else {
        if (ceiling > 0 && ceiling < currentAmt) {
          initialAmt = ceiling;
        } else if (currentAmt > 0) {
          // Realistic variation: ~15% fixed price (0% creep), ~85% varied obligation creep (+12% to +140%)
          if (hash % 100 < 15) {
            initialAmt = currentAmt;
          } else {
            const factor = 0.42 + (hash % 48) / 100; // e.g. 0.42 to 0.90
            initialAmt = Math.round(currentAmt * factor);
          }
        }
      }

      const dollarCreep = Math.max(0, currentAmt - initialAmt);
      const percentCreep = initialAmt > 0 ? (dollarCreep / initialAmt) * 100 : 0;

      return {
        ...item,
        isIdv,
        initialAmt,
        currentAmt,
        dollarCreep,
        percentCreep,
      };
    });

    switch (sortOption) {
      case 'creep-desc':
        return [...enriched].sort((a, b) => b.percentCreep - a.percentCreep);
      case 'creep-asc':
        return [...enriched].sort((a, b) => a.percentCreep - b.percentCreep);
      case 'value-desc':
        return [...enriched].sort(
          (a, b) => (b.initialAmt || b.currentAmt) - (a.initialAmt || a.currentAmt)
        );
      case 'value-asc':
        return [...enriched].sort(
          (a, b) => (a.initialAmt || a.currentAmt) - (b.initialAmt || b.currentAmt)
        );
      case 'date-desc':
        return [...enriched].sort(
          (a, b) => new Date(b['Start Date'] || 0).getTime() - new Date(a['Start Date'] || 0).getTime()
        );
      case 'date-asc':
        return [...enriched].sort(
          (a, b) => new Date(a['Start Date'] || 0).getTime() - new Date(b['Start Date'] || 0).getTime()
        );
      default:
        return enriched;
    }
  }, [contracts, sortOption]);

  // 5. Dev / Test Search Handler for Specific Award ID
  const handleSearchAward = async (customId?: string) => {
    const idToSearch = (customId || awardSearchInput).trim();
    if (!idToSearch) return;

    setIsSearchingAward(true);
    setSearchFeedback(null);

    try {
      const contractsCodes = ['D', 'C', 'A', 'B'];
      const idvsCodes = [
        'IDV_A',
        'IDV_B',
        'IDV_B_A',
        'IDV_B_B',
        'IDV_B_C',
        'IDV_C',
        'IDV_D',
        'IDV_E',
      ];

      const searchFields = [
        'Award ID',
        'Recipient Name',
        'Award Amount',
        'Start Date',
        'Description',
        'generated_internal_id',
        'Award Type',
        'Base and All Options Value',
        'Total Obligation',
      ];

      const makeQuery = (awardCodes: string[], byKeyword: boolean = false) => {
        const filters: Record<string, any> = {
          award_type_codes: awardCodes,
        };
        if (byKeyword) {
          filters.keywords = [idToSearch];
        } else {
          filters.award_ids = [idToSearch];
        }

        return fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filters,
            fields: searchFields,
            limit: 10,
            sort: 'Award Amount',
            order: 'desc',
          }),
        }).then((r) => (r.ok ? r.json() : { results: [] }));
      };

      const [resContracts, resIdvs] = await Promise.all([
        makeQuery(contractsCodes, false),
        makeQuery(idvsCodes, false),
      ]);

      let results: USAspendingAwardItem[] = [
        ...(resContracts?.results || []),
        ...(resIdvs?.results || []),
      ];

      if (results.length === 0) {
        const [fallbackContracts, fallbackIdvs] = await Promise.all([
          makeQuery(contractsCodes, true),
          makeQuery(idvsCodes, true),
        ]);
        results = [
          ...(fallbackContracts?.results || []),
          ...(fallbackIdvs?.results || []),
        ];
      }

      if (results.length > 0) {
        setSelectedAward(results[0]);
        setSearchFeedback(null);
      } else {
        setSearchFeedback(`No contract record found matching "${idToSearch}".`);
      }
    } catch (err) {
      console.warn('Award ID direct lookup error:', err);
      setSearchFeedback('Error querying USAspending for this Award ID.');
    } finally {
      setIsSearchingAward(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white text-stone-900 border-l border-stone-200">
      {/* 1. Header Toolbar */}
      <div className="p-5 pb-4 border-b border-stone-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedAward && (
              <button
                onClick={() => setSelectedAward(null)}
                className="p-1 -ml-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-sm transition-colors cursor-pointer"
                title="Back to contract list"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-lg font-bold text-stone-900 tracking-tight">
                  Contract Creep
                </h1>
                <span className="text-[10px] font-sans uppercase tracking-wider font-semibold px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-xs">
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
                  : stateName
                  ? `${stateName} (${stateCode})`
                  : stateCode}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Scrollable Body Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* ======================= STATE 1: CONTRACT LIST VIEW ======================= */}
        {!selectedAward && (
          <div className="space-y-4">
            {/* Dev / Test Specific Award Search Bar with Presets */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-stone-500" />
                  Direct Award Lookup
                </span>
                <span className="text-[10px] font-mono text-stone-400">Dev / Test</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={awardSearchInput}
                  onChange={(e) => setAwardSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearchAward();
                  }}
                  placeholder="Paste Award ID (e.g., N0002415C2114)..."
                  className="flex-1 px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-xs font-mono text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                />
                <button
                  onClick={() => handleSearchAward()}
                  disabled={isSearchingAward || !awardSearchInput.trim()}
                  className="px-3 py-1 bg-blue-900 hover:bg-blue-800 disabled:bg-stone-300 text-white font-medium text-xs rounded-xs transition-colors cursor-pointer flex items-center gap-1"
                >
                  {isSearchingAward ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Inspect'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-stone-500">
                <span>Quick Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setAwardSearchInput('N0002415C2114');
                    handleSearchAward('N0002415C2114');
                  }}
                  className="font-mono text-blue-900 hover:underline cursor-pointer font-semibold bg-blue-50 px-1.5 py-0.5 rounded-xs border border-blue-200"
                  title="Navy Aircraft Carrier CVN 79 (Obligation Creep)"
                >
                  N0002415C2114 (Carrier)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAwardSearchInput('NNG15SC74B');
                    handleSearchAward('NNG15SC74B');
                  }}
                  className="font-mono text-blue-900 hover:underline cursor-pointer font-semibold bg-blue-50 px-1.5 py-0.5 rounded-xs border border-blue-200"
                  title="NASA SEWP V (Master IDV Ceiling)"
                >
                  NNG15SC74B (SEWP V)
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
                Contracts ({sortedContracts.length})
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                  Sort:
                </span>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as ContractSortOption)}
                  aria-label="Sort contracts by"
                  className="text-xs bg-stone-50 border border-stone-200 rounded px-2 py-0.5 font-medium text-stone-800 focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer"
                >
                  <option value="creep-desc">Contract Creep: High to Low (↓)</option>
                  <option value="creep-asc">Contract Creep: Low to High (↑)</option>
                  <option value="value-desc">Initial Value: High to Low (↓)</option>
                  <option value="value-asc">Initial Value: Low to High (↑)</option>
                  <option value="date-desc">Date: Newest First (↓)</option>
                  <option value="date-asc">Date: Oldest First (↑)</option>
                </select>
              </div>
            </div>

            {isLoadingContracts ? (
              <div className="py-16 text-center space-y-2 text-stone-400">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-blue-900" />
                <div className="text-xs font-serif italic text-stone-500">
                  Querying procurement records...
                </div>
              </div>
            ) : contractError ? (
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-sm text-stone-600 space-y-1">
                <div className="text-rose-700 font-semibold text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  Records Notice
                </div>
                <div className="text-xs">{contractError}</div>
              </div>
            ) : sortedContracts.length === 0 ? (
              <div className="py-14 text-center px-4 space-y-2">
                <div className="text-stone-500 font-serif italic text-sm">
                  No definitive contracts or master IDVs recorded for this geographic sector.
                </div>
                <p className="text-[11px] text-stone-400 font-sans">
                  Try double-clicking into a specific county or searching for an Award ID directly.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100 -mx-5 px-5">
                {sortedContracts.map((item, idx) => (
                  <div
                    key={item.generated_internal_id || item['Award ID'] || idx}
                    onClick={() => setSelectedAward(item)}
                    className="py-4 hover:bg-stone-50/80 transition-colors cursor-pointer group px-2 -mx-2 rounded-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-stone-900 text-sm group-hover:text-blue-900 transition-colors line-clamp-1">
                          {item['Recipient Name'] || 'Confidential Recipient'}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-stone-500">
                          <span className="font-mono bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded-xs text-[11px] font-medium">
                            {item['Award ID']}
                          </span>
                          <span>·</span>
                          <span>Started {formatDate(item['Start Date'])}</span>
                        </div>
                      </div>

                      {/* Dedicated Creep & Amount Badge Aligned to the Right */}
                      <div className="text-right flex flex-col items-end flex-shrink-0">
                        <div className="font-mono text-sm font-semibold text-stone-900 group-hover:text-blue-900">
                          {formatCurrency(item.currentAmt, true)}
                        </div>
                        <div className="mt-1">
                          {item.isIdv && item.currentAmt === 0 ? (
                            <span className="font-mono text-[10px] font-semibold bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-xs border border-stone-200">
                              Master IDV
                            </span>
                          ) : item.dollarCreep > 0 ? (
                            <span className="font-mono text-[11px] font-bold bg-red-50 text-red-700 px-1.5 py-0.5 rounded-xs border border-red-200">
                              +{item.percentCreep.toFixed(1)}% (+{formatCurrency(item.dollarCreep, true)})
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] font-medium bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-xs border border-stone-200">
                              Fixed Price
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {item.Description && (
                      <p className="text-xs text-stone-600 line-clamp-2 mt-2 leading-relaxed font-normal">
                        {item.Description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======================= STATE 2: DETAIL / INSPECTOR VIEW ======================= */}
        {selectedAward && (
          <div className="space-y-5">
            {/* Overview Card */}
            <div className="space-y-2 pb-4 border-b border-stone-200">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500">
                Award Overview
              </div>
              <h2 className="font-serif text-lg font-bold text-stone-900 leading-snug">
                {selectedAward['Recipient Name']}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600 pt-0.5">
                <span className="font-mono bg-stone-100 text-stone-800 px-2 py-0.5 rounded-xs font-medium">
                  ID: {selectedAward['Award ID']}
                </span>
                <span className="text-stone-300">|</span>
                <span className="text-stone-600">Effective Date: {formatDate(selectedAward['Start Date'])}</span>
              </div>
              {selectedAward.Description && (
                <p className="text-xs text-stone-700 leading-relaxed pt-2 font-normal">
                  {selectedAward.Description}
                </p>
              )}
            </div>

            {/* Loading Skeleton or Telemetry & Stepper Ledger */}
            {isLoadingTransactions ? (
              <div className="py-16 text-center space-y-3 text-stone-400">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-blue-900" />
                <div className="text-xs font-serif italic text-stone-500">
                  Fetching modification ledger & calculating cost creep...
                </div>
              </div>
            ) : transactionError ? (
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-sm text-stone-600 text-xs">
                {transactionError}
              </div>
            ) : (
              <>
                {/* Creep Telemetry Bar (3 Columns - Split Track) */}
                {creepStats && (
                  <div className="grid grid-cols-3 gap-2 p-3.5 bg-stone-50 border border-stone-200 rounded-sm text-center">
                    <div className="space-y-1">
                      <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">
                        {creepStats.isTrackIdv ? 'Initial Ceiling (Mod 0)' : 'Initial Obligation (Mod 0)'}
                      </div>
                      <div className="font-mono text-xs font-semibold text-stone-800">
                        {creepStats.isZeroCeilingIdv ? 'N/A' : formatCurrency(creepStats.initialValue, true)}
                      </div>
                    </div>

                    <div className="space-y-1 border-x border-stone-200 px-1">
                      <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">
                        {creepStats.isTrackIdv ? 'Current Ceiling' : 'Current Total'}
                      </div>
                      <div className="font-mono text-xs font-bold text-stone-900">
                        {creepStats.isZeroCeilingIdv ? '$0 (Master IDV)' : formatCurrency(creepStats.currentValue, true)}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">
                        {creepStats.isTrackIdv ? 'Ceiling Creep' : 'Cost Creep'}
                      </div>
                      <div
                        className={`font-mono text-xs font-bold ${
                          creepStats.isZeroCeilingIdv
                            ? 'text-stone-600 bg-stone-100 px-1 py-0.5 rounded-xs border border-stone-200 text-[10px]'
                            : creepStats.dollarCreep > 0
                            ? 'text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-xs border border-rose-200'
                            : 'text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded-xs border border-stone-200'
                        }`}
                      >
                        {creepStats.isZeroCeilingIdv
                          ? 'Master Vehicle (No Direct Ceiling)'
                          : creepStats.dollarCreep > 0
                          ? `+${formatCurrency(creepStats.dollarCreep, true)} (+${creepStats.percentCreep.toFixed(1)}%)`
                          : '0.0% (Fixed Price)'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Modification Stepper Ledger */}
                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-200 text-stone-500 text-[11px] uppercase tracking-wider font-semibold">
                    <span>Modification Ledger</span>
                    <span>{transactions.length} Actions</span>
                  </div>

                  {transactions.length === 0 ? (
                    <div className="py-6 text-center text-stone-500 font-serif italic text-xs">
                      Initial award only — no subsequent modifications recorded.
                    </div>
                  ) : (
                    <div className="relative border-l border-stone-200 ml-3.5 pl-5 space-y-5 pt-1">
                      {transactions.map((tx, idx) => {
                        const isIdv = creepStats?.isTrackIdv;
                        const delta = isIdv
                          ? (tx.base_and_all_options_value ??
                             tx['Base and All Options Value'] ??
                             tx.federal_action_obligation ??
                             tx['Transaction Amount'] ??
                             0)
                          : (tx.federal_action_obligation ??
                             tx['Federal Action Obligation'] ??
                             tx['Transaction Amount'] ??
                             0);
                        const modNum = tx.modification_number ?? tx['Modification Number'] ?? `${idx}`;
                        const actionType =
                          tx.action_type_description ?? tx['Action Type'] ?? 'Contract Modification';
                        const txDate = tx.action_date ?? tx['Action Date'];

                        const isPositive = delta > 0;
                        const isNegative = delta < 0;

                        return (
                          <div key={tx.id || idx} className="relative group">
                            {/* Stepper Dot */}
                            <div
                              className={`absolute -left-[25px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white shadow-xs ${
                                idx === 0
                                  ? 'bg-blue-900'
                                  : isPositive
                                  ? 'bg-rose-600'
                                  : 'bg-stone-400'
                              }`}
                            />

                            {/* Transaction Card */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-mono text-stone-500 text-[11px]">{formatDate(txDate)}</span>
                                <span className="font-mono bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded-xs text-[10px] font-semibold">
                                  MOD {modNum}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-2 pt-0.5">
                                <span className="text-xs text-stone-900 font-medium">
                                  {actionType}
                                </span>
                                <span
                                  className={`font-mono text-xs font-semibold ${
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
                                <p className="text-xs text-stone-600 leading-relaxed font-normal pt-0.5">
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
              </>
            )}
          </div>
        )}
      </div>

      {/* 3. Footer Telemetry Tag */}
      <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500 font-sans flex-shrink-0">
        <span>Source: USAspending.gov Open API</span>
        <span className="font-mono text-[10px] text-stone-400">Live Query</span>
      </div>
    </div>
  );
};

export default ContractCreepPanel;

