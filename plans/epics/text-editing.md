# Epic: Text editing

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Text editing |
| **Goal** | Users can edit text content, font properties, alignment, and create new text elements. |
| **Labels** | `roadmap`, `post-mvp`, `text` |
| **Type** | `epic` |
| **bd id** | `svg-editor-nkz` |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| TE-1 | Double-click text to enter inline edit mode | `svg-editor-nkz.1` | `story` | Double-click on `<text>` shows editable overlay; Escape/click-outside commits; undoable via TextContentCommand. | — | 240 |
| TE-2 | Font family, size, and weight controls | `svg-editor-nkz.2` | `story` | Properties panel shows font-family dropdown, font-size input, bold/italic toggles for text elements; changes are undoable. | TE-1 | 180 |
| TE-3 | Text alignment (left/center/right) | `svg-editor-nkz.3` | `story` | Properties panel shows text-anchor alignment buttons; changes update SVG attribute; undoable. | TE-1 | 90 |
| TE-4 | Create new text element tool | `svg-editor-nkz.4` | `story` | Text tool in tool strip; click on canvas places new text with default content and enters inline edit; uses AddShapeCommand. | TE-1 | 180 |
| TE-5 | Tests for text editing | `svg-editor-nkz.5` | `task` | Unit tests for all text commands, font property changes, alignment, tool creation, inline edit lifecycle. | TE-1 through TE-4 | 120 |

## Exit criteria

- Users can double-click text to edit content inline.
- Font family, size, weight, and alignment are editable from the properties panel.
- Users can create new text elements via a text tool.
- All text operations are undoable/redoable.

## Code touchpoints

- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — inline edit overlay, text tool gesture
- [`src/app/components/properties-panel/properties-panel.component.ts`](../../src/app/components/properties-panel/properties-panel.component.ts) — font controls
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — TextContentCommand, FontCommand
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — text attribute updates
- [`src/app/services/editor-tool.service.ts`](../../src/app/services/editor-tool.service.ts) — text tool entry
- [`src/app/components/tool-strip/tool-strip.component.ts`](../../src/app/components/tool-strip/tool-strip.component.ts) — text tool button

## Notes

Text editing is labeled `post-mvp` as it is more complex than other features and can be deferred past initial MVP release. It shares tool infrastructure with shape creation (epic 7), so shape creation should land first.
