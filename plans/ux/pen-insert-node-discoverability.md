# Plan: Pen tool — discoverability for “insert node on existing path”

## Decision (2026-05-29, revised)

Ship in this order:

1. **Option B** — While **Pen** is active, pen session **idle** (`canTryPenInsertNodeOnPath`), change the **cursor** when the pointer is over a **valid pen-insert hit** (same geometry as `findPenPathInsertHit` + `getPenPathInsertToleranceSvg`). Throttle pointer work for cursor updates; revert when not insert-eligible. **On `mousedown`**, always run a **fresh** hit test (same code path as commit) so throttling cannot desync cursor from click.
2. **After a successful insert** on an existing path — show a **Pen-owned** overlay of **anchor dots only** (node-edit–like styling; **no** handles — not editable in this mode). **Suppress** this overlay whenever **true** path node-edit is already showing for that path (single visual source of truth). Overlay tracks the **last path inserted on**; inserting on another path **replaces** it. **Clear** the overlay on the next **meaningful Pen action** other than another insert on the same path; **another insert on the same path** redisplays updated anchors.
3. **Insert gesture = pen draw parity** — Pen insert on an existing segment supports **mousedown → drag → mouseup** like drawing a curved segment. The **planted anchor** stays at the **mousedown hit** on the path; **drag** only reshapes **handles** (incoming + **mirrored** outgoing at the new node for **C–C** / **Q–Q**). Modifier for cusp / break = **TBD** (see §Insert drag parity).

**Explicitly out of v1:** Session/tooltips/tutorial copy for insert discoverability (no first-hover hint; revisit when a broader **tutorial prefs** / localStorage story exists). Option A hover-only full node preview remains deferred.

### Grilled constraints (conversation)

| Topic | Choice |
|--------|--------|
| Post-insert overlay | Pen-owned; **anchors only**; not switching tool into node-edit |
| vs true node-edit | **Suppress** Pen overlay when real node-edit overlay is active for that path |
| Hint / copy | **None** in v1 |
| Pointer vs throttle | **Authoritative** insert hit on pointer down; throttle **display** only |
| Insert drag tangents | **Smooth into both neighbors**; anchor **fixed** at hit; drag adjusts **handles** (mirrored at join); non-smooth via **modifier TBD** |

---

## Problem

Inserting an anchor on an **existing** path with the **Pen** tool already works when the session is idle and the click (or click-drag release) lands within hit tolerance on a supported segment (see `PenToolSession` + `commitPenInsertOnExistingPath` in `svg-canvas.component.ts` and `path-pen-insert.ts` / `path-pen-insert-drag.ts`). Users do not discover this because:

- There is **no** persistent hint in the chrome that Pen can “add to” finished paths.
- There is **no** visual parity with **Node edit** (anchors/handles on the path) while using Pen over that path.
- The **cursor** does not change when the pointer is over a valid insert hit, so the affordance matches “draw a new path” everywhere on the canvas.

Related baseline doc: [`bezier-anchor-handle-interactions.md`](./bezier-anchor-handle-interactions.md) — **Terminology** (vertex, knot, node, handles, chord, anchor) at the top; pen insert is mentioned there; node-edit visuals are described in §1.

---

## Goals

1. Users should **recognize** when Pen is in a state where **insert on this path** (including **mousedown + drag + mouseup** for curvature, matching new-segment pen behavior) vs **starting a new anchor in empty space**.
2. Prefer **reuse** of existing overlay geometry and parsers (`parsePathDForNodeEditing`, anchor/control collections used by node-edit) to avoid two divergent “views” of the same path.
3. Keep **performance** acceptable on `mousemove` (throttle/debounce hit tests; avoid full reparse every frame if possible).

Non-goals for this plan: changing insert tolerance math, supporting new segment types for insert, or replacing Node edit with Pen. **Tutorial / first-hover hints** are explicitly out of v1 (see Decision).

---

## Insert drag parity

**Goal:** On a valid insert hit, **press → drag → release** with the same **interaction rhythm** as drawing a curved segment on a new path (preview during drag), then **commit** on **mouseup** (or cancel per pen rules).

### Resolved

