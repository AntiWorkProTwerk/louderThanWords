// Opt-in, local-only measurement. No analytics endpoint, cookies or beacons.
// Shared by the lab runner and manual-device report UI.
export function startDiagnostics() {
  const observers: PerformanceObserver[] = [];
  const interactions = new Map<number, number>();
  let lcp: number | null = null,
    cls = 0,
    firstInput: number | null = null;
  let sessionValue = 0,
    sessionStart = 0,
    lastShift = 0;
  const observe = (type: string, callback: (entry: any) => void, options = {}) => {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
    const observer = new PerformanceObserver((list) => list.getEntries().forEach(callback));
    observer.observe({ type, buffered: true, ...options });
    observers.push(observer);
  };
  observe('largest-contentful-paint', (e) => {
    lcp = e.startTime;
  });
  observe('layout-shift', (e) => {
    if (e.hadRecentInput) return;
    if (e.startTime - lastShift > 1000 || e.startTime - sessionStart > 5000) {
      sessionStart = e.startTime;
      sessionValue = 0;
    }
    sessionValue += e.value;
    lastShift = e.startTime;
    cls = Math.max(cls, sessionValue);
  });
  observe('first-input', (e) => {
    firstInput = e.duration;
  });
  observe(
    'event',
    (e) => {
      if (e.interactionId)
        interactions.set(
          e.interactionId,
          Math.max(interactions.get(e.interactionId) ?? 0, e.duration),
        );
    },
    { durationThreshold: 16 },
  );
  const snapshot = () => {
    const durations = [...interactions.values()].sort((a, b) => b - a);
    const count = (performance as any).interactionCount ?? interactions.size;
    return {
      lcpMs: lcp,
      cls,
      inpEstimateMs: durations.length
        ? durations[Math.min(durations.length - 1, Math.floor(count / 50))]
        : firstInput,
      interactionCount: count,
      interactionDurationsMs: durations,
      supportedEntries: PerformanceObserver.supportedEntryTypes,
      note: 'A local session measurement, not field p75. INP estimate omits cross-origin frames and bfcache attribution. No events or source text are transmitted.',
    };
  };
  return { snapshot, stop: () => observers.forEach((o) => o.disconnect()) };
}

export function sampleFrames(durationMs = 1200) {
  return new Promise<number[]>((resolve) => {
    const deltas: number[] = [];
    let previous: number | null = null,
      start = performance.now();
    const frame = (now: number) => {
      if (previous !== null) deltas.push(now - previous);
      previous = now;
      if (now - start < durationMs) requestAnimationFrame(frame);
      else resolve(deltas);
    };
    requestAnimationFrame(frame);
  });
}
