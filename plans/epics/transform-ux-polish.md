# Epic: Transform and gesture UX polish

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Transform and gesture UX polish |
| **Goal** | Modifier-key gestures, escape cancel, zoom-adaptive handles, custom cursors, and read-only transform fields bring interaction parity with professional design tools. |
| **Labels** | `roadmap`, `post-mvp`, `transforms`, `ux` |
| **Type** | `epic` |
| **bd id** | `svg-editor-vfr` |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Priority | Depends on |
|-----------|--------|-------|------|----------|------------|
| TUX-1 | Escape cancels in-progress drag, resize, and rotate | `svg-editor-9aq` | `task` | P3 | — |
| TUX-2 | Shift+drag: constrain to H/V axis | `svg-editor-wpd` | `story` | P3 | — |
| TUX-3 | Shift+rotate: snap to 15-degree increments | `svg-editor-yse` | `story` | P3 | — |
| TUX-4 | Alt+resize: scale from center | `svg-editor-eh1` | `story` | P3 | — |
| TUX-5 | Selection handles adapt to zoom level | `svg-editor-tck` | `story` | P3 | — |
| TUX-6 | Read-only transform fields (X, Y, W, H, R) in properties panel | `svg-editor-bl4` | `story` | P3 | — |
| TUX-7 | Custom rotate cursor during rotation gesture | `svg-editor-8kn` | `story` | P4 | — |

## Prerequisites

`svg-editor-60f` (Extract gesture handlers from svg-canvas component) should land first. It restructures the ~1600-line canvas component into focused gesture handler classes, making all TUX-* changes cleaner and less risky.

## Exit criteria

- Modifier-key gestures (Shift+drag, Shift+rotate, Alt+resize) work as described.
- Escape cancels any in-progress transform gesture.
- Selection handles remain usable across zoom extremes.
- Properties panel shows current X/Y/W/H/R for the selection.

## Code touchpoints

- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts)
- [`src/app/components/properties-panel/properties-panel.component.ts`](../../src/app/components/properties-panel/properties-panel.component.ts)
- [`src/app/services/canvas-view.service.ts`](../../src/app/services/canvas-view.service.ts)
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts)
