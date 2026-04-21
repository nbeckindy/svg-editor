# Epic: File operations and viewport UX

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | File operations and viewport UX |
| **Goal** | Users can download their edited SVG, start a new canvas, and use standard viewport controls (wheel zoom, keyboard shortcuts). |
| **Labels** | `roadmap`, `mvp`, `file-ops`, `viewport` |
| **Type** | `epic` |
| **bd id** | `svg-editor-we7` |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| FO-1 | Download SVG button | `svg-editor-we7.1` | `story` | Toolbar download button triggers browser download of exported SVG file. AC: (1) uses `exportSVG()` + Blob + `URL.createObjectURL` + anchor click pattern; (2) default filename `document.svg` (or original upload name if available); (3) MIME type `image/svg+xml`; (4) button disabled or hidden when no SVG loaded (`svgContent() === ''`); (5) button placed in toolbar row alongside file-upload/tool-strip. | — | 60 |
| FO-2a | New canvas: default empty document | `svg-editor-we7.2` | `story` | "New" button creates a fresh empty SVG document with default artboard. AC: (1) produces a minimal valid SVG string (not empty string — `initializeSVG` needs valid `<svg>` to parse); (2) default viewBox (e.g. `0 0 800 600`); (3) clears selection, drilled-in group, and marquee state; (4) resets undo/redo history (already done by `initializeSVG`); (5) viewport resets via `canvasView.resetZoom()`. | — | 90 |
| FO-2b | Confirm-if-dirty before new/clear | _(merged into FO-2a)_ | `story` | If document has unsaved changes, prompt user before clearing. AC: (1) "dirty" defined as `editorHistory.canUndo()` (sufficient for MVP); (2) `window.confirm` dialog with clear message; (3) cancel aborts new; (4) no prompt when document is clean. | FO-2a | 60 |
| FO-3 | Mouse wheel zoom and pan | `svg-editor-we7.3` | `story` | Ctrl+scroll zooms at pointer; plain scroll pans vertically; Shift+scroll pans horizontally. AC: (1) uses existing `zoomInAt`/`zoomOutAt` (step-based — may need smooth scaling for continuous wheel); (2) non-passive wheel listener on canvas to `preventDefault`; (3) no-op when no SVG loaded; (4) `overscroll-behavior` or equivalent prevents page scroll when canvas handles the event; (5) trackpad pinch-to-zoom treated as Ctrl+wheel (browsers send `ctrlKey: true` for pinch); (6) zoom factor per wheel delta configurable or sensible default. | — | 120 |
| FO-4 | Keyboard zoom shortcuts | `svg-editor-we7.4` | `story` | Ctrl+Plus/Minus zooms; Ctrl+0 resets to 100%; Ctrl+1 fits to viewport. AC: (1) Ctrl/Cmd parity (reuse `mod` pattern); (2) `+`/`=` and numpad `+` both work for zoom in; (3) Ctrl+0: `resetZoom()` (resets scale and pan); (4) Ctrl+1: `zoomToFitRect` using document viewBox rect + margin (reuse `INITIAL_LOAD_VIEWPORT_FIT_FRACTION` pattern); (5) no-op when no SVG loaded; (6) repeat key behavior works naturally (browser keydown repeat). | — | 60 |
| FO-5 | Tests for file operations and viewport | `svg-editor-we7.5` | `task` | Tests for download, new canvas, wheel zoom, keyboard zoom. AC: (1) unit tests for export string + download trigger (mock `URL.createObjectURL`); (2) unit tests for new-canvas state reset (selection, history, viewport); (3) component tests for keyboard handlers; (4) wheel tests may need E2E/Playwright (jsdom wheel support limited). | FO-1, FO-2a, FO-2b, FO-3, FO-4 | 120 |

## Exit criteria

- Users can download their edited SVG as a `.svg` file.
- Users can start fresh with a new empty canvas (with confirmation if dirty).
- Mouse wheel zoom/pan works as in standard design tools.
- Keyboard zoom shortcuts work.

## Code touchpoints

- [`src/app/app.ts`](../../src/app/app.ts) — download button, new canvas action
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — wheel event handler, selection/state reset on new
- [`src/app/services/canvas-view.service.ts`](../../src/app/services/canvas-view.service.ts) — zoom methods (already exist)
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — `exportSVG()` (already exists)

## Notes

- FO-1 (download button) is near-trivial since `exportSVG()` already produces the SVG string.
- FO-2a requires a valid minimal SVG string — empty string will not initialize (parser returns early). The default viewBox values should coordinate with the canvas-artboard epic (epic 14) if both are in scope.