- **Continuity:** New point is **smooth with respect to both adjacent subpath segments** (incoming and outgoing). **Dragging** adjusts **both** sides’ tangent-related control geometry so the curve stays visually continuous through the new point (same “smooth” meaning as elsewhere in the pen tool—implement to match existing smooth / mirrored-handle conventions).
- **Modifier (from option C):** Default = smooth both sides; a **modifier** may opt into **non-smooth** (cusp) or other break behavior—**which key(s)** and exact behavior to align with existing pen modifiers; **document in AC** when chosen.

### Still to nail in implementation / QA

1. **No-drag / micro-drag** — **mouseup** after movement below epsilon: match today’s **`insertPenNodeOnParsedPath`** result (position + default tangents) so legacy click-insert and tests stay valid; first frame of drag may snap from that baseline into smooth-adjusted preview.
2. **Preview ownership** — Reuse `penSessionPreviewPathD` (or parallel state) for insert-drag so it never fights an in-progress new path; confirm single state machine branch.
3. **Neighbors that are `L` (lines)** — Smoothing may require **promoting** adjacent segments to cubics (or your app’s equivalent); define behavior at corners and at **`Z`** / subpath breaks.
4. **Cancellation** — Escape / pen-cancel parity: abort without mutating `d`.
5. **Cursor during drag** — Keep insert cursor vs switch to draw cursor after epsilon (**pick** for consistency).

**Modifier (cusp / break) — v1:** shipped as **smooth-into-both-neighbors only**; which key opts into cusp is **TBD** — see `path-pen-insert-drag.ts` and revisit when aligned with existing pen curve modifiers.

---

## Option A — Show path nodes while Pen targets an existing path (“like node-select mode”)

**Intent:** When the **Pen** tool is active and the user is interacting with an **existing** path (see interaction variants below), render **anchors** (and optionally **handles/connectors**) the same way as **Node edit** so the path reads as “editable structure,” not only a stroke.

**Behavior variants** (pick one in implementation; document the choice in AC):

| Variant | Description | Pros | Cons |
|--------|-------------|------|------|
| **A1 — Hover path** | If Pen session is idle (`canTryPenInsertNodeOnPath`) and pointer is over a **path** that passes `isEditorContentShapeTarget`, show a **read-only** node overlay (or full visual copy of node-edit styling) until pointer leaves the path’s hit region. | No click consumed; user sees topology before committing | Need stable “over path” hit (may include fill); must not fight marquee or other overlays |
| **A2 — Hover + insert zone** | Same as A1, but only show overlay when `findPenPathInsertHit` would succeed at pointer (stricter). | Strongest coupling to “you can click to add here” | No overlay on interior fill; still need edge hover accuracy |
| **A3 — After first click selects** | First click **selects** path and pins overlay; second click on segment performs insert (or dedicated “+” affordance). | Clear mode separation | **Breaking change** vs today’s single-click insert on edge; needs product sign-off |

**Recommendation:** Start with **A1 or A2** + **Option B** (cursor) for maximum clarity with minimal behavior change. Defer **A3** unless we explicitly want Pen insert to become a two-step action.

**Engineering notes:**

- Today, switching **away** from selector tools exits path node edit (`svg-canvas.component.ts` effect: `currentTool !== pen` … `exitPathNodeEditMode`). Pen + “show nodes” must either:
  - **Reuse** node-edit overlay builders in a **new** “pen path highlight” state that does **not** toggle `node-edit-selector` tool, or
  - Introduce a lightweight **preview overlay** that shares CSS/classes with `.path-node-anchor` / handle styles for visual consistency.
- If reusing `enterPathNodeEditMode`, ensure we do **not** steal keyboard semantics from Pen (Escape, modifiers) without a matrix in the plan’s QA section.
- Z-order: pen previews (`penSessionPreviewPathD`, etc.) must remain readable; node preview must not block outgoing handle knob hits when a pen stroke *is* active.

**Acceptance criteria (draft):**

