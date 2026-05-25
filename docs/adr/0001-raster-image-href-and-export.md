# Raster `<image>`: formats, href policy, geometry, and Serialized export

We treat inserted rasters as normal SVG `<image>` nodes in the **Live tree**. Insert paths (toolbar, drag-drop) run in the browser without a stable on-disk path for the user’s source file, so **Serialized** output must not rely on `file://` or session-only `blob:` URLs. This ADR locks v1 rules so insert (e4s.2–e4s.5), export (e4s.7), and tests can stay aligned.

## Supported input (MIME)

- **Required:** `image/png`, `image/jpeg`, `image/webp`.
- **Optional / accepted:** `image/gif` — we do not re-encode or strip animation in v1; playback follows the host SVG user agent for `<image>` (no separate timeline UI).
- **Rejected:** anything else at insert time (clear user-visible error).

## Insert-time `href` (embed vs link)

- **Default for file picker and drag-drop:** read the file in-session and set `href` to a **`data:` URL** (base64 payload) so **Serialized** is self-contained. We **do not** write `file://` `href`s from local picks (non-portable, often blocked).
- **Opening existing SVG:** if **Serialized** already contains `http(s):`, relative, or `file:` `href`s, v1 **displays** them as loaded (browser rules); we **do not** auto-rewrite or auto-embed on open. Saving/export rules below apply when emitting new **Serialized**.

## Size and decode limits (before insert)

- **File bytes:** reject inserts **> 16 MiB** (16 × 1024 × 1024 bytes) with a user-visible message (“file too large”). Rationale: main-thread read/decode and memory pressure for typical editor sessions.
- **Decoded pixels:** reject if **width × height > 32 megapixels** (decoded bitmap dimensions from the decode pipeline we use, e.g. `createImageBitmap` / `Image` intrinsic size) with the same class of message. Rationale: GPU/texture and canvas-friendly upper bound without hard-coding every aspect ratio.
- Over-limit behavior: **no partial insert** — fail the operation and leave the **Live tree** unchanged.

## Geometry (`width`, `height`, `preserveAspectRatio`)

- **Intrinsic size:** use the decoded intrinsic pixel width/height as the initial `width` and `height` in **Document** (root SVG user) units **1:1** (one image pixel → one user unit), unless that would exceed the limits below.
- **Clamp to document:** if either dimension exceeds the root `viewBox` width/height (when a `viewBox` exists), scale **down uniformly** so the image **fits inside** the viewBox rectangle while preserving aspect ratio (same outcome as `meet` against the viewBox bounds). If there is no `viewBox`, skip this clamp (canvas may be unconstrained).
- **`preserveAspectRatio`:** omit on insert so SVG’s default applies: **`xMidYMid meet`**. Transform/selection parity (handles, bbox) is owned by e4s.6; this ADR only defines **initial** placement attributes.

## Serialized export / download

- **`data:` `href`s:** **keep** as-is in emitted **Serialized** (portable, single-file SVG). No silent stripping. (Optional “externalize asset” can be a later feature; not v1.)
- **External `href`s** (`http(s):`, site-relative paths, `file:`): on export/download, **do not silently drop** the reference. v1 policy: **emit the same `href` string** and treat “broken when opened elsewhere” as a **known limitation** unless e4s.7 adds explicit UI to embed or block; until then, copy in UI/docs should avoid promising portability for external refs.
- **`blob:` `href`s:** **not portable.** Before producing downloadable **Serialized**, the editor must **block or rewrite** (e4s.7 implements the UX): never emit a naked `blob:` `href` in a saved file without user-visible handling (error, or user-confirmed inline embed).

## Multi-file insert

- Detailed behavior (queue vs single selection, etc.) belongs to **e4s.5**; each inserted image still obeys the limits and **href** rules above.

## Non-goals (v1)

- Smart cropping, image optimization/recompression pipeline, or CDN upload workflows.
- Replacing **data:** URLs with sidecar files on disk automatically.
