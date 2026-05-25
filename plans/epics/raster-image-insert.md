# Epic: Insert raster images into SVG documents

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Insert raster images into SVG documents |
| **Goal** | Users place common raster formats into the canvas as `<image>` elements with undo/redo, selection/transform parity, and clear export semantics. |
| **Labels** | `roadmap`, `raster`, `import`, `media` |
| **Type** | `epic` |
| **bd id** | `svg-editor-e4s` |

## Spec (canonical)

Decisions for raster **Live tree** insert and **Serialized** export live in **[ADR 0001: Raster image `href` and export](../../docs/adr/0001-raster-image-href-and-export.md)** (`svg-editor-e4s.1`).

Summary:

- **Formats:** `image/png`, `image/jpeg`, `image/webp` required; `image/gif` accepted (UA-driven playback); other MIME types rejected at insert.
- **Insert `href`:** file picker / drag-drop default to **`data:`** URLs; no `file://` from local picks; opening existing SVG does not auto-rewrite external refs.
- **Limits:** reject **> 16 MiB** files and **> 32 MP** decoded bitmaps before insert, with user-visible errors.
- **Geometry:** intrinsic `width`/`height` in user units (1:1 px→unit), clamp down to fit root `viewBox` when present; omit `preserveAspectRatio` (default `xMidYMid meet`).
- **Export:** keep `data:` as-is; preserve external `href` strings (portability caveat); never silently ship `blob:` — block or rewrite with UX (e4s.7).

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on (bd) | Est (min) |
|-----------|--------|-------|------|---------------------|-----------------|----------:|
| RIMG-1 | Spec — embed vs link, formats, export, size limits | `svg-editor-e4s.1` | `task` | Short ADR or epic note: MIME types; max size / perf; data URL vs href; `preserveAspectRatio` + default dimensions; export/download behavior documented. | — | 45 |
| RIMG-2 | SvgManipulationService — insert `<image>` into content group | `svg-editor-e4s.2` | `feature` | API inserts `<image>` with stable id, `href`, geometry in root user space, revision bump, clickable wiring; unit tests for id + DOM. | `e4s.1` | 120 |
| RIMG-3 | AddImageCommand + history (undo/redo) | `svg-editor-e4s.3` | `feature` | Undoable insert/remove; selection rules; `EditorHistoryService` integration. | `e4s.2` | 90 |
| RIMG-4 | Toolbar — Insert image file picker + placement | `svg-editor-e4s.4` | `feature` | File picker `image/*`; read as data URL; insert via command; disabled when no SVG; `data-testid` hooks. | `e4s.3` | 120 |
| RIMG-5 | Drag-and-drop raster files onto canvas | `svg-editor-e4s.5` | `feature` | Same pipeline as toolbar; `preventDefault`; **multi-file:** iterate in order, skip disallowed MIME silently, alert and stop on first hard failure, one `AddImageCommand` per successful insert; drop test. | `e4s.3` | 120 |
| RIMG-6 | Selection, bbox, and transform parity for `<image>` | `svg-editor-e4s.6` | `task` | Marquee partial-hit uses opaque box for `<image>` (not `isPointInFill`); layer preview swaps huge `data:` href for tiny placeholder + viewBox fallback from `width`/`height`; Vitest for marquee/translate/union-scale on inserted image. | `e4s.2` | 90 |
| RIMG-7 | Export/download — data URLs and external href policy | `svg-editor-e4s.7` | `task` | No silent loss for `blob:` / huge data URLs; user-visible policy. | `e4s.1` | 60 |
| RIMG-8 | Tests — insert pipeline (command + canvas) | `svg-editor-e4s.8` | `task` | Vitest + canvas integration; jsdom-safe attrs. | `e4s.4`, `e4s.5` | 90 |

## Dependency graph (summary)

```text
e4s.1 (spec)
 ├→ e4s.2 (insert API) ─→ e4s.3 (command) ─┬→ e4s.4 (toolbar) ─┐
 │                    │                     └→ e4s.5 (drop)  ─┴→ e4s.8 (tests)
 └→ e4s.7 (export)     └→ e4s.6 (selection parity)
```

## Exit criteria

- User can insert at least one raster format via UI and see it on canvas, selected, undoable.
- Drag-drop and/or toolbar path share one insert pipeline.
- Export behavior matches written spec (no silent broken images without warning).

## Code touchpoints (expected)

- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — insert API, `CONTENT_SHAPE_SELECTOR` already includes `image`
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — new command type
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — drop target, routing
- [`src/app/components/tool-strip/tool-strip.component.ts`](../../src/app/components/tool-strip/tool-strip.component.ts) — insert control (or file menu if preferred)

## Notes

- Prefer **svg.js** for DOM mutations inside the canvas per project rules.
- `svg-editor-e4s.9` was created in error and **closed** as duplicate of `e4s.8`.
- **Post–e4s.6 follow-ups:** skew handles are hidden when the selection is **image-only** (resize/rotate remain). `SvgSelectionGeometryService.getShapeBBox` falls back to layout `x`/`y`/`width`/`height` for `<image>` when `getBBox()` is zero-area so unions stay aligned with the opaque hit box. Manual QA checklist: bead **`svg-editor-d4m`**.
- **e4s.7 (export/download):** before **Download SVG**, the app scans content `<image>` hrefs — **`blob:`** blocks with `alert`; oversized **`data:`** (see ADR) requires `confirm` to proceed. Logic: [`svg-export-image-href-policy.ts`](../../src/app/utils/svg-export-image-href-policy.ts), [`SvgEditorDocumentService.getSvgExportImagePolicyResult`](../../src/app/services/svg-editor-document.service.ts), [`AppComponent.downloadSvg`](../../src/app/app.ts).
- **e4s.8 (tests):** [`raster-image-insert.pipeline.spec.ts`](../../src/app/services/raster-image-insert.pipeline.spec.ts) (real DOM + `AddImageCommand`); multi-file drop cases in [`svg-canvas.component.spec.ts`](../../src/app/components/svg-canvas/svg-canvas.component.spec.ts); Playwright [`e2e/raster-insert-image.spec.ts`](../../e2e/raster-insert-image.spec.ts) + [`e2e/fixtures/tiny.png`](../../e2e/fixtures/tiny.png).
