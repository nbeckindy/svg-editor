# Epic: Layer panel — lock, hide, and reorder

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Layer panel — lock, hide, and reorder |
| **Goal** | Users can **lock** layers to prevent accidental edits, **hide** layers for visibility control, and **reorder** layer rows by dragging within the layers panel. |
| **Labels** | `roadmap`, `layers`, `chrome` |
| **Type** | `epic` |
| **bd id** | `TBD` |

## Child issues (bd-mappable)

| Local ref | Title | Type | Acceptance criteria (summary) | Depends on |
|-----------|--------|------|--------------------------------|------------|
| LL-1 | Layer hide / show in panel | `story` | Each layer row toggles **Layer visibility**; hidden subtrees do not paint; state persists with **History** where appropriate; tests. | — |
| LL-2 | Layer lock in panel | `story` | Locked rows reject direct manipulation of descendant shapes (transforms, drags, property writes) per product rules; clear affordance in panel; tests. | LL-1 optional |
| LL-3 | Drag-and-drop reorder in layers panel | `story` | Reorder changes **Live tree** paint order; undo/redo; no broken group invariants beyond what epic [layers-groups-dnd](./layers-groups-dnd.md) defines. | LL-1 |

## Exit criteria

- Users can hide and show layers from the panel; canvas reflects visibility.
- Users can lock and unlock layers; edits are blocked according to agreed rules.
- Users can reorder layers by dragging within the panel, with undo/redo.

## Code touchpoints (initial)

- Layers tab **Chrome** (inspector dock), layer list model, commands that reorder / toggle visibility / lock flags on layer-backed nodes.

## Notes

- Vocabulary: **Layer lock**, **Layer visibility** — see [CONTEXT.md](../../CONTEXT.md).
- Builds on closed epic [groups-layers](./groups-layers.md); scope here is panel affordances and reorder, not cross-group reparenting (see [layers-groups-dnd](./layers-groups-dnd.md)).
