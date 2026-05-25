# Epic: Tool parity and pen authoring

Cross-cutting work to narrow gaps vs common vector editors (Figma, Illustrator, Inkscape). **Does not extend closed epics** ([shape-transforms](./shape-transforms.md), [pen-path-tool](./pen-path-tool.md), etc.); this epic owned new beads only.

**Scope split (2026-05-25):** Boolean path ops (**TP-5** / `svg-editor-0zh`), symbols (**TP-6** / `svg-editor-hya`), and elliptical arc work (**PPEN-7** / `svg-editor-j24.7`) **moved out** — see [boolean-path-operations](./boolean-path-operations.md), [symbols-reusable-instances](./symbols-reusable-instances.md) (post-MVP), and [arc-shape-tool](./arc-shape-tool.md). **`svg-editor-j24` closed in `bd` 2026-05-25** after `0zh` / `hya` were promoted to root **epic** beads.

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Epic: Tool parity and pen authoring |
| **Goal** | Ship transform/readout parity items and pen-authoring parity items as independent child issues; keep acceptance testable per child. |
| **Labels** | `roadmap`, `tool-parity`, `pen`, `transforms` |
| **Type** | `epic` |
| **bd id** | `svg-editor-j24` |

## Completion status (beads)

**Epic `svg-editor-j24`:** **CLOSED** in `bd` (2026-05-25). Former direct children were 12 closed features + 2 migrated epics; see migration table below.

| Status | Issue |
|--------|--------|
| ✓ Closed | `svg-editor-e9a`, `svg-editor-269`, `svg-editor-zc7`, `svg-editor-jqe`, `svg-editor-j24.1`, `svg-editor-j24.2`, `svg-editor-j24.3`, `svg-editor-j24.4`, `svg-editor-j24.5`, `svg-editor-j24.6`, `svg-editor-j24.8`, `svg-editor-j24.9` |

## Migrated work (no longer children of `svg-editor-j24`)

| Was | bd id | New home |
|-----|-------|----------|
| TP-5 Boolean path operations | `svg-editor-0zh` | [boolean-path-operations](./boolean-path-operations.md) — **this bead is the epic** (`type=epic`, root parent) |
| TP-6 Symbols / reusable instances | `svg-editor-hya` | [symbols-reusable-instances](./symbols-reusable-instances.md) — **this bead is the epic** (`type=epic`, root parent) |
| PPEN-7 Elliptical arc | `svg-editor-j24.7` | [arc-shape-tool](./arc-shape-tool.md) (phase 3 epic; **Arc tool**, not pen-only) |

## Child issues — transform / UI parity

| Local ref | Title | bd id | Type | Status | Notes |
|-----------|--------|-------|------|--------|-------|
| TP-1 | Non-uniform selection resize (edge handles + modifier parity) | `svg-editor-e9a` | feature | ✓ Closed | [`selection-resize.ts`](../../src/app/utils/selection-resize.ts), [`resize-gesture.ts`](../../src/app/components/svg-canvas/gestures/resize-gesture.ts) |
| TP-2 | Editable numeric selection bbox (X/Y/W/H) in properties panel | `svg-editor-jqe` | feature | ✓ Closed | Numeric edits use `TranslateCommand` / `UnionScaleCommand` / `UnionRotateCommand`; rapid edits **coalesce** within `EditorHistoryService`’s time window (same keys as canvas transforms). |
| TP-3 | Eyedropper: sample fill/stroke from canvas | `svg-editor-zc7` | feature | ✓ Closed | Canvas pick → properties |
| TP-4 | Stroke scaling policy when transforming selection | `svg-editor-269` | feature | ✓ Closed | `vector-effect` / product toggle |

## Child issues — pen authoring parity

Pen baseline today: [`PenSession`](../../src/app/models/pen-path.ts) (`M`/`L`/`C`), [`svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) (rubber-band, double-click close, Enter finish, Escape discard, RMB finish). UX comparison: [`bezier-anchor-handle-interactions.md`](../ux/bezier-anchor-handle-interactions.md).

| Local ref | Title | bd id | Type | Status | Notes |
|-----------|--------|-------|------|--------|-------|
| PPEN-1 | Pen: corner/smooth modifiers while drawing (Illustrator-style) | `svg-editor-j24.1` | feature | ✓ Closed | v1: Shift 45° constraint; Alt/Option drag breaks symmetry; Cmd/Ctrl temp snap off; deeper chord semantics may land under `svg-editor-bmy` if still used for modifier matrix |
| PPEN-2 | Pen: quadratic and smooth shorthand (Q / S / T) authoring (phase 1) | `svg-editor-j24.2` | feature | ✓ Closed | Phase 1 only; elliptical **`A`/`a`** → dedicated [arc shape tool](./arc-shape-tool.md) epic |
| PPEN-3 | Pen: single-click close path (click first anchor / start point) | `svg-editor-j24.3` | feature | ✓ Closed | Fixed screen-space hit radius (~8px) around start anchor; hover affordance; close on pointer-up if still inside (avoids drag-through accidents); adds `Z` |
| PPEN-4 | Pen: Backspace removes last committed anchor during session | `svg-editor-j24.4` | feature | ✓ Closed | Pop last segment; M-only → exit pen session (no degenerate commit); Escape still full discard |
| PPEN-5 | Pen: continue or join open paths (endpoint hit-target) | `svg-editor-j24.5` | feature | ✓ Closed | ~8px endpoint tolerance (shared w/ PPEN-3); join highlight; pointer-up merge → one `<path>` + one `d`; resume when session empty; no distant welds |
| PPEN-6 | Pen: adjust last segment handles before next anchor | `svg-editor-j24.6` | feature | ✓ Closed | v1: drag visible outgoing handles from rubber-band only; no invisible anchor slab |
| PPEN-8 | Pen session: preview path uses active stroke color and stroke width | `svg-editor-j24.8` | feature | ✓ Closed | Child of `svg-editor-j24` in bd |
| PPEN-9 | Pen: click-drag new point should behave like anchor curve drag | `svg-editor-j24.9` | feature | ✓ Closed | Child of `svg-editor-j24` in bd |

## Exit criteria

- Each in-scope child issue was claimable and closable with its own acceptance criteria in `bd`.
- Epic **`svg-editor-j24` closed** 2026-05-25 with booleans/symbols split to epics `svg-editor-0zh` and `svg-editor-hya`.

## Code touchpoints (by theme)

- **TP-1–TP-2:** [`svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts), [`properties-panel`](../../src/app/components/properties-panel/), [`editor-commands.ts`](../../src/app/models/editor-commands.ts), [`svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts)
- **TP-3–TP-4:** Canvas hit-testing, color pipeline, stroke/transform attributes
- **PPEN-1–PPEN-9 (in-epic):** [`pen-path.ts`](../../src/app/models/pen-path.ts), [`path-pen-insert.ts`](../../src/app/models/path-pen-insert.ts), pen handlers and overlays in [`svg-canvas`](../../src/app/components/svg-canvas/)

## Notes

- Free-standing **`svg-editor-j1a`** (artboard resize anchor) — **DONE** (closed in `bd`); link from [canvas-artboard](./canvas-artboard.md) / roadmap.
- Original pen MVP epic remains **closed**; this epic was **follow-on parity**, not a reopen of `svg-editor-tfs`.
- **`svg-editor-bmy`:** If it only tracked arc (`j24.7`), close it when arc epic owns that bead; if it still tracks broader “modifier/chord matrix” work, keep it separate from [arc-shape-tool](./arc-shape-tool.md).
