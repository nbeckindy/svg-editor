# Spike: Boolean path operations (BO-1)

**Epic:** [Boolean path operations](../epics/boolean-path-operations.md) (`svg-editor-0zh`)  
**Bead:** `svg-editor-0zh.1`  
**Date:** 2026-06-18

---

## 1. Goal

Choose an implementation strategy so **BO-2 (union MVP)** can ship without reopening core geometry, SVG output, or UX decisions.

**Confirmed product constraints (planning session 2026-06-18):**

| Topic | Decision |
|--------|----------|
| Operands | `<path>` only at MVP — no silent convert-to-path |
| First operation | Union, then subtract / intersect |
| First UI | Minimal affordance (properties or toolbar), dedicated panel in BO-3 |
| Live preview | Follow-on (BO-6), not MVP |
| Exclusion / XOR | Out of epic scope |

---

## 2. Current code assets

### 2.1 Path parsing and serialization

- [`path-d.ts`](../../src/app/models/path-d.ts) — `parsePathD`, `parsePathDForNodeEditing`, `pathSegmentsToD`.
- Arcs (`A`) normalize to explicit cubics during parse.
- Smooth `S`/`T` normalize to `C`/`Q` for node-edit parse.
- Round-trip `parse → pathSegmentsToD` is tested.

### 2.2 Coordinate spaces

Path `d` is stored in **element-local** space. Overlay, selection bbox, and pointer math use **root SVG user** space (viewBox):

```3254:3262:src/app/components/svg-canvas/svg-canvas.component.ts
  /**
   * Path `d` is stored in **element-local** space; overlay and pointer math use **root SVG user**
   * space (same as selection bbox). Uses `getTransformToElement` so parent `<g>` transforms are
   * included. Multi-select: each path id has its own mapping.
   */
  private pathNodeLocalPointToOverlay(pathId: string, lx: number, ly: number): { x: number; y: number } {
    const mapped = this.svgManipulation.mapPathLocalToRootUser(pathId, lx, ly);
```

[`SvgSelectionGeometryService.mapPathLocalToRootUser`](../../src/app/services/svg-selection-geometry.service.ts) / `mapRootUserToPathLocal` are the seams for boolean flatten (out) and result `d` write-back (in).

### 2.3 Operand eligibility (reuse node-edit gate)

Only `tagName === 'path'` qualifies today (see [convert-to-path spike](./convert-to-path-node-editing.md)). Boolean MVP reuses the same DOM check plus a successful path parse.

### 2.4 DOM stack order

Layer grouping already sorts selected elements by document order via `compareDocumentPosition`:

```188:193:src/app/services/svg-layer-structure.service.ts
    elements.sort((a, b) => {
      const pos = a.node.compareDocumentPosition(b.node);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
```

Use the same sort for **front-to-back** operand ordering (last in sorted array = topmost / front).

### 2.5 History pattern

Boolean apply should be one undo step. Existing primitives:

- [`RemoveShapesCommand`](../../src/app/history/commands/editor-command-implementations.ts) — captures `outerHTML` + content-group insertion index per operand.
- [`AddPathCommand`](../../src/app/history/commands/editor-command-implementations.ts) — same capture/restore lifecycle for a single path.

**Recommendation:** new `BooleanPathCommand` (or `CompositeCommand` wrapper) that atomically removes N operands and inserts one result, storing all serialized markup + indices for redo/undo. Follow [`editor-commands.mdc`](../../.cursor/rules/editor-commands.mdc): capture old state in constructor, delegate to SVG.js ports.

---

## 3. Algorithm options

| Option | Pros | Cons |
|--------|------|------|
| **`martinez-polygon-clipping`** (pure JS) | MIT; npm install only; union/diff/intersection/xor; multipolygon + holes; GeoJSON ring format; active (0.8.x, Dec 2025) | Curves must be flattened first; no offsetting; numeric edge cases on degenerate input |
| **`clipper2-wasm`** | Industry-standard Clipper2; fast; offsetting path for future stroke expand; SVG-oriented examples upstream | WASM asset wiring in Angular build (`locateFile`, `angular.json` assets); heavier integration |
| **`polygon-clipping`** (mfogel) | Mature pure JS alternative | Similar flattening requirement; less active than martinez recently |
| **Canvas `Path2D`** | Built-in | **No boolean API**; raster fallback only — not acceptable for vector editor export |
| **Server-side** | Offloads compute | Out of scope for offline-first SVG editor |

### Decision: **`martinez-polygon-clipping` for MVP (BO-2–BO-5)**

Rationale:

