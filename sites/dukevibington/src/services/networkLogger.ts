export interface NetworkLogEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  category: 'Google Civic API' | 'Census TIGERweb' | 'Nominatim Geocoding' | 'Google Maps' | 'Cache (Memory/Storage)' | 'Cloudflare D1' | 'External Network';
  status: 'PENDING' | 'SUCCESS' | 'CACHE_HIT' | 'ERROR';
  statusCode?: number;
  durationMs?: number;
  requestPayload?: any;
  responsePayload?: any;
  errorMessage?: string;
  sizeBytes?: number;
}

type NetworkListener = (logs: NetworkLogEntry[]) => void;

class NetworkActivityManager {
  private logs: NetworkLogEntry[] = [];
  private listeners: Set<NetworkListener> = new Set();
  private isInitialized = false;

  constructor() {
    this.initGlobalFetchInterceptor();
  }

  public subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const copy = [...this.logs];
    this.listeners.forEach((l) => l(copy));
  }

  public logEvent(entry: Omit<NetworkLogEntry, 'id' | 'timestamp'>): string {
    const id = `net-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const fullEntry: NetworkLogEntry = {
      ...entry,
      id,
      timestamp: new Date().toLocaleTimeString(),
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > 200) {
      this.logs.pop();
    }

    // Rich Console Output
    this.printToConsole(fullEntry);
    this.notify();
    return id;
  }

  public updateEvent(id: string, updates: Partial<NetworkLogEntry>) {
    const index = this.logs.findIndex((l) => l.id === id);
    if (index !== -1) {
      this.logs[index] = { ...this.logs[index], ...updates };
      this.printToConsole(this.logs[index]);
      this.notify();
    }
  }

  public clear() {
    this.logs = [];
    this.notify();
    console.log('%c[NETWORK-LOGGER] Cleared network history', 'color:#94a3b8');
  }

  public getLogs(): NetworkLogEntry[] {
    return [...this.logs];
  }

  private printToConsole(entry: NetworkLogEntry) {
    const isError = entry.status === 'ERROR';
    const isCache = entry.status === 'CACHE_HIT';

    const tagStyle = isCache
      ? 'background: #065f46; color: #34d399; font-weight: bold; padding: 2px 6px; border-radius: 4px;'
      : isError
      ? 'background: #881337; color: #f43f5e; font-weight: bold; padding: 2px 6px; border-radius: 4px;'
      : 'background: #312e81; color: #818cf8; font-weight: bold; padding: 2px 6px; border-radius: 4px;';

    const metaStyle = 'color: #94a3b8; font-family: monospace; font-size: 11px;';
    const urlStyle = 'color: #38bdf8; font-family: monospace; font-weight: bold;';

    console.groupCollapsed(
      `%c[NET: ${entry.category}]%c ${entry.method} %c${entry.url.split('?')[0]} %c[${entry.status} ${entry.durationMs ? `${entry.durationMs}ms` : ''}]`,
      tagStyle,
      'color: #f8fafc; font-weight: bold;',
      urlStyle,
      metaStyle
    );
    console.log('Full URL:', entry.url);
    console.log('Status:', entry.status, entry.statusCode ? `(${entry.statusCode})` : '');
    console.log('Duration:', entry.durationMs ? `${entry.durationMs} ms` : 'N/A');
    if (entry.requestPayload) console.log('Request Payload:', entry.requestPayload);
    if (entry.responsePayload) console.log('Response Payload:', entry.responsePayload);
    if (entry.errorMessage) console.error('Error:', entry.errorMessage);
    console.groupEnd();
  }

  private categorizeUrl(url: string): NetworkLogEntry['category'] {
    const u = url.toLowerCase();
    if (u.includes('civicinfo.googleapis.com')) return 'Google Civic API';
    if (u.includes('tigerweb.geo.census.gov')) return 'Census TIGERweb';
    if (u.includes('nominatim.openstreetmap.org')) return 'Nominatim Geocoding';
    if (u.includes('maps.googleapis.com')) return 'Google Maps';
    if (u.includes('/api/civic/cache')) return 'Cloudflare D1';
    return 'External Network';
  }

  private initGlobalFetchInterceptor() {
    if (typeof window === 'undefined' || this.isInitialized) return;
    this.isInitialized = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET').toUpperCase();
      const category = this.categorizeUrl(urlString);
      const startTime = performance.now();

      const logId = this.logEvent({
        method,
        url: urlString,
        category,
        status: 'PENDING',
        requestPayload: init?.body ? String(init.body) : undefined,
      });

      try {
        const response = await originalFetch(input, init);
        const durationMs = Math.round(performance.now() - startTime);

        // Clone response to inspect body without consuming it
        let responsePreview: any = null;
        try {
          const clone = response.clone();
          const contentType = clone.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            responsePreview = await clone.json();
          }
        } catch (e) {
          // Non-JSON or streaming response
        }

        this.updateEvent(logId, {
          status: response.ok ? 'SUCCESS' : 'ERROR',
          statusCode: response.status,
          durationMs,
          responsePayload: responsePreview,
        });

        return response;
      } catch (err: any) {
        const durationMs = Math.round(performance.now() - startTime);
        this.updateEvent(logId, {
          status: 'ERROR',
          durationMs,
          errorMessage: err?.message || String(err),
        });
        throw err;
      }
    };
  }
}

export const networkLogger = new NetworkActivityManager();
