# Epic: Undo and redo

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Undo and redo |
| **Goal** | Users can step backward and forward through editing operations with predictable scope (per session), integrated with SVG.js mutations. |
| **Labels** | `roadmap`, `post-mvp`, `history` |
| **Type** | `epic` |
| **bd id** | `svg-editor-bbc` |

## Child issues (bd-mappable)

| Local ref | Title | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|------|---------------------|------------|-----------|
| EH-1 | Spike: undo granularity and SVG.js strategy | `spike` | Decision recorded: command objects vs snapshot; max stack; which operations are undoable first. | — | 120 |
| EH-2 | Implement undo/redo stack service | `story` | Service applies inverse operations or restores snapshots per spike; API `undo()`, `redo()`, `canUndo`, `canRedo`. | EH-1 | 300 |
| EH-3 | Wire canvas and property edits to history | `story` | Fill/stroke/transform edits push commands; initial load does not pollute stack without an explicit “session start” rule documented in issue. | EH-2 | 240 |
| EH-4 | UI entry points for undo/redo | `task` | Toolbar or menu items plus keyboard shortcuts; disabled state when unavailable. | EH-3 | 90 |
| EH-5 | Tests for history service | `task` | Unit tests cover push/undo/redo boundaries and corruption guards. | EH-2 | 120 |

## Exit criteria

- Undo/redo works for core edit operations defined in the spike.
- Tests green; no unbounded memory growth for typical sessions (threshold in spike).

## Code touchpoints

- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts)
- [`src/app/components/tool-strip/tool-strip.component.ts`](../../src/app/components/tool-strip/tool-strip.component.ts)
- New service (e.g. `editor-history.service.ts`) as decided in EH-1.

## Optional batch create

Replace `EPIC_ID` with the epic’s `bd` id.

```bash
bd create "Spike: undo granularity and SVG.js strategy" -t spike --parent EPIC_ID -l roadmap,history --estimate 120 \
  --acceptance "Documents command vs snapshot, stack limits, first undoable operations."

bd create "Implement undo/redo stack service" -t story --parent EPIC_ID -l roadmap,history --estimate 300 \
  --acceptance "undo/redo API with canUndo/canRedo per decision note."
```

## Beads execution notes

1. `bd create "Undo and redo" -t epic -l roadmap,post-mvp -d "Session undo/redo integrated with SVG.js."`
2. Create EH-1…EH-5 with `--parent`; chain `--deps` where EH-3 depends on EH-2, etc.
