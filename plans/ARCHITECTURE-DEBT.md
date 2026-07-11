# Architecture debt register

> **Source:** Adversarial review of [ARCHITECTURE.md](./ARCHITECTURE.md) (2026-07-10)  
> **Related:** [CONTEXT.md](../CONTEXT.md) · [hexagonal epics](./epics/hexagonal-architecture-extensibility.md)

Tracked gaps between **documented seams** and **runtime behavior**. Priority reflects risk to correctness and extensibility under growth, not effort alone.

**Priority key**

| Tier | Meaning |
|------|---------|
| **P0** | Active correctness or dual-path risk — fix before major feature work |
| **P1** | Structural debt that blocks seam completion or misleads contributors |
| **P2** | Testability, documentation drift, or enforcement gaps |
| **P3** | Product-class ceilings — accept or plan a deliberate model change |

---

## P0 — Active routing and mapping debt

### DEBT-001 · Dual input routing (registry + canvas fallbacks) ✓

**Problem:** The tool registry owns pointer down/move/up, but click selection, cursor policy, keyboard guards, and path-node drag bypass the registry. New tools must know which events are “registry-pure” vs still canvas-owned.

**Evidence**

| Surface | Registry? | Still in canvas / elsewhere |
|---------|-----------|------------------------------|
| Pointer down/move/up | `pointer-gesture-router.ts` (77 lines) | Path-node drag bypass in router host (`getPathNodeDragSession`, lines 52–66) |
| Click | `tryDispatchRegisteredCanvasClick` | Selector click, drill-in, additive select in `onCanvasClick` (~2108–2187); **selector has no `onClick`** in `selector-canvas-tool.ts` |
| Keyboard | `dispatchRegisteredKeyDown` | Path-node delete before registry (`svg-canvas-keyboard.controller.ts` 103–108); Escape / eyedropper / pen after registry (115–161) |
| Cursor | — | `computeExpectedCursorHint` (~2403–2505), 33+ `getCurrentTool()` / tool-literal branches in `svg-canvas.component.ts` |
| Pen right-click | `pen-canvas-tool.ts` | Duplicate handler in `onCanvasMouseDown` (2099–2102) before router |

**Risk:** Contributors follow ARCHITECTURE.md “register a `CanvasTool`” and still must edit the 2,679-line canvas for click/cursor/keyboard behavior.

**Remediation**

1. Add `onClick` to selector/node-edit `CanvasTool` adapters; move `onCanvasClick` body into adapter + shared selection-click helper.
2. Route path-node document drag through node-edit adapter or a dedicated session port — remove router host bypass.
3. Collapse keyboard policy: registry first for tool keys; canvas-wide guards only for session types (inline text, path-node edit).
4. Extract cursor policy to per-tool `getCursorHint` on `CanvasTool` or a `CursorPolicyRegistry`.
5. Delete duplicate pen right-click from canvas once adapter is sole owner.

**Depends on:** DEBT-002 (coordinate mapping), DEBT-003 (canvas shrink).

---

### DEBT-002 · `CanvasCoordinateMappingService` unwired (dead extraction)

**Problem:** Coordinate mapping was extracted but never bound. Duplicate `clientToEditorSvgPoint` lives on the canvas (line 1925); the service has **zero imports** elsewhere in `src/app`.

**Evidence**

- `src/app/services/canvas-coordinate-mapping.service.ts` (143 lines, complete API)
- `svg-canvas.component.ts` — 10+ call sites pass `clientToEditorSvgPoint` into tool deps (718, 1371, 1700, …)
- ARCHITECTURE.md lists wiring as “next seam”; epic phases marked closed

**Risk:** Join tolerance, pen continuation pickup, overlay sync, and zoom fixes must be applied in two places; subtle coordinate bugs.

**Remediation**

1. Bind service from canvas `AfterViewInit` / overlay sync lifecycle.
2. Replace component method with service delegation; implement `CanvasAdapterCoordinates` via service.
3. Add unit tests for mapping with mocked bindings (jsdom-safe).
4. Remove duplicate parsing helpers from component.

**Depends on:** None (can start immediately).

---

### DEBT-003 · `SvgCanvasComponent` remains integration hub

