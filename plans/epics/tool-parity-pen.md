# Epic: Tool parity and pen authoring

Cross-cutting work to narrow gaps vs common vector editors (Figma, Illustrator, Inkscape). **Does not extend closed epics** ([shape-transforms](./shape-transforms.md), [pen-path-tool](./pen-path-tool.md), etc.); this epic owns new beads only.

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Epic: Tool parity and pen authoring |
| **Goal** | Ship transform/readout parity items and pen-authoring parity items as independent child issues; keep acceptance testable per child. |
| **Labels** | `roadmap`, `tool-parity`, `pen`, `transforms` |
| **Type** | `epic` |
| **bd id** | `svg-editor-j24` |

## Child issues — transform / UI parity

| Local ref | Title | bd id | Type | Notes |
|-----------|--------|-------|------|-------|
| TP-1 | Non-uniform selection resize (edge handles + modifier parity) | `svg-editor-e9a` | feature | [`selection-resize.ts`](../../src/app/utils/selection-resize.ts), [`resize-gesture.ts`](../../src/app/components/svg-canvas/gestures/resize-gesture.ts) |
| TP-2 | Editable numeric selection bbox (X/Y/W/H) in properties panel | `svg-editor-jqe` | feature | Read-only readouts today |
| TP-3 | Eyedropper: sample fill/stroke from canvas | `svg-editor-zc7` | feature | Canvas pick → properties |
| TP-4 | Stroke scaling policy when transforming selection | `svg-editor-269` | feature | `vector-effect` / product toggle |
| TP-5 | Boolean path operations (union / subtract / intersect) | `svg-editor-0zh` | feature | Spike-first; heavy scope |
| TP-6 | Symbols or reusable instances | `svg-editor-hya` | feature | Discovery epic; children later |

## Child issues — pen authoring parity

Pen baseline today: [`PenSession`](../../src/app/models/pen-path.ts) (`M`/`L`/`C`), [`svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) (rubber-band, double-click close, Enter finish, Escape discard, RMB finish). UX comparison: [`bezier-anchor-handle-interactions.md`](../ux/bezier-anchor-handle-interactions.md).

| Local ref | Title | bd id | Type | Notes |
|-----------|--------|-------|------|-------|
| PPEN-1 | Pen: corner/smooth modifiers while drawing (Illustrator-style) | `svg-editor-j24.1` | feature | Alt/Shift semantics vs snap-only today |
| PPEN-2 | Pen: quadratic, arc, and smooth shorthand (Q / A / S / T) authoring | `svg-editor-j24.2` | feature | Beyond `M`/`L`/`C` pen session |
| PPEN-3 | Pen: single-click close path (click first anchor / start point) | `svg-editor-j24.3` | feature | Tolerance hit-test + `Z` |
| PPEN-4 | Pen: Backspace removes last committed anchor during session | `svg-editor-j24.4` | feature | Without clearing whole path |
| PPEN-5 | Pen: continue or join open paths (endpoint hit-target) | `svg-editor-j24.5` | feature | Resume subpath / join endpoints |
| PPEN-6 | Pen: adjust last segment handles before next anchor | `svg-editor-j24.6` | feature | Outgoing tangent before next click |

## Exit criteria

- Each child issue can be claimed and closed independently with its own acceptance criteria in `bd`.
- Epic closes when all children are closed (or remaining work is explicitly superseded/moved).

## Code touchpoints (by theme)

- **TP-1–TP-2:** [`svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts), [`properties-panel`](../../src/app/components/properties-panel/), [`editor-commands.ts`](../../src/app/models/editor-commands.ts), [`svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts)
- **TP-3–TP-4:** Canvas hit-testing, color pipeline, stroke/transform attributes
- **TP-5–TP-6:** Path geometry, defs, architecture spikes
- **PPEN-1–PPEN-6:** [`pen-path.ts`](../../src/app/models/pen-path.ts), [`path-pen-insert.ts`](../../src/app/models/path-pen-insert.ts), pen handlers and overlays in [`svg-canvas`](../../src/app/components/svg-canvas/)

## Notes

- Free-standing **`svg-editor-j1a`** (artboard resize anchor) remains outside this epic; link from [canvas-artboard](./canvas-artboard.md) / roadmap if desired.
- Original pen MVP epic remains **closed**; this epic is **follow-on parity**, not a reopen of `svg-editor-tfs`.
