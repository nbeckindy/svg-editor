# Spike: SVG.js patterns for groups and ordering

**Bead:** `svg-editor-0l4.1`
**Date:** 2026-04-16

## 1. How groups appear in the DOM today

Source SVG children are deep-cloned into the editor content group during `initializeSVG`:

```typescript
const contentGroup = editorSvg.group().attr(EDITOR_CONTENT_GROUP_ID, 'true');
Array.from(svgElement.children).forEach((el) => {
  contentGroup.node.appendChild(el.cloneNode(true));
});
```

`<g>` elements from the source **are preserved** — `cloneNode(true)` keeps the full subtree structure. The live DOM tree looks like:

```
<svg>                                 ← editor root
  <rect data-editor-outside-rect />   ← grey background
  <rect data-editor-viewbox-rect />   ← white viewBox area
  <g data-editor-content-group>       ← content root
    <circle id="shape-abc" />         ← top-level shape (visible to layers/selection)
    <g id="author-group-1">           ← author group (INVISIBLE to layers/selection)
      <rect id="shape-def" />         ← nested shape (clickable but NOT in layers panel)
      <path id="shape-ghi" />
    </g>
  </g>
</svg>
```

## 2. Selection pitfalls

### Problem: `CONTENT_SHAPE_SELECTOR` excludes `<g>`

```typescript
const CONTENT_SHAPE_SELECTOR = 'circle, rect, path, polygon, ellipse, line, polyline';
```

This selector drives three critical code paths:

| Code path | Effect on `<g>` |
|-----------|-----------------|
| `makeShapesClickable()` | Groups don't get cursor styling or auto-IDs |
| `getShapePropertiesIntersectingRect()` (marquee) | Shapes **inside** groups are individually hit-tested (bypasses group boundary) |
| `getLayerStackItems()` | Only iterates **direct children** of content group matching this selector — `<g>` elements and everything inside them are skipped entirely |

### Clicking shapes inside groups

`makeShapesClickable` uses `scope.find(CONTENT_SHAPE_SELECTOR)`, which is a recursive query. Shapes inside `<g>` elements **do** get clickable cursors and auto-IDs. But clicking selects the **individual shape**, not the parent group. There is no "click group boundary → select group" behavior.

### Clip-path/mask vs regular `<g>` groups

`getShapePropertiesInSameClipGroup()` expands selection to all shapes under the same `[clip-path]` or `[mask]` ancestor. This does **not** apply to regular `<g>` groups — they have no collective selection behavior.

### `getNearestGroupAncestorId` is informational only

Walks from a shape upward to find the nearest `<g>` with an `id`. Currently used only for paint-inheritance display (properties panel shows inherited fill/stroke source). It doesn't drive selection behavior.

## 3. Layer stack and `<g>` visibility

`getLayerStackItems()` is the foundation for the layers panel. It iterates **only direct children** of `[data-editor-content-group]` and filters to `CONTENT_SHAPE_SELECTOR`:

```typescript
const children = Array.from((contentGroup.node as Element).children);
for (const child of children) {
  const tagName = child.tagName?.toLowerCase?.() || '';
  if (!tagName || !CONTENT_SHAPE_SELECTOR.split(', ').includes(tagName)) continue;
  // ... build LayerStackItem
}
```

**Impact:** If source SVG contains `<g><rect/><circle/></g>`, none of these shapes appear in the layers panel. The `<g>` is a direct child but doesn't match the selector; the `<rect>` and `<circle>` match the selector but aren't direct children.

### Recommendation for GL-3 (Layers panel: visibility and reorder)

Two approaches for layer items:

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **A. Flat** | Walk all descendants recursively, show every shape as a flat row | Simple, always shows everything | Loses group hierarchy; reorder across groups is confusing |
| **B. Tree** | Show `<g>` as collapsible parents with nested shapes indented | Matches SVG DOM; natural for group operations | More complex UI; reorder semantics differ for within-group vs across-group |

**Recommendation:** Approach B (tree). It maps cleanly to the SVG DOM model, supports future group operations (collapse/expand, drag group), and aligns with tools like Figma/Inkscape. The `LayerStackItem` interface should add optional `children` and a `depth` field.

## 4. Reorder operations via SVG.js

SVG.js `arrange.js` provides sibling-ordering methods on every `Dom` subclass:

| Method | Effect |
|--------|--------|
| `shape.front()` | Move to end of parent's children (paint on top) |
| `shape.back()` | Move to start (paint behind) |
| `shape.forward()` | One step toward the end |
| `shape.backward()` | One step toward the start |
| `shape.before(other)` | Insert `other` just before `shape` |
| `shape.after(other)` | Insert `other` just after `shape` |
| `shape.insertBefore(target)` | Move `shape` before `target` |
| `shape.insertAfter(target)` | Move `shape` after `target` |

**Key constraint:** These only reorder among **siblings** (same parent). To move a shape from one group to another while preserving visual position:

```typescript
shape.toParent(newParent, insertIndex);
```

`toParent` captures the element's screen CTM, reparents, clears the transform, and applies a combined matrix so it appears unchanged on screen.

### Proposed service API for GL-3

```typescript
// Within-group reorder (simple)
bringToFront(shapeId: string): void;
sendToBack(shapeId: string): void;
moveForward(shapeId: string): void;
moveBackward(shapeId: string): void;

// Cross-group reparent (advanced, preserves visual position)
moveToGroup(shapeId: string, targetGroupId: string, index?: number): void;
```

Each wraps the SVG.js call + `bumpDocumentRevision()`.

## 5. Group selection design for GL-2

### Click behavior recommendations

| Gesture | Behavior |
|---------|----------|
| Single click on shape inside group | Select the **shape** (current behavior, keep it) |
| Double-click on group background | Select the **group** (select all children) |
| Click on group in layers panel | Select the **group** as a unit |
| Shift+click on shape inside group | Toggle shape in/from selection (current behavior) |
| Escape while group-selected | Deselect all |

### Selection service changes

`ShapeSelectionService` currently holds `ShapeProperties[]`. For groups, two options:

| Option | Description |
|--------|-------------|
| **A. Expand** | When group is selected, store all child shapes in `selectedShapes` with a `groupId` marker | Simple; existing code mostly works |
| **B. Mixed** | Allow `selectedShapes` to hold group references alongside shapes | Cleaner semantics; but every consumer must handle group vs shape |

**Recommendation:** Option A (expand). The selection signal continues to hold only shapes; a separate `selectedGroupId` signal (or a `groupContext` on each shape entry) indicates "these are selected as a group." This minimizes churn in consumers (properties panel, drag, resize, etc.).

## 6. Risks and open questions

1. **Exported SVG fidelity:** `exportSVG` clones the content group's inner HTML. Groups are already preserved since the DOM structure is maintained. Reorder operations change DOM order, which correctly changes paint order in export. No issues expected.

2. **Transform stacking:** Moving shapes between groups via `toParent()` merges ancestor transforms into the shape's local transform. This can produce complex matrix values that are harder to edit later. Consider simplifying (`translate` + `rotate` + `scale` decomposition) after reparent.

3. **ID management during clone/group:** Auto-generated IDs (`shape-${random}`) don't check for collisions. When cloning or grouping shapes that reference `<defs>` by ID (clip-path, mask, gradients), duplicate IDs in the same document will break rendering.

4. **`text`, `image`, `use` elements:** `CONTENT_SHAPE_SELECTOR` excludes these valid SVG content elements. They won't appear in layers or be selectable. This should be addressed independently of the groups epic.