1. Smallest integration cost — no WASM packaging in Angular 21 build pipeline.
2. Covers union, difference (subtract), intersection required by epic.
3. Output multipolygon maps cleanly to SVG compound paths with holes.
4. If precision or performance fails on real artwork, **migrate to `clipper2-wasm`** in a follow-up bead without changing the UI/command surface (geometry service swap).

**Non-goal for MVP:** polygon offsetting (stroke-to-fill expansion) — defer even if Clipper2 is adopted later.

---

## 4. Geometry pipeline

All booleans run in **root SVG user coordinates** (consistent with selection bbox and transforms).

```
For each operand <path>:
  1. Read local `d` → parsePathD / parsePathDForNodeEditing
  2. Reject if unparseable (same tolerance as node-edit) or no closed subpaths
  3. Split into subpaths (contours between M and Z)
  4. Flatten each contour: L segments pass through; C/Q subdivided to polylines
  5. Map every vertex local → root user via mapPathLocalToRootUser
  6. Build GeoJSON Polygon/MultiPolygon rings (outer + holes per subpath winding)

Sort operands front-to-back (DOM order, §2.4).

Operation:
  - Union:     fold union(poly, next) over all operands
  - Subtract:  topmost minus union(all others)  [Illustrator-style Minus Front for 2 shapes]
  - Intersect: fold intersection over all operands

Result:
  7. Convert multipolygon rings → path `d` (M/L/Z only) in root user space
  8. Map root user → local for new path element (identity transform on result — see §5)
  9. Apply fill-rule, paint from primary operand
```

### 4.1 Curve flattening

Polygon clipper inputs are line segments only.

- **Approach:** adaptive De Casteljau / flatness test on cubics and quadratics in **root user space** after control points are transformed (correct under non-uniform scale/skew).
- **Tolerance:** `BOOLEAN_FLATTEN_TOLERANCE = 0.25` in root user units (≈ quarter pixel at 1×). Expose as constant in geometry service; tune if exports look faceted.
- **Lines (`L`)** and **moveto** endpoints: no subdivision.
- **Arcs:** already cubics in parser — no separate arc flattener.

### 4.2 Closed contours and open paths

- Each subpath must close with `Z` or be treated as **invalid for boolean** (disable UI, no silent auto-close for MVP).
- Single-point / degenerate contours: skip; if nothing remains, operation is no-op with user feedback.

### 4.3 Winding and holes

- Martinez expects GeoJSON rings; hole orientation is handled by the library when outers/holes are grouped per polygon.
- Map each original subpath to a ring; let union/diff produce multipolygon output.
- Serialize result with **`fill-rule="evenodd"`** on the result `<path>` when output has holes (detect multiple disjoint outers or nested rings). Use `nonzero` only for simple single-contour results without holes.

---

## 5. SVG output strategy

| Field | Rule |
|--------|------|
| **Element** | Single `<path id="shape-…">` |
| **Transform** | **Identity** on result — geometry baked into `d` in local space. Operand transforms are applied during flatten (§4). Avoids compound transform + compound path confusion. |
| **Placement** | Insert at content-group index of **topmost** operand; remove all operands. |
| **Style** | Copy presentation from **topmost** operand: `fill`, `stroke`, `stroke-width`, `opacity`, `stroke-*`, `fill-opacity`, `stroke-opacity`. Do not copy `transform`. |
| **Gradients/patterns** | If top operand uses `url(#…)` fill/stroke, preserve reference as-is (same as duplicate). |
| **`d` commands** | `M`, `L`, `Z` only in output (clipper output is polygonal). Acceptable for export and node-edit (parser supports M/L/C/Z; result is all M/L/Z). |
| **Compound paths** | One `<path>` with multiple `M…Z` subpaths — standard SVG compound path. |

**Export validity:** Result is a normal `<path>` in the content group — no special export path required.

---

## 6. Operand ordering (subtract / intersect)

Align with Illustrator **Pathfinder** semantics:

| Op | 2 shapes | N shapes (N ≥ 2) |
|----|----------|------------------|
| **Union** | A ∪ B | ∪ all |
| **Subtract** | **Front − Back** | **Front − ∪(others)** |
| **Intersect** | A ∩ B | fold ∩ over all (order-independent) |

**Front** = topmost in paint order among selected paths (last in DOM sort within `data-editor-content-group`, including nested groups via `compareDocumentPosition` on actual element nodes).

Document in UI: subtract button tooltip *"Subtracts shapes behind the frontmost path from the frontmost path."*

---

## 7. UI recommendations

### 7.1 BO-2 minimal entry (union MVP)

Add a **"Pathfinder"** (or "Boolean") section to the **properties panel** when:

- `editorTool === 'selector'`
- `selectionCount >= 2`
- every selected shape is a `<path>` with parseable closed geometry

