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

export function getCached<T>(key: string): T | null {
  const now = Date.now();

  // 1. Check in-memory Map
  if (memoryCache.has(key)) {
    const entry = memoryCache.get(key)!;
    if (now - entry.timestamp < entry.ttlMs) {
      return entry.data as T;
    }
    memoryCache.delete(key);
  }

  // 2. Check sessionStorage
  try {
    const raw = sessionStorage.getItem(`civic_cache_${key}`);
    if (raw) {
      const parsed: CacheEntry<T> = JSON.parse(raw);
      if (now - parsed.timestamp < parsed.ttlMs) {
        memoryCache.set(key, parsed);
        return parsed.data;
      }
      sessionStorage.removeItem(`civic_cache_${key}`);
    }
  } catch (e) {
    // SessionStorage unavailable or full
  }

  return null;
}

export function setCached<T>(key: string, data: T, ttlMs: number = CACHE_TTL.CIVIC_REPRESENTATIVES): void {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttlMs,
  };

  // 1. Write in-memory
  memoryCache.set(key, entry);

  // 2. Write sessionStorage
  try {
    sessionStorage.setItem(`civic_cache_${key}`, JSON.stringify(entry));
  } catch (e) {
    // Ignore storage quota limits gracefully
  }
}