**Problem:** Extraction moved orchestrators and overlays out, but the canvas still wires every session, gesture, cursor RAF loop, debug HUD, and direct history mutation.

**Evidence**

- `svg-canvas.component.ts` — **2,679** lines TS + **341** lines HTML
- **25** direct `getSVGInstance()` calls
- **9** direct `pushAndExecute` calls (bypass chrome-apply path)
- **102** references to `penTool` / `pathNodeEdit` / `inlineTextEdit` (approx.)
- `PenToolSession` — **813** lines under `svg-canvas/pen-tool-session/`

**Risk:** Every complex feature touches the hub; review surface and regression risk grow faster than feature count.

**Remediation**

1. Complete DEBT-001 and DEBT-002 first (largest line-count wins).
2. Extract pen preview chrome from template into overlay component (ARCHITECTURE.md already names this).
3. Introduce a thin `CanvasSessionCoordinator` (or extend pointer-stack factory) that owns session lifecycle; canvas only binds view refs.
4. Route remaining `pushAndExecute` through command ports / chrome-apply where the mutation is user-visible chrome intent.

**Depends on:** DEBT-001, DEBT-002.

---

## P1 — Structural honesty and extensibility

### DEBT-004 · “Hexagonal” is interface segregation, not isolation

**Problem:** Docs and epics use hexagonal vocabulary; runtime is a **modular monolith** — many `*Port` types implemented by the same `@Injectable` singletons.

**Evidence**

- `SvgManipulationService` implements **14** port interfaces (~584 lines, ~104 public methods)
- `CanvasToolHost` exposes full `SvgManipulationService`, `ShapeSelectionService`, `EditorHistoryService` — not narrow ports
- `chrome-apply/*` injects `SvgManipulationService` cast to port types (`chrome-editor-apply-support.service.ts` 18–20; same pattern in paint/layers/transform/path-ops)

**Risk:** “Inject a narrow port” is convention only; refactors do not reduce compile-time coupling.

**Remediation**

1. Update ARCHITECTURE.md posture: **“modular monolith with typed seams”** (drop “partially hexagonal” or qualify it heavily).
2. Split `SvgManipulationService` into port-scoped injectable facades (e.g. `TransformGestureSvgAdapter`) that delegate to sub-services — optional, incremental.
3. Narrow `CanvasToolHost` to declared port slices per tool bundle.
4. Chrome-apply: inject `PropertiesPanelSvgPort` token backed by implementation, not `SvgManipulationService` type.

**Depends on:** Documentation change can land immediately; code splits are incremental.

---

### DEBT-005 · Closed-type “plugin” seam (internal only)

**Problem:** Tool registration reads like a plugin system but requires core edits across closed unions and imperative registrar hooks.

**Evidence**

- `EditorTool` — closed union of 11 literals (`editor-tool.service.ts`)
- `CanvasBoundToolRegistrar` — hard-coded `registerPenTool` / `registerSelectorTools` / flags per tool family
- `tool-bundles.ts` + `register-default-tool-descriptors.ts` — startup registration only
- No DI extension token, dynamic manifest, or third-party boundary

**Risk:** Roadmap items (symbols, new tool packs) will be scoped as “register a tool” when they actually need type-system and registrar changes.

**Remediation**

1. Document explicitly: **internal refactor seam, not external plugin API**.
2. If external tools are ever in scope: introduce `TOOL_EXTENSION` multi-provider or registry `register(descriptor, factory)` without editing `EditorTool` union (string id + capability flags).
3. Until then: keep checklist in ARCHITECTURE.md but add “closed union edit required” step.

**Depends on:** DEBT-004 (honest naming).

---

### DEBT-006 · Command undo stack implicit state machine

**Problem:** Undo is command-based (good) but stack manipulation and live-DOM preview sit outside a single reversible model.

**Evidence**

- `EditorHistoryService` — silent truncation at depth **100** (`MAX_STACK_DEPTH`, line 4)
- `discardWhere` — pen removes provisional `PenSegmentReplaceCommand` from stack (`pen-tool-session.ts` ~607)
- Coalescing — 500 ms window; `CompositeCommand.coalesceWith` assumes parallel command arrays
- `GhostSession` — live DOM mutation via `setAttribute` / `cloneNode` during transforms (`ghost-session.ts` 54–115), outside `EditorCommand` until commit

