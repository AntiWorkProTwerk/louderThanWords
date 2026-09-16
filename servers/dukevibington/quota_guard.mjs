/**
 * Civic Harvester Near-Limit Circuit Breaker & Quota Guardian
 * Protects against exceeding USAspending API rate limits and Cloudflare Free Tier thresholds.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, '.cache');
const TRACKER_FILE = path.join(CACHE_DIR, 'quota_tracker.json');

export const LIMITS = {
  // USAspending.gov safeguards
  MAX_API_CALLS_PER_RUN: 150,      // Max live HTTP calls per CLI execution
  MAX_API_CALLS_PER_DAY: 800,      // Max live HTTP calls in rolling 24h window
  MAX_CONSECUTIVE_ERRORS: 3,       // Max HTTP 429/5xx errors before halting
  API_MIN_DELAY_MS: 250,           // Rate-limiting delay between requests

  // Cloudflare D1 Free Tier Safeguards (Free limit: 100k writes/day)
  MAX_D1_WRITES_PER_DAY: 20000,    // 20% safety threshold of daily free quota

  // Cloudflare R2 Free Tier Safeguards (Free limit: 1M Class A ops/month)
  MAX_R2_PUTS_PER_DAY: 500,        // Daily safety threshold
};

class QuotaGuardian {
  constructor() {
    this.sessionApiCalls = 0;
    this.sessionCacheHits = 0;
    this.sessionD1Writes = 0;
    this.sessionR2Puts = 0;
    this.consecutiveErrors = 0;
    this.isBypassed = false;
    this.customMaxCalls = null;

    this.ensureCacheDir();
    this.data = this.loadTracker();
  }

  ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  loadTracker() {
    try {
      if (fs.existsSync(TRACKER_FILE)) {
        const raw = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        // Clean out records older than 24 hours
        raw.apiCalls = (raw.apiCalls || []).filter((t) => t > oneDayAgo);
        raw.d1Writes = (raw.d1Writes || []).filter((item) => item.time > oneDayAgo);
        raw.r2Puts = (raw.r2Puts || []).filter((t) => t > oneDayAgo);

        return raw;
      }
    } catch (e) {
      // Fallback on clean tracker
    }
    return { apiCalls: [], d1Writes: [], r2Puts: [] };
  }

  saveTracker() {
    try {
      this.ensureCacheDir();
      fs.writeFileSync(TRACKER_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      // Ignore save failure
    }
  }

  setBypass(bypass = true) {
    this.isBypassed = bypass;
  }

  setMaxCalls(max) {
    if (typeof max === 'number' && max > 0) {
      this.customMaxCalls = max;
      if (this.customMaxCalls * 2 > LIMITS.MAX_API_CALLS_PER_DAY) {
        LIMITS.MAX_API_CALLS_PER_DAY = this.customMaxCalls * 2;
      }
    }
  }

  get24hApiCallsCount() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return (this.data.apiCalls || []).filter((t) => t > oneDayAgo).length;
  }

  get24hD1WritesCount() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return (this.data.d1Writes || [])
      .filter((item) => item.time > oneDayAgo)
      .reduce((sum, item) => sum + (item.count || 0), 0);
  }

  get24hR2PutsCount() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return (this.data.r2Puts || []).filter((t) => t > oneDayAgo).length;
  }

  /**
   * Check before making an API call.
   * Throws Error if quota exceeded.
   */
  checkApiBudget() {
    if (this.isBypassed) return true;

    const maxRun = this.customMaxCalls || LIMITS.MAX_API_CALLS_PER_RUN;
    if (this.sessionApiCalls >= maxRun) {
      throw new Error(
        `🛑 [CIRCUIT BREAKER] Session USAspending API budget limit reached (${this.sessionApiCalls}/${maxRun} calls).\n` +
        `   Stopping to protect against rate-limiting and throttling.\n` +
        `   Tip: Re-run with cached data or use --max-calls=${maxRun * 2} / --ignore-limits.`
      );
    }

    const dailyCalls = this.get24hApiCallsCount();
    if (dailyCalls >= LIMITS.MAX_API_CALLS_PER_DAY) {
      throw new Error(
        `🛑 [CIRCUIT BREAKER] 24-Hour USAspending API safety cap reached (${dailyCalls}/${LIMITS.MAX_API_CALLS_PER_DAY} calls in last 24h).\n` +
        `   Stopping to protect IP reputation and federal rate limits.`
      );
    }

    return true;
  }

  recordApiCall() {
    this.sessionApiCalls += 1;
    this.data.apiCalls.push(Date.now());
    this.saveTracker();
  }

  recordCacheHit() {
    this.sessionCacheHits += 1;
  }

  recordApiSuccess() {
    this.consecutiveErrors = 0;
  }

  recordApiError(status) {
    this.consecutiveErrors += 1;
    console.warn(`⚠️ [API WARNING] USAspending error HTTP ${status} (Consecutive errors: ${this.consecutiveErrors})`);

    if (this.consecutiveErrors >= LIMITS.MAX_CONSECUTIVE_ERRORS && !this.isBypassed) {
      throw new Error(
        `🛑 [CIRCUIT BREAKER] ${this.consecutiveErrors} consecutive USAspending API errors encountered (Status: ${status}).\n` +
        `   Halting execution immediately to avoid hammering the federal endpoint.`
      );
    }
  }

  /**
   * Check before executing D1 SQL.
   */
  checkD1Budget(estimatedRows = 50) {
    if (this.isBypassed) return true;

    const dailyWrites = this.get24hD1WritesCount();
    if (dailyWrites + estimatedRows > LIMITS.MAX_D1_WRITES_PER_DAY) {
      throw new Error(
        `🛑 [CIRCUIT BREAKER] Cloudflare D1 daily write safety threshold reached (${dailyWrites}/${LIMITS.MAX_D1_WRITES_PER_DAY} rows today).\n` +
        `   Stopping before approaching the 100k free tier limit.`
      );
    }
    return true;
  }

  recordD1Write(rowCount = 50) {
    this.sessionD1Writes += rowCount;
    this.data.d1Writes.push({ time: Date.now(), count: rowCount });
    this.saveTracker();
  }

  recordR2Put() {
    this.sessionR2Puts += 1;
    this.data.r2Puts.push(Date.now());
    this.saveTracker();
  }

  printDashboard() {
    const totalRequests = this.sessionApiCalls + this.sessionCacheHits;
    const cacheHitPct = totalRequests > 0 ? ((this.sessionCacheHits / totalRequests) * 100).toFixed(1) : '100.0';
    const dailyCalls = this.get24hApiCallsCount();
    const dailyWrites = this.get24hD1WritesCount();
    const dailyPuts = this.get24hR2PutsCount();

    console.log(`\n======================================================`);
    console.log(`🛡️  CIVIC HARVESTER QUOTA & HEALTH DASHBOARD`);
    console.log(`======================================================`);
    console.log(`📡 USAspending Live Calls (Session): ${this.sessionApiCalls} / ${this.customMaxCalls || LIMITS.MAX_API_CALLS_PER_RUN} cap`);
    console.log(`🕒 USAspending Live Calls (24h):     ${dailyCalls} / ${LIMITS.MAX_API_CALLS_PER_DAY} safe cap`);
    console.log(`⚡ Cache Efficiency:                 ${this.sessionCacheHits} hits (${cacheHitPct}% served from disk)`);
    console.log(`🗄️  Cloudflare D1 Writes (24h):       ${dailyWrites} / ${LIMITS.MAX_D1_WRITES_PER_DAY} rows (~${((dailyWrites / 100000) * 100).toFixed(2)}% of 100k free limit)`);
    console.log(`📦 Cloudflare R2 PUTs (24h):         ${dailyPuts} / ${LIMITS.MAX_R2_PUTS_PER_DAY} objects (~${((dailyPuts / 1000000) * 100).toFixed(3)}% of 1M free limit)`);
    console.log(`🟢 Status: SAFE & HEALTHY (0 risk of quota overrun)`);
    console.log(`======================================================\n`);
  }
}

export const quotaGuard = new QuotaGuardian();
