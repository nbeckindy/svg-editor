# Epic: Path node editing

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Path node editing |
| **Goal** | Users can edit nodes and control handles of existing SVG paths, enabling fine-grained shape editing beyond object-level transforms. |
| **Labels** | `roadmap`, `mvp`, `paths`, `editing` |
| **Type** | `epic` |
| **bd id** | TBD |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| NE-1 | Path `d` parser and segment model | — | `story` | Parse arbitrary SVG path `d` attributes into the structured segment model (from pen tool PP-2a). AC: (1) handles M, L, C, S, Q, T, A, Z commands (at least M/L/C/Z for MVP); (2) relative and absolute command variants; (3) round-trip: parse → serialize produces equivalent `d` string; (4) error tolerance for malformed paths (best-effort or skip); (5) unit tests with real-world `d` strings from sample SVGs. | PP-2a (segment model) | 180 |
| NE-2 | Enter and exit node-edit mode | — | `story` | Double-clicking a `<path>` in selector mode enters node-edit mode; Escape exits. AC: (1) `onCanvasDoubleClick` branches: group → drill-in, text → inline edit (TE-1a), path → node-edit, other → no-op; (2) node-edit mode renders anchor point markers (small circles) at each node position on the overlay; (3) bezier control handles rendered as lines + small squares for `C`/`S` segments; (4) markers are not selectable as shapes (overlay-only); (5) Escape exits node-edit mode and returns to normal selection; (6) clicking outside the path exits node-edit mode. | NE-1 | 150 |
| NE-3 | Drag nodes to update path | — | `story` | Dragging a node in node-edit mode updates the path `d` attribute. AC: (1) mousedown on node starts drag; mousemove updates position; mouseup commits; (2) `d` attribute updated live during drag (or on commit); (3) control handle drag updates bezier tangent; (4) transform-aware: node positions account for element's CTM; (5) `EditPathNodesCommand` stores old and new `d` for undo/redo; (6) single undo step per drag operation. | NE-2 | 180 |
| NE-4 | Tests for path node editing | — | `task` | Tests for path parsing, node rendering, and edit commands. AC: (1) unit tests for `d` parser round-trip; (2) `EditPathNodesCommand` undo/redo; (3) component tests for node overlay rendering; (4) drag node updates `d` correctly. | NE-3 | 120 |

## Exit criteria

- Existing paths can be node-edited by double-clicking to enter edit mode.
- Anchor points and bezier control handles are visible and draggable.
- Node edits update the path `d` attribute and are fully undoable/redoable.
- Node-edit mode coexists with group drill-in and text inline edit (double-click dispatch).

## Code touchpoints

- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — node-edit overlay, double-click dispatch
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — path `d` parsing and manipulation
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — `EditPathNodesCommand` (new)
- Shared path segment model from pen tool (PP-2a)

## Notes

- This epic was split from the pen and path tool epic to reduce scope. Pen creation (lines + bezier) is in [pen-path-tool](./pen-path-tool.md); node editing of existing paths is here.
- NE-1 (path parser) is the most complex story — arbitrary SVG paths can have many command variants. MVP can limit to M/L/C/Z and treat others as opaque (non-editable segments).
- The `onCanvasDoubleClick` handler is becoming a multi-way dispatch (group/text/path). Consider extracting a `doubleClickDispatch` helper to keep the method clean.
