# Epic: Layer panel — lock, hide, and reorder

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Layer panel — lock, hide, and reorder |
| **Goal** | Users can **lock** layers to prevent accidental edits, **hide** layers for visibility control, and **reorder** layer rows by dragging within the layers panel. |
| **Labels** | `roadmap`, `layers`, `chrome` |
| **Type** | `epic` |
| **bd id** | `svg-editor-m2k` (`CLOSED` in `bd` 2026-05-25) |

## Child issues (`bd`)

| bd id | Title |
|--------|--------|
| `svg-editor-m2k.1` | Epic 23: visibility audit and gap list |
| `svg-editor-m2k.2` | Epic 23: layer lock — model and history |
| `svg-editor-m2k.3` | Epic 23: layer lock — enforce on canvas and inspector |
| `svg-editor-m2k.4` | Epic 23: layers DnD — interaction choice |
| `svg-editor-m2k.5` | Epic 23: layers DnD — sibling reorder command |
| `svg-editor-m2k.6` | Epic 23: layers DnD — panel UI |
| `svg-editor-m2k.7` | Epic 23: QA + regression |

## Implementation notes (2026-05-25)

- **Lock model**: `data-editor-locked="true"` on layer row elements (`EDITOR_LAYER_LOCKED_ATTR`); `ToggleLayerLockCommand`; `LayerTreeNode.locked`; `SvgLayerStructureService` / port helpers `isElementOrAncestorLocked`, `setLayerLocked`.
- **Guards**: `ChromeEditorApplyService` blocks inspector mutations when selection touches a locked subtree; **panel** actions remain: visibility, lock toggle, reorder (buttons + DnD), `group`/`ungroup` blocked when locked; canvas **drag / resize / rotate / skew** start blocked via `gesture-layer-lock.ts` + `TransformGestureDocPort.isElementOrAncestorLocked`; keyboard delete; `svg-canvas` align / distribute / duplicate / group / ungroup.
- **DnD**: Native HTML5 drag from `.layer-drag-handle`; drop on row — upper half = move before target’s following sibling (toward front), lower half = `insertBefore` target; `ReorderBeforeSiblingCommand` + `moveElementBeforeNextSibling` (same parent only).
- **Tests**: `ToggleLayerLockCommand` / `ReorderBeforeSiblingCommand` command specs; layers panel lock button spec; `getLayerTree` locked attribute spec; gesture spec mocks extended.

## Child issues (local LL refs — historical)

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
