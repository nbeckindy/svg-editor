# Epic: Always-visible paint defaults

Keep fill color, stroke color, and stroke width controls always visible so users can preselect styles before drawing, while preserving existing selection-edit behavior.

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Epic: Always-visible paint defaults |
| **Goal** | Ship a single contextual paint UI that always shows fill/stroke/stroke-width controls, with canonical defaults wired through all creation paths and undo/redo-safe defaults sync. |
| **Labels** | `roadmap`, `ui`, `styling` |
| **Type** | `epic` |
| **bd id** | `svg-editor-6g0` |

## Child issues

| Local ref | Title | bd id | Type | Notes |
|-----------|--------|-------|------|-------|
| AP-1 | Add drawing style defaults service | `svg-editor-6g0.1` | feature | Signal-backed canonical defaults state for fill/stroke/stroke-width |
| AP-2 | Make paint edits undoable with defaults sync | `svg-editor-6g0.2` | feature | Defaults updates modeled as commands and composed with selection paint edits |
| AP-3 | Keep fill/stroke color controls and stroke width always visible | `svg-editor-9i5` | feature | Unified contextual paint UI in properties panel |
| AP-4 | Apply defaults across creation tools | `svg-editor-6g0.3` | feature | Rect/ellipse/line/text/pen mapping to canonical defaults |
| AP-5 | Add regression and integration coverage for paint defaults flow | `svg-editor-6g0.4` | task | Service, UI, creation flow, and mixed-state regression tests |

## Dependencies (child level)

- `svg-editor-9i5` depends on `svg-editor-6g0.1` and `svg-editor-6g0.2`
- `svg-editor-6g0.3` depends on `svg-editor-6g0.1` and `svg-editor-6g0.2`
- `svg-editor-6g0.4` depends on `svg-editor-9i5` and `svg-editor-6g0.3`

## Code touchpoints

- [`../../src/app/components/properties-panel/`](../../src/app/components/properties-panel/)
- [`../../src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts)
- [`../../src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts)
- [`../../src/app/components/svg-canvas/gestures/creation-gesture.ts`](../../src/app/components/svg-canvas/gestures/creation-gesture.ts)
- [`../../src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts)

## Exit criteria

- Fill, stroke, and stroke-width controls are always visible.
- With selection: paint edits apply to selection and sync defaults in one undo transaction.
- With no selection: paint edits update defaults used by subsequent creation tools.
- Creation flows (rect, ellipse, line, text, pen) consume defaults with agreed tool-specific mapping.