Show a **Union** button (others hidden or disabled until BO-4/BO-5). Disabled state + `title` tooltip when selection invalid (mirrors align/distribute guard pattern in [align-distribute epic](../epics/align-distribute.md)).

Wire through `ChromeEditorApplyService` → `EditorHistoryService.pushAndExecute` (same as other properties actions).

### 7.2 BO-3 dedicated panel — **recommendation: new right-dock tab**

| Option | Assessment |
|--------|------------|
| **New dock tab** (`Properties` \| `Layers` \| `Path ops`) | **Recommended.** Matches epic ("dedicated UI surface", "dock panel"), UI redesign shell, and lets users keep the panel open while changing selection. Extend [`EditorDockPanel`](../../src/app/components/editor-dock-panel.ts) union type. |
| **Modal** | Works but fights persistent operand review; better as compact-width fallback post-`svg-editor-8x1.6`. |
| **Toolbar-only** | Too cramped for 3+ operands and future preview (BO-6). |

**Tab label:** `Path ops` (short for narrow dock). Icon optional later.

**Panel contents (BO-3):** operand count + id list (read-only), Union / Subtract / Intersect buttons, disabled reasons, migrate Union from properties section (remove duplicate or keep one entry point — prefer **panel primary**, properties section removed once panel ships).

**Entry point:** auto-switch to `Path ops` tab when user invokes boolean from properties (BO-2) or when 2+ paths selected and user clicks new toolbar icon (optional, BO-3).

---

## 8. Module layout (BO-2 onward)

| Module | Responsibility |
|--------|----------------|
| [`src/app/models/path-boolean.ts`](../../src/app/models/path-boolean.ts) (new) | Types: `BooleanOp`, `FlattenedPolygon`, ring ↔ `d` serialization |
| [`src/app/services/path-boolean-geometry.service.ts`](../../src/app/services/path-boolean-geometry.service.ts) (new) | Flatten, martinez calls, operand sort — pure + unit tested |
| [`src/app/history/commands/editor-command-implementations.ts`](../../src/app/history/commands/editor-command-implementations.ts) | `BooleanPathCommand` |
| [`src/app/services/chrome-editor-apply.service.ts`](../../src/app/services/chrome-editor-apply.service.ts) | `applyBooleanPath(op)` entry for UI |
| [`src/app/components/boolean-path-panel/`](../../src/app/components/boolean-path-panel/) (new, BO-3) | Dock tab panel |
| [`src/app/components/properties-panel/`](../../src/app/components/properties-panel/) | Temporary Union button (BO-2 only) |

Dependency: add `martinez-polygon-clipping` to `package.json` in BO-2.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Faceted curves after flatten | Tolerance constant; user-space adaptive subdivision; revisit tolerance per zoom if needed |
| Self-intersecting paths | Martinez handles many cases; reject with message if operation returns empty unexpectedly |
| Transformed paths (rotate/skew in parent `<g>`) | Flatten in root user space — already required for correct overlap |
| jsdom tests lack `getCTM` | Geometry unit tests use identity-transform paths; integration tests mock `mapPathLocalToRootUser` as pass-through |
| Gradient fill on result | Preserve `url(#id)` from top operand; boolean does not bake gradients |
| Locked / hidden operands | Reuse `anySelectedShapeLocked` guard — block boolean like other chrome apply |

---

## 10. Explicit non-goals (MVP)

- Exclusion / XOR (future epic or BO follow-up if Clipper2 adopted)
- Non-path operands (`rect`, `circle`, …) — separate convert-to-path epic
- Live canvas preview (BO-6)
- True Bézier-preserving booleans (always flatten)
- Stroke-outlined boolean (offset stroke to fill first)
- Boolean on text, images, symbols, groups-as-operands

---

## 11. BO-2 acceptance mapping

BO-2 can proceed when this spike is merged. Implementation checklist:

- [ ] Add `martinez-polygon-clipping`
- [ ] `path-boolean-geometry.service` with `union(pathIds): string | null` returning local `d`
- [ ] `BooleanPathCommand` with undo restoring all operands
- [ ] Properties panel Union button + guards
- [ ] Unit tests: two overlapping rects-as-paths, transformed path, undo round-trip

---

## 12. Follow-up beads (already filed)

| Bead | Title |
|------|--------|
| `svg-editor-0zh.2` | Union MVP |
| `svg-editor-0zh.3` | Boolean operations panel (dock tab) |
| `svg-editor-0zh.4` | Subtract |
| `svg-editor-0zh.5` | Intersect |
| `svg-editor-0zh.6` | Live preview |
| `svg-editor-0zh.7` | E2E tests |

Optional future beads (not filed): migrate to Clipper2-WASM; exclusion op; convert-to-path operands; flatten tolerance UX.
