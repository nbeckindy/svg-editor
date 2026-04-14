# Epic: Multi-select and keyboard shortcuts

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Multi-select and keyboard shortcuts |
| **Goal** | Users can select multiple shapes, clear selection efficiently, and drive common actions from the keyboard without conflicting with browser defaults. |
| **Labels** | `roadmap`, `post-mvp`, `selection` |
| **Type** | `epic` |
| **bd id** | `svg-editor-3b7` |

## Child issues (bd-mappable)

| Local ref | Title | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|------|---------------------|------------|-----------|
| SI-1 | Spike: document current selection and marquee flows | `spike` | Short note in issue: list entry points in `svg-canvas`, `marquee-selection`, `shape-selection`; list gaps for multi-ID state. | — | 90 |
| SI-2 | Extend selection model to multiple shape IDs | `story` | Selection service exposes a stable multi-select API; canvas applies distinct style to all selected shapes; single-click and shift/meta modifiers documented in issue. | SI-1 | 240 |
| SI-3 | Properties panel behavior for multi-selection | `story` | Mixed fill/stroke shows indeterminate or batch apply; no silent wrong writes. | SI-2 | 180 |
| SI-4 | Keyboard shortcuts for selection and edit actions | `task` | Documented shortcuts (e.g. select all, deselect, delete) with graceful no-op when unsupported; does not break typing in inputs. | SI-2 | 120 |
| SI-5 | Tests for multi-select and shortcuts | `task` | Unit tests for selection service; component tests or harness tests where appropriate. | SI-3, SI-4 | 150 |
| SI-6 | Layers panel: sync with multi-selection from canvas | `story` | Layer clicks and canvas multi-select stay consistent; behavior documented. | SI-2 (`svg-editor-3b7.2`) | 120 |
| SI-7 | Pointer: Ctrl/Meta+click additive selection on canvas | `story` | Modifier+click adds/removes shapes without breaking Shift marquee or clip-group rules. | SI-2 | 180 |
| SI-8 | Selection highlight API: implement or remove no-op | `task` | Implement `highlightShape` to match overlay or remove API and update callers/tests. | SI-2 | 90 |

**Beads IDs:** SI-1 `svg-editor-3b7.1` (closed); SI-2 `svg-editor-3b7.2` (closed); SI-3 … SI-5 `svg-editor-3b7.3`–`3b7.5`; SI-6 `svg-editor-3b7.6`; SI-7 `svg-editor-3b7.7`; SI-8 `svg-editor-3b7.8`.

## Exit criteria

- All child issues closed; `npm test` / `ng test` passes for touched suites.
- Manual smoke: load sample SVG, multi-select via shift, apply fill to selection, keyboard deselect.

## Code touchpoints

- [`src/app/services/shape-selection.service.ts`](../../src/app/services/shape-selection.service.ts)
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts)
- [`src/app/utils/marquee-selection.ts`](../../src/app/utils/marquee-selection.ts)
- [`src/app/components/properties-panel/properties-panel.component.ts`](../../src/app/components/properties-panel/properties-panel.component.ts)

## Optional batch create (after epic ID is known)

Replace `EPIC_ID` with the epic’s `bd` id.

```bash
bd create "Spike: document current selection and marquee flows" -t spike --parent EPIC_ID -l roadmap,selection \
  --acceptance "Note lists svg-canvas, marquee-selection, shape-selection entry points and gaps for multi-ID state." --estimate 90

bd create "Extend selection model to multiple shape IDs" -t story --parent EPIC_ID -l roadmap,selection \
  --acceptance "Multi-select API; all selected shapes styled; modifier behavior described in issue." --estimate 240 \
  --deps "discovered-from:SI_PREV_ID"

# …create SI-3…SI-5 similarly, setting --deps to prior bead IDs as appropriate.
```

## Beads execution notes

1. Create the epic: `bd create "Multi-select and keyboard shortcuts" -t epic -l roadmap,post-mvp -d "Multi-select, properties panel, keyboard shortcuts."`
2. Create children with `--parent <epic-id>` in order; use `--deps` when a story truly blocks another (use actual issued ids, e.g. `blocks:bd-12`).
