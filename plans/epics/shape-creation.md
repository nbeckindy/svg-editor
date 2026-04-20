# Epic: Shape creation tools

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Shape creation tools |
| **Goal** | Users can create basic SVG shapes (rect, ellipse, line) directly on the canvas via click-and-drag gestures. |
| **Labels** | `roadmap`, `mvp`, `creation` |
| **Type** | `epic` |
| **bd id** | `svg-editor-og7` |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| SC-1 | New EditorTool entries (rect, ellipse, line) and tool strip buttons | `svg-editor-og7.1` | `story` | Tool strip shows rect/ellipse/line buttons; clicking switches active tool; cursor changes to crosshair via CSS host class on `.canvas-container`. AC: (1) `EditorTool` union extended; (2) tool strip buttons with `data-testid`s matching existing pattern (`tool-rect`, `tool-ellipse`, `tool-line`); (3) `showResizeHandles` remains false in creation modes; (4) no-op if `svgContent()` is empty. | — | 120 |
| SC-2a | Shape insert API on SvgManipulationService | `svg-editor-og7.2a` | `story` | `addShape(type, attrs)` inserts a new element into `[data-editor-content-group]` with a unique ID, makes it clickable, bumps `documentRevision`, and returns the ID. AC: (1) supports `<rect>`, `<ellipse>`, `<line>`; (2) default paint (black fill, no stroke) unless overridden; (3) `makeShapesClickable`-equivalent setup on new element; (4) unit tests for insert + ID uniqueness + revision bump. | SC-1 | 120 |
| SC-2b | Click-and-drag creation gesture for rectangles | `svg-editor-og7.2b` | `story` | Drag on canvas in rect mode creates a new `<rect>` via SC-2a API; ghost preview during drag. AC: (1) `onCanvasMouseDown` routes to creation path for non-selector tools (update guard that currently returns early for non-selector); (2) minimum drag threshold (reuse `MARQUEE_MIN_DRAG_PX`); (3) rect normalized when dragging backwards (negative width/height); (4) ghost preview shows rectangle outline during drag; (5) auto-selected after creation; (6) `onCanvasClick` does not fire selection logic in creation modes; (7) sub-threshold drag is no-op (no zero-size shape). | SC-1, SC-2a | 180 |
| SC-3 | Click-and-drag creation gesture for ellipses | `svg-editor-og7.3` | `story` | Drag in ellipse mode creates `<ellipse>` via SC-2a API; Shift constrains to circle. AC: (1) circle = equal `rx`/`ry` from bbox; (2) Shift read live (toggleable mid-drag); (3) minimum size guard (no zero `rx`/`ry`); (4) ghost preview; (5) auto-selected after creation. | SC-1, SC-2a, SC-2b | 180 |
| SC-4 | Click-and-drag creation gesture for lines | `svg-editor-og7.4` | `story` | Drag in line mode creates `<line>` via SC-2a API; Shift constrains to 8-way angles (0°, 45°, 90°, …). AC: (1) angle snapped from drag vector, not document axes; (2) sub-threshold drag is no-op; (3) ghost preview; (4) auto-selected after creation. | SC-1, SC-2a, SC-2b | 120 |
| SC-5 | AddShapeCommand (undoable) and history integration | `svg-editor-og7.5` | `story` | Shape creation pushed through `AddShapeCommand` via `EditorHistoryService`. AC: (1) undo removes the created shape; (2) redo re-inserts at same position; (3) selection restored on undo (shape deselected) and redo (shape re-selected); (4) does not coalesce with other commands; (5) covers rect, ellipse, and line. | SC-2a, SC-2b, SC-3, SC-4 | 120 |
| SC-6a | Unit tests for shape creation API and commands | `svg-editor-og7.6a` | `task` | Unit tests for `addShape`, `AddShapeCommand` undo/redo, tool switching. AC: (1) command round-trip for each shape type; (2) `documentRevision` increments; (3) layer stack updated after creation. | SC-5 | 90 |
| SC-6b | Integration tests for creation gestures | `svg-editor-og7.6b` | `task` | Component-level tests for canvas creation flow. AC: (1) mousedown+drag+mouseup creates shape; (2) Shift constraints verified for ellipse and line; (3) sub-threshold drag produces no shape; (4) ghost preview appears during drag. | SC-5 | 90 |

## Exit criteria

- Users can create rect, ellipse, and line shapes on the canvas.
- Each creation gesture shows a ghost preview during drag.
- Created shapes appear in the layer stack and are auto-selected.
- Shape creation is fully undoable/redoable.
- `onCanvasMouseDown` routes correctly for creation tools (selector guard updated).

## Code touchpoints

- [`src/app/services/editor-tool.service.ts`](../../src/app/services/editor-tool.service.ts) — new tool enum values
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — creation gesture handlers, selector guard update
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — `addShape` API (new)
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — `AddShapeCommand` (new)
- [`src/app/components/tool-strip/tool-strip.component.ts`](../../src/app/components/tool-strip/tool-strip.component.ts) — new tool buttons

## Notes

- The `onCanvasMouseDown` guard (`if tool !== 'selector' return`) is a shared blocker for all new tool modes (creation, pen, text). SC-2b must update this guard to route creation tools through a new code path.
- `addShape` API does not exist; SC-2a is greenfield prerequisite work.
