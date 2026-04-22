# Epic: Pen and path tool

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Pen and path tool |
| **Goal** | Users can create SVG paths using a pen tool with support for line segments and bezier curves. |
| **Labels** | `roadmap`, `mvp`, `creation`, `paths` |
| **Type** | `epic` |
| **bd id** | `svg-editor-tfs` |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| PP-1 | Pen tool mode and tool strip integration | `svg-editor-tfs.1` | `story` | `EditorTool` gets a `pen` entry; tool strip shows pen button. AC: (1) clicking switches to pen mode with crosshair cursor (CSS host class on `.canvas-container`); (2) `data-testid` for button (`tool-pen`); (3) selection chrome hidden in pen mode (`showResizeHandles` false); (4) no-op if `svgContent()` is empty; (5) coordinate with SC-1 if both land — share `EditorTool` extension pattern. | SC-1 | 60 |
| PP-2a | Pen session state and path service API | `svg-editor-tfs.2` | `story` | Path model and service methods for building paths incrementally. AC: (1) structured path segment model (array of segments with type `L`/`C` + control points), not just string concatenation; (2) `beginPath()` / `addPoint()` / `finishPath()` on service or dedicated `PenSession` class; (3) generates valid SVG `d` attribute from segment model; (4) `insertPathIntoContentGroup` helper (reuses SC-2a `addShape` pattern with `<path>` type); (5) unit tests for `d` string generation. | PP-1 | 120 |
| PP-2b | Click-to-place path points (line segments) | `svg-editor-tfs.3` | `story` | Clicking on canvas in pen mode adds points; path renders as connected line segments. AC: (1) `onCanvasMouseDown` routes to pen handler (update selector guard); (2) rubber-band line from last point to cursor during drawing; (3) Enter finishes open path; double-click finishes and adds final point; Escape cancels entire path (removes it); (4) minimum 2 points for a valid path; (5) coordinates via `clientToEditorSvgPoint` in root SVG user space; (6) path auto-selected after finish; (7) tool switches back to selector after finish. | PP-2a | 150 |
| PP-3 | Click-and-drag for bezier curves | `svg-editor-tfs.4` | `story` | Click-and-drag in pen mode creates cubic bezier control handles. AC: (1) drag after click-down creates symmetric control handles (cubic `C` segment); (2) click without drag = corner point (line `L` segment); (3) real-time curve preview during drag; (4) handles visible during drawing session; (5) dragging back to previous point behavior defined (no-op or close path). | PP-2b | 240 |
| PP-4 | AddPathCommand and history integration | `svg-editor-tfs.5` | `story` | Path creation pushed through `AddPathCommand` via `EditorHistoryService`. AC: (1) undo removes the created path; (2) redo re-inserts at same position; (3) selection restored on undo/redo; (4) path inserted as single undo step (all points from one pen session = one command); (5) does not coalesce with other commands. | PP-2b | 120 |
| PP-5a | Unit tests for path creation | `svg-editor-tfs.6` | `task` | Unit tests for pen session, path data generation, AddPathCommand. AC: (1) segment model → `d` string for lines and curves; (2) command undo/redo round-trip; (3) empty/single-point paths rejected. | PP-4 | 90 |
| PP-5b | Integration tests for pen tool flow | `svg-editor-tfs.7` | `task` | Component tests for pen tool canvas interaction. AC: (1) click sequence produces path; (2) Enter/double-click finish; (3) Escape cancels; (4) rubber-band preview visible during drawing. | PP-4 | 90 |

## Exit criteria

- Users can create open and closed paths with line segments using the pen tool.
- Click-and-drag creates bezier curves with control handles.
- Path creation is fully undoable/redoable.
- Rubber-band preview shown during drawing.

## Code touchpoints

- [`src/app/services/editor-tool.service.ts`](../../src/app/services/editor-tool.service.ts) — `pen` tool enum value
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — pen gesture handling, rubber-band preview
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — path insertion, `d` attribute helpers
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — `AddPathCommand`
- [`src/app/components/tool-strip/tool-strip.component.ts`](../../src/app/components/tool-strip/tool-strip.component.ts) — pen tool button

## Notes

- Additional tracker issues (not in the PP-x table): `svg-editor-tfs.8` (confirm discard on tool/doc change), `svg-editor-tfs.9` (feedback when finish is invalid), `svg-editor-tfs.10` (pen hit-test / click target policy), `svg-editor-tfs.11` (optional richer cubic handle model vs chord-thirds).
- **PP-4:** finished pen paths use `AddPathCommand` (undo removes path and clears selection; redo re-inserts and re-selects).
- Node editing of existing paths has been split into its own epic ([path-node-editing](./path-node-editing.md)).
- The path segment model (PP-2a) is foundational — PP-3 (bezier curves) extends it with `C` segments. Choosing a structured representation up front avoids a refactor when adding curves.
- `onCanvasMouseDown` selector-only guard must be updated (same shared blocker as shape creation SC-2b).
