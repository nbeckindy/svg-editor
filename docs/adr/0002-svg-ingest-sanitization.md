# SVG ingest sanitization and security layers

**Supersedes:** ADR 0001 §"Opening existing SVG" (ingest-time href display rule).

## Context

The editor accepts SVG markup from multiple user-facing sources (file upload, icon palette, clipboard paste, debug panel). Raw SVG is an execution context: `<script>` elements, `on*` event handler attributes, `<foreignObject>` embedding arbitrary HTML, and external `href` references to attacker-controlled content are all live XSS vectors.

## Decision

All SVG markup is sanitized at ingest time by `src/app/utils/svg-sanitize.ts` before it reaches any DOM writer. Sanitization runs at the following choke points, in order of the data flow:

| Choke point | Function | Source |
|-------------|----------|--------|
| `SvgEditorDocumentService.initializeSVG` | Full document ingest | File upload, icon palette, debug panel |
| `SvgShapeContentService.insertShapeMarkup` | Shape fragment ingest | Icon palette (fragment path), history replay via `PasteCommand` |
| `SvgClipboardService.pasteClipboardPayload` | Clipboard fragment ingest | Copy-paste within editor |
| `SvgService.loadSVG` | File read return path | File upload pipeline |

### What is stripped

| Category | Action |
|----------|--------|
| `<script>` elements (anywhere in tree) | Removed |
| `<foreignObject>` elements | Removed |
| `on*` event handler attributes (all elements, including root `<svg>`) | Attribute removed |
| `javascript:` URIs on any href carrier | Attribute removed |
| `blob:` hrefs (not portable; see ADR 0001) | Attribute removed |
| `http:` hrefs on `<image>` | Attribute removed |
| Non-raster `data:` URIs on `<image>` (e.g. `data:image/svg+xml`) | Attribute removed |
| External hrefs on `<use>` (anything except `#fragment` or `url(#id)`) | Attribute removed |
| External hrefs on `<a>` and other carriers | Attribute removed |

### What is allowed

| Element | Allowed hrefs |
|---------|---------------|
| `<image>` | `https:`, `data:image/png`, `data:image/jpeg`, `data:image/gif`, `data:image/webp`, `data:image/avif`, relative paths |
| `<use>` | `#fragment`, `url(#fragment)` |
| `<a>` | `#fragment` only |

### Choke-point invariant

History entries (`serializedMarkup` in undo/redo commands) contain only markup captured from the live DOM — markup that was already sanitized at its original ingest. `restoreRemovedShapesInContentGroup` therefore does **not** re-sanitize on undo/redo. Any future path that writes raw (un-sanitized) markup directly into a history command breaks this invariant.

### Double-parse trade-off

`sanitizeSvgMarkup` parses the input via `DOMParser` internally, then `initializeSVG` parses the sanitized output again. This is two full parses for document-level ingest, which is acceptable for v1 (< 5 ms for typical SVGs). If performance becomes an issue at scale, the sanitizer API can be extended to return a `Document` handle so the caller can skip its own parse.

### Fast path

Documents containing no attack patterns (detected by a single combined regex scan) bypass the DOM parse/serialize cycle entirely and are returned as-is. This ensures large clean SVGs with embedded raster `data:` URIs do not incur measurable overhead.

## Consequences

- **ADR 0001 superseded for ingest:** ADR 0001 stated that opening an existing SVG "displays" `http(s):` image hrefs as loaded. The ingest sanitizer now removes `http:` (insecure) image hrefs on open. `https:` image hrefs are still displayed. Users who open SVG files with `http:` images will see a `window.alert` notification and the images will be blank.
- **`blob:` hrefs at ingest:** `blob:` hrefs are stripped at ingest (consistent with the export policy in ADR 0001 which already blocked them at save time). The export policy will no longer see `blob:` hrefs; its "blocked" result for blobs will not fire.
- **Out of scope:**
  - Hiding the debug panel in production (`isDevMode()` gate) — separate UX concern.
  - OS-level clipboard paste (`navigator.clipboard.read`) — not implemented.
  - Server-side validation — client-only SPA.
  - Full `DOMPurify` dependency — hand-rolled allowlist is sufficient; revisit if policy grows.
  - Sanitizing SVG CSS (`<style>` elements, `style=` attributes) — deferred.

## CSP (deployment layer)

A Content-Security-Policy is applied via `<meta>` tag in `src/index.html` and via Netlify-style `public/_headers`. The policy is:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: https:;
connect-src 'self';
object-src 'none';
base-uri 'self';
```

`blob:` is intentionally absent from `img-src` — the app never writes `blob:` hrefs into SVG documents.  
`'unsafe-inline'` in `style-src` is required for Angular component encapsulation styles until nonces are adopted.  
`script-src 'self'` is safe — Angular CLI production builds emit only external bundle scripts.
