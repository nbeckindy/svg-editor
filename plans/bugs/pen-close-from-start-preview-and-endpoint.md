# Plan: Pen close-from-start — curve preview + exact moveto endpoint

## Symptoms (confirmed)

1. **Preview / affordance:** With mousedown on the path **start** to close, a **small** pointer motion (under `MARQUEE_MIN_DRAG_PX` / 5px in screen space) does **not** enable `penCurvePreviewPathD`, so users do not see handle-style preview while shaping the closing segment from a tight hit target.
2. **Geometry (real bug):** In some sessions the **last cubic’s endpoint** does not match the **`M` moveto** (e.g. `M 169 203.203125` … `C … 169 201.203125` — Y drift). The path is not geometrically closed at the same point as the start anchor.

## Tests (already in tree)

| Test | Intent |
|------|--------|
| `pen: committed segment list is unchanged during pending cubic drag` | Confirms **committed** `penSession` segments are **identical** across `mousemove` during a pending cubic; only overlay preview changes. |
| `pen: drag-close from start commits last cubic endpoint exactly on moveto` | Parses final `d`: last **`C`** endpoint must equal **`M`** (within float tolerance). |
| `pen: curve preview appears during drag-close from start after small screen motion (TDD)` | **Red:** 2px move after mousedown on start should still show `penCurvePreviewPathD` (currently fails until preview rule is relaxed for close-from-start). |

## Root cause notes

### A — Preview gate (`penPendingShowsCurvePreview`)

`PenToolSession.penPendingShowsCurvePreview` uses **only** `hypot(lastClient - startClient) >= MARQUEE_MIN_DRAG_PX` (`pen-tool-session.ts`). That is appropriate for marquee-style “intentional drag” on an **infinite** canvas, but **too strict** when `penPendingSegment.startSvg` is within **join/close tolerance** of path start: the user is already expressing “I am closing” and has little room to move before leaving the ring.

### B — Endpoint vs `M` on commit

Close path with curve uses `commitPenDraggedCurve(..., segmentEnd?: m)` when inside close radius and `penPendingShowsCurvePreview` (`commitPenPendingSegment`). Mismatch can come from:

- **`releaseSvg`** taken from `clientToEditorSvgPoint` on mouseup while **`segmentEnd` is `m`**: placement math might still blend pointer/snapped drag into the **end** control pair inconsistently in some branches.
- **`geometryAlreadyMeetsStart`** vs explicit `appendCubicToD` close path in `tryFinishPenPath` — double-check every branch ends the last drawable segment on **exact** `firstSeg.x/y` before `Z`.
- **Snap pipeline** (`getSnappedPenPoint`) moving the **last** anchor away from `m` on the **release** event even when closing.

## Fix strategy (ordered)

1. **Introduce “close-pending” curve preview**  
   When `penPendingSegment` exists **and** `startSvg` is within `penEndpointsWithinJoinTolerance` (or `isPenPointerWithinCloseRadius`-equivalent in **root user space**) of `penPathStartMv()`, treat curve preview as enabled if **either**:
   - existing screen `>= MARQUEE_MIN_DRAG_PX`, **or**
   - root-SVG distance from `penPendingDragSvg` to `startSvg` (or to `m`) exceeds a **small epsilon** in **user units** (e.g. `1e-3` … `1e-2`), **or**
   - a dedicated smaller **screen** threshold for this mode only (document choice in code comment).

   Centralize in one helper (e.g. `penPendingShowsCurvePreviewForClose`) to keep `penCurvePreviewPathD`, `penSessionPreviewPathD`, `penPendingCurveHandleGuideOverlays`, and `commitPenPendingSegment` in sync.

2. **Hard-enforce close endpoint on commit**  
   For `closePath === true` when emitting the **user** closing cubic, set the segment’s **terminal point** to **`m` exactly** after computing controls (or pass `segmentEnd` through so `appendCubic` / `penSession.appendCubic` always receives `m` for the endpoint, never a snapped mouse point). Add a **unit** test on `PenToolSession` / pure helper if logic is extracted.

3. **Regression pass**  
   - Green the TDD test (`2px` move).  
   - Keep `pen: drag-close from start commits last cubic endpoint exactly on moveto` green.  
   - Manual: reproduce user path with fractional coords + optional grid/shape snap.

4. **Docs**  
   Update `plans/ux/bezier-anchor-handle-interactions.md` pen subsection: close-from-start preview rule + “last point equals `M` before `Z`”.

## Out of scope (unless discovered)

- Changing global `MARQUEE_MIN_DRAG_PX` for all pen drags (would affect non-close gestures). Prefer a **scoped** exception for close-pending only.

## Suggested bead

File a single **P2** bug/feature: *Pen: close-from-start curve preview + exact moveto on commit*; reference this plan and the three tests above.

## Follow-up (M + Z parity under drag-close)

See **`plans/bugs/pen-drag-close-m-z-parity.md`**: strict Vitest coverage + browser/CTM repro gap and fix strategy when drag-close still diverges from click-close (e.g. last `C` vs `M`, missing `Z`).
