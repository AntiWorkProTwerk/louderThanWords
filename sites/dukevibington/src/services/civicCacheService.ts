// Civic Data Smart Caching & Request Coalescing Service
// Multi-tier: Memory Cache + SessionStorage persistence + Request Deduplication + TTL Invalidation

interface CacheEnvelope<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export const CACHE_TTL = {
  SHORT: 5 * 60 * 1000, // 5 minutes (rapidly changing queries)
  API_AWARDS: 60 * 60 * 1000, // 1 hour (USAspending API award queries)
  API_TRANSACTIONS: 2 * 60 * 60 * 1000, // 2 hours (USAspending modification ledgers)
  CONGRESS_MEMBERS: 24 * 60 * 60 * 1000, // 24 hours (Bioguide directory)
  GEO_BOUNDARIES: 7 * 24 * 60 * 60 * 1000, // 7 days (US Census TopoJSON)
};

class CivicCacheService {
  private memoryCache = new Map<string, CacheEnvelope<any>>();
  private inflightRequests = new Map<string, Promise<any>>();
  private storagePrefix = 'ltw_civic_cache_v2_';

  constructor() {
    // Purge legacy cache keys from sessionStorage if present
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const legacyKeys: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith('ltw_civic_cache_') && !k.startsWith('ltw_civic_cache_v2_')) {
            legacyKeys.push(k);
          }
        }
        legacyKeys.forEach((k) => window.sessionStorage.removeItem(k));
      } catch {
        // Ignore
      }
    }
  }

  // Recursive deterministic JSON serializer that preserves and sorts all nested object keys
  private canonicalStringify(obj: any): string {
    if (obj === null || obj === undefined) return String(obj);
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.canonicalStringify(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${this.canonicalStringify(obj[key])}`);
    return '{' + entries.join(',') + '}';
  }

  // Compute deterministic collision-resistant cache key from arbitrary objects
  public hashKey(prefix: string, payload: any): string {
    if (typeof payload === 'string') return `${prefix}:${payload}`;
    try {
      const serialized = this.canonicalStringify(payload);
      let hash = 2166136261;
      for (let i = 0; i < serialized.length; i++) {
        hash ^= serialized.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return `${prefix}:${(hash >>> 0).toString(16)}`;
    } catch {
      return `${prefix}:${String(payload)}`;
    }
  }

  // Get from in-memory or sessionStorage
  public get<T>(key: string): T | null {
    const now = Date.now();

    // 1. Check in-memory
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem) {
      if (now - memoryItem.timestamp < memoryItem.ttl) {
        return memoryItem.data as T;
      }
      this.memoryCache.delete(key);
    }

    // 2. Check sessionStorage if available
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const itemStr = window.sessionStorage.getItem(this.storagePrefix + key);
        if (itemStr) {
          const envelope: CacheEnvelope<T> = JSON.parse(itemStr);
          if (now - envelope.timestamp < envelope.ttl) {
            // Repopulate memory cache for speed
            this.memoryCache.set(key, envelope);
            return envelope.data;
          }
          window.sessionStorage.removeItem(this.storagePrefix + key);
        }
      } catch {
        // Ignore JSON/Storage errors
      }
    }

    return null;
  }

  // Set item in memory & sessionStorage
  public set<T>(key: string, data: T, ttl: number = CACHE_TTL.API_AWARDS): void {
    const envelope: CacheEnvelope<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    this.memoryCache.set(key, envelope);

    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.setItem(this.storagePrefix + key, JSON.stringify(envelope));
      } catch {
        // Quota exceeded or private browsing, safe to ignore
      }
    }
  }

  // Request deduplicating cached fetcher
  public async fetchCached<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = CACHE_TTL.API_AWARDS
  ): Promise<T> {
    // 1. Check existing cache
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // 2. Check in-flight request
    const existingPromise = this.inflightRequests.get(key);
    if (existingPromise) {
      return existingPromise as Promise<T>;
    }

    // 3. Initiate request with coalescing
    const requestPromise = (async () => {
      try {
        const result = await fetcher();
        if (result !== undefined && result !== null) {
          this.set<T>(key, result, ttl);
        }
        return result;
      } finally {
        this.inflightRequests.delete(key);
      }
    })();

    this.inflightRequests.set(key, requestPromise);
    return requestPromise;
  }

  // Cached POST request wrapper for JSON APIs like USAspending
  public async postCached<T>(
    url: string,
    body: any,
    ttl: number = CACHE_TTL.API_AWARDS,
    headers: Record<string, string> = { 'Content-Type': 'application/json' }
  ): Promise<T> {
    const key = this.hashKey(`post:${url}`, body);

    return this.fetchCached<T>(
      key,
      async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as T;
      },
      ttl
    );
  }

  // Clear all caches
  public clear(): void {
    this.memoryCache.clear();
    this.inflightRequests.clear();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(this.storagePrefix)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch {
        // Ignore
      }
    }
  }
}

export const civicCache = new CivicCacheService();
