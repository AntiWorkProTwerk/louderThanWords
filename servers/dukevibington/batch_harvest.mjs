/**
 * Civic Intelligence Full Batch Harvester & Pre-Seeder v2.0
 * Harvests National, 50 States + DC, and all Major Counties from USAspending.gov,
 * reconstructs Mod #0 baselines, calculates creep, and generates seeds & R2 bundles.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { harvestJurisdiction, generateSqlBundle } from './ingest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const US_STATES = [
  'CO', 'IL', 'TX', 'CA', 'NY', 'FL', 'WA', 'VA', 'MD', 'PA',
  'OH', 'NC', 'GA', 'MI', 'NJ', 'AZ', 'TN', 'MA', 'IN', 'MO',
  'WI', 'MN', 'SC', 'AL', 'LA', 'KY', 'OR', 'OK', 'CT', 'UT',
  'IA', 'NV', 'AR', 'MS', 'KS', 'NM', 'NE', 'ID', 'WV', 'HI',
  'NH', 'ME', 'MT', 'RI', 'DE', 'SD', 'ND', 'AK', 'DC', 'VT', 'WY'
];

// Major Counties mapping per top state
const STATE_COUNTIES = {
  CO: [
    { fips: '041', name: 'El Paso County' },
    { fips: '031', name: 'Denver County' },
    { fips: '059', name: 'Jefferson County' },
    { fips: '005', name: 'Arapahoe County' },
    { fips: '001', name: 'Adams County' },
    { fips: '013', name: 'Boulder County' },
    { fips: '035', name: 'Douglas County' },
    { fips: '069', name: 'Larimer County' },
    { fips: '123', name: 'Weld County' },
    { fips: '101', name: 'Pueblo County' },
    { fips: '093', name: 'Park County' },
  ],
  IL: [
    { fips: '031', name: 'Cook County' },
    { fips: '043', name: 'DuPage County' },
    { fips: '089', name: 'Kane County' },
    { fips: '097', name: 'Lake County' },
    { fips: '197', name: 'Will County' },
    { fips: '019', name: 'Champaign County' },
    { fips: '167', name: 'Sangamon County' },
    { fips: '163', name: 'St. Clair County' },
    { fips: '119', name: 'Madison County' },
    { fips: '143', name: 'Peoria County' },
    { fips: '201', name: 'Winnebago County' },
  ],
  TX: [
    { fips: '201', name: 'Harris County' },
    { fips: '113', name: 'Dallas County' },
    { fips: '439', name: 'Tarrant County' },
    { fips: '029', name: 'Bexar County' },
    { fips: '453', name: 'Travis County' },
    { fips: '085', name: 'Collin County' },
    { fips: '121', name: 'Denton County' },
    { fips: '141', name: 'El Paso County' },
  ],
  CA: [
    { fips: '037', name: 'Los Angeles County' },
    { fips: '073', name: 'San Diego County' },
    { fips: '059', name: 'Orange County' },
    { fips: '085', name: 'Santa Clara County' },
    { fips: '067', name: 'Sacramento County' },
    { fips: '001', name: 'Alameda County' },
  ],
  NY: [
    { fips: '061', name: 'New York County' },
    { fips: '047', name: 'Kings County' },
    { fips: '081', name: 'Queens County' },
    { fips: '059', name: 'Nassau County' },
    { fips: '103', name: 'Suffolk County' },
    { fips: '029', name: 'Erie County' },
  ],
  VA: [
    { fips: '059', name: 'Fairfax County' },
    { fips: '013', name: 'Arlington County' },
    { fips: '107', name: 'Loudoun County' },
    { fips: '153', name: 'Prince William County' },
    { fips: '700', name: 'Newport News City' },
    { fips: '710', name: 'Norfolk City' },
  ],
  FL: [
    { fips: '086', name: 'Miami-Dade County' },
    { fips: '011', name: 'Broward County' },
    { fips: '095', name: 'Orange County' },
    { fips: '057', name: 'Hillsborough County' },
    { fips: '031', name: 'Duval County' },
    { fips: '009', name: 'Brevard County' },
  ],
};

import { quotaGuard } from './quota_guard.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function harvestStateAndCounties(stateCode, { autoExecute = false, force = false, rebuild = false } = {}) {
  const sqlDir = path.join(__dirname, 'seed_data');
  const bundleDir = path.join(__dirname, 'bundles', 'states');
  const sqlFile = path.join(sqlDir, `${stateCode}_seed.sql`);
  const bundleFile = path.join(bundleDir, `${stateCode}.json`);

  const alreadyHarvested = fs.existsSync(sqlFile) && fs.existsSync(bundleFile) && !rebuild && !force;

  if (alreadyHarvested) {
    console.log(`\n======================================================`);
    console.log(`⏩ [CACHED] ${stateCode} already harvested locally.`);
    console.log(`   Bundle: ${bundleFile}`);
    console.log(`   SQL:    ${sqlFile}`);
    console.log(`======================================================`);

    if (autoExecute) {
      try {
        quotaGuard.checkD1Budget(50);
        console.log(`🚀 Seeding remote D1 for ${stateCode} from cached SQL...`);
        execSync(`npx wrangler d1 execute civic_data --remote --file="${sqlFile}" --yes`, { stdio: 'inherit' });
        quotaGuard.recordD1Write(50);

        console.log(`☁️ Uploading cached ${stateCode} bundle to remote R2...`);
        execSync(`npx wrangler r2 object put civic-bundles/dukevibington/states/${stateCode}.json --file="${bundleFile}" --remote`, { stdio: 'inherit' });
        quotaGuard.recordR2Put();
        console.log(`✅ ${stateCode} fully deployed to D1 and R2!`);
      } catch (e) {
        console.error(`Error deploying ${stateCode}:`, e.message);
      }
    }

    return { stateCode, cached: true };
  }

  console.log(`\n======================================================`);
  console.log(`🏛️ HARVESTING JURISDICTIONS FOR: ${stateCode}`);
  console.log(`======================================================`);

  const sqlStatements = [];
  const stateAwards = await harvestJurisdiction({ stateCode, limit: 25, force });
  const stateBundle = generateSqlBundle({ stateCode, name: stateCode }, stateAwards);
  sqlStatements.push(stateBundle.sql);

  const countyBundles = [];
  const counties = STATE_COUNTIES[stateCode] || [];

  for (const c of counties) {
    await sleep(250); // rate limiting
    console.log(`  📍 Harvesting County: ${c.name} (${stateCode}-${c.fips})...`);
    try {
      const cAwards = await harvestJurisdiction({ stateCode, countyFips: c.fips, limit: 10, force });
      if (cAwards.length > 0) {
        const cBundle = generateSqlBundle({ stateCode, countyFips: c.fips, name: c.name }, cAwards);
        sqlStatements.push(cBundle.sql);
        countyBundles.push({
          countyFips: c.fips,
          name: c.name,
          summary: cBundle.summary,
          awards: cAwards,
        });
      }
    } catch (err) {
      console.warn(`Could not harvest county ${c.name}:`, err.message);
    }
  }

  // 1. Output combined State + Counties D1 SQL Seed
  if (!fs.existsSync(sqlDir)) fs.mkdirSync(sqlDir, { recursive: true });
  fs.writeFileSync(sqlFile, sqlStatements.join('\n'), 'utf8');
  console.log(`✨ Generated Comprehensive Seed SQL: ${sqlFile}`);

  // 2. Output R2 Bundle JSON
  if (!fs.existsSync(bundleDir)) fs.mkdirSync(bundleDir, { recursive: true });

  const bundlePayload = {
    stateCode,
    updatedAt: Date.now(),
    summary: stateBundle.summary,
    sectorBreakdown: stateBundle.sectorBreakdown,
    fiscalYears: stateBundle.fiscalYears,
    counties: countyBundles,
    awards: stateAwards,
  };

  fs.writeFileSync(bundleFile, JSON.stringify(bundlePayload, null, 2), 'utf8');
  console.log(`📦 Generated Comprehensive R2 Bundle: ${bundleFile}`);

  // 3. Auto Execute Remote D1 and R2 if requested
  if (autoExecute) {
    try {
      const estimatedRows = stateAwards.length + countyBundles.reduce((s, c) => s + c.awards.length, 0) + 15;
      quotaGuard.checkD1Budget(estimatedRows);
      console.log(`🚀 Seeding remote D1 for ${stateCode}...`);
      execSync(`npx wrangler d1 execute civic_data --remote --file="${sqlFile}" --yes`, { stdio: 'inherit' });
      quotaGuard.recordD1Write(estimatedRows);

      console.log(`☁️ Uploading ${stateCode} bundle to remote R2...`);
      execSync(`npx wrangler r2 object put civic-bundles/dukevibington/states/${stateCode}.json --file="${bundleFile}" --remote`, { stdio: 'inherit' });
      quotaGuard.recordR2Put();
      console.log(`✅ ${stateCode} fully deployed to D1 and R2!`);
    } catch (e) {
      console.error(`Error deploying ${stateCode}:`, e.message);
    }
  }

  return { stateCode, awardsCount: stateAwards.length, countiesCount: countyBundles.length };
}

async function harvestNational({ autoExecute = false, force = false, rebuild = false } = {}) {
  const sqlDir = path.join(__dirname, 'seed_data');
  const bundleDir = path.join(__dirname, 'bundles', 'states');
  const sqlFile = path.join(sqlDir, `US_seed.sql`);
  const bundleFile = path.join(bundleDir, `US.json`);

  const alreadyHarvested = fs.existsSync(sqlFile) && fs.existsSync(bundleFile) && !rebuild && !force;

  if (alreadyHarvested) {
    console.log(`\n======================================================`);
    console.log(`⏩ [CACHED] National Federal Jurisdiction (US) already harvested locally.`);
    console.log(`   Bundle: ${bundleFile}`);
    console.log(`   SQL:    ${sqlFile}`);
    console.log(`======================================================`);

    if (autoExecute) {
      try {
        quotaGuard.checkD1Budget(40);
        console.log(`🚀 Seeding National Federal Data to remote D1 from cached SQL...`);
        execSync(`npx wrangler d1 execute civic_data --remote --file="${sqlFile}" --yes`, { stdio: 'inherit' });
        quotaGuard.recordD1Write(40);

        console.log(`☁️ Uploading cached US bundle to remote R2...`);
        execSync(`npx wrangler r2 object put civic-bundles/dukevibington/states/US.json --file="${bundleFile}" --remote`, { stdio: 'inherit' });
        quotaGuard.recordR2Put();
        console.log(`✅ National Federal data live in D1 and R2!`);
      } catch (e) {
        console.error(`Error deploying US National:`, e.message);
      }
    }
    return;
  }

  console.log(`\n======================================================`);
  console.log(`🇺🇸 HARVESTING NATIONAL FEDERAL JURISDICTION (US)`);
  console.log(`======================================================`);

  const awards = await harvestJurisdiction({ stateCode: 'US', limit: 30, force });
  const result = generateSqlBundle({ stateCode: 'US', name: 'United States' }, awards);

  if (!fs.existsSync(sqlDir)) fs.mkdirSync(sqlDir, { recursive: true });
  fs.writeFileSync(sqlFile, result.sql, 'utf8');

  if (!fs.existsSync(bundleDir)) fs.mkdirSync(bundleDir, { recursive: true });

  const bundlePayload = {
    stateCode: 'US',
    updatedAt: Date.now(),
    summary: result.summary,
    sectorBreakdown: result.sectorBreakdown,
    fiscalYears: result.fiscalYears,
    awards,
  };
  fs.writeFileSync(bundleFile, JSON.stringify(bundlePayload, null, 2), 'utf8');

  if (autoExecute) {
    try {
      quotaGuard.checkD1Budget(40);
      console.log(`🚀 Seeding National Federal Data to remote D1...`);
      execSync(`npx wrangler d1 execute civic_data --remote --file="${sqlFile}" --yes`, { stdio: 'inherit' });
      quotaGuard.recordD1Write(40);

      execSync(`npx wrangler r2 object put civic-bundles/dukevibington/states/US.json --file="${bundleFile}" --remote`, { stdio: 'inherit' });
      quotaGuard.recordR2Put();
      console.log(`✅ National Federal data live in D1 and R2!`);
    } catch (e) {
      console.error(`Error deploying US National:`, e.message);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targetState = args.find((a) => !a.startsWith('-'))?.toUpperCase();
  const autoDeploy = args.includes('--deploy') || args.includes('--remote');
  const force = args.includes('--force') || args.includes('-f');
  const rebuild = args.includes('--rebuild') || args.includes('--regenerate');
  const ignoreLimits = args.includes('--ignore-limits');

  const maxCallsArg = args.find((a) => a.startsWith('--max-calls='));
  if (maxCallsArg) {
    const parsed = parseInt(maxCallsArg.split('=')[1], 10);
    if (!isNaN(parsed)) quotaGuard.setMaxCalls(parsed);
  } else if (!targetState || targetState === 'ALL') {
    // Generous session quota for batch run across 50 states
    quotaGuard.setMaxCalls(1000);
  }

  if (ignoreLimits) {
    quotaGuard.setBypass(true);
    console.log(`⚠️ [OVERRIDE] QuotaGuardian safety limits bypassed by user flag.`);
  }

  try {
    if (targetState === 'NATIONAL' || targetState === 'US') {
      await harvestNational({ autoExecute: autoDeploy, force, rebuild });
      return;
    }

    if (targetState && targetState !== 'ALL') {
      await harvestStateAndCounties(targetState, { autoExecute: autoDeploy, force, rebuild });
      return;
    }

    // Harvest all states in batch
    console.log(`🚀 Starting Comprehensive Multi-State Civic Pre-Seeding Batch (50 States + DC, force=${force}, rebuild=${rebuild})...`);
    await harvestNational({ autoExecute: autoDeploy, force, rebuild });

    const statesToProcess = targetState && targetState !== 'ALL' ? [targetState] : US_STATES;
    console.log(`📋 Processing ${statesToProcess.length} jurisdictions...`);

    for (const st of statesToProcess) {
      await harvestStateAndCounties(st, { autoExecute: autoDeploy, force, rebuild });
      await sleep(200);
    }

    console.log(`\n🎉 BATCH HARVEST & SEED RUN COMPLETE!`);
  } catch (err) {
    console.error(`\n❌ Execution halted:`, err.message);
  } finally {
    quotaGuard.printDashboard();
  }
}

main().catch(console.error);
