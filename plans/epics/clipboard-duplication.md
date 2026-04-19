# Epic: Clipboard and duplication

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Clipboard and duplication |
| **Goal** | Users can copy, cut, paste, and duplicate shapes using standard keyboard shortcuts. |
| **Labels** | `roadmap`, `mvp`, `clipboard` |
| **Type** | `epic` |
| **bd id** | `svg-editor-d79` |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| CP-1 | Internal clipboard model | `svg-editor-d79.1` | `story` | ClipboardService stores serialized shape data; supports single and multi-shape clipboard. | — | 120 |
| CP-2 | Copy and cut commands (Ctrl+C / Ctrl+X) | `svg-editor-d79.2` | `story` | Copy serializes to clipboard; cut copies then removes via RemoveShapesCommand; keyboard shortcuts wired. | CP-1 | 120 |
| CP-3 | Paste command (Ctrl+V) with offset positioning | `svg-editor-d79.3` | `story` | Paste deserializes and inserts shapes offset from original; new shapes auto-selected; undoable. | CP-1, CP-2 | 150 |
| CP-4 | Duplicate shortcut (Ctrl+D) | `svg-editor-d79.4` | `story` | Duplicates selection in place with small offset; does not overwrite clipboard. | CP-3 | 60 |
| CP-5 | Tests for clipboard operations | `svg-editor-d79.5` | `task` | Unit tests for service, commands, serialization round-trip, shortcuts. | CP-4 | 120 |

## Exit criteria

- Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D all work as expected.
- Pasted/duplicated shapes appear in the layer stack and are selected.
- All clipboard operations are undoable/redoable.
- Multi-shape copy/paste preserves relative positions.

## Code touchpoints

- New `src/app/services/clipboard.service.ts`
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — PasteCommand, DuplicateCommand
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — keyboard shortcuts
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — shape serialization/deserialization
