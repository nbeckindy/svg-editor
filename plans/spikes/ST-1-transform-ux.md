# Spike ST-1: bbox and handle UX for transforms

**Epic:** Shape transforms (`svg-editor-2zo`)
**Status:** Complete
**Date:** 2026-04-17

---

## 1. Handle layout

### Current implementation

When the selector tool is active and at least one shape is selected (and no drag/resize/rotate/marquee is in progress), the overlay renders **five handles** on the selection bounding box:

| Handle | Element | Position (overlay px) | `data-*` attribute | Cursor (CSS class) |
|--------|---------|----------------------|--------------------|--------------------|
| NW resize | `<circle r="5">` | `(hr.x, hr.y)` — top-left corner | `data-resize-handle="nw"` | `selection-resize-nw` |
| NE resize | `<circle r="5">` | `(hr.x + hr.width, hr.y)` — top-right corner | `data-resize-handle="ne"` | `selection-resize-ne` |
| SW resize | `<circle r="5">` | `(hr.x, hr.y + hr.height)` — bottom-left corner | `data-resize-handle="sw"` | `selection-resize-sw` |
| SE resize | `<circle r="5">` | `(hr.x + hr.width, hr.y + hr.height)` — bottom-right corner | `data-resize-handle="se"` | `selection-resize-se` |
| Rotate | `<circle r="5">` | `(hr.x + hr.width/2, hr.y - 28)` — centered above top edge | `data-rotate-handle` | `selection-rotate-handle` |

A **stem line** (`selection-rotate-stem`) connects the top-center of the bounding box to the rotate handle: from `(hr.x + hr.width/2, hr.y)` to `(hr.x + hr.width/2, hr.y - rotateHandleOffset)` where `rotateHandleOffset = 28` overlay SVG units.

### Visibility gate (`showResizeHandles`)

Handles render only when all of:
- Tool is `selector`
- `selectedShapes.length > 0`
- No drag, resize, rotate, or marquee in progress
- `wrapperWidth > 0` (overlay laid out)
- `lastBbox` is set

### Gaps and notes

- **No edge (midpoint) handles** — only corners. Non-uniform scale (independent W/H) is not possible via handles. This is acceptable for ST-3 if the story specifies uniform-only resize.
- **Handle radius is fixed at 5 overlay-px** — does not adapt to zoom. At extreme zoom-out, handles may be hard to click; at extreme zoom-in they look small relative to shapes. Consider making handle radius zoom-aware in a future story.
- **No rotate cursor feedback** — the rotate handle uses a generic CSS class; there is no custom `grab`/`grabbing` cursor during rotation.
- **During rotation, the bounding box frame rotates visually** via `selectionRotateHighlightTransform()`, giving correct feedback. During resize, `resizeOverlayRect` updates the frame to match the ghost.

---

## 2. Modifier keys

### Current modifier key behavior

Reviewed `onCanvasMouseDown`, `onDocumentMouseMove`, and `onDocumentMouseUp` in `svg-canvas.component.ts`:

| Gesture | Modifier | Current behavior |
|---------|----------|-----------------|
| **Click on shape** | Shift / Ctrl / Meta | Additive toggle (add/remove from selection) — handled in `onCanvasClick` and guarded in `onCanvasMouseDown` (skips drag initiation) |
| **Marquee select** | Shift | Merge new hits into existing selection (`mergeShapesIntoSelection`) |
| **Zoom click** | Alt | Zoom out instead of zoom in |
| **Resize drag** | _(none checked)_ | Always proportional — `computeProportionalResizedUnion` is called unconditionally with no modifier gates |
| **Rotate drag** | _(none checked)_ | Free rotation — `rotationDeltaFromPointerMoveRad` accumulates continuously with no snapping |
| **Shape drag** | _(none checked)_ | Free movement, no axis-lock |

