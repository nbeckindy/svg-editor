# Spike: Convert-to-path for node editing (non-path shapes)

**Epic:** Advanced path editing (`svg-editor-4nz`)  
**Bead:** `svg-editor-18f`  
**Date:** 2026-04-29

---

## 1. What can be node-edited today (code-backed)

### 1.1 Only `<path>` elements qualify for the node-edit selector

Node-edit mode is gated on the **DOM tag name**, not on `ShapeProperties.type` from selection.

`SvgCanvasComponent` resolves “is this selected id a path?” by looking up the element and checking `tagName === 'path'`:

```3106:3111:src/app/components/svg-canvas/svg-canvas.component.ts
  private isPathElementId(id: string): boolean {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return false;
    const el = svg.findOne(`#${id}`)?.node as Element | null;
    return el?.tagName?.toLowerCase?.() === 'path';
  }
```

When the node-edit selector tool is active, selected shape ids are filtered with `isPathElementId` before `enterPathNodeEditMode` runs. `ShapeSelectionService` only holds `ShapeProperties[]`; it does **not** implement path-specific rules beyond carrying `type` (from SVG.js `element.type`) for each selected item.

**Implication:** `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`, `<text>`, `<image>`, `<use>`, and `<g>` are **not** node-editable in the current implementation, even when they are valid editor content shapes.

### 1.2 Not every `<path>` can enter node-edit mode

`buildPathNodeEditState` loads `d`, then requires a successful **node-edit parse**. On failure it surfaces feedback (e.g. unusable `d` or unsupported error cases from the parser):

```2833:2856:src/app/components/svg-canvas/svg-canvas.component.ts
  private buildPathNodeEditState(pathId: string): PathNodeEditStateBuildResult {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return { state: null, reason: null };
    const pathEl = svg.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return { state: null, reason: null };
    const pathData = pathEl.getAttribute('d') ?? '';
    if (!pathData.trim()) return { state: null, reason: null };

    const parsed = this.parsePathDataForNodeEditing(pathData);
    if (!parsed) {
      return {
        state: null,
        reason: 'Node editing supports only clean M/L/C/S/Q/T/Z path commands (smooth S/T are stored as C/Q).'
      };
    }
    // ...
  }
```

`parsePathDataForNodeEditing` delegates to `parsePathD` and requires **no parse errors**, a non-empty segment list, and an initial moveto:

```559:565:src/app/models/path-d.ts
export function parsePathDForNodeEditing(pathData: string): PathSegment[] | null {
  const parsed = parsePathD(pathData);
  if (parsed.errors.length > 0) return null;
  if (parsed.segments.length === 0) return null;
  if (parsed.segments[0].type !== 'M') return null;
  return parsed.segments;
}
```

The general parser (`parsePathD`) accepts M/L/H/V/C/S/Q/T/A/Z (relative forms included); arc (`A`) segments are **expanded to cubic segments** during parse. Serialization from edited segments uses **M, L, C, Q, Z** only (`pathSegmentsToD`), so a round-trip through node editing **rewrites** arc-native `d` into cubic approximations even for paths that were already `<path>` elements.

**Summary table**

| Kind | Direct node-edit today? | Notes |
|------|-------------------------|--------|
| `<path>` with valid, parseable `d` | Yes (if node-edit selector + selected) | See §1.2; arcs in source become cubics after edit serialize |
| `<path>` with empty/invalid `d` | No | `buildPathNodeEditState` returns no state |
| `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>` | No | Not `path` in DOM; creation API uses primitives (`SvgManipulationService.addShape` for `rect` \| `ellipse` \| `line` \| `text` only) |
| `<text>`, `<image>`, `<use>` | No | Same as above |
| `<g>` | No | Group is in `CONTENT_SHAPE_TAGS` for hit testing, but not a path |

### 1.3 Path geometry updates go through `SvgManipulationService`

Undoable node edits ultimately call `updatePathData`, which **no-ops unless** the target is SVG.js `type === 'path'`:

```978:987:src/app/services/svg-manipulation.service.ts
  updatePathData(pathId: string, d: string): void {
    if (!this.svgInstance) return;
    const shape = this.svgInstance.findOne(`#${pathId}`) as SvgJsElement | undefined;
    if (!shape || shape.type !== 'path') return;
    shape.attr('d', d);
    this.bumpDocumentRevision();
  }
