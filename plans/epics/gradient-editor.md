# Epic plan: Gradient editor (bd `svg-editor-e1x` + AS-1)

## Bead

| Field | Value |
|--------|--------|
| **bd id** | `svg-editor-e1x` |
| **Title** | Full gradient editor UI (phase 2) |
| **Depends on** | `svg-editor-brz` (gradient fill picker guard — **closed**) |

## Foundation

| Input | Location |
|--------|----------|
| **AS-1 spike** | [svg-js-gradient-pattern-support.md](../spikes/svg-js-gradient-pattern-support.md) |
| **Prior epic** | [advanced-styling](./advanced-styling.md) (AS-1 … AS-5) |

## Phases (implementation)

1. **Service + model** — [`svg-gradient.ts`](../../src/app/models/svg-gradient.ts), [`SvgManipulationService`](../../src/app/services/svg-manipulation.service.ts): resolve id, refcount, dedicate clone, read/write `EditableGradientModel`, create linear default.
2. **History** — [`SetPaintGradientSnapshotCommand`](../../src/app/models/editor-commands.ts).
3. **UI** — gradient section in properties (linear fields, stops, type toggle radial when implemented); single-select only for v1.
4. **Harden** — Vitest for service + panel; shared-gradient dedication; stroke deferred to same APIs in a follow-up pass (see spike).

## Exit criteria

- User can create a linear gradient fill from a solid selection, edit stops and axis endpoints, switch linear ↔ radial where implemented, and undo/redo without corrupting `url(#id)` refs for the edited shape.
- Shared defs: editing one shape does not silently change another (**dedicate** on edit).

## ROADMAP

Listed as a free-standing P3 item in [ROADMAP.md](../ROADMAP.md) (`svg-editor-e1x`).