**Key finding: No modifier keys are checked during resize or rotate operations.** The `event.shiftKey` / `event.altKey` / `event.ctrlKey` properties are not read in the resize or rotate mouse-move handlers.

### Recommended modifier key behavior

| Gesture | Modifier | Recommended behavior | Implementation note |
|---------|----------|---------------------|---------------------|
| **Rotate** | Shift | Snap to 15° increments | Round `rotateAccumulatedRad` to nearest `π/12` before passing to `updateRotateGhost()` and on commit. Apply in `onDocumentMouseMove` rotate branch. |
| **Resize** | _(default)_ | Proportional (already implemented) | `computeProportionalResizedUnion` projects onto the diagonal — this is inherently proportional. No change needed. |
| **Resize** | Alt | Resize from center (anchor = union center instead of opposite corner) | Requires a new variant of `computeProportionalResizedUnion` or a `fromCenter` parameter. The anchor point in `anchorAndVectorFromHandle` would become `(w/2, h/2)` and the scale applied symmetrically. |
| **Resize** | Shift | Could be repurposed for non-uniform resize if edge handles are added; otherwise no-op since resize is already proportional | Defer to edge-handle story. |
| **Drag** | Shift | Constrain to horizontal or vertical axis | Compare `|dx|` vs `|dy|` after a small threshold; zero out the smaller delta. |

---

## 3. Numeric precision

### Current precision in code

- **Rotation angle:** `radiansToDegrees()` returns a raw `(rad * 180) / Math.PI` with full floating-point precision. No rounding is applied before commit. The `UnionRotateCommand` stores `angleDeg` as-is.
- **Scale factor:** `unionAfter.width / unionBefore.width` — full floating-point. No rounding.
- **Position/size (bbox):** `getShapeBBox` and `getUnionBBox` return raw `getBoundingClientRect()` → inverse-CTM mapped values. No rounding.
- **Matrix values:** SVG.js `Matrix` stores `a, b, c, d, e, f` as IEEE 754 doubles; the `transform` attribute serialized by SVG.js includes full precision.

### Recommendations

| Value | Display precision | Storage precision | Rationale |
|-------|------------------|-------------------|-----------|
| Rotation angle | 1 decimal (e.g. `45.0°`) | Full float internally; round only for display/commit snap | Users think in whole degrees; 0.1° gives fine control |
| Scale factor | 3 decimals (e.g. `1.250×`) | Full float | Sub-percent precision matters for alignment |
| Position (X, Y) | 1 decimal (e.g. `120.5`) | Full float | SVG user units; 0.1 is sub-pixel at typical sizes |
| Size (W, H) | 1 decimal (e.g. `48.0`) | Full float | Matches position precision |

For the properties panel (section 4), displayed values should be rounded for readability. Internal matrix math should remain at full precision to avoid cumulative rounding errors.

---

## 4. Properties panel transform UI

### Current state

The properties panel (`properties-panel.component.ts/html`) shows:
- Shape Type (read-only)
- ID (read-only)
- Fill Color (editable)
- Stroke Color (editable)
- Stroke Width (editable, range + number input)
- Opacity (editable, range + number input)

**No transform-related fields exist.** No position, size, or rotation.

### Recommended transform section

Add a **"Transform"** property group below the ID row, displaying:

| Field | Type | Single select | Multi-select | Editable? | Notes |
|-------|------|---------------|--------------|-----------|-------|
| **X** | number input | Union bbox `.x` | Union bbox `.x` | Phase 1: read-only; Phase 2: editable | Position of selection left edge |
| **Y** | number input | Union bbox `.y` | Union bbox `.y` | Phase 1: read-only; Phase 2: editable | Position of selection top edge |
| **W** | number input | Union bbox `.width` | Union bbox `.width` | Phase 1: read-only; Phase 2: editable | Width of selection |
| **H** | number input | Union bbox `.height` | Union bbox `.height` | Phase 1: read-only; Phase 2: editable | Height of selection |
| **R** | number input + ° suffix | Accumulated rotation | "Mixed" if different | Phase 1: read-only; Phase 2: editable | Rotation in degrees |

