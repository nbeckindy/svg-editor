# Epic: Transform and gesture UX polish

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Transform and gesture UX polish |
| **Goal** | Modifier-key gestures, escape cancel, zoom-adaptive handles, custom cursors, read-only transform fields, skew support, and z-order UI bring interaction parity with professional design tools. |
| **Labels** | `roadmap`, `mvp`, `transforms`, `ux` |
| **Type** | `epic` |
| **bd id** | `svg-editor-vfr` |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Priority | Acceptance criteria | Depends on |
|-----------|--------|-------|------|----------|---------------------|------------|
| TUX-1 | Escape cancels in-progress drag, resize, and rotate | `svg-editor-9aq` | `task` | P3 | Add `cancel()` to DragGesture/ResizeGesture/RotateGesture that restores pre-gesture matrices/visibility, removes ghost fragments, resets state, and pushes no history. Early branch in `onKeyDown` checks gesture-active before selection-clear. AC: (1) shapes return to pre-gesture state with no undo entry; (2) Escape during gesture cancels gesture only, does not clear selection; (3) Escape with no active gesture still clears selection as today. | — |
| TUX-2 | Shift+drag: constrain to H/V axis | `svg-editor-wpd` | `story` | P3 | In `DragGesture.move()`, when Shift is held, constrain delta to the axis with the larger absolute displacement. AC: (1) axis chosen from dominant `|dx|` vs `|dy|`; (2) multi-selection moves as a rigid group on the constrained axis; (3) Shift read live (modifier can toggle mid-drag); (4) `end()` uses the same constrained delta as the last `move()`. | — |
| TUX-3 | Shift+rotate: snap to 15-degree increments | `svg-editor-yse` | `story` | P3 | In `RotateGesture.move()`, snap to nearest 15° absolute orientation when Shift is held. AC: (1) snap is on absolute angle, not incremental delta; (2) multi-select union rotation snaps identically; (3) Shift read live throughout gesture; (4) ghost preview reflects snapped angle. | — |
| TUX-4a | Center-anchored resize math and API | `svg-editor-eh1` | `story` | P3 | New `computeCenterAnchoredResize` helper and `applyUnionScaleFromCenter` on SvgManipulationService. AC: (1) scale factor computed from pointer distance to union center along diagonal; (2) union center remains fixed; (3) unit tests cover single and multi-shape cases; (4) no conflict with Alt = zoom-out in zoom tool (Alt+resize only applies in selector mode on resize handles). | — |
| TUX-4b | Alt+resize gesture integration | `svg-editor-eh1` | `story` | P3 | ResizeGesture reads `altKey` and uses center-anchored path from TUX-4a. AC: (1) Alt toggleable mid-gesture (preview updates live); (2) `end()` commits matching the last preview; (3) ghost preview reflects center-anchored scaling. | TUX-4a |
| TUX-5 | Selection handles adapt to zoom level | `svg-editor-tck` | `story` | P3 | Handle radii and rotate-handle offset scale inversely with `canvasView.scale`. AC: (1) handle radius clamped between 4–8 screen px; (2) rotate handle offset clamped between 20–40 screen px; (3) selection box stroke uses `vector-effect: non-scaling-stroke`; (4) works at zoom extremes (10%–1000%). | — |
| TUX-6 | Read-only transform fields (X, Y, W, H, R) in properties panel | `svg-editor-bl4` | `story` | P3 | Properties panel shows read-only numeric fields for selection position, size, and rotation. AC: (1) values from `getUnionBBox` for X/Y/W/H; (2) rotation extracted via `atan2` matrix decomposition, displayed as degrees (0–360); (3) multi-select shows union bbox for X/Y/W/H, "Mixed" for R when angles differ; (4) values update on selection change and after transform commands; (5) coordinate space is root SVG user space. | — |
| TUX-7 | Custom rotate cursor during rotation gesture | `svg-editor-8kn` | `story` | P4 | Custom cursor shown while RotateGesture is active. AC: (1) cursor set on gesture start, restored on end or cancel (TUX-1); (2) fallback to `grab` if custom cursor asset fails to load. | TUX-1 |
| TUX-8a | Skew transform design spike | `svg-editor-w1t` | `task` | P3 | Document skew UX (handle placement, interaction model), SVG.js matrix representation, and interaction with existing rotate/resize. Deliver a short design doc or code comments. AC: (1) define handle positions (e.g. middle-edge handles); (2) define skew axes and units (degrees); (3) address multi-select behavior; (4) address singularity / degenerate cases. | — |
| TUX-8b | Skew transform commands and service API | `svg-editor-w1t` | `story` | P3 | SkewCommand with matrix-based undo/redo; `applySkew` on SvgManipulationService. AC: (1) skew X and skew Y as separate operations; (2) undoable via matrix snapshot; (3) multi-select applies uniform skew via union approach; (4) unit tests for command round-trip. | TUX-8a |
| TUX-8c | Skew gesture and properties UI | `svg-editor-w1t` | `story` | P3 | Canvas gesture for skew via handles; optional skew fields in properties panel. AC: (1) middle-edge handles trigger skew gesture; (2) ghost preview during skew; (3) properties panel shows skew angle (read-only or editable per spike decision). | TUX-8a, TUX-8b |
| TUX-9 | Bring-to-front / send-to-back UI and shortcuts | — | `story` | P3 | Wire existing `moveElementToFront`/`moveElementToBack` to layers panel buttons and keyboard shortcuts. AC: (1) layers panel shows front/back buttons alongside existing forward/backward; (2) keyboard shortcuts wired (selector tool active, not in input fields per `shouldIgnoreKeyboardShortcuts`); (3) multi-select applies in DOM order; (4) `ReorderCommand` with `'front'`/`'back'` directions. | — |

