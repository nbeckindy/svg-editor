# `svg-canvas.component.spec.ts` triage (handoff #6)

Purpose: cluster the ~5.9k-line canvas spec by **theme**, label each cluster for **migration**, and note **overlap** with smaller spec files so new work moves tests deliberately (no long double-maintenance).

Legend:

- **gesture-host** — behavior covered by routing + host flags; prefer tests on [`SvgCanvasPointerGestureHost`](src/app/components/svg-canvas/gestures/pointer-gesture-router.ts) + [`pointer-gesture-router.spec.ts`](src/app/components/svg-canvas/gestures/pointer-gesture-router.spec.ts).
- **gesture-class** — logic in a gesture class; prefer [`*gesture.spec.ts`](src/app/components/svg-canvas/gestures/) with mocked [`GestureRuntimeContext`](src/app/components/svg-canvas/gestures/gesture-context.ts).
- **must-stay-canvas** — needs `ComponentFixture`, real template/SVG wiring, or Angular lifecycle.

Existing gesture / unit specs (overlap notes):

| File | Covers (high level) |
|------|---------------------|
| [`pointer-gesture-router.spec.ts`](src/app/components/svg-canvas/gestures/pointer-gesture-router.spec.ts) | Document/canvas pointer precedence, zoom mousedown |
| [`marquee-gestures.spec.ts`](src/app/components/svg-canvas/gestures/marquee-gestures.spec.ts) | Selection + zoom marquee geometry/lifecycle |
| [`creation-gesture.spec.ts`](src/app/components/svg-canvas/gestures/creation-gesture.spec.ts) | Rect/ellipse/line creation |
| [`rotate-gesture.spec.ts`](src/app/components/svg-canvas/gestures/rotate-gesture.spec.ts) | Rotate start/cancel/cursor + ghost stub |
| [`ghost-session.spec.ts`](src/app/components/svg-canvas/gestures/ghost-session.spec.ts) | Ghost DOM insertion order for union |
| [`drag-gesture.spec.ts`](src/app/components/svg-canvas/gestures/drag-gesture.spec.ts) | Drag start failure + union commit (mocked ghost) |
| [`resize-gesture.spec.ts`](src/app/components/svg-canvas/gestures/resize-gesture.spec.ts) | Resize start preconditions |
| [`skew-gesture.spec.ts`](src/app/components/svg-canvas/gestures/skew-gesture.spec.ts) | Skew start + noop end |
| [`chrome-editor-apply.service.spec.ts`](src/app/services/chrome-editor-apply.service.spec.ts) | Chrome → History write path (paint + inspector) |

---

## 1. Pure helpers (outside `SvgCanvasComponent`)

| Lines (approx) | Cluster | Label | Overlap |
|----------------|---------|-------|---------|
| 47–74 | `selection chrome zoom (TUX-5)` — `clampCanvasScaleForSelectionChrome`, handle radii | **gesture-class** / pure math | None today; could move with exported helpers if split from component |

---

## 2. `describe('SvgCanvasComponent')` — top-level `it` blocks (≈109–2266)

Themes mixed in one block: **grid overlay**, **snap toggles**, **zoom / pan / text tools**, **selection + shift/ctrl meta**, **marquee selection + clip expansion**, **shape drag** (ghost, snap, axis lock), **overlay / highlightRect**, **smart guides** during drag.

| Theme | Label | Overlap / target |
|-------|-------|------------------|
| Grid overlay visibility vs snap signals | **must-stay-canvas** | Template + `CanvasViewService` |
| Zoom tool click / Alt+click / marquee | **gesture-host** + **gesture-class** `ZoomMarqueeGesture` | `marquee-gestures.spec`, `pointer-gesture-router.spec` |
| Selection marquee + `selectShapes` / clip group expansion | **gesture-host** + **gesture-class** | `marquee-gestures.spec` |
| Pan mousedown / document mouseup | **gesture-host** | `pointer-gesture-router.spec` |
| Text tool placement + preview | **must-stay-canvas** (for now) | Could move with tool session module (handoff #1) |
| Selection overlays, multi-select bbox | **must-stay-canvas** or **gesture-class** once bbox math extracted | Partial overlap `DragGesture` overlay |
| Drag ghost, z-order, snap, axis lock, `highlightRect` cache | **gesture-class** `DragGesture` + host | `drag-gesture.spec` (start/end); canvas keeps DOM-heavy regressions |
| Resize / rotate / skew (before nested `describe`) | **gesture-class** | `resize-gesture.spec`, `skew-gesture.spec`, `rotate-gesture.spec`, router |

---

## 3. Nested `describe` blocks under `SvgCanvasComponent`

| Lines (approx) | Cluster | Label | Overlap |
|----------------|---------|-------|---------|
| 2267–2396 | `selection resize (corner handles)` | **gesture-class** `ResizeGesture` | `resize-gesture.spec`; router `onCanvasMouseDownPrimary` resize branch |
| 2397–2511 | `selection rotate (handle)` | **gesture-class** `RotateGesture` | `rotate-gesture.spec` |
| 2512–2559 | `viewBox visibility in editor` | **must-stay-canvas** | DOM + editor chrome |
| 2560–3589 | `path node edit mode` | **must-stay-canvas** / future **gesture-class** | Path/overlay + transforms; candidate for pen/node session module |
| 3590–5129 | `pen tool` | **must-stay-canvas** / future session tests | `pen-tool-session` models already have pure tests |
| 5130–end | `keyboard shortcuts` | **must-stay-canvas** / future orchestration | Keyboard routing often needs component harness |

---

## 4. Migration checklist (same PR as refactors — handoff #6 + #1–#4)

When extracting a module or widening a gesture **interface**:

1. Add or extend **module-level** specs first (gesture `*.spec.ts`, service `*.spec.ts`, or new orchestration unit).
2. **Remove or narrow** the corresponding `svg-canvas.component.spec.ts` cases in the **same** change set once behavior is asserted at the new seam (avoid duplicate failures).
3. Keep canvas tests that are truly **integration**: first paint, host bindings, regressions that require full `TestBed` + template.
4. Prefer **host stubs** (`makeHost` in `pointer-gesture-router.spec.ts`) over new `SvgCanvasComponent` construction when only routing order matters.

This session added **new** gesture/service coverage without deleting canvas cases yet: nothing was redundant at the assertion level with the new router tests (canvas tests still guard full wiring). The next refactor that moves behavior behind a stable host should delete or slim the overlapping `SvgCanvasComponent` `it` blocks in the same PR per steps 1–2 above.

---

## 5. Done-enough metrics (initiative)

- Track line count of [`svg-canvas.component.spec.ts`](../src/app/components/svg-canvas/svg-canvas.component.spec.ts): goal **no net growth**; shrink as clusters migrate.
- New failures should pin to **small** files first (`gestures/*.spec.ts`, `chrome-editor-apply.service.spec.ts`).