#### Phase 1 (read-only display — ship with ST-2/ST-3)

Display the union bounding box and rotation angle as read-only values. This gives the user feedback during and after transforms without requiring input validation or new commands.

Data sources:
- **X, Y, W, H:** `SvgManipulationService.getUnionBBox(selectedIds)` — already used for handle positioning
- **R:** Currently not tracked as cumulative state. The `UnionRotateCommand` stores per-operation `angleDeg` but no "total rotation" is persisted on the selection. For read-only display, decompose the shape's `transform` matrix to extract rotation (via `Math.atan2(b, a)` on the SVG.js `Matrix`).

#### Phase 2 (editable inputs — separate story)

Editing X/Y creates a `TranslateCommand`; editing W/H creates a `UnionScaleCommand`; editing R creates a `UnionRotateCommand`. Each requires computing deltas from current state. This is a distinct story beyond ST-2/ST-3.

#### `ShapeProperties` interface impact

The `ShapeProperties` interface currently lacks transform fields. Extending it is optional for Phase 1 if the panel reads directly from `SvgManipulationService`. For Phase 2, consider adding:

```typescript
interface ShapeProperties {
  // ... existing fields ...
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}
```

---

## 5. Skew decision

### Recommendation: defer skew to a follow-up

**Rationale:**

1. **No existing infrastructure.** There are no skew handles, no skew math utilities, no `SkewCommand`, and no service methods for skew. Every layer would need to be built from scratch.

2. **Low user priority.** Skew is rarely used in typical SVG editing workflows. Rotate and scale cover the vast majority of transform use cases. Professional tools (Figma, Sketch) either hide skew or don't support it at all.

3. **UX complexity.** Skew requires additional edge-midpoint handles with distinct cursors and interaction models (horizontal vs vertical skew). Adding these handles increases visual clutter and interaction complexity on the selection frame.

4. **Matrix composition risk.** Skew (non-zero `b` and `c` in the SVG transform matrix) interacts non-trivially with rotation and scale. Getting undo/redo correct for combined skew+rotate+scale requires careful matrix decomposition that is not yet implemented.

5. **Epic acceptance allows deferral.** ST-4 explicitly states: _"Either basic skew support **or** issue closed with explicit 'out of scope' and link to follow-up epic."_

**Action:** Close ST-4 as "out of scope" with a link to a new follow-up issue/epic: _"Skew transform support"_ with type `story`, labeled `post-mvp, transforms, deferred`.

---

## 6. Existing helper references

### Rotate helpers

| Helper | Location | Used by | Notes |
|--------|----------|---------|-------|
| `unionRotationPivot(union)` | `selection-rotate.ts` | Canvas mousedown (rotate) | Returns `{x: cx, y: cy}` of union bbox center |
| `rotationDeltaFromPointerMoveRad(pivot, prev, curr)` | `selection-rotate.ts` | Canvas mousemove (rotate) | Incremental signed angle in radians; branch-safe via `atan2(sin,cos)` |
| `radiansToDegrees(rad)` | `selection-rotate.ts` | Canvas mouseup (rotate commit) | Simple `rad * 180 / π` |
| `rotateGhostWorldToUnionMatrix(union, pivot, angleRad)` | `selection-rotate.ts` | `updateRotateGhost()` | Composes translate-to-local + rotate for ghost preview |
| `rotatedAxisAlignedBBox(union, pivot, angleRad)` | `selection-rotate.ts` | _(not currently used)_ | Could be useful for computing post-rotation bbox in properties panel |

### Resize helpers

