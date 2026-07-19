# Epic: Text editing

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Text editing |
| **Goal** | Users can edit text content, font properties, alignment, and create new text elements. |
| **Labels** | `roadmap`, `mvp`, `text` |
| **Type** | `epic` |
| **bd id** | `svg-editor-nkz` |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| TE-1a | Text inline edit: overlay and commit | `svg-editor-nkz.1a` | `story` | Double-click on `<text>` in selector mode shows editable overlay; Escape or click-outside commits. AC: (1) double-click on text enters edit (does not trigger group drill-in — `onCanvasDoubleClick` must branch: group → drill, text → edit, other → no-op); (2) HTML overlay (contenteditable or textarea) positioned to match text element in SVG user space, accounting for zoom/pan; (3) Escape commits and exits edit mode; (4) click outside overlay commits and exits; (5) no-op when multiple shapes selected or selection is not `<text>`; (6) `<tspan>` within `<text>` treated as part of parent text for MVP. | — | 180 |
| TE-1b | TextContentCommand and history | `svg-editor-nkz.1b` | `story` | Text content changes are undoable via `TextContentCommand`. AC: (1) command stores old and new text content; (2) undo restores previous content; (3) redo re-applies edit; (4) command pushed on commit (not on every keystroke); (5) `ShapeProperties` extended with text content field. | TE-1a | 90 |
| TE-2 | Font family, size, and weight controls | `svg-editor-nkz.2` | `story` | Properties panel shows font-family dropdown, font-size input, bold/italic toggles for text elements. AC: (1) `ShapeProperties` extended with `fontFamily`, `fontSize`, `fontWeight`, `fontStyle` fields; (2) `getShapeProperties` reads font attributes from element; (3) `FontCommand` (coalesceable) for each property; (4) multi-select: show "Mixed" when values differ (mirror `fillMixed()` pattern); (5) controls visible only when selection includes `<text>` elements; (6) font source is system fonts (no embedded `@font-face` for MVP). | TE-1b | 180 |
| TE-3 | Text alignment (left/center/right) | `svg-editor-nkz.3` | `story` | Properties panel shows text-anchor alignment buttons. AC: (1) maps L/C/R to SVG `text-anchor` values `start`/`middle`/`end`; (2) changes undoable via command; (3) multi-select supported; (4) vertical alignment (`dominant-baseline`) deferred. | TE-1b | 90 |
| TE-4 | Create new text element tool | `svg-editor-nkz.4` | `story` | Text tool in tool strip; click on canvas places new `<text>` and enters inline edit. AC: (1) `EditorTool` extended with `text` entry (reuse SC-1 pattern); (2) click on empty canvas inserts `<text>` via `addShape` API (from SC-2a) at click point in SVG user space; (3) default text content (e.g. "Text"); (4) auto-enters inline edit mode after placement; (5) uses `AddShapeCommand` for undo; (6) text tool remains active after placement and while typing; (7) click on existing content `<text>` / `<tspan>` selects it and enters inline edit (select tool still uses transform handles on single click). | TE-1a, SC-1, SC-2a, SC-5 | 180 |
| TE-5a | Unit tests for text commands and properties | `svg-editor-nkz.5a` | `task` | Unit tests for `TextContentCommand`, `FontCommand`, text property reading. AC: (1) command undo/redo for content, font family, size, weight, style, anchor; (2) `ShapeProperties` text fields populated correctly. | TE-2, TE-3 | 90 |
| TE-5b | Integration tests for text editing flow | `svg-editor-nkz.5b` | `task` | Component/E2E tests for inline edit and text tool. AC: (1) double-click text → overlay appears; (2) type → commit → text updated; (3) text tool click → new element + edit mode; (4) jsdom constraints documented (overlay focus may need Playwright). | TE-4 | 90 |

## Exit criteria

- Users can double-click text to edit content inline.
- Font family, size, weight, and alignment are editable from the properties panel.
- Users can create new text elements via a text tool.
- All text operations are undoable/redoable.

## Code touchpoints

- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — inline edit overlay, text tool gesture, double-click branch update
- [`src/app/components/properties-panel/properties-panel.component.ts`](../../src/app/components/properties-panel/properties-panel.component.ts) — font controls
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — `TextContentCommand` (new), `FontCommand` (new)
- [`src/app/models/shape-properties.interface.ts`](../../src/app/models/shape-properties.interface.ts) — text/font fields
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — text attribute reads/writes, `getShapeProperties` extension
- [`src/app/services/editor-tool.service.ts`](../../src/app/services/editor-tool.service.ts) — `text` tool entry
- [`src/app/components/tool-strip/tool-strip.component.ts`](../../src/app/components/tool-strip/tool-strip.component.ts) — text tool button

## Notes

- TE-4 has an explicit dependency on shape creation (SC-1, SC-2a, SC-5) for `addShape` API and `AddShapeCommand`. Shape creation epic should land first.
- `onCanvasDoubleClick` currently only handles group drill-in. TE-1a must add a branch for `<text>` elements.
- `TextContentCommand` and `FontCommand` do not exist in the codebase; they are greenfield.
