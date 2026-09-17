# Civic Intelligence Data Ingestion & Pre-Seeding Guide

This guide details how to harvest, audit, and pre-seed **National Federal**, **State**, and **County** procurement data from USAspending.gov into **Cloudflare D1 (SQLite)** and **Cloudflare R2 (Object Storage)** with zero AI token usage.

---

## 1. Quick Start: 1-Step Automated CLI Commands

All commands should be run from the root project directory: `c:\VS Code Projects\louderthanwords.fyi\louderThanWords`

### A. Ingest a Specific State + All Major Counties (e.g. Illinois)
Harvests state-wide records, all major county rollups, reconstructs Mod #0 baselines, seeds remote D1, and uploads the R2 bundle in one command:
```bash
node servers/dukevibington/batch_harvest.mjs IL --deploy
```

### B. Ingest National Federal Overview + Mega-Contracts
```bash
node servers/dukevibington/batch_harvest.mjs US --deploy
```

### C. Ingest All Primary Core States in Batch (CO, IL, TX, CA, NY, VA, FL)
```bash
node servers/dukevibington/batch_harvest.mjs --deploy
```

### D. Bypass Cache & Force Re-harvest (`--force` or `-f`)
By default, `batch_harvest.mjs` automatically detects if a jurisdiction's seed SQL and bundle JSON already exist locally and skips re-querying the USAspending API (saving bandwidth and time). To force a full fresh re-fetch from the federal API:
```bash
node servers/dukevibington/batch_harvest.mjs IL --force --deploy
```

### E. QuotaGuardian™ Near-Limit Circuit Breakers & Safety Flags
The harvester includes built-in near-limit circuit breakers to protect against USAspending API rate-limiting and Cloudflare Free Tier thresholds:
- **Session API Limit**: 150 live API requests max per run.
- **24-Hour Rolling Cap**: 800 live API requests max in 24 hours.
- **Consecutive Error Stopper**: Automatically halts if 3 consecutive HTTP 429/5xx errors occur.
- **D1 Daily Safety Cap**: 20,000 write rows/day (20% of 100k free tier).

**Optional Flags:**
```bash
# Adjust session API call budget
node servers/dukevibington/batch_harvest.mjs --max-calls=300

# Bypass safety stoppers (if harvesting all 50 states at once)
node servers/dukevibington/batch_harvest.mjs --ignore-limits --deploy
```

*(Note: Adding `--deploy` automatically executes the generated D1 SQL seed against remote Cloudflare D1 and uploads the R2 bundle.)*

---

## 2. Manual 3-Step Execution (For Granular Control)

If you prefer to inspect the generated SQL and JSON files before deploying:

### Step 1: Harvest & Generate Local Seed Files
```bash
# Harvest Colorado + Counties
node servers/dukevibington/batch_harvest.mjs CO

# Or single-state harvester:
node servers/dukevibington/ingest.mjs CO
```
**Outputs Created:**
- D1 SQL Migration Seed: `servers/dukevibington/seed_data/CO_seed.sql`
- R2 Civic Bundle JSON: `servers/dukevibington/bundles/states/CO.json`

### Step 2: Seed Remote Cloudflare D1
```bash
npx wrangler d1 execute civic_data --remote --file=./servers/dukevibington/seed_data/CO_seed.sql --yes
```

### Step 3: Upload Compressed Bundle to Cloudflare R2
```bash
npx wrangler r2 object put civic-bundles/states/CO.json --file=./servers/dukevibington/bundles/states/CO.json --remote
```

---

## 3. How to Verify Live Data

### Verify D1 Database Rows
Check that the state and county rows are live in D1:
```bash
npx wrangler d1 execute civic_data --remote --command="SELECT id, level, state_code, name, current_obligation, dollar_creep, contracts_to_state_budget_pct, return_on_tax_dollar FROM jurisdictions"
```

Check Annual Fiscal Cohorts (FY2018–FY2026):
```bash
npx wrangler d1 execute civic_data --remote --command="SELECT fiscal_year, contracts_started_count, current_obligation_started, dollar_creep_started, state_operating_budget, federal_tax_collected, return_on_tax_dollar FROM jurisdiction_fiscal_years WHERE jurisdiction_id='state:CO' ORDER BY fiscal_year ASC"
```

### Verify R2 Objects
List all uploaded bundles in the R2 bucket:
```bash
npx wrangler r2 object get civic-bundles/states/CO.json --remote
```

---

## 4. Adding New States or Counties

### Adding Counties to the Batch Harvester
Open [`servers/dukevibington/batch_harvest.mjs`](./batch_harvest.mjs) and add the target state's FIPS codes to `STATE_COUNTIES`:
```javascript
const STATE_COUNTIES = {
  TX: [
    { fips: '201', name: 'Harris County' },
    { fips: '113', name: 'Dallas County' },
    { fips: '439', name: 'Tarrant County' },
    { fips: '029', name: 'Bexar County' },
    { fips: '453', name: 'Travis County' },
  ],
  // Add more states here...
};
```

### Adding State Budget & IRS Tax Benchmarks
Open [`servers/dukevibington/data/state_budget_benchmarks.json`](./data/state_budget_benchmarks.json) to add or adjust annual state operating budgets and IRS tax collections for any US state.

---

## 5. Security & Edge Configuration

- **Private Database & Storage**: D1 and R2 bindings are strictly internal to the Cloudflare Worker runtime.
- **Allowed Origins Whitelist**: Configured in [`worker/index.js`](../../worker/index.js) to accept requests only from `louderthanwords.fyi`, `*.workers.dev`, and `localhost:*`.
- **Deploying Worker Updates**:
```bash
npm run build
npx wrangler deploy
```