| Helper | Location | Used by | Notes |
|--------|----------|---------|-------|
| `computeProportionalResizedUnion(union, handle, pointer, minSize?)` | `selection-resize.ts` | Canvas mousemove (resize) | Projects pointer onto diagonal; returns new union bbox |
| `oppositeCornerForHandle(union, handle)` | `selection-resize.ts` | `applyUnionScaleFromSnapshot()` | Fixed anchor point for scale matrix |
| `MIN_UNION_SIZE` | `selection-resize.ts` | `computeProportionalResizedUnion` | Floor for degenerate selection (`1e-3` user units) |

### Service methods

| Method | Location | Used by | Notes |
|--------|----------|---------|-------|
| `snapshotSelectionTransforms(ids)` | `SvgManipulationService` | Drag/resize/rotate mousedown | Clones current `Matrix` per shape for undo |
| `applyUnionScaleFromSnapshot(ids, before, after, snapshot, handle)` | `SvgManipulationService` | `UnionScaleCommand.execute()` | Composes `scale(s,s,ax,ay) * snapshot` |
| `applyUnionRotationFromSnapshot(ids, pivot, deg, snapshot)` | `SvgManipulationService` | `UnionRotateCommand.execute()` | Composes `rotate(deg,cx,cy) * snapshot` |
| `getSelectionRotationPivot(ids)` | `SvgManipulationService` | Canvas mousedown (rotate) | Geometric centroid via `matrixify()` + local bbox; falls back to union center |
| `getUnionBBox(ids)` | `SvgManipulationService` | Everywhere (highlight, handles, drag, resize, rotate) | Axis-aligned union of per-shape screen-mapped bboxes |
| `getShapeBBox(id)` | `SvgManipulationService` | `getUnionBBox`, drag start | Single-shape bbox; prefers `getBoundingClientRect` → inverse CTM |
| `translateShape(id, dx, dy)` | `SvgManipulationService` | `TranslateCommand.execute()` | Converts root-space delta to parent-local space |

### Editor commands

| Command | Location | Notes |
|---------|----------|-------|
| `UnionRotateCommand` | `editor-commands.ts` | Stores `pivot`, `angleDeg`, `snapshotBefore`; undo restores snapshot matrices |
| `UnionScaleCommand` | `editor-commands.ts` | Stores `unionBefore`, `unionAfter`, `snapshotBefore`, `handle`; undo restores snapshot |
| `TranslateCommand` | `editor-commands.ts` | Per-shape; stores `dx`, `dy`, `snapshotBefore` |
| `CompositeCommand` | `editor-commands.ts` | Wraps multiple commands for group drag |

### Coordinate mapping utilities

| Helper | Location | Notes |
|--------|----------|-------|
| `screenPointToRootSvgUserPoint(svg, cx, cy)` | `svg-screen-user.ts` | Client coords → root SVG user space via `getScreenCTM().inverse()` |
| `svgBboxToOverlayPixels(bbox)` | `SvgCanvasComponent` (private) | Document bbox → overlay pixel rect (handles `preserveAspectRatio`) |
| `clientToEditorSvgPoint(cx, cy)` | `SvgCanvasComponent` (private) | Client coords → editor SVG user space |

---

## Summary of recommendations for downstream stories

| Story | Key decisions from this spike |
|-------|-------------------------------|
| **ST-2 (Rotate)** | Already implemented. Add Shift-snap (15° increments) as an enhancement. Add read-only rotation display in properties panel. |
| **ST-3 (Scale)** | Already implemented as proportional-only. Add Alt+resize-from-center. Add read-only W/H display in properties panel. Consider edge handles in a follow-up for non-uniform scale. |
| **ST-4 (Skew)** | Close as out-of-scope; create follow-up issue. |
| **ST-5 (Tests)** | Cover `selection-rotate.ts` and `selection-resize.ts` pure functions. Cover `UnionRotateCommand`/`UnionScaleCommand` execute+undo. Cover modifier key behavior once added. |
| **Properties panel** | New story: Phase 1 (read-only X, Y, W, H, R) → Phase 2 (editable inputs). |
