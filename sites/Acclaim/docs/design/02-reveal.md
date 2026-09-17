# 02 — Reveal transition

## Purpose

Let the white title disappear into the white application surface without a flash or hard scene cut.

## Sequence

1. `Actions` remains at its hover size.
2. The entire background slowly transitions from black to white.
3. The unchanged white title loses contrast and blends into the white background.
4. Once the surface is fully white, the title is removed.
5. The navbar appears.
6. A unified boundary mesh is revealed outward from Kansas in adjacency-based breadth-first layers.
7. Each neutral-gray state fill and label settles in behind its completed outline.

## Visual rules

- The title never scales beyond its hover state after activation.
- The background changes as a single continuous field, without a white flash.
- The title disappears through decreasing contrast rather than a separate fade or blur.
- The application background is white.
- Navbar words, borders, and accents are black.
- State outlines are black during and after their draw animation.
- Shared borders are rendered once; adjacent state polygons do not draw overlapping strokes.

## Motion preference

- The prototype currently plays this transition for every visitor so its motion can be reviewed.
- A user-facing reduced-motion option is deferred until the main motion language is approved.

## Acceptance

- The screen reaches solid white before navigation and map drawing begin.
- The map is visibly constructed in geographic waves rather than appearing all at once.
- Fills never precede their corresponding outlines.
