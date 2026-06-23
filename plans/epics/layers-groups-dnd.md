# Epic: Layer–group drag-and-drop

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Layer–group drag-and-drop |
| **Goal** | Users can reorganize the **Live tree** from the layers panel by dragging: pull shapes out of **Group**s into their own layer rows, drop layer rows into **Group**s, and reorder children **within** a **Group**. |
| **Labels** | `roadmap`, `layers`, `groups` |
| **Type** | `epic` |
| **bd id** | `TBD` |

## Child issues (bd-mappable)

| Local ref | Title | Type | Acceptance criteria (summary) | Depends on |
|-----------|--------|------|--------------------------------|------------|
| LG-1 | Reparent via panel DnD (into / out of groups) | `story` | Drop target resolves to `<g>` or root list; reparent updates DOM order; selection and **History** stay consistent; regression tests for prior group bugs (`cno`-class issues). | [layers-panel-lock-hide-reorder](./layers-panel-lock-hide-reorder.md) LL-3 |
| LG-2 | Intra-group reorder | `story` | Drag among siblings inside a **Group** changes paint order only; expand/collapse or indent UX as product specifies. | LG-1 |

## Exit criteria

- Panel DnD can move layer rows between root and nested **Group** containers.
- Users can reorder items within a **Group** from the panel.
- Undo/redo and selection remain coherent after reparent operations.

## Code touchpoints (initial)

- Layer tree component, drag-drop handlers, commands for reparent/reorder, **ChromeEditorApplyService** or equivalent **History** batching.

## Implementation notes (2026-06)

- **Interaction library:** `@angular/cdk/drag-drop` — `cdkDropList` on the flat layer list, `cdkDrag` + `cdkDragHandle` on each row.
- **Animated preview:** CDK placeholder gap during drag; custom row classes for **drop into group** (middle zone) and cross-parent reparent indicators.
- **Source of truth:** SVG **Live tree** — drop commits via `ReorderBeforeSiblingCommand` / `ReparentElementsCommand`; list re-renders from `documentRevision()`, not local array mutation.
- **Reorder affordances:** Per-row arrow buttons removed; step and extreme reorder via layer row right-click context menu (`MatMenu`).

## Notes

- **Group** vocabulary: [CONTEXT.md](../../CONTEXT.md).
- Coordinate UX with [layers-panel-lock-hide-reorder](./layers-panel-lock-hide-reorder.md) so one DnD interaction model covers reorder + reparent.
- Supersedes the native HTML5 DnD approach documented in [layers-panel-lock-hide-reorder](./layers-panel-lock-hide-reorder.md) (2026-05-25).
