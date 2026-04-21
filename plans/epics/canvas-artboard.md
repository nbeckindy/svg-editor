# Epic: Canvas and artboard

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Canvas and artboard |
| **Goal** | Users can define document dimensions, set a background color, see a visible artboard boundary, and fit the view to content, providing a clear workspace for creation. |
| **Labels** | `roadmap`, `mvp`, `canvas`, `viewport` |
| **Type** | `epic` |
| **bd id** | `svg-editor-dl9` |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| CA-1a | Artboard model and read path | `svg-editor-ae3` | `story` | Artboard model as single source of truth for document dimensions. AC: (1) `ArtboardModel` (or extension of existing state) stores width, height, background color; (2) populated from parsed SVG `viewBox` on load (aligns with existing `documentViewBox`); (3) supports non-zero `viewBox` origin (`min-x`/`min-y`); (4) default for new documents: 800x600, white background; (5) background color is editor-only for MVP (not exported as a `<rect>` — the existing `data-editor-viewbox-rect` already renders this). | — | 90 |
| CA-1b | Artboard mutation API and DOM sync | `svg-editor-glw` | `story` | Changing artboard dimensions updates editor stage DOM. AC: (1) `setArtboardSize(width, height)` updates `documentViewBox`, resizes `data-editor-viewbox-rect`, `data-editor-outside-rect`, and root stage `viewBox`/size; (2) `setBackgroundColor(color)` updates `data-editor-viewbox-rect` fill; (3) `bumpDocumentRevision` after changes; (4) handles aspect ratio recalculation (existing `initializeSVG` has complex PAR logic — mutation path should mirror it or simplify for user-set dimensions); (5) unit tests for DOM sync. | CA-1a | 120 |
| CA-1c | Artboard export rules | `svg-editor-7sd` | `story` | `exportSVG()` respects artboard dimensions. AC: (1) exported `<svg>` includes `width` and `height` attributes (currently only `viewBox` is emitted); (2) `viewBox` matches artboard model; (3) background color: not exported as content for MVP (editor-only visual); (4) validation: reject zero/negative dimensions. | CA-1a, CA-1b | 90 |
| CA-2 | Artboard boundary chrome | `svg-editor-v2t` | `story` | Visible artboard boundary with polished styling. AC: (1) subtle drop shadow on the document rect (CSS `filter: drop-shadow` or SVG `<filter>`); (2) existing grey outside rect and white document rect already exist — enhance styling without breaking zoom/pan; (3) boundary stroke visible at all zoom levels (`vector-effect: non-scaling-stroke`); (4) no "preview mode" or clipping for MVP (deferred). | CA-1a | 90 |
| CA-3 | Document settings panel | `svg-editor-2vk` | `story` | Settings UI for editing artboard width, height, and background color. AC: (1) panel or dialog with numeric inputs for width/height and color picker for background; (2) changes pushed through `EditorHistoryService` via `ArtboardCommand` (undoable); (3) coalesceable for drag-style inputs (follow properties panel pattern); (4) units displayed as px (SVG user units); (5) validation: min 1, max 10000; (6) accessible from toolbar or properties panel when no shape selected. | CA-1b | 150 |
| CA-4 | Fit-to-content and fit-to-artboard view commands | `svg-editor-vf9` | `story` | Toolbar buttons or shortcuts trigger zoom-to-fit. AC: (1) fit-to-artboard: `zoomToFitRect` with artboard bounds from model + margin (reuse `INITIAL_LOAD_VIEWPORT_FIT_FRACTION` pattern); (2) fit-to-content: `zoomToFitRect` with `getUnionBBox(allShapeIds)` + margin; (3) no-op when no content or no artboard; (4) single-shape edge case: fit to shape bbox; (5) integrates with ruler origin recalculation. | CA-1a | 90 |
| CA-5 | Tests for artboard and document settings | `svg-editor-p70` | `task` | Tests for artboard model, mutation, export, and fit commands. AC: (1) unit tests for model read/write; (2) DOM sync tests (viewBox rect resizes); (3) export tests (width/height in output); (4) fit-to-content zoom math; (5) undo/redo for artboard commands; (6) integration test for resize artboard → export → reload cycle. | CA-1c, CA-3, CA-4 | 120 |

## Exit criteria

- New and loaded documents have defined artboard dimensions visible on the canvas.
- Users can change document width, height, and background color via a settings UI.
- Fit-to-artboard and fit-to-content view commands work correctly.
- Artboard changes are undoable/redoable.
- Exported SVGs include `width`/`height` attributes.

## Code touchpoints

- New `src/app/models/artboard.model.ts` or extend existing SVG service state
- [`src/app/services/canvas-view.service.ts`](../../src/app/services/canvas-view.service.ts) — fit-to-artboard/content zoom
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — viewBox/root dimension management, `exportSVG()` update
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — artboard boundary styling
- New settings panel component or extension to properties panel
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — `ArtboardCommand` (new)

## Notes

- Preview mode (clipping/dimming content outside artboard) is deferred to post-MVP.
- `initializeSVG()` has complex aspect-ratio and stage-sizing logic. CA-1b mutations must align with those invariants or simplify them for user-set dimensions.
- Background color is editor-only for MVP — the existing `data-editor-viewbox-rect` (white) already serves this purpose. CA-1b changes its fill; it is not exported as content.
- CA-4 can depend on CA-1a alone (doesn't need CA-2) for parallel work.
