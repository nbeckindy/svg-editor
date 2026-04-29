# Spike: SVG.js gradient / pattern support (AS-1)

**Epic:** [Advanced stroke and fill](../epics/advanced-styling.md) (`svg-editor-v77`)  
**Local ref:** AS-1  
**Date:** 2026-04-29

---

## 1. SVG.js version and defs API

- **Pinned version:** `@svgdotjs/svg.js` **~3.2.5** ([package.json](../../package.json)).
- **Defs access:** `Svg` instances expose `.defs()` returning a container; new nodes are created with `.element('linearGradient')`, `.element('radialGradient')`, `.element('stop')`, matching existing usage for filters:

```598:599:src/app/services/svg-manipulation.service.ts
    const shadowFilter = editorSvg.defs().element('filter').attr({ id: 'artboard-shadow', x: '-5%', y: '-5%', width: '110%', height: '110%' });
    shadowFilter.element('feDropShadow').attr({ dx: '0', dy: '1', stdDeviation: '3', 'flood-color': 'rgba(0,0,0,0.2)' });
```

- **Recommendation:** Use the same **`.defs().element(...).attr(...)`** pattern for gradients and stops for consistency with the rest of the editor. Raw `document.createElementNS(SVG_NS, ...)` is acceptable for complex replace operations (e.g. swapping linear ↔ radial while preserving `id`).

- **Proof / harness:** Service unit tests in [`svg-manipulation.service.spec.ts`](../../src/app/services/svg-manipulation.service.spec.ts) mount a real `SVG()` root (Vitest + jsdom), call new gradient helpers, and assert serialized DOM — same style as existing paint classification tests.

---

## 2. Document model: where gradients live

| Option | Pros | Cons |
|--------|------|------|
| **Root `<defs>`** (sibling to content group, under editor `Svg`) | Single namespace for IDs; `findOne('#id')` matches current `classifyPaint()` lookup | Must append after `initializeSVG` / editor construction |
| **Per-shape nested `<defs>`** | Inkscape-style locality | Duplicate `url(#id)` collisions on clone/group ([groups-ordering-spike](../spikes/groups-ordering-spike.md) §6.3); harder dedup |

**Decision:** **Author all editor-created gradients in the root SVG’s primary `<defs>`** (the one returned by `svgInstance.defs()`). Imported documents may still contain nested defs; readers resolve via global `findOne('#id')` as today.

---

## 3. ID uniqueness and shared gradients

- Auto IDs should follow the existing **`shape-` + random** style or a dedicated **`grad-` + random** prefix; collision probability is low but clone/group remains a product risk (documented in groups spike).
- **Editing policy (implemented):** Before applying a user-driven mutation from the properties panel, call **`ensureDedicatedPaintGradient(shapeId, 'fill' | 'stroke')`**: if more than one element references `url(#thatId)` for paint, **deep-clone** the `<linearGradient>` / `<radialGradient>` under defs with a **new id**, repoint **only** the selected shape’s `fill`/`stroke`. Then edits affect one shape only.
- **Patterns (`pattern`):** Out of scope for this spike’s implementation; UI continues to show the static pattern label (no editor).

---

## 4. AS-4 vs `svg-editor-e1x` scope

| Track | Scope |
|-------|--------|
| **AS-4 (phase 1 story)** | “Simple linear gradient” or defer — **superseded in practice** by incremental delivery below. |
| **`svg-editor-e1x`** | Full editor: **linear + radial**, **stops** (add/remove/reorder, color + opacity), **geometry** (linear `x1,y1,x2,y2`; radial `cx,cy,r,fx,fy`), `gradientUnits`. |

**Phased delivery (code):**

1. **MVP:** Linear only, `objectBoundingBox`, two+ stops, create-from-solid, dedicated-def on shared edit, undo snapshots.
2. **Next:** Radial type + radial attributes + type toggle in UI.
3. **Later:** Stroke gradient parity (same APIs, second properties block), `gradientTransform` UI, unused-def GC, stricter clone-ID collision handling.

---

## 5. Undo / redo model

- Avoid coalescing with [`FillColorCommand`](../../src/app/models/editor-commands.ts).
- Use a **snapshot command** pairing `(shapeId, paintProperty)` presentation attribute value **+** `outerHTML` of the gradient definition (or `null` if absent). Execute/undo swap snapshots and insert/remove/replace the def node by id.

---

## 6. Recommended follow-up beads (titles)

- Gradient editor: grid snap for gradient vector handles on-canvas (optional).
- Clipboard: remap gradient/pattern defs when pasting duplicate IDs.
- Properties: pattern fill mini-editor (tile/size) — separate epic.
- Defs garbage-collect: remove unreferenced gradients after solid fill switch (safe scan).

---

## 7. Code touchpoints

- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — `classifyPaint`, defs, new gradient API.
- [`src/app/models/svg-gradient.ts`](../../src/app/models/svg-gradient.ts) — parse/serialize `EditableGradientModel`.
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — `SetPaintGradientSnapshotCommand`.
- [`src/app/components/properties-panel/`](../../src/app/components/properties-panel/) — gradient UI + history wiring.
