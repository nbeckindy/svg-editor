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
| FO-1 | Download SVG button | `svg-editor-we7.1` | `story` | Toolbar download button triggers browser download of exported SVG file. | — | 60 |
| FO-2 | New/clear canvas action | `svg-editor-we7.2` | `story` | 'New' button clears canvas to empty state with default viewBox; confirms if unsaved changes. | — | 60 |
| FO-3 | Mouse wheel zoom | `svg-editor-we7.3` | `story` | Ctrl+scroll zooms at pointer; plain scroll pans vertically; Shift+scroll pans horizontally. | — | 90 |
| FO-4 | Keyboard zoom shortcuts | `svg-editor-we7.4` | `story` | Ctrl+Plus/Minus zooms; Ctrl+0 resets to 100%; Ctrl+1 fits to viewport. | — | 60 |
| FO-5 | Tests for file operations and viewport | `svg-editor-we7.5` | `task` | Unit tests for download, new canvas, wheel zoom, keyboard zoom. | FO-1, FO-3, FO-4 | 90 |

## Exit criteria

- Users can download their edited SVG as a `.svg` file.
- Users can start fresh with a new empty canvas.
- Mouse wheel zoom/pan works as in standard design tools.
- Keyboard zoom shortcuts work.

## Code touchpoints

- [`src/app/app.ts`](../../src/app/app.ts) — download button, new canvas action
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — wheel event handler
- [`src/app/services/canvas-view.service.ts`](../../src/app/services/canvas-view.service.ts) — zoom methods (already exist)
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — exportSVG() (already exists)

## Notes

FO-1 (download button) is near-trivial since `exportSVG()` already produces the SVG string; it just needs a Blob + `URL.createObjectURL` + anchor click pattern to trigger a browser download.