## Prerequisites

`svg-editor-60f` (Extract gesture handlers from svg-canvas component) should land first. The gesture handler classes already exist under `src/app/components/svg-canvas/gestures/`; confirm extraction is complete before starting TUX work.

## Exit criteria

- Modifier-key gestures (Shift+drag, Shift+rotate, Alt+resize) work as described.
- Escape cancels any in-progress transform gesture with no undo entry.
- Selection handles remain usable across zoom extremes.
- Properties panel shows current X/Y/W/H/R for the selection.
- Skew transform can be applied to shapes via gesture or properties panel.
- Bring-to-front, send-to-back, move forward, and move backward are accessible from layers panel UI and keyboard shortcuts.

## Code touchpoints

- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts)
- [`src/app/components/svg-canvas/gestures/drag-gesture.ts`](../../src/app/components/svg-canvas/gestures/drag-gesture.ts) — cancel(), Shift constraint
- [`src/app/components/svg-canvas/gestures/resize-gesture.ts`](../../src/app/components/svg-canvas/gestures/resize-gesture.ts) — cancel(), Alt center-anchor
- [`src/app/components/svg-canvas/gestures/rotate-gesture.ts`](../../src/app/components/svg-canvas/gestures/rotate-gesture.ts) — cancel(), Shift snap
- [`src/app/components/properties-panel/properties-panel.component.ts`](../../src/app/components/properties-panel/properties-panel.component.ts) — transform fields
- [`src/app/components/layers-panel/layers-panel.component.ts`](../../src/app/components/layers-panel/layers-panel.component.ts) — z-order buttons
- [`src/app/services/canvas-view.service.ts`](../../src/app/services/canvas-view.service.ts)
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — skew API (new), z-order API (exists)
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — SkewCommand (new)

## Notes

- **Skew (TUX-8a–8c) is implemented:** middle-edge handles, `SkewGesture`, `SkewCommand`, `SvgManipulationService.applyUnionSkewFromSnapshot`, and read-only **Skew X / Skew Y** in the properties panel (matrix-derived degrees; approximate when rotation and skew are combined). Design + checklists live in this file under “TUX-8a design spike” and following sections.
- Z-order API (`moveElementToFront`/`moveElementToBack`, `ReorderCommand` with `'front'`/`'back'`) already exists; TUX-9 is pure UI wiring.

## TUX-8a design spike: skew transform UX

Scope: define skew interaction behavior that fits the existing selection box, gesture model, and matrix-based command stack.

### 1) Handle positions for skew interactions

- Use the 4 **middle-edge handles** of the current selection box for skew only:
  - Top-center and bottom-center handles -> **Skew X** interaction.
  - Left-center and right-center handles -> **Skew Y** interaction.
- Keep the 4 corner handles for resize and the rotate handle unchanged.
- Cursor intent:
  - Top/bottom middle handles use a horizontal-shear cursor (fallback: `ew-resize`).
  - Left/right middle handles use a vertical-shear cursor (fallback: `ns-resize`).
- Hit targets should follow the same zoom-adaptive sizing rules as existing handles (TUX-5), so skew remains usable at extreme zoom levels.

### 2) Skew axes/units and pointer-to-skew mapping

- Unit is **degrees** for UX and optional properties display; matrix ops use radians internally only at math boundaries.
- Axis definitions:
  - **Skew X**: `x' = x + tan(ax) * y`, where `ax` is skewX angle in degrees.
  - **Skew Y**: `y' = y + tan(ay) * x`, where `ay` is skewY angle in degrees.
