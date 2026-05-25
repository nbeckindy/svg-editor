# Epic: Symbols and reusable instances (post-MVP)

Document-level **symbols** (definitions) and **instances** (reuse) with update propagation — common in Illustrator / Figma-style workflows. This is **post-MVP**: large discovery surface (defs, `<use>`, overrides, export, performance).

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Epic: Symbols and reusable instances |
| **Goal** | Users can define reusable graphic symbols and place instances that stay linked to the master, with a clear story for editing and export. |
| **Labels** | `roadmap`, `symbols`, `defs`, `post-mvp` |
| **Type** | `epic` |
| **bd id** | `svg-editor-hya` — epic bead (`bd show svg-editor-hya`); promoted from TP-6 when [`svg-editor-j24`](./tool-parity-pen.md) closed. |

## Relationship to prior roadmap

This work was **TP-6** on [tool parity and pen authoring](./tool-parity-pen.md). It is intentionally **deferred past phase 3** delivery pressure.

## Child issues (bd-mappable)

File spikes and vertical slices as **children of** `svg-editor-hya` when splitting work (this epic bead is the umbrella).

## Exit criteria

- Documented target behavior vs SVG `<symbol>` / `<use>` and editor constraints.
- First vertical slice (e.g. single symbol + one instance type) agreed and trackable as child issues.

## Code touchpoints (future)

- `<defs>`, id stability, [`svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts), layer tree, export pipeline

## Beads hygiene

- **`svg-editor-j24`:** closed 2026-05-25 after `svg-editor-hya` was reparented to root and promoted to `epic`.
