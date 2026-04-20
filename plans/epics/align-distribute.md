# Epic: Align and distribute

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Align and distribute |
| **Goal** | Users can align and distribute multiple selected shapes relative to the selection bounds, matching standard design tool expectations. |
| **Labels** | `roadmap`, `mvp`, `alignment` |
| **Type** | `epic` |
| **bd id** | TBD |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| AD-1 | Alignment commands | — | `story` | `AlignCommand` supports left, center, right, top, middle, bottom alignment for multi-selection via `TranslateCommand` + `CompositeCommand` pattern. AC: (1) minimum 2 selected shapes (no-op / guard if fewer); (2) reference frame = union of selected bboxes (not canvas/artboard); (3) consistent bbox mode across all operations (use `getShapeBBox` with same `preferScreenBounds` option); (4) handles degenerate bounds (zero width/height) — no-op; (5) multi-shape translates as one composite undo step using `snapshotSelectionTransforms` + `TranslateCommand` per shape; (6) selection refresh handled automatically via `editorHistory.revision()` effect. | — | 150 |
| AD-2 | Distribute spacing commands | — | `story` | `DistributeCommand` supports horizontal and vertical equal spacing for 3+ selected shapes. AC: (1) minimum 3 shapes (no-op if fewer); (2) shapes sorted by position along the axis (center-x for horizontal, center-y for vertical); (3) total span = distance between first and last shape centers; gaps distributed equally; (4) overlapping shapes still sorted and spaced; (5) stable tie-breaking when positions are equal; (6) same undo pattern as AD-1 (composite TranslateCommand). | AD-1 | 120 |
| AD-3 | Alignment toolbar UI | — | `story` | Properties panel (or toolbar section) shows align/distribute buttons. AC: (1) align buttons (6) disabled when `selectionCount < 2`; (2) distribute buttons (2) disabled when `selectionCount < 3`; (3) follows existing `pushCommand` pattern from properties panel; (4) visible only in selector mode. | AD-1, AD-2 | 120 |
| AD-4 | Keyboard shortcuts for alignment | — | `task` | Fixed keyboard shortcuts for common alignment operations. AC: (1) shortcuts as centralized constants (not user-configurable for MVP); (2) active only in selector tool + not in input fields (reuse `shouldIgnoreKeyboardShortcuts`); (3) modifier scheme avoids conflicts with existing shortcuts (Ctrl/Cmd+Shift+... prefix); (4) documented in tooltip on buttons. | AD-1 | 60 |
| AD-5 | Tests for align and distribute | — | `task` | Tests for alignment math and commands. AC: (1) unit tests for alignment math (each of 6 directions) + distribute (H/V); (2) command undo round-trip; (3) edge cases: 1 shape no-op, 2 shapes distribute no-op, zero-size bbox; (4) component tests for button disable states. | AD-1, AD-2 | 120 |

## Exit criteria

- Multi-selected shapes can be aligned along any axis (L/C/R/T/M/B) relative to selection bounds.
- Three or more selected shapes can be distributed with equal spacing.
- All alignment and distribution operations are undoable/redoable.
- UI buttons are visible and disabled/enabled appropriately based on selection count.

## Code touchpoints

- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — alignment/distribution math (bbox, translate APIs exist)
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — `AlignCommand`, `DistributeCommand` (reuse `CompositeCommand` + `TranslateCommand`)
- [`src/app/components/properties-panel/properties-panel.component.ts`](../../src/app/components/properties-panel/properties-panel.component.ts) — alignment buttons
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — keyboard shortcuts

## Notes

- Alignment relative to canvas/artboard (vs. selection bounds) is deferred. The goal has been narrowed to selection-relative alignment for MVP.
- `TranslateCommand`, `CompositeCommand`, and `snapshotSelectionTransforms` patterns are proven in drag-gesture; alignment reuses them directly.
- "Configurable" shortcuts deferred to post-MVP; AD-4 uses fixed constants.
