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

### Phase 1 — path operands (complete)

| Bead | Title |
|------|--------|
| `svg-editor-0zh.1` | BO-1: Spike — boolean path geometry algorithm and SVG output strategy |
| `svg-editor-0zh.2` | BO-2: Union MVP |
| `svg-editor-0zh.3` | BO-3: Boolean operations panel |
| `svg-editor-0zh.4` | BO-4: Subtract |
| `svg-editor-0zh.5` | BO-5: Intersect |
| `svg-editor-0zh.6` | BO-6: Live preview |
| `svg-editor-0zh.7` | BO-7: E2E and integration tests |

### Phase 2 — primitive operands (rect, circle, ellipse)

| Bead | Title | Depends on |
|------|--------|------------|
| `svg-editor-0zh.8` | BO-8: Spike — primitive operands for boolean operations | — |
| `svg-editor-0zh.9` | BO-9: Rectangles as boolean operands | BO-8 |
| `svg-editor-0zh.10` | BO-10: Circles and ellipses as boolean operands | BO-8 |
| `svg-editor-0zh.11` | BO-11: E2E and panel updates for primitive boolean ops | BO-9, BO-10 |
| `svg-editor-0zh.13` | BO-13: Make compound path — combine selection without boolean merge | BO-3 (done) |
| `svg-editor-0zh.14` | BO-14: Compound path with rect, circle, and ellipse operands | BO-13 |
| `svg-editor-0zh.15` | Outline to path — convert single primitive to editable path | — |

### Phase 3 — curve fidelity (future / P4)

| Bead | Title | Depends on |
|------|--------|------------|
| `svg-editor-0zh.12` | BO-12: Spike — curve-preserving boolean output (future) | — |

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
