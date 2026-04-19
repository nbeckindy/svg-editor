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
| SC-1 | New EditorTool entries (rect, ellipse, line) and tool strip buttons | `svg-editor-og7.1` | `story` | Tool strip shows rect/ellipse/line buttons; clicking switches active tool; cursor changes per tool. | — | 120 |
| SC-2 | Click-and-drag creation gesture for rectangles | `svg-editor-og7.2` | `story` | Drag on canvas in rect mode creates a new `<rect>`; ghost preview during drag; auto-selected after creation. | SC-1 | 180 |
| SC-3 | Click-and-drag creation gesture for ellipses | `svg-editor-og7.3` | `story` | Drag in ellipse mode creates `<ellipse>`; Shift constrains to circle; ghost preview. | SC-1 | 180 |
| SC-4 | Click-and-drag creation gesture for lines | `svg-editor-og7.4` | `story` | Drag in line mode creates `<line>`; Shift constrains to 45-degree angles; ghost preview. | SC-1 | 120 |
| SC-5 | AddShapeCommand (undoable) and history integration | `svg-editor-og7.5` | `story` | Shape creation is undoable/redoable via EditorHistoryService. | SC-2 | 120 |
| SC-6 | Tests for shape creation | `svg-editor-og7.6` | `task` | Unit tests for AddShapeCommand, addShape API, tool switching. | SC-5 | 120 |

## Exit criteria

- Users can create rect, ellipse, and line shapes on the canvas.
- Each creation gesture shows a ghost preview during drag.
- Created shapes appear in the layer stack and are auto-selected.
- Shape creation is fully undoable/redoable.

## Code touchpoints

- [`src/app/services/editor-tool.service.ts`](../../src/app/services/editor-tool.service.ts) — new tool enum values
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — creation gesture handlers
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — addShape API
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — AddShapeCommand
- [`src/app/components/tool-strip/tool-strip.component.ts`](../../src/app/components/tool-strip/tool-strip.component.ts) — new tool buttons
