# Epic: Groups and layer management

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Groups and layer management |
| **Goal** | Users can work with grouped elements (`<g>`) and a practical layer list (order/visibility) aligned with the SVG structure. |
| **Labels** | `roadmap`, `post-mvp`, `layers` |
| **Type** | `epic` |
| **bd id** | `svg-editor-0l4` |

## Child issues (bd-mappable)

| Local ref | Title | Type | Status | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|------|--------|---------------------|------------|-----------|
| GL-1 | Spike: SVG.js patterns for groups and ordering | `spike` | **done** | Documents how groups appear in the DOM, selection pitfalls, and reorder operations (insertBefore, etc.). | — | 120 |
| GL-2 | Select and drill into grouped content | `story` | **done** | Click behavior defined (group vs child); selection service can represent group members without breaking SVG.js rules. | GL-1 | 300 |
| GL-3 | Layers panel: visibility and reorder | `story` | **done** | Toggles and moves map to real SVG order; errors surfaced if invalid. | GL-1 | 360 |
| GL-4 | Align layers UI with existing component | `task` | **done** | [`layers-panel`](../../src/app/components/layers-panel/layers-panel.component.ts) wired or refactored per spike; no dead controls. | GL-2, GL-3 | 180 |
| GL-5 | Tests for group/layer operations | `task` | **done** | Service tests for reorder/visibility; component tests as feasible. | GL-3 | 150 |

## Exit criteria

- [x] Documented selection behavior for nested groups.
- [x] Layers panel actions reflect in canvas and export.

## Implementation notes (2026-04-18)

### What was built

- **Service layer**: `getLayerTree()`, `moveElementForward/Backward/ToFront/ToBack()`, `toggleLayerVisibility()`, `groupSelectedElements()`, `ungroupElement()`, `renameElement()`, `getElementName()` on `SvgManipulationService`.
- **Editor commands**: `ReorderCommand`, `ToggleVisibilityCommand`, `GroupCommand`, `UngroupCommand` — all undoable.
- **Canvas interaction**: Click selects the nearest `<g>` ancestor; double-click drills into the group to select individual children. `Ctrl+G` groups, `Ctrl+Shift+G` ungroups. Clip/mask groups bypass group selection (existing clip-group expansion preserved).
- **Layers panel**: Hierarchical tree view with group rows, chevron expand/collapse, visibility toggles (●/○), reorder buttons (↑/↓), Group/Ungroup action buttons. All backed by undo-able commands.
- **Tests**: 35 new service tests + 18 layers panel component tests. 367 total tests pass.

### Known follow-ups (orthogonal issues)

1. **Zero-distance drag on double-click** — Double-click can produce a no-op `TranslateCommand(0,0)` in the undo stack.
2. **Nested group drill-in is single-level** — Only the innermost `<g>` ancestor is used; full Figma-like outermost-first traversal deferred.
3. **`RemoveShapesCommand` index tracking** — Undo assumes shapes are direct children of content group; shapes inside groups may restore to wrong position.
4. **Ghost preview for large `<g>` elements** — `buildDragGhostShapeSubtree()` deep-clones entire group subtrees; could be expensive for very large groups.

## Code touchpoints

- [`src/app/components/layers-panel/layers-panel.component.ts`](../../src/app/components/layers-panel/layers-panel.component.ts)
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts)
- [`src/app/services/shape-selection.service.ts`](../../src/app/services/shape-selection.service.ts)

## Optional batch create

Replace `EPIC_ID` with the epic’s `bd` id.

```bash
bd create "Spike: SVG.js patterns for groups and ordering" -t spike --parent EPIC_ID -l roadmap,layers --estimate 120
bd create "Select and drill into grouped content" -t story --parent EPIC_ID -l roadmap,layers --estimate 300
```

## Beads execution notes

1. `bd create "Groups and layer management" -t epic -l roadmap,post-mvp -d "Groups, layers panel, ordering."`
2. Create GL-1…GL-5 with `--parent` and dependency links between ordered work.
