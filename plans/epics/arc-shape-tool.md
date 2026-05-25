# Epic: Elliptical arc shape tool

First-class **Arc tool** in the creation toolbar **alongside rectangle and circle** (not only as pen path `A`/`a` segments). Users place elliptical arcs as shapes with the same affordances as other primitive tools: tool mode, rubber-band preview, commit to `<path>` (or dedicated representation) with correct SVG `A`/`a` semantics and undo integration.

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Epic: Elliptical arc shape tool |
| **Goal** | Ship a dedicated arc authoring tool that matches design-tool expectations and round-trips cleanly with the existing path model. |
| **Labels** | `roadmap`, `paths`, `shape-creation`, `tool-parity` |
| **Type** | `epic` |
| **bd id** | `TBD` — consolidate feature bead **`svg-editor-j24.7`** (formerly PPEN-7) here; **retire or close** umbrella `svg-editor-bmy` (“pen parity follow-up”) if its only child was arc-only work. |

## Relationship to prior roadmap

Elliptical arc work was previously tracked as **PPEN-7** under pen parity (`svg-editor-j24.7`, parent `svg-editor-bmy`). Product direction is now an **Arc shape tool** parallel to rect/circle, not pen-session-only authoring.

Geometry and flag semantics remain aligned with [`pen-elliptical-arc-authoring.md`](../spikes/pen-elliptical-arc-authoring.md).

## Dependencies

- Closed pen Q/S/T phase 1 (`svg-editor-j24.2`) — path session/parser stability (already satisfied).
- [Shape creation](./shape-creation.md) patterns for toolbar activation, defaults, and commit flows.

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Notes |
|-----------|--------|-------|------|-------|
| ARC-1 | Elliptical arc (`A`) — spike + implementation (shape tool) | `svg-editor-j24.7` | feature | Re-scope acceptance: Arc **tool** + optional later pen integration |

Additional beads (toolbar icon, hit targets, numeric readouts, tests) should be filed under this epic when splitting ARC-1.

## Exit criteria

- Arc tool selectable from creation toolbar next to rect/circle (exact layout TBD).
- Spike outcomes incorporated: parameterization, large-arc/sweep UX, stable `d` round-trip for representative cases.
- `bd` shows this epic as parent of `svg-editor-j24.7` (or superseding issue) with clear acceptance in the bead.

## Code touchpoints (initial)

- Shape tool registration and toolbar (same area as rectangle/circle tools)
- [`pen-path.ts`](../../src/app/models/pen-path.ts) / [`path-pen-insert.ts`](../../src/app/models/path-pen-insert.ts) — reuse arc math and serialization paths where shared; **new** arc tool session model if cleaner than overloading pen
- [`svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — pointer routing for new tool

## Beads hygiene

1. Create epic bead `TBD` in `bd`.
2. Reparent `svg-editor-j24.7` from `svg-editor-bmy` (or wherever it lives) to the new epic.
3. If `svg-editor-bmy` has no other children, close it with note pointing to this epic.