- [ ] With Pen active, idle insert allowed, pointer over at least one targeted path, user sees **anchor dots** (same or documented-equivalent styling to node-edit) for that path within N ms of hover stability (define N, e.g. 32–50 ms throttle).
- [ ] Overlay clears when tool changes, path unmounts, or pointer leaves (define leave hysteresis if needed to reduce flicker).
- [ ] No regression to existing pen draw, insert, or node-edit flows in `svg-canvas.component.spec.ts` (extend with hover/pointer tests where feasible in jsdom).

---

## Option B — Cursor / pointer icon when insert hit is valid

**Intent:** When Pen session is idle and the pointer is in SVG space where `findPenPathInsertHit` (same tolerance as `tryPenInsertNodeOnPath`) returns a hit, change the **cursor** (or a small anchored cursor badge) to a distinct affordance (“add point on path” / pen-plus / node-plus — exact art TBD).

**Engineering notes:**

- Hit test should share **one** code path with insert (`findPenPathInsertHit` + same `maxDistSq` / `getPenPathInsertToleranceSvg`) so cursor truth matches click truth.
- Apply cursor on the **canvas host** or overlay SVG under the pointer stack used for canvas events; avoid fighting the browser’s `cursor` on child SVG elements unless hit-testing is centralized.
- **Throttle** `mousemove` (e.g. rAF or 16 ms) and skip work when `!canTryPenInsertNodeOnPath`.
- **Discoverability v1:** cursor change + post-insert anchor overlay only; **no** tooltip/session hint (see Decision). Optional high-DPI fallback remains **cursor-only** (e.g. alternate `cursor` keyword or `url`) — no badge until a later UX pass.

**Acceptance criteria (draft):**

- [ ] Over a valid insert location (segment types already supported by `findPenPathInsertHit`), cursor differs from default Pen/draw cursor.
- [ ] Cursor reverts immediately when leaving valid hit or when `canTryPenInsertNodeOnPath` becomes false.
- [ ] Documented fallback when `cursor: url(...)` is undesirable (e.g. high-DPI): alternate **cursor** styling without relying on tooltip/badge in v1.

---

## QA checklist (both options)

- [ ] **Open path** — edge hover and endpoint-adjacent (respect `minT`/`maxT`) behavior.
- [ ] **Closed path** — closing **`Z`** segment; near-start join ring if applicable; no duplicate anchor at coincident close (see `PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ` in canvas).
- [ ] **Insert drag** — preview during drag; commit on mouseup; micro-movement matches legacy click-insert; **smooth continuity into both neighbors** with drag updating **incoming + outgoing** tangents; cancel paths (Escape / pen parity); **modifier** for cusp/break once chosen.
- [ ] **Grouped path** — drill-in / `event.target` is `path` vs `g`; insert still fires when geometry allows.
- [ ] **Post-insert anchor overlay** — shows after commit; **suppress** when true node-edit is active for that path; clears on next meaningful Pen action; **replaces** target when inserting on a different path.
- [ ] **Selected path + selection overlay** — pointer still receives insert hit where implemented today; cursor/overlay do not require clicking through chrome incorrectly.
- [ ] **Fill-only large path** — user expectation: Option B false on interior; Option A1 may still show nodes if “over path” uses fill hit — align copy and behavior.
- [ ] **Unsupported / arc-heavy `d`** — graceful no-overlay / default cursor (no thrash).

---

## Tracking

Beads: **`svg-editor-dgc`** — `bd show svg-editor-dgc` (feature: valid-hit cursor + anchors-only overlay after insert + insert mousedown-drag parity).

---

## References

- `src/app/components/svg-canvas/svg-canvas.component.ts` — `commitPenInsertOnExistingPath`, insert hover cursor, `syncPenPostInsertAnchorOverlayDom`, tool effects vs `pathNodeEditState`
- `src/app/models/path-pen-insert-drag.ts` — drag preview tangents (smooth neighbors)
- `src/app/components/svg-canvas/pen-tool-session/pen-tool-session.ts` — `canTryPenInsertNodeOnPath`, `onCanvasPenPrimaryMouseDown`
- `src/app/models/path-pen-insert.ts` — `findPenPathInsertHit`, `insertPenNodeOnParsedPath`
- Closed bead **svg-editor-gh9** (historical: pen insert on existing path)
- [`bezier-anchor-handle-interactions.md`](./bezier-anchor-handle-interactions.md)
