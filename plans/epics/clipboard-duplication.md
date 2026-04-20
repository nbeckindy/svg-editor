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
| CP-1 | Internal clipboard model and serialization | `svg-editor-d79.1` | `story` | `ClipboardService` stores serialized shape data for single and multi-shape clipboard. AC: (1) payload stores ordered `outerHTML` blobs + insertion indices (reuse `RemoveShapesCommand` snapshot pattern); (2) supports `<g>` subtrees from group selection; (3) internal-only (not OS system clipboard — document as explicit MVP limitation); (4) empty clipboard / clear behavior defined; (5) `<defs>` / `url(#...)` policy: MVP stores markup as-is, paste-time ID remapping handled in CP-3a. | — | 120 |
| CP-2 | Copy and cut commands (Ctrl+C / Ctrl+X) | `svg-editor-d79.2` | `story` | Copy serializes selected shapes to clipboard; cut copies then removes via `RemoveShapesCommand`. AC: (1) no-op when selection empty or focus is in input fields (`shouldIgnoreKeyboardShortcuts`); (2) copy does not modify document or push history; (3) cut = one undo step that restores shapes + selection; (4) uses expanded clip-group IDs (consistent with `removeShapes` expansion); (5) Ctrl/Cmd parity (reuse existing `mod` pattern). | CP-1 | 120 |
| CP-3a | PasteCommand: insert shapes with new IDs | `svg-editor-d79.3a` | `story` | Paste deserializes clipboard payload, generates collision-free IDs, inserts into content group, bumps `documentRevision`, selects new shapes. AC: (1) new IDs via `ensureShapeIds`-style generation; (2) inserted shapes get pointer styling (`makeShapesClickable` equivalent); (3) z-order: append at end (front-most); (4) no-op when clipboard empty; (5) `<defs>` ID remapping within pasted subtree (rename `url(#...)` references to match new IDs); (6) single undo step removes all pasted shapes. | CP-1, CP-2 | 180 |
| CP-3b | Paste offset and multi-shape relative positioning | `svg-editor-d79.3b` | `story` | Pasted shapes offset from source position; multi-shape paste preserves relative layout. AC: (1) offset in root user space (e.g. +10, +10 SVG units); (2) multi-shape relative positions maintained; (3) repeated paste increments offset; (4) composite undo (insert + translate) as one step. | CP-3a | 90 |
| CP-4 | Duplicate shortcut (Ctrl+D) | `svg-editor-d79.4` | `story` | Duplicates selection in place with small offset; does not overwrite clipboard. AC: (1) clones directly from live DOM / selection (not "copy then paste from buffer"); (2) single undo step; (3) clipboard contents unchanged (assertable in tests); (4) same offset and positioning rules as CP-3b; (5) no-op when selection empty or in input. | CP-3a | 90 |
| CP-5a | Unit tests for clipboard service and commands | `svg-editor-d79.5a` | `task` | Unit tests for `ClipboardService`, `PasteCommand`, `DuplicateCommand`. AC: (1) serialization round-trip; (2) command undo/redo for each operation; (3) ID remapping verified (no collisions); (4) clipboard non-mutation after duplicate. | CP-3b, CP-4 | 90 |
| CP-5b | Integration tests for clipboard shortcuts | `svg-editor-d79.5b` | `task` | Component tests for Ctrl+C/X/V/D in `svg-canvas`. AC: (1) shortcuts fire via `document:keydown` host listener; (2) Cmd/Meta parity on macOS; (3) shortcuts ignored when focus in INPUT/TEXTAREA/SELECT; (4) selector tool gating (clipboard shortcuts active in selector mode). | CP-5a | 90 |

## Exit criteria

- Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D all work as expected.
- Pasted/duplicated shapes appear in the layer stack and are selected.
- All clipboard operations are undoable/redoable.
- Multi-shape copy/paste preserves relative positions.

## Code touchpoints

- New `src/app/services/clipboard.service.ts`
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — `PasteCommand`, `DuplicateCommand`
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — keyboard shortcuts
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — shape insert + ID generation + `makeShapesClickable` (extend existing)

## Notes

- `RemoveShapesCommand` has a potential edge case: constructor snapshots `shapeIds` but `execute()` calls `removeShapes()` which expands via `expandSelectionByClipGroups`. If expansion removes un-snapshotted nodes, undo may be incomplete. CP-2 (cut) should verify alignment or fix this.
- MVP explicitly uses internal clipboard only (not OS system clipboard).