**Risk:** Edge cases (pen + undo + tool switch + transform ghost) poorly covered; stack surgery can desync redo.

**Remediation**

1. Document pen `discardWhere` and ghost lifecycle in CONTEXT.md or command rules.
2. Add integration tests: pen provisional segment → undo → tool switch; transform drag → cancel → undo.
3. Consider explicit `ProvisionalCommand` marker vs predicate-based `discardWhere`.
4. Evaluate snapshot fallback for depth overflow (drop oldest vs merge) — product decision.

**Depends on:** DEBT-007 (tests).

---

### DEBT-007 · DOM-as-model selection drift

**Problem:** No document kernel separate from the live SVG DOM. Selection and shape properties are re-derived from DOM after history events.

**Evidence**

- `syncSelectionFromDom()` (`svg-canvas.component.ts` ~1940) — re-reads shape props from live tree, re-selects
- Triggered after undo/redo via `setTimeout` (~1534)
- `documentRevision` signal exists but correctness relies on scattered invalidation

**Risk:** Stale selection, wrong inspector values, drill-in state after undo; scales poorly with complexity.

**Remediation**

1. Short term: centralize “history applied → selection reconcile” in one service listening to `EditorHistoryService.revision`.
2. Medium term: selection holds ids + cached `ShapeProperties` snapshots updated by commands, not DOM re-parse.
3. Long term (P3): only if product needs it — internal scene graph above SVG DOM.

**Depends on:** DEBT-006.

---

## P2 — Enforcement, tests, and doc drift

### DEBT-008 · Anti-patterns documented, not enforced

**Problem:** ARCHITECTURE.md and `.cursor/rules/canvas-tools-ports.mdc` list anti-patterns; no lint/import guards.

**Evidence**

- No `no-restricted-imports` for tools → `SvgCanvasComponent`
- Pen right-click duplicated (DEBT-001)
- Direct `getSVGInstance()` / `pushAndExecute` in canvas (DEBT-003)

**Remediation**

1. ESLint `no-restricted-imports`: `src/app/tools/**` cannot import `svg-canvas.component`.
2. Optional: restrict `SvgManipulationService` in tool orchestrators where a `*Port` exists.
3. CI grep check: fail on new `if (tool === '` in `svg-canvas.component.ts` (allowlist cursor module during migration).

**Depends on:** DEBT-001 progress (avoid fighting active migration).

---

### DEBT-009 · Command test coverage monolith

**Problem:** ~45 command classes across `history/commands/` share one spec file; port contracts lack dedicated tests.

**Evidence**

- `editor-command-implementations.spec.ts` — **1,799** lines, heavy mocking
- No per-domain specs (`paint/`, `transform/`, `layers/`, `path/`)
- No integration test: registry-routed click → selection change
- jsdom gaps on `getBBox` / `getCTM` (noted in CONTEXT.md) affect coordinate and geometry tests

**Remediation**

1. Split spec by domain mirroring `history/commands/` layout.
2. Add thin contract tests per port (mock implementation, assert command calls port methods).
3. One Playwright or component integration test: select shape via click with registry active.
4. Shared test harness for SVG geometry mocks.

**Depends on:** DEBT-001 (click routing) for integration test value.

---

### DEBT-010 · Stale architecture claims in epics

**Problem:** Closed epics and ARCHITECTURE.md understate remaining gaps; line counts and fallback locations are wrong.

**Evidence**

| Claim | Stale? | Actual |
|-------|--------|--------|
| Canvas ~4.3k lines TS | Yes | **2,679** (improvement, not updated) |
| Residual routing in `PointerGestureRouter` | Yes | Router is clean; residuals in click/keyboard/cursor |
| Phase 1–3 “closed” | Partial | Coordinate service unwired; selector click not in registry |
| “All tools registered” | Partial | Descriptors at startup; canvas adapters deferred via `CanvasBoundToolRegistrar` |

**Remediation**

