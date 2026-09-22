type PlotPoint = { code: string; name: string; x: number; y: number };

/** Ordered axis browsing reaches even coincident dots; it never changes selection. */
export function nextPlotPoint(points: PlotPoint[], code: string, key: string): string | null {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key))
    return null;
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const alphabetical = key === 'Home' || key === 'End';
  const ordered = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .toSorted(
      (a, b) =>
        (alphabetical ? 0 : horizontal ? a.x - b.x : a.y - b.y) ||
        a.name.localeCompare(b.name) ||
        a.code.localeCompare(b.code),
    );
  if (!ordered.length) return null;
  if (key === 'Home') return ordered[0].code;
  if (key === 'End') return ordered.at(-1)!.code;
  const index = ordered.findIndex((point) => point.code === code);
  if (index < 0) return ordered[0].code;
  const step = key === 'ArrowRight' || key === 'ArrowUp' ? 1 : -1;
  return ordered[Math.max(0, Math.min(ordered.length - 1, index + step))].code;
}
