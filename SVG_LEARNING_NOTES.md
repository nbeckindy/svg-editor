# SVG Learning Notes

Concise project notes about SVG path behavior and editor implications.

## Path command mental model

- A path is a sequence of drawing commands in `d`.
- Commands are either absolute (`M`, `L`, `C`) or relative (`m`, `l`, `c`).
- Common commands:
  - `M`: move current point (starts a subpath).
  - `L`: line to point.
  - `H` / `V`: horizontal / vertical line shortcuts.
  - `C`: cubic Bezier curve.
  - `Q`: quadratic Bezier curve.
  - `T`: smooth quadratic (implicit reflected control; can be normalized to `Q`).
  - `A`: elliptical arc.
  - `Z`: close current subpath.

## Why normalize commands in an editor

- Editing logic is simpler if path data is normalized to a smaller internal set.
- In this project, normalization uses explicit segments (`M/L/C/Q/Z`) for node editing.
- This avoids per-command special cases in hit-testing, dragging, inserting, deleting, and undo/redo.

## `H` / `V` vs `L`

- `H` and `V` are syntax sugar for axis-aligned `L`.
  - `M 10 10 H 30` == `M 10 10 L 30 10`
  - `M 10 10 V 40` == `M 10 10 L 10 40`
- Runtime differences are negligible:
  - No meaningful rendering/styling advantage over `L`.
  - Tiny possible text-size savings only.
- Editor implication: normalize `H/V` to `L` for consistency.

## Arcs (`A`) and editing complexity

- Arc segments encode more geometry than Bezier lines/curves:
  - radii (`rx`, `ry`)
  - x-axis rotation
  - `large-arc` and `sweep` flags
  - endpoint
- This is why arc-aware node editing is more complex than `L/C/Q`.

## Current practical strategy

- Parse `A/a`, then convert arcs into one or more cubic Bezier (`C`) segments.
- Benefits:
  - Arc-containing paths become editable immediately with existing node-edit tools.
  - Reuses current `C` editing UX and command pipeline.
- Tradeoff:
  - Original arc primitives are not preserved after edit (destructive normalization).

## Subpaths and closure details

- A single `d` string can contain multiple subpaths (`M ... Z M ...`).
- `Z` closes to the subpath start point, not necessarily to the previous command point.
- Node-edit/insert logic must track:
  - current point
  - current subpath start
  - transitions across multiple subpaths

## Serialization notes

- Emit normalized uppercase commands for deterministic output.
- Deterministic serialization improves:
  - diff readability
  - round-trip tests
  - undo/redo stability

## Future research

- Prototype a native arc editor UX (instead of only arc->cubic conversion):
  - on-canvas handles for sweep/start/end/radius/rotation
  - decide whether arc flags are explicit controls or inferred from gestures
  - compare interaction patterns from Inkscape/Figma/Affinity
