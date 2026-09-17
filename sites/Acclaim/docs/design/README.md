# Actions front-end flow

This directory contains small, composable interface specifications. Each file describes one visible state or transition. Together they define the first front-end flow:

```text
Entry -> Reveal -> Analyze
                    |-> National map -> State focus -> Federal officials
                    `-> Bill analysis -> Recorded votes
```

The specifications are the source of truth for design decisions. Items marked **Open** are intentionally undecided and should not be treated as established product requirements.

## Current specifications

1. [Entry](01-entry.md)
2. [Reveal transition](02-reveal.md)
3. [National map](03-national-map.md)
4. [State focus](04-state-focus.md)
5. [Motion language](05-motion-language.md)
6. [Responsive behavior](06-responsive-behavior.md)
7. [State officials panel](07-state-officials-panel.md)
8. [Presidential election layer](08-presidential-election-layer.md)
9. [Bill analysis](09-bill-analysis.md)
10. [State geography modes](10-state-geography-modes.md)
