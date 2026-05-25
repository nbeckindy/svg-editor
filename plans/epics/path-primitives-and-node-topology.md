# Epic: Path primitives conversion and node topology

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Path primitives conversion and node topology |
| **Goal** | Users can convert **primitive shapes** (circle, rectangle, line) to `<path>` for **Node-edit tool** workflows; add and remove **Path node**s; convert **Corner node**s to **Smooth node**s (Bezier handles) and back. |
| **Labels** | `roadmap`, `paths`, `editing` |
| **Type** | `epic` |
| **bd id** | `TBD` |

## Child issues (bd-mappable)

| Local ref | Title | Type | Acceptance criteria (summary) | Depends on |
|-----------|--------|------|--------------------------------|------------|
| PT-1 | Outline to path (rect, circle, line) | `story` | Command replaces element with equivalent `<path>` preserving appearance (fill/stroke/transform); **History**; works with current segment model; tests for geometry equivalence. | Path node editing (closed) |
| PT-2 | Add / remove path nodes | `story` | Insert node on segment, delete node, preserve valid `d`; undo/redo; integrates with **Node-edit tool**. | PT-1 optional |
| PT-3 | Corner ↔ smooth node conversion | `story` | Toggle segment knots between sharp corner and smooth (symmetric or independent handles per product); undo/redo; overlay affordances. | PT-2 |

## Exit criteria

- Rectangles, circles, and lines can become editable paths at least as well as a typical “Outline stroke” / “Convert to path” flow.
- Path topology can be edited (add/remove knots) without corrupting `d`.
- Users can switch nodes between corner and curve handle modes with predictable geometry.

## Code touchpoints (initial)

- Path segment model, `EditPathNodesCommand` family, **Node-edit tool** overlay, svg.js mutations, [path-node-editing](./path-node-editing.md) / [advanced-path-editing](./advanced-path-editing.md) successors.

## Notes

- Vocabulary: **Outline to path**, **Path node**, **Corner node**, **Smooth node** — [CONTEXT.md](../../CONTEXT.md).
- Corner dragging on a rect after conversion is a **Path node** drag, not a bounding-box handle — document in UX copy if needed.
