# 05 — Motion language

## Established direction

- Motion is a primary part of the experience, not incidental decoration.
- Entry motion is tonal: the background moves from black to white while the white title holds its hover size and disappears through loss of contrast.
- The national map reveals one unified boundary mesh in breadth-first geographic regions, beginning at Kansas and expanding through neighboring states.
- Map navigation preserves spatial continuity by moving the existing 2D plane.
- Hover motion is smaller and faster than navigation motion.
- Interactions remain interruptible; users do not wait for an animation before they can return.

## Reduced motion

- Automatic reduced-motion behavior is temporarily disabled while the prototype's motion is being reviewed.
- Before release, provide a reduced-motion treatment that preserves every interaction and final visual state.

## Open

- Exact durations and easing curves remain subject to browser review.

## Current timing

- Background transition: 1500ms.
- Navbar entrance: 500-720ms after the white surface is reached.
- Boundary-region reveal: 360ms per breadth-first region.
- Breadth-first layer stagger: 125ms per adjacency step.
- State fill: 440ms, beginning after its corresponding boundary region is visible.