```

New paths from the pen / insert flow use `insertPathIntoContentGroup`, which creates a `<path>` with `d` and paint defaults—same stack as other shapes.

---

## 2. Proposed convert-to-`<path>` flow (preserve transform + paint)

### 2.1 High-level steps

1. **Eligibility** — User invokes “Convert to path” on a single selected primitive (or a path that failed §1.2, if we decide to support “repair” via full `parsePathD` + normalize). Multi-selection and `<g>` as a single target are out of scope for MVP (see §4).
2. **Snapshot for undo** — Capture `outerHTML` or enough state to restore the old element and its index under `[data-editor-content-group]`, consistent with `insertShapeMarkup` / clipboard patterns in `SvgManipulationService`.
3. **Geometry → `d` (local space)** — For each supported tag, generate an absolute `d` in **local coordinates** (before element transform), matching how existing path editing reasons about `d`:
   - **Line / polyline / polygon:** moveto + lineto chain; polygon closes with `Z`.
   - **Rect:** four lines; if `rx`/`ry` > 0, approximate corners with elliptical arc via the same cubic strategy as `parsePathD` (arcs → cubics) or explicit corner cubics—must match SVG rendering within acceptable tolerance.
   - **Circle / ellipse:** ellipse as four elliptical arcs or cubic approximation (canonical parameterization).
4. **Preserve `transform`** — Copy the element’s `transform` attribute (or SVG.js matrix) onto the replacement `<path>` so the painted result matches **before** users edit nodes in encoded local space overlays (consistent with comments on `translateShape` / matrix usage in `SvgManipulationService`).
5. **Preserve paint and presentation** — Copy `fill`, `stroke`, `stroke-width`, `stroke-*`, `opacity`, `fill-opacity`, `stroke-opacity`, `class`, relevant inline `style`, and **`id`** if we replace in place. For `url(#…)` gradients/patterns, copying attributes is enough **if** defs live in-document; otherwise flag a warning (§3). Optional: call `bakeEffectiveFillToLocal` / `bakeEffectiveStrokeToLocal` first so the properties panel and editor see local solid values where the cascade was inherited.
6. **Replace in DOM** — Remove the old node, insert `<path id="…" d="…">` at the same index; run `bumpDocumentRevision`; push a dedicated editor command for undo/redo.
7. **Reselect** — `getShapeProperties` on the new path and update `ShapeSelectionService`.

### 2.2 SVG.js role

The project already uses `@svgdotjs/svg.js` for construction (`contentGroup.path(d)`, `rect`, `line`, etc.). A conversion implementation can:

- Build `d` strings either **by hand** (aligned with `path-d` segment types) or via small helpers that emit the same command subset `pathSegmentsToD` produces (M/L/C/Q/Z) so `parsePathDForNodeEditing` accepts the result immediately.
- Use SVG.js to read **`viewBox`/CTM-independent** attrs (`x`, `cx`, `r`, …) from the parsed element rather than re-implementing all edge cases.

No third-party “convert to path” API is wired today; greenfield helpers live next to `path-d` or `SvgManipulationService` as fits tests.

---

## 3. Irreversible / lossy risks and recommended UX warnings

| Risk | Why | UX / product note |
|------|-----|-------------------|
| **Primitives → path** | Parametric edits (in a future UI) disappear: you can’t round-trip back to `<rect rx ry>` or `<circle r>`. | Confirm: “Convert to path cannot be undone as a rectangle/circle.” One-way language in dialog. |
| **Rounded rectangles (`rx` / `ry`)** | Corner curves become cubic/arcs approximation; numerical drift vs original renderer is possible under extreme radii or stroke. | Short warning when `rx` or `ry` set. |
| **Elliptical arcs in existing paths** | Node editing serializes arcs to cubics (see §1.2); editing any path can already change arc encoding. | If converting **to** path from circle/ellipse, same class of loss applies. |
| **Text → outline** | Outlining text destroys live text editing, font semantics, `<tspan>`, RTL, and semantics. **Strongly discourage** or exclude from MVP. | Separate “Create outlines” epic-level feature; never silent. |
| **`<use>` / `<image>` / symbols** | “Path” semantics don’t apply cleanly; `use` references external definitions. | Exclude from MVP; explain in UI. |
| **Inherited paint** | Gradient `url(#id)` breaks if defs move or IDs duplicate on paste; inherited fill from parent `<g>` is easy to misunderstand after replace. | Offer “bake appearance to element” checkbox using existing `bakeEffectiveFillToLocal` / `bakeEffectiveStrokeToLocal`; warn when defs are missing. |
| **Stroke alignment / markers** | `vector-effect`, `stroke-miterlimit`, `marker-*` behave on paths but path outline may differ subtly from authored primitive markup. | Test matrix; disclose “stroke may shift slightly after conversion.” |
| **Clip-path / mask groups** | Selection expansion for clip groups must remain consistent when replacing one member; id changes would break references. | Replace id in place; integration test with `expandSelectionByClipGroups`. |

---

## 4. Recommended MVP scope

1. **Commands:** “Convert to path” for **`<line>`**, **`<polyline>`**, **`<polygon>`**, **`<rect>`** (including `rx`/`ry` with documented approximation), **`<circle>`**, **`<ellipse>`** — single selection only, within editor content group.
2. **Out of MVP:** `<text>`, `<image>`, `<use>`, whole `<g>`, multi-selection batch convert, and “convert path with broken `d` to repaired path” (optional follow-up).
3. **Must preserve:** same `id` (or scripted update + selection sync), **`transform`**, dominant paint attributes listed in §2, and DOM order for layer-like behavior.
4. **Confirmation:** Blocking modal summarizing irreversibility and rounded-rect approximation (see §3).

---

## 5. Concrete follow-up implementation beads (titles only)

- Convert-to-path editor command with undo/redo replacing a single primitive `<path>`
- Geometry builders: primitive SVG elements → validated `d` aligned with `parsePathDForNodeEditing`
- Properties / canvas entry point: “Convert to path” with MVP confirmation copy
- Vitest coverage for round-trip parse after conversion for each supported tag
- E2E: convert then enter node-edit selector and drag one anchor
- Follow-up: text-to-outline (optional, separate epic) or explicit exclusion list in settings

---

## Code touchpoints (for implementers)

- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — `isPathElementId`, `buildPathNodeEditState`, node-edit UX
- [`src/app/models/path-d.ts`](../../src/app/models/path-d.ts) — `parsePathD`, `parsePathDForNodeEditing`, `pathSegmentsToD`
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — `updatePathData`, `insertPathIntoContentGroup`, paint baking, transforms
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — pattern for undoable replacements (`EditPathNodesCommand`, etc.)
