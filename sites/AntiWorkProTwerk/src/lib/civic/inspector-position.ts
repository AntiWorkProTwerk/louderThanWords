/** Viewport placement for a fixed, nonmodal inspector. No content measurement loop. */
export function inspectorPosition(
  anchor: { left: number; top: number; bottom: number },
  width: number,
  height: number,
) {
  if (
    ![anchor.left, anchor.top, anchor.bottom, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    anchor.bottom < anchor.top
  )
    throw new Error('Inspector placement requires a finite viewport and anchor');
  const margin = Math.min(12, width / 4, height / 4);
  const panelWidth = Math.min(330, width - 2 * margin);
  const left = Math.max(margin, Math.min(anchor.left, width - panelWidth - margin));
  const top = Math.max(0, Math.min(anchor.top, height));
  const bottom = Math.max(0, Math.min(anchor.bottom, height));
  const above = Math.max(0, top - 2 * margin);
  const below = Math.max(0, height - bottom - 2 * margin);
  const minimum = Math.min(260, height - 2 * margin);
  if (Math.max(above, below) < minimum)
    return {
      left,
      width: panelWidth,
      top: margin,
      bottom: null,
      maxHeight: height - 2 * margin,
      side: 'viewport' as const,
    };
  return above >= below
    ? {
        left,
        width: panelWidth,
        top: null,
        bottom: height - top + margin,
        maxHeight: Math.min(650, above),
        side: 'above' as const,
      }
    : {
        left,
        width: panelWidth,
        top: bottom + margin,
        bottom: null,
        maxHeight: Math.min(650, below),
        side: 'below' as const,
      };
}
