/**
 * Civic Intelligence Full Batch Harvester & Pre-Seeder v2.0 (Multi-Threaded / Concurrent)
 * Harvests National, 50 States + DC, and all Major Counties from USAspending.gov,
 * reconstructs Mod #0 baselines, calculates creep, and generates seeds & R2 bundles.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  harvestJurisdiction,
  generateSqlBundle,
  resolveCounty,
  getCountiesForState
} from './ingest.mjs';
import { quotaGuard } from './quota_guard.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const US_STATES = [
  'CO', 'IL', 'TX', 'CA', 'NY', 'FL', 'WA', 'VA', 'MD', 'PA',
  'OH', 'NC', 'GA', 'MI', 'NJ', 'AZ', 'TN', 'MA', 'IN', 'MO',
  'WI', 'MN', 'SC', 'AL', 'LA', 'KY', 'OR', 'OK', 'CT', 'UT',
  'IA', 'NV', 'AR', 'MS', 'KS', 'NM', 'NE', 'ID', 'WV', 'HI',
  'NH', 'ME', 'MT', 'RI', 'DE', 'SD', 'ND', 'AK', 'DC', 'VT', 'WY'
];

// Explicit Major Counties mapping for priority states
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
  ],
  IL: [
    { fips: '031', name: 'Cook County' },
    { fips: '043', name: 'DuPage County' },
    { fips: '089', name: 'Kane County' },
    { fips: '097', name: 'Lake County' },
    { fips: '197', name: 'Will County' },
    { fips: '019', name: 'Champaign County' },
    { fips: '167', name: 'Sangamon County' },
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
  ],
  FL: [
    { fips: '086', name: 'Miami-Dade County' },
    { fips: '011', name: 'Broward County' },
    { fips: '095', name: 'Orange County' },
    { fips: '057', name: 'Hillsborough County' },
    { fips: '031', name: 'Duval County' },
    { fips: '009', name: 'Brevard County' },
  ],
  KS: [
    { fips: '091', name: 'Johnson County' },
    { fips: '173', name: 'Sedgwick County' },
    { fips: '209', name: 'Wyandotte County' },
    { fips: '177', name: 'Shawnee County' },
  ],
  MO: [
    { fips: '189', name: 'St. Louis County' },
    { fips: '510', name: 'St. Louis City' },
    { fips: '095', name: 'Jackson County' },
    { fips: '037', name: 'Cass County' },
    { fips: '047', name: 'Clay County' },
  ],
  WA: [
    { fips: '033', name: 'King County' },
    { fips: '053', name: 'Pierce County' },
    { fips: '061', name: 'Snohomish County' },
    { fips: '005', name: 'Benton County' },
  ],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Concurrent task pool runner
async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker(workerId) {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      const item = items[idx];
      try {
        results[idx] = await fn(item, idx, items.length, workerId);
      } catch (err) {
        console.error(`[Worker ${workerId}] ❌ Error processing ${item}:`, err.message);
        results[idx] = { error: err.message, item };
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, (_, i) => worker(i + 1));
  await Promise.all(workers);
  return results;
}

export async function harvestStateAndCounties(stateCode, { autoExecute = false, force = false, rebuild = false, workerId = 1, progressStr = '' } = {}) {
  const sqlDir = path.join(__dirname, 'seed_data');
  const bundleDir = path.join(__dirname, 'bundles', 'states');
  const sqlFile = path.join(sqlDir, `${stateCode}_seed.sql`);
  const bundleFile = path.join(bundleDir, `${stateCode}.json`);

  const alreadyHarvested = fs.existsSync(sqlFile) && fs.existsSync(bundleFile) && !rebuild && !force;

  if (alreadyHarvested) {
    console.log(`[Worker ${workerId}] ⏩ [CACHED] ${stateCode} ${progressStr} (Bundle & SQL ready)`);
    return { stateCode, cached: true, sqlFile, bundleFile };
  }

  console.log(`[Worker ${workerId}] 🏛️ [START] Harvesting ${stateCode} ${progressStr}...`);

  const sqlStatements = [];
  const stateAwards = await harvestJurisdiction({ stateCode, limit: 30, force });
  const stateBundle = generateSqlBundle({ stateCode, name: stateCode }, stateAwards);
  sqlStatements.push(stateBundle.sql);

  // Group state awards by county dynamically
  const countyAwardsMap = new Map(); // fips -> { meta: { fips, name }, awards: [] }

  for (const award of stateAwards) {
    const rawCounty = award['Place of Performance County Name'] || award.recipient_location_county_name;
    if (!rawCounty) continue;
    const matched = resolveCounty(stateCode, rawCounty);
    if (matched) {
      if (!countyAwardsMap.has(matched.fips)) {
        countyAwardsMap.set(matched.fips, { meta: matched, awards: [] });
      }
      countyAwardsMap.get(matched.fips).awards.push(award);
    }
  }

  // Harvest dedicated awards for explicit major counties if specified
  const explicitCounties = STATE_COUNTIES[stateCode] || [];
  for (const c of explicitCounties) {
    if (!countyAwardsMap.has(c.fips) && explicitCounties.length <= 4) {
      try {
        await sleep(150);
        const cAwards = await harvestJurisdiction({ stateCode, countyFips: c.fips, limit: 10, force });
        if (cAwards.length > 0) {
          countyAwardsMap.set(c.fips, { meta: c, awards: cAwards });
        }
      } catch (err) {
        // Continue if single county fails
      }
    }
  }

  // Generate SQL and bundle payloads for all discovered counties
  const countyBundles = [];
  for (const [fips, { meta, awards }] of countyAwardsMap.entries()) {
    try {
      const cBundle = generateSqlBundle({ stateCode, countyFips: fips, name: meta.name }, awards);
      sqlStatements.push(cBundle.sql);
      countyBundles.push({
        countyFips: fips,
        name: meta.name,
        summary: cBundle.summary,
        awards,
      });
    } catch (e) {
      console.warn(`Could not bundle county ${meta.name} (${fips}):`, e.message);
    }
  }

  // 1. Output combined State + Counties D1 SQL Seed
  if (!fs.existsSync(sqlDir)) fs.mkdirSync(sqlDir, { recursive: true });
  fs.writeFileSync(sqlFile, sqlStatements.join('\n'), 'utf8');

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
  console.log(`[Worker ${workerId}] ✅ [DONE] ${stateCode} ${progressStr} (${stateAwards.length} awards, ${countyBundles.length} counties)`);

  return {
    stateCode,
    awardsCount: stateAwards.length,
    countiesCount: countyBundles.length,
    sqlFile,
    bundleFile
  };
}

export async function harvestNational({ autoExecute = false, force = false, rebuild = false } = {}) {
  const sqlDir = path.join(__dirname, 'seed_data');
  const bundleDir = path.join(__dirname, 'bundles', 'states');
  const sqlFile = path.join(sqlDir, `US_seed.sql`);
  const bundleFile = path.join(bundleDir, `US.json`);

  const alreadyHarvested = fs.existsSync(sqlFile) && fs.existsSync(bundleFile) && !rebuild && !force;

  if (alreadyHarvested) {
    console.log(`\n======================================================`);
    console.log(`⏩ [CACHED] National Federal Jurisdiction (US) already ready.`);
    console.log(`======================================================`);
    return { stateCode: 'US', cached: true, sqlFile, bundleFile };
  }

  console.log(`\n======================================================`);
  console.log(`🇺🇸 HARVESTING NATIONAL FEDERAL JURISDICTION (US)`);
  console.log(`======================================================`);

  const awards = await harvestJurisdiction({ stateCode: 'US', limit: 35, force });
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
  console.log(`✅ National Federal jurisdiction processed.`);

  return { stateCode: 'US', awardsCount: awards.length, sqlFile, bundleFile };
}

// Deploy SQL and R2 bundles sequentially to avoid database contention
export function deployArtifacts(items) {
  console.log(`\n🚀 DEPLOYING HARVESTED ARTIFACTS TO CLOUDFLARE D1 & R2...`);
  let deployedCount = 0;

  for (const item of items) {
    if (!item || item.error || !item.sqlFile || !fs.existsSync(item.sqlFile)) continue;
    const st = item.stateCode;
    try {
      console.log(`[D1 Deploy] 🗄️ Seeding ${st} to remote D1...`);
      execSync(`npx wrangler d1 execute civic_data --remote --file="${item.sqlFile}" --yes -c servers/dukevibington/wrangler.jsonc`, { stdio: 'inherit' });
      quotaGuard.recordD1Write(45);

      if (item.bundleFile && fs.existsSync(item.bundleFile)) {
        console.log(`[R2 Deploy] ☁️ Uploading ${st} bundle to remote R2...`);
        try {
          execSync(`npx wrangler r2 object put civic-bundles/dukevibington/states/${st}.json --file="${item.bundleFile}" --remote -c servers/dukevibington/wrangler.jsonc`, { stdio: 'inherit' });
          quotaGuard.recordR2Put();
        } catch (r2Err) {
          console.warn(`R2 upload warning for ${st}:`, r2Err.message);
        }
      }

      console.log(`✅ ${st} successfully deployed to Cloudflare D1!`);
      deployedCount++;
    } catch (e) {
      console.error(`❌ Deployment failed for ${st}:`, e.message);
    }
  }

  console.log(`\n🎉 Deployed ${deployedCount} jurisdictions to Cloudflare!`);
}

async function main() {
  const args = process.argv.slice(2);
  const targetState = args.find((a) => !a.startsWith('-'))?.toUpperCase();
  const autoDeploy = args.includes('--deploy') || args.includes('--remote');
  const force = args.includes('--force') || args.includes('-f');
  const rebuild = args.includes('--rebuild') || args.includes('--regenerate');
  const ignoreLimits = args.includes('--ignore-limits');

  const concurrencyArg = args.find((a) => a.startsWith('--concurrency=') || a.startsWith('-c='));
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) || 4 : 4;

  const maxCallsArg = args.find((a) => a.startsWith('--max-calls='));
  if (maxCallsArg) {
    const parsed = parseInt(maxCallsArg.split('=')[1], 10);
    if (!isNaN(parsed)) quotaGuard.setMaxCalls(parsed);
  } else if (!targetState || targetState === 'ALL') {
    quotaGuard.setMaxCalls(3500);
  }

  if (ignoreLimits) {
    quotaGuard.setBypass(true);
    console.log(`⚠️ [OVERRIDE] QuotaGuardian safety limits bypassed by user flag.`);
  }

  const startTime = Date.now();

  try {
    if (targetState === 'NATIONAL' || targetState === 'US') {
      const nationalRes = await harvestNational({ autoExecute: false, force, rebuild });
      if (autoDeploy) deployArtifacts([nationalRes]);
      return;
    }

    if (targetState && targetState !== 'ALL') {
      const stateRes = await harvestStateAndCounties(targetState, { autoExecute: false, force, rebuild });
      if (autoDeploy) deployArtifacts([stateRes]);
      return;
    }

    // Full 50 States + DC + National Batch Run
    console.log(`\n======================================================`);
    console.log(`🚀 STARTING MULTI-THREADED CIVIC BATCH HARVESTER`);
    console.log(`   Jurisdictions: 50 States + DC + National Federal`);
    console.log(`   Worker Concurrency: ${concurrency} parallel streams`);
    console.log(`   Force Re-fetch: ${force} | Rebuild: ${rebuild} | Auto Deploy: ${autoDeploy}`);
    console.log(`======================================================\n`);

    const nationalRes = await harvestNational({ autoExecute: false, force, rebuild });

    const statesToProcess = US_STATES;
    console.log(`📋 Queueing ${statesToProcess.length} state jurisdictions across ${concurrency} workers...\n`);

    const stateResults = await mapConcurrent(
      statesToProcess,
      concurrency,
      async (st, idx, total, workerId) => {
        const progressStr = `[${idx + 1}/${total}]`;
        return harvestStateAndCounties(st, {
          autoExecute: false,
          force,
          rebuild,
          workerId,
          progressStr
        });
      }
    );

    const allResults = [nationalRes, ...stateResults];
    const successful = allResults.filter((r) => r && !r.error);
    const cachedCount = successful.filter((r) => r.cached).length;
    const freshCount = successful.length - cachedCount;
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n======================================================`);
    console.log(`🏁 BATCH HARVEST COMPLETED IN ${durationSec}s`);
    console.log(`   Total Processed: ${successful.length}/${allResults.length}`);
    console.log(`   Freshly Harvested: ${freshCount} | Cached: ${cachedCount}`);
    console.log(`======================================================`);

    if (autoDeploy) {
      deployArtifacts(successful);
    } else {
      console.log(`\n💡 Tip: Run with --deploy to automatically seed Cloudflare D1 and upload to R2.`);
    }

  } catch (err) {
    console.error(`\n❌ Execution halted:`, err.message);
  } finally {
    quotaGuard.printDashboard();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

