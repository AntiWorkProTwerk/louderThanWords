/**
 * Civic Edge API Client
 * Queries Cloudflare D1-backed Edge API endpoints for sub-30ms forensic procurement metrics
 */

import { civicCache } from './civicCacheService';

export interface FiscalYearCohort {
  id?: string;
  fiscal_year: number;
  fiscalYear?: number;
  state_operating_budget?: number;
  stateOperatingBudget?: number;
  federal_tax_collected?: number;
  federalTaxCollected?: number;
  contracts_started_count?: number;
  contractsStartedCount?: number;
  initial_obligation_started?: number;
  initialObligationStarted?: number;
  current_obligation_started?: number;
  currentObligationStarted?: number;
  dollar_creep_started?: number;
  dollarCreepStarted?: number;
  percent_creep_started?: number;
  percentCreepStarted?: number;
  return_on_tax_dollar?: number;
  returnOnTaxDollar?: number;
  contracts_to_state_budget_pct?: number;
  contractsToStateBudgetPct?: number;
}

export interface StateEdgeBundle {
  state: {
    id: string;
    level: string;
    state_code: string;
    name: string;
    population?: number;
    initial_obligation: number;
    current_obligation: number;
    dollar_creep: number;
    percent_creep: number;
    dollars_per_capita?: number;
    creep_per_capita?: number;
    cost_plus_pct: number;
    cost_plus_multiplier?: number;
    sole_source_pct?: number;
    capital_flight_pct: number;
    september_spurt_pct?: number;
    avg_schedule_delay_days?: number;
    zombie_contracts_count?: number;
    hhi_score?: number;
    top3_vendor_concentration_pct?: number;
    contracts_to_state_budget_pct?: number;
    return_on_tax_dollar?: number;
    active_contracts_count: number;
    top_offender_name?: string;
  } | null;
  counties: {
    id: string;
    county_fips: string;
    name: string;
    population?: number;
    initial_obligation: number;
    current_obligation: number;
    dollar_creep: number;
    percent_creep: number;
    dollars_per_capita?: number;
    creep_per_capita?: number;
    cost_plus_pct?: number;
    cost_plus_multiplier?: number;
    sole_source_pct?: number;
    capital_flight_pct?: number;
    september_spurt_pct?: number;
    avg_schedule_delay_days?: number;
    zombie_contracts_count?: number;
    hhi_score?: number;
    active_contracts_count: number;
    top_offender_name?: string;
  }[];
  fiscalYears?: FiscalYearCohort[];
  topAwards: any[];
}

export interface CountyEdgeBundle {
  county: {
    id: string;
    county_fips: string;
    name: string;
    population?: number;
    initial_obligation: number;
    current_obligation: number;
    dollar_creep: number;
    percent_creep: number;
    dollars_per_capita?: number;
    creep_per_capita?: number;
    cost_plus_pct?: number;
    cost_plus_multiplier?: number;
    sole_source_pct?: number;
    capital_flight_pct?: number;
    september_spurt_pct?: number;
    avg_schedule_delay_days?: number;
    zombie_contracts_count?: number;
    hhi_score?: number;
    active_contracts_count: number;
  } | null;
  fiscalYears?: FiscalYearCohort[];
  awards: any[];
}

export class CivicEdgeApiClient {
  private static readonly BACKEND_FALLBACK = 'https://dukevibington-dev-louderthanwords.louder-than-words.workers.dev';

  private static async fetchEdge(endpoint: string): Promise<Response> {
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    const primaryUrl = `${origin}${endpoint}`;

    try {
      const res = await fetch(primaryUrl);
      if (res.ok) return res;
    } catch {
      // Direct origin unavailable or network fallback
    }

    const fallbackUrl = `${this.BACKEND_FALLBACK}${endpoint}`;
    return fetch(fallbackUrl);
  }

  /**
   * Fetch full state bundle with all pre-computed county rollups & fiscal year time series
   */
  static async getStateBundle(stateCode: string): Promise<StateEdgeBundle | null> {
    const cacheKey = `edge_state_bundle_v4_${stateCode.toUpperCase()}`;
    return civicCache.fetchCached(
      cacheKey,
      async () => {
        const res = await this.fetchEdge(`/api/creep/state/${encodeURIComponent(stateCode.toUpperCase())}`);
        if (!res.ok) return null;
        return res.json();
      },
      86400 * 1000 // 24hr TTL
    );
  }

  /**
   * Fetch specific county details, fiscal cohorts, and prime awards
   */
  static async getCountyBundle(stateCode: string, countyFips: string): Promise<CountyEdgeBundle | null> {
    const cacheKey = `edge_county_bundle_v4_${stateCode.toUpperCase()}_${countyFips}`;
    return civicCache.fetchCached(
      cacheKey,
      async () => {
        const res = await this.fetchEdge(
          `/api/creep/county/${encodeURIComponent(stateCode.toUpperCase())}/${encodeURIComponent(countyFips)}`
        );
        if (!res.ok) return null;
        return res.json();
      },
      86400 * 1000
    );
  }

  /**
   * Fetch year-by-year time series for any jurisdiction
   */
  static async getFiscalYears(jurisdictionId: string): Promise<FiscalYearCohort[]> {
    const cacheKey = `edge_fiscal_years_${jurisdictionId}`;
    return civicCache.fetchCached(
      cacheKey,
      async () => {
        const res = await this.fetchEdge(`/api/creep/fiscal-years/${encodeURIComponent(jurisdictionId)}`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.fiscalYears || [];
      },
      86400 * 1000
    );
  }

  /**
   * Fetch static R2 state bundle (zero egress, CDN cached)
   */
  static async getR2StateBundle(stateCode: string): Promise<any | null> {
    const cacheKey = `r2_bundle_state_v2_${stateCode.toUpperCase()}`;
    return civicCache.fetchCached(
      cacheKey,
      async () => {
        const res = await this.fetchEdge(`/bundles/states/${encodeURIComponent(stateCode.toUpperCase())}.json`);
        if (!res.ok) return null;
        return res.json();
      },
      86400 * 1000
    );
  }
}
