-- Civic Intelligence D1 Database Schema
-- Version 2.0 (Forensic Procurement Creep, State Budget Benchmarks & Fiscal Cohorts)

DROP TABLE IF EXISTS jurisdiction_fiscal_years;
DROP TABLE IF EXISTS awards;
DROP TABLE IF EXISTS jurisdictions;

CREATE TABLE IF NOT EXISTS jurisdictions (
  id TEXT PRIMARY KEY,                       -- e.g. 'US', 'state:CO', 'county:CO:093', 'muni:CO:093:fairplay'
  level TEXT NOT NULL,                       -- 'national', 'state', 'county', 'municipal'
  state_code TEXT NOT NULL,                  -- 'CO', 'IL', 'US', etc.
  county_fips TEXT,                          -- '093' (3-digit code)
  city_name TEXT,                            -- 'Fairplay'
  name TEXT NOT NULL,                        -- Display name (e.g. 'Park County', 'Colorado')
  population INTEGER NOT NULL DEFAULT 0,     -- Census population
  initial_obligation REAL NOT NULL DEFAULT 0,
  current_obligation REAL NOT NULL DEFAULT 0,
  dollar_creep REAL NOT NULL DEFAULT 0,
  percent_creep REAL NOT NULL DEFAULT 0,
  dollars_per_capita REAL NOT NULL DEFAULT 0,
  creep_per_capita REAL NOT NULL DEFAULT 0,
  cost_plus_pct REAL NOT NULL DEFAULT 0,
  sole_source_pct REAL NOT NULL DEFAULT 0,
  capital_flight_pct REAL NOT NULL DEFAULT 0,
  top3_vendor_concentration_pct REAL NOT NULL DEFAULT 0,
  contracts_to_state_budget_pct REAL NOT NULL DEFAULT 0,
  return_on_tax_dollar REAL NOT NULL DEFAULT 0,
  active_contracts_count INTEGER NOT NULL DEFAULT 0,
  top_offender_name TEXT,
  top_offender_creep REAL NOT NULL DEFAULT 0,
  payload_json TEXT,                         -- Full pre-computed summary JSON bundle for instant response
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jurisdictions_state_level ON jurisdictions (state_code, level);
CREATE INDEX IF NOT EXISTS idx_jurisdictions_county ON jurisdictions (state_code, county_fips);

CREATE TABLE IF NOT EXISTS awards (
  internal_id TEXT PRIMARY KEY,              -- generated_internal_id e.g. 'CONT_AWD_...'
  award_id_piid TEXT NOT NULL,               -- '12363N21C4009'
  parent_award_piid TEXT,                    -- Master IDV / BPA vehicle identifier
  fiscal_year_started INTEGER,               -- Fiscal year contract was initiated (e.g. 2021)
  state_code TEXT NOT NULL,                  -- Place of performance state
  county_fips TEXT,                          -- Place of performance county 3-digit FIPS
  city_name TEXT,                            -- Place of performance city name
  congressional_district TEXT,               -- Place of performance congressional district (e.g. 'CO-05')
  recipient_name TEXT NOT NULL,
  parent_recipient_name TEXT NOT NULL,
  recipient_state TEXT,                      -- Corporate HQ state
  business_type TEXT DEFAULT 'LARGE CORPORATE', -- 'LARGE CORPORATE', 'SMALL BUSINESS', 'NONPROFIT'
  competition_type TEXT DEFAULT 'FULL COMPETITION', -- 'FULL COMPETITION', 'SOLE SOURCE / NO BID', 'FOLLOW-ON', 'LIMITED BID'
  industry_sector TEXT DEFAULT 'DEFENSE & WEAPONS', -- 'DEFENSE & WEAPONS', 'ENERGY & R&D', 'HEALTHCARE & PHARMA', 'IT & CLOUD SYSTEMS', 'INFRASTRUCTURE & CONSTRUCTION', 'LOGISTICS & SUPPORT'
  awarding_agency TEXT NOT NULL,
  awarding_sub_agency TEXT NOT NULL,
  office_name TEXT,
  pricing_type TEXT NOT NULL,                -- 'COST-PLUS', 'FIXED PRICE', 'TIME & MATERIALS'
  award_type TEXT NOT NULL,                  -- 'DEFINITIVE', 'IDV', etc.
  initial_obligation REAL NOT NULL DEFAULT 0,
  current_obligation REAL NOT NULL DEFAULT 0,
  award_ceiling REAL NOT NULL DEFAULT 0,
  dollar_creep REAL NOT NULL DEFAULT 0,
  percent_creep REAL NOT NULL DEFAULT 0,
  start_date TEXT,
  initial_end_date TEXT,
  end_date TEXT,
  schedule_delay_days INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  transactions_json TEXT,                    -- Array of Mod 0..N transactions
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_awards_geo ON awards (state_code, county_fips);
CREATE INDEX IF NOT EXISTS idx_awards_parent ON awards (parent_recipient_name);
CREATE INDEX IF NOT EXISTS idx_awards_office ON awards (office_name);
CREATE INDEX IF NOT EXISTS idx_awards_creep ON awards (dollar_creep DESC);
CREATE INDEX IF NOT EXISTS idx_awards_fy ON awards (fiscal_year_started);
CREATE INDEX IF NOT EXISTS idx_awards_sector ON awards (industry_sector);

CREATE TABLE IF NOT EXISTS jurisdiction_fiscal_years (
  id TEXT PRIMARY KEY,                       -- e.g. 'state:CO:2023', 'county:CO:093:2023'
  jurisdiction_id TEXT NOT NULL,             -- 'state:CO' or 'county:CO:093'
  fiscal_year INTEGER NOT NULL,              -- 2018..2026
  state_operating_budget REAL DEFAULT 0,     -- State annual operating budget (Census/NASBO)
  federal_tax_collected REAL DEFAULT 0,      -- Federal taxes paid by residents (IRS SOI)
  contracts_started_count INTEGER DEFAULT 0,
  initial_obligation_started REAL DEFAULT 0, -- Mod #0 obligation sum for awards born in FY
  current_obligation_started REAL DEFAULT 0, -- What those FY awards cost today
  dollar_creep_started REAL DEFAULT 0,       -- Creep accumulated by that year's cohort
  percent_creep_started REAL DEFAULT 0,
  return_on_tax_dollar REAL DEFAULT 0,       -- Federal procurement / Taxes paid
  contracts_to_state_budget_pct REAL DEFAULT 0, -- Contracts / State operating budget
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (jurisdiction_id) REFERENCES jurisdictions(id)
);

CREATE INDEX IF NOT EXISTS idx_jfy_lookup ON jurisdiction_fiscal_years (jurisdiction_id, fiscal_year);

CREATE TABLE IF NOT EXISTS civic_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_expiry ON civic_cache (expires_at);
