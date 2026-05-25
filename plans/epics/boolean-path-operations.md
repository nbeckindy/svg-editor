# Epic: Boolean path operations

Boolean geometry for vector paths (union, subtract, intersect), delivered as a **dedicated UI surface** (separate component / dock panel) so it does not overload the main properties panel or selector flows.

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Epic: Boolean path operations |
| **Goal** | Users can combine two or more paths using standard boolean ops with clear preview, undoable commands, and stable SVG output. |
| **Labels** | `roadmap`, `paths`, `booleans`, `tool-parity` |
| **Type** | `epic` |
| **bd id** | `svg-editor-0zh` — epic bead (`bd show svg-editor-0zh`); promoted from TP-5 when [`svg-editor-j24`](./tool-parity-pen.md) closed. |

## Relationship to prior roadmap

This work was **TP-5** on [tool parity and pen authoring](./tool-parity-pen.md) (`svg-editor-j24`). It is now a **standalone phase 3 epic** because scope is large (spike → geometry engine → panel → history → tests) and deserves its own delivery train.

## Child issues (bd-mappable)

File spike / panel / per-operation / test beads as **children of** `svg-editor-0zh` when splitting work (this epic bead is the umbrella).

## UX / architecture notes

- **Separate component panel** (dock or modal) for choosing operands, operation, and preview — not buried in the generic properties strip.
- Reuse path / selection infrastructure from [advanced path editing](./advanced-path-editing.md) and [path node editing](./path-node-editing.md) where possible.

## Exit criteria

- Spike documents algorithm choice (2D polygon clip vs library vs server) and SVG constraints (compound paths, fill rules).
- At least one boolean operation is shippable end-to-end with undo/redo.
- Panel is reachable from a predictable entry point (toolbar or selection context).

## Code touchpoints (initial)

- Path geometry, `d` serialization, [`editor-commands.ts`](../../src/app/models/editor-commands.ts), [`svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts)
- New **boolean operations panel** component (routing + DI pattern consistent with other dock panels)

## Beads hygiene

- **`svg-editor-j24`:** closed 2026-05-25 after `svg-editor-0zh` was reparented to root and promoted to `epic`.
