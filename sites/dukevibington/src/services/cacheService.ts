import { networkLogger } from './networkLogger';

// Multi-tiered caching service: In-Memory -> SessionStorage -> LocalStorage -> Cloudflare D1

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

// Standard TTLs: 24 hours for representative records, 7 days for Census boundaries
export const CACHE_TTL = {
  CIVIC_REPRESENTATIVES: 24 * 60 * 60 * 1000, // 24 hours
  CENSUS_BOUNDARIES: 7 * 24 * 60 * 60 * 1000, // 7 days
  GEOCODING: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const CACHE_PREFIX = 'civic_v3_cdn_';

export function getCached<T>(key: string): T | null {
  const now = Date.now();
  const fullKey = `${CACHE_PREFIX}${key}`;

  // 1. Check in-memory Map
  if (memoryCache.has(fullKey)) {
    const entry = memoryCache.get(fullKey)!;
    if (now - entry.timestamp < entry.ttlMs) {
      // Reject any stale object that still has stock images
      const serialized = JSON.stringify(entry.data);
      if (!serialized.includes('unsplash.com')) {
        networkLogger.logEvent({
          method: 'GET',
          url: `cache://memory/${key}`,
          category: 'Cache (Memory/Storage)',
          status: 'CACHE_HIT',
          durationMs: 0,
          responsePayload: { cacheTier: 'In-Memory Map', key, ttlRemainingMs: entry.ttlMs - (now - entry.timestamp) },
        });
        return entry.data as T;
      }
    }
    memoryCache.delete(fullKey);
  }

  // 2. Check sessionStorage
  try {
    const raw = sessionStorage.getItem(fullKey);
    if (raw) {
      if (raw.includes('unsplash.com')) {
        sessionStorage.removeItem(fullKey);
      } else {
        const parsed: CacheEntry<T> = JSON.parse(raw);
        if (now - parsed.timestamp < parsed.ttlMs) {
          memoryCache.set(fullKey, parsed);
          networkLogger.logEvent({
            method: 'GET',
            url: `cache://sessionStorage/${key}`,
            category: 'Cache (Memory/Storage)',
            status: 'CACHE_HIT',
            durationMs: 1,
            responsePayload: { cacheTier: 'SessionStorage', key, sizeBytes: raw.length },
          });
          return parsed.data;
        }
        sessionStorage.removeItem(fullKey);
      }
    }
  } catch (e) {
    // SessionStorage unavailable or full
  }

  return null;
}

export function setCached<T>(key: string, data: T, ttlMs: number = CACHE_TTL.CIVIC_REPRESENTATIVES): void {
  const fullKey = `${CACHE_PREFIX}${key}`;
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttlMs,
  };

  // 1. Write in-memory
  memoryCache.set(fullKey, entry);

  // 2. Write sessionStorage
  try {
    const serialized = JSON.stringify(entry);
    sessionStorage.setItem(fullKey, serialized);
    networkLogger.logEvent({
      method: 'SET',
      url: `cache://storage/${key}`,
      category: 'Cache (Memory/Storage)',
      status: 'SUCCESS',
      durationMs: 1,
      requestPayload: { key, ttlMs, sizeBytes: serialized.length },
    });
  } catch (e) {
    // Ignore storage quota limits gracefully
  }
}

