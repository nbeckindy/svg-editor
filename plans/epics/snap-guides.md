# Epic: Snap and guides

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Snap and guides |
| **Goal** | Shapes snap to a configurable grid and to edges/centers of nearby objects during drag, resize, and creation gestures, providing precise positioning feedback. |
| **Labels** | `roadmap`, `mvp`, `snapping`, `ux` |
| **Type** | `epic` |
| **bd id** | TBD |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| SG-1a | Snap service and grid model | — | `story` | `SnapService` with grid snap math, enabled flag, and configurable grid size. AC: (1) `snapToGrid(point)` rounds to nearest grid intersection in root SVG user space; (2) grid size stored as a signal with default (e.g. 10px); (3) enabled/disabled flag as a signal; (4) `snapDelta(startPoint, rawDelta)` for drag integration — returns snapped delta so `end()` and `move()` use the same values; (5) multi-select: union translated as rigid group with snap applied to union anchor; (6) unit tests for snap math. | — | 120 |
| SG-1b | Snap toggle in toolbar | — | `story` | Tool strip shows snap-on/off toggle button (not a tool switch — independent of active tool). AC: (1) toggle does not change active tool; (2) visual indicator for on/off state; (3) `data-testid` for button. | SG-1a | 60 |
| SG-2 | Grid overlay rendering | — | `story` | Canvas renders a visible grid overlay when snap-to-grid is enabled. AC: (1) grid lines in root SVG user space, rendered via SVG `<pattern>` or direct lines in overlay; (2) grid adapts to zoom level (coarsen when zoomed out, refine when zoomed in — follow ruler tick pattern); (3) grid origin at (0,0) of SVG user space; (4) stroke constant in screen px (`vector-effect: non-scaling-stroke`); (5) hidden when snap disabled or no SVG loaded; (6) grid aligns with ruler values. | SG-1a | 120 |
| SG-3a | Smart guides: alignment detection and snap math | — | `story` | Pure functions that detect alignment between a moving bbox and candidate shapes. AC: (1) detects edge-to-edge and center-to-center alignment on both axes; (2) snap tolerance configurable (default e.g. 5 SVG user units); (3) excludes selected shapes from candidates; (4) returns snapped delta + list of active guide positions; (5) handles empty document (no candidates — no-op); (6) unit tests covering edge cases (overlapping shapes, rotated AABBs). | SG-1a | 150 |
| SG-3b | Smart guides: gesture integration and guide rendering | — | `story` | Wire SG-3a into `DragGesture` and `ResizeGesture`; render guide lines on canvas overlay. AC: (1) guide lines appear as colored overlay lines (e.g. magenta) at detected alignment positions; (2) lines span full viewport width/height; (3) `move()` applies snapped delta from SG-3a; (4) `end()` commits with same snapped values (no divergence from preview); (5) Alt key temporarily disables snap (common UX expectation); (6) guides disappear when gesture ends or snap disabled. | SG-3a, SG-2 | 150 |
| SG-4 | Snap integration with creation gestures | — | `story` | Shape creation gestures snap to grid and smart guides during drag. AC: (1) creation rect/ellipse/line endpoints snap to grid when enabled; (2) smart guides active during creation drag; (3) Shift constraints (circle, 45° line) take precedence over snap when both active; (4) ghost preview reflects snapped position. | SG-1a, SG-3b, SC-2b | 120 |
| SG-5a | Unit tests for snap math and guide detection | — | `task` | Unit tests for `SnapService` and smart guide functions. AC: (1) grid snap at various grid sizes; (2) guide detection with known bboxes; (3) tolerance edge cases; (4) empty-document no-op. | SG-3a | 90 |
| SG-5b | Integration tests for snap gestures and grid rendering | — | `task` | Component/E2E tests for snap behavior during drag and grid overlay. AC: (1) drag with snap enabled produces snapped position; (2) grid overlay visible/hidden toggle; (3) `end()` parity with `move()` (committed position matches preview). | SG-3b, SG-2 | 90 |

## Exit criteria

- Snap-to-grid can be toggled on/off; grid size is configurable.
- A visible grid overlay renders on the canvas when enabled.
- Smart guides appear during drag/resize showing alignment with nearby objects.
- Snapping works for both move/resize and shape creation gestures.
- Alt key temporarily disables snap during a gesture.

## Code touchpoints

- New `src/app/services/snap.service.ts` — snap logic, grid state, guide detection
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — grid overlay, guide line rendering
- [`src/app/components/svg-canvas/gestures/drag-gesture.ts`](../../src/app/components/svg-canvas/gestures/drag-gesture.ts) — snap during drag (both `move()` and `end()`)
- [`src/app/components/svg-canvas/gestures/resize-gesture.ts`](../../src/app/components/svg-canvas/gestures/resize-gesture.ts) — snap during resize
- [`src/app/components/tool-strip/tool-strip.component.ts`](../../src/app/components/tool-strip/tool-strip.component.ts) — snap toggle button

## Notes

- `DragGesture.end()` recomputes delta from raw pointer (not from last `move()`). Snap stories must ensure `end()` applies the same snapping as `move()`, or persist the last snapped delta.
- `ResizeGesture` uses `computeProportionalResizedUnion` with diagonal projection. Snap for resize should snap the resulting union edges, not the raw pointer — this is underspecified and should be clarified during SG-3b.
- Rotation snap (Shift+rotate) is handled separately in epic 6 (TUX-3) and is not in scope for this epic.