1. Add “Architecture debt” section link in ARCHITECTURE.md → this file.
2. Annotate epic doc with post-close debt pointer; do not reopen epics — track here or via `bd`.
3. Refresh line counts when DEBT-003 milestones land.

**Depends on:** This file (DEBT-010 self).

---

### DEBT-011 · Pen preview chrome in canvas template

**Problem:** Pen policy lives in `PenToolSession`; preview SVG still rendered from canvas template / component bindings.

**Evidence**

- ARCHITECTURE.md “Still centralized” and “Next seams” sections
- `svg-canvas.component.html` (341 lines) includes pen preview chrome

**Remediation**

1. Dedicated `pen-preview-overlay` component under `overlays/`.
2. Bind from `PenToolSession` signals via narrow overlay port.
3. Remove `editorChrome.*` pen readouts from canvas template.

**Depends on:** DEBT-003.

---

## P3 — Product-class ceilings (accept or redesign)

### DEBT-012 · Unbounded hot-path cost (DOM hit-testing)

**Problem:** No spatial index, render throttling, or worker offload. `document:mousemove` always traverses canvas → router → tool chain; pen insert cursor uses rAF polling.

**Risk:** Acceptable for small/medium SVGs; degrades with large imports or many overlays.

**Remediation:** Only if product requires large documents — viewport culling, indexed hit-test, throttled overlay refresh. Not a seam issue; a model/render strategy change.

---

### DEBT-013 · Boolean geometry flattens curves

**Problem:** Path booleans operate on polygon-flattened fill geometry; results are `M`/`L`/`Z`. Documented in CONTEXT.md but architectural for “pro vector” expectations.

**Remediation:** Product decision — keep as-is for SVG-editor class, or introduce curve-aware kernel (significant scope).

---

## Suggested execution order

```text
Wave 1 (unblock correctness)
  DEBT-002 → DEBT-001 (click + pen dedup) → DEBT-010 doc sync

Wave 2 (shrink hub)
  DEBT-003 → DEBT-011

Wave 3 (honesty + safety net)
  DEBT-004 → DEBT-005 → DEBT-008 → DEBT-009 → DEBT-006 → DEBT-007

Wave 4 (only if product demands)
  DEBT-012 → DEBT-013
```

---

## Debt ↔ adversarial finding map

| Adversarial challenge | Debt IDs |
|----------------------|----------|
| Registry-only for pointer lifecycle | DEBT-001 |
| Dead coordinate extraction | DEBT-002 |
| God-object canvas hub | DEBT-003 |
| Hexagonal oversell | DEBT-004 |
| Not a plugin system | DEBT-005 |
| Undo / ghost fragility | DEBT-006 |
| DOM selection drift | DEBT-007 |
| Unenforced anti-patterns | DEBT-008 |
| Monolithic command tests | DEBT-009 |
| Doc vs reality | DEBT-010 |
| Pen preview in template | DEBT-011 |
| Performance ceiling | DEBT-012 |
| Boolean fidelity ceiling | DEBT-013 |

---

## Tracking

| Debt ID | Beads | Priority |
|---------|-------|----------|
| DEBT-001 | `svg-editor-my0.1` | P0 |
| DEBT-002 | `svg-editor-my0.2` ✓ | P0 |
| DEBT-003 | `svg-editor-my0.3` | P0 |
| DEBT-004 | `svg-editor-my0.4` | P1 |
| DEBT-005 | `svg-editor-my0.5` | P1 |
| DEBT-006 | `svg-editor-my0.6` | P1 |
| DEBT-007 | `svg-editor-my0.7` | P1 |
| DEBT-008 | `svg-editor-my0.8` | P2 |
| DEBT-009 | `svg-editor-my0.9` | P2 |
| DEBT-010 | `svg-editor-my0.10` ✓ | P2 |
| DEBT-011 | `svg-editor-my0.11` | P2 |
| DEBT-012 | `svg-editor-my0.12` | P3 |
| DEBT-013 | `svg-editor-my0.13` | P3 |

**Epic:** `svg-editor-my0` — [epic] Architecture debt register (adversarial review 2026-07-10)

Close debt items here when acceptance criteria in beads issues are met.