- Gesture mapping is computed in root SVG user space from gesture start snapshot:
  - For Skew X (top/bottom handles): map horizontal pointer delta (`dx`) against selection height `H`.
    - `ax = atan(dx / max(H, epsilon)) * 180 / PI`
  - For Skew Y (left/right handles): map vertical pointer delta (`dy`) against selection width `W`.
    - `ay = atan(dy / max(W, epsilon)) * 180 / PI`
- This `atan` mapping gives a smooth, bounded interaction and avoids runaway values from linear `tan` near singularities.
- Sign convention should feel directional with handle side:
  - Dragging right on top handle produces positive skewX.
  - Dragging down on right handle produces positive skewY.
  - Opposite sides may invert sign if needed so screen-direction behavior stays intuitive.

### 3) Multi-select / union behavior

- Multi-select skew uses the **union selection bbox** as the interaction frame (same model as rotate/resize union behavior).
- The gesture computes one skew angle from pointer movement relative to union dimensions, then applies that same angle to each selected element.
- Elements keep their relative offsets in the group frame; effect is a rigid "shear the whole selection" feel (not per-element local-handle skewing).
- For command history, emit a single skew command for the selection (with per-element matrix snapshots for undo/redo parity with existing transform commands).

### 4) Singularity / degenerate safeguards

- Clamp user-facing skew angles to a safe range, e.g. `[-80deg, +80deg]` (well away from `+-90deg` tan singularity).
- Treat tiny union dimensions as degenerate:
  - `epsilon = 1e-6` in math helpers.
  - If `W < minSize` for skewY or `H < minSize` for skewX (e.g. `minSize = 0.5` user units), freeze preview at previous valid angle or no-op.
- Reject non-finite matrix results (`NaN`/`Infinity`) before applying preview or commit.
- Commit guard: if final effective angle is near zero (`abs(angle) < 0.01deg`), skip command creation to avoid no-op history entries.

### 5) Integration with rotate/resize gestures and command architecture

- Gesture ownership:
  - `ResizeGesture` keeps corner handles.
  - New `SkewGesture` owns middle-edge handles.
  - `RotateGesture` remains rotate-handle-only.
- `svg-canvas.component` handle dispatch should route by handle type (`corner`, `edge-middle`, `rotate`) so gesture activation is explicit and conflict-free.
- New command architecture additions:
  - `SkewCommand` in `editor-commands` with matrix snapshot undo/redo (same style as rotate/resize commands).
  - `SvgManipulationService.applySkew(selection, axis, angleDeg, frame)` where `frame` is the union bbox snapshot captured at gesture start.
- Preview flow mirrors existing transform gestures:
  - On `start`: capture original matrices and union frame.
  - On `move`: apply transient skew preview from start snapshot (no cumulative drift).
  - On `end`: commit `SkewCommand` with before/after matrices.
  - On `cancel` (TUX-1 dependency): restore original matrices and clear ghost preview.

## TUX-8b implementation checklist (commands + service API)

- Add `SkewAxis = 'x' | 'y'` model/type in transform command/service contracts.
- Implement `SkewCommand` with:
  - constructor inputs: selected element ids, axis, angleDeg, beforeMatrices, afterMatrices
  - `execute()` applying after-matrices
  - `undo()` restoring before-matrices
  - serialization shape consistent with existing command stack patterns.
- Add `applySkew(...)` to `SvgManipulationService`:
  - accepts selection, axis, angle degrees, and union frame snapshot
  - computes per-element skew transform relative to union frame
  - returns/records before+after matrices for command creation.
- Add service unit tests:
  - skewX and skewY single-element cases
  - multi-select union-frame consistency
  - clamp + degenerate guards
  - no-op near-zero angle behavior.
- Add command round-trip tests:
  - execute -> undo -> redo returns exact prior/final matrices.

## TUX-8c implementation checklist (gesture + properties UI)

- Add skew handle semantics to selection overlay model (`edge-middle` typed handles).
- Implement `SkewGesture` class with `start/move/end/cancel`, following Drag/Resize/Rotate lifecycle.
- Wire pointer dispatch in `svg-canvas.component`:
  - middle-edge handle starts `SkewGesture`
  - preserve current resize/rotate behavior for other handles.
- Add skew ghost preview behavior aligned with existing transform previews.
- Add keyboard modifier support decisions (if none, explicitly no-op and document).
- Properties panel integration:
  - show read-only `SkewX` / `SkewY` fields for current selection (or "Mixed" for differing values)
  - if editable mode is chosen later, reuse `applySkew` + `SkewCommand` path rather than direct DOM mutation.
- Add tests:
  - gesture mapping from pointer movement to angle
  - multi-select skew preview + commit
  - cancel restores original matrices with no history entry
  - properties panel skew display updates on selection/transform changes.
