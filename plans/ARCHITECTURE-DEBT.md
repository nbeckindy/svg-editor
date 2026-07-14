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

Product-class ceilings and deferred optimizations (large-document performance, curve-aware booleans) live in [ROADMAP.md](./ROADMAP.md#deferred-optimizations) — not architecture debt.

---

## P0 — Active routing and mapping debt

### DEBT-001 · Dual input routing (registry + canvas fallbacks) ✓

**Problem:** The tool registry owns pointer down/move/up and most click/keyboard paths, but cursor policy and a few canvas-wide click guards remained outside adapters. New tools had to know which events are “registry-pure” vs still canvas-owned.

**Evidence (2026-07-11, post `svg-editor-1sb`)**

| Surface | Registry / adapter? | Canvas adapter glue |
|---------|---------------------|---------------------|
| Pointer down/move/up | `pointer-gesture-router.ts` (~65 lines) → active `CanvasTool` | Path-node drag via `node-edit-selector` adapter — not a router bypass |
| Click | `tryDispatchRegisteredCanvasClick` → selector `onClick` | Pre-dispatch policy in `svg-canvas-click.controller.ts` (inline-text commit, gesture `consumeJustEnded`, path-node exit) |
| Double-click | Registry `onDoubleClick` (selector adapter) | Pen consumes via `pen-canvas-tool.ts` `onDoubleClick` |
| Keyboard | `dispatchRegisteredKeyDown` first (`svg-canvas-keyboard.controller.ts`) | Post-registry policy in `svg-canvas-keyboard-policy.ts` (Escape stack, undo/redo, view) |
| Cursor | Per-tool `getCursorHint`; `computeExpectedCursorHint` in `canvas-cursor-hint.ts` | Pen-insert hover RAF in `pen-insert-hover-cursor.ts` (viewport deps from canvas) |
| Pen right-click | `pen-canvas-tool.ts` sole owner | ✓ duplicate removed from canvas |

**Status:** Closed (`svg-editor-my0.1`, `svg-editor-my0.15`, `svg-editor-1sb`). Residual rows are **named policy modules** on the canvas adapter — not registry bypasses for tool-specific behavior.

**Merge note (2026-07-11):** DEBT-001 refactor stash reconciled on top of merged `2026-06-25-ao8i` branch features (clip-path / outline-to-path context menu, Material icons, expanded document actions). Arch guard baseline lowered to **6** tool-literal branches in `svg-canvas.component.ts`.

**Risk:** Pen-insert hover still needs viewport element + coordinate deps wired from the canvas adapter (expected for DOM-bound chrome).

**Remediation**

1. ✓ `onClick` on selector/node-edit adapters + `components/svg-canvas/selector-canvas-click.ts` helper.
2. ✓ Path-node pointer drag through node-edit adapter.
3. ✓ Keyboard registry-first; path-node delete in selector adapter.
4. ✓ **DEBT-001b** (`svg-editor-my0.15`): group drill-in double-click + path-node exit-on-click in selector/session; gesture cursor branches extracted to `canvas-cursor-hint.ts`.
5. ✓ Pen right-click deduped — adapter sole owner.
6. ✓ **Residual (2026-07-11):** `svg-canvas-click.controller.ts`, `svg-canvas-keyboard-policy.ts`, `pen-insert-hover-cursor.ts`, `computeExpectedCursorHint` in `canvas-cursor-hint.ts`.

**Depends on:** DEBT-002 (coordinate mapping) ✓. Hub glue tracked under DEBT-003.

---

### DEBT-002 · `CanvasCoordinateMappingService` unwired (dead extraction) ✓

**Problem:** Coordinate mapping was extracted but never bound. Duplicate `clientToEditorSvgPoint` lived on the canvas; the service had **zero imports** elsewhere in `src/app`.

**Evidence (resolved 2026-07-11, `svg-editor-my0.2`)**

- `canvas-coordinate-mapping.service.ts` (142 lines) — bound from canvas via `bindCoordinateMapping()` on view init / overlay sync
- `svg-canvas.component.ts` — `clientToEditorSvgPoint` / `svgBboxToOverlayPixels` delegate to injected service (~1635–1639)
- `canvas-coordinate-mapping.service.spec.ts` — jsdom-safe unit tests with mocked bindings
- Residual: `rootUserPathDToOutlineOverlayD` on canvas adapter — consumed by `PathBooleanChromeReadout` (acceptable chrome glue).

**Remediation (done)**

1. ✓ Bind service from canvas lifecycle (`coordinateMapping.bind({ … })`).
2. ✓ Component methods delegate to service; pointer stack / session ports receive `clientToEditorSvgPoint` via canvas adapter.
3. ✓ Unit tests for mapping with mocked bindings.
4. Partial — overlay-path `d` → pixel conversion remains on canvas for boolean preview readout (acceptable chrome glue).

**Depends on:** None.

---

### DEBT-003 · `SvgCanvasComponent` remains integration hub (partial)

**Problem:** Extraction moved orchestrators and overlays out, but the canvas still wires sessions, keyboard/click context assembly, and context-menu command routing.

**Evidence (2026-07-13, post `svg-editor-j7i` + follow-ups `6xh` / `wkr` / `ait`)**

- `svg-canvas.component.ts` — still a large integration hub (grew after `2026-06-25-ao8i` merge: context menu, clip-path, outline-to-path); net LOC ~unchanged after pointer-intent controller extract (structural win, not size win)
- `svg-canvas-pointer-intent-debug.controller.ts` — owns DOM hit-test via `sampleCanvasPointerTarget`, `buildPointerIntentSnapshot` orchestration, and publish; gated by `EditorPointerIntentDebugService.samplingEnabled` (synced from debug panel collapse); canvas adapter keeps `buildSvgCanvasPointerIntentDebugContext()` (~wiring only) using `buildComputeExpectedCursorHintDepsFromCanvas`; pure snapshot builder in `gestures/pointer-intent-debug.ts`
- Direct `pushAndExecute` / `getSVGInstance()` call sites reduced via session bundle + document actions service
- Pen preview in `PenPreviewOverlayComponent` (DEBT-011 ✓); path-boolean preview in `BooleanPreviewOverlayComponent` via `PathBooleanChromeReadout` (DEBT-012 ✓)

**Remediation (partial — landed + residual)**

1. ✓ `createCanvasSessionBundle` (`canvas-session-coordinator.ts`) owns pen, path-node edit, inline-text session lifecycle + pointer-stack assembly.
2. ✓ `CanvasDocumentActionsService` routes keyboard align/distribute/group/ungroup through chrome-apply; clipboard cut/paste/duplicate centralized. `CanvasEditorCommandController` (`svg-canvas-keyboard.controller.ts`) owns clip-path make/release and keyboard delete; context menu still delegates clip-path to command controller and clipboard/group/rotate to document actions.
3. ✓ `PenToolChromeReadout` + pen preview overlay — pen preview SVG no longer inline in canvas template.
4. ✓ `PathBooleanChromeReadout` + `BooleanPreviewOverlayComponent` — boolean preview getter removed from component (DEBT-012 / `svg-editor-bd1`).
5. ✓ Click/keyboard policy modules (`svg-canvas-click.controller.ts`, `svg-canvas-keyboard-policy.ts`, `pen-insert-hover-cursor.ts`); ✓ pointer-intent debug policy/orchestration in `svg-canvas-pointer-intent-debug.controller.ts` (hit-test, snapshot publish); ✓ sampling gate (`svg-editor-6xh`); ✓ cursor-hint deps helper (`svg-editor-wkr`); ✓ `sampleCanvasPointerTarget` dedupe (`svg-editor-ait`). Canvas adapter retains `buildSvgCanvasPointerIntentDebugContext()` wiring only. **Residual:** keyboard context assembly; context-menu command split (document actions vs command controller).

**Depends on:** DEBT-001 ✓, DEBT-002 ✓.

---

## P1 — Structural honesty and extensibility

### DEBT-004 · “Hexagonal” is interface segregation, not isolation ✓

**Problem:** Docs and epics use hexagonal vocabulary; runtime is a **modular monolith** — many `*Port` types implemented by the same `@Injectable` singletons.

**Evidence (resolved 2026-07-10)**

- `SvgManipulationService` implements **16** port interfaces — ports remain typed slices on one façade
- ~~`CanvasToolHost` exposes full `SvgManipulationService`, `ShapeSelectionService`, `EditorHistoryService`~~ → `CanvasToolHost` removed; tools use per-tool `*CanvasToolDeps` + `CanvasAdapterContext` slices
- ~~`chrome-apply/*` injects `SvgManipulationService` cast to port types~~ → chrome apply injects port **tokens** (`chrome-apply.tokens.ts` + `useExisting` in `app.config.ts`)

**Risk:** “Inject a narrow port” is convention only; refactors do not reduce compile-time coupling.

**Remediation**

1. ✓ Update ARCHITECTURE.md posture: **“modular monolith with typed seams”**
2. Split `SvgManipulationService` into port-scoped injectable facades — optional, incremental (out of scope)
3. ✓ Narrow `CanvasToolHost` to adapter-context slice; tools stay on `*CanvasToolDeps`
4. ✓ Chrome-apply: inject port tokens backed by `useExisting: SvgManipulationService`

**Depends on:** Documentation change can land immediately; code splits are incremental.

---

### DEBT-005 · Closed-type “plugin” seam (internal only) ✓

**Problem:** Tool registration reads like a plugin system but requires core edits across closed unions and imperative registrar hooks.

**Evidence**

- `EditorTool` — closed union of 11 literals (`editor-tool.service.ts`)
- `CanvasBoundToolRegistrar` — hard-coded `registerPenTool` / `registerSelectorTools` / flags per tool family
- `tool-bundles.ts` + `register-default-tool-descriptors.ts` — startup registration only
- No DI extension token, dynamic manifest, or third-party boundary

**Risk:** Roadmap items (symbols, new tool packs) will be scoped as “register a tool” when they actually need type-system and registrar changes.

**Remediation (done)**

1. ✓ ARCHITECTURE.md + `.cursor/rules/canvas-tools-ports.mdc`: **internal refactor seam, not external plugin API**.
2. ✓ ARCHITECTURE.md checklist: **closed union edit** step (`EditorTool`, `ToolBundle`, `CanvasBoundToolRegistrar` hook).
3. ✓ `TOOL_EXTENSION` future sketch below (not implemented).

**Depends on:** DEBT-004 (honest naming).

#### TOOL_EXTENSION sketch (not implemented)

If external or pack-based tools are ever in scope, replace the closed union with an extension boundary:

```typescript
// Hypothetical — not in codebase
export const TOOL_EXTENSION = new InjectionToken<ToolExtension[]>('TOOL_EXTENSION');

export interface ToolExtension {
  readonly id: string; // replaces EditorTool literal
  readonly descriptor: ToolDescriptor;
  readonly capabilityFlags: ReadonlySet<ToolCapability>; // e.g. 'pointer', 'keyboard', 'selector-interaction'
  readonly registerCanvasTool: (registry: ToolRegistryService, deps: ToolExtensionDeps) => void;
}
```

- **Multi-provider** `TOOL_EXTENSION` in `app.config.ts` — third-party modules contribute descriptors + adapter factories without editing `EditorTool`.
- **String tool id** everywhere `EditorTool` is used today; capability flags replace scattered `getCurrentTool() === '…'` branches.
- **Single-phase or two-phase** registration unified under `ToolRegistryService.register(descriptor, factory?)` instead of split startup descriptors vs deferred `CanvasBoundToolRegistrar` hooks.

Until then, treat every new tool as a core change following the ARCHITECTURE.md checklist.

---

### DEBT-006 · Command undo stack implicit state machine ✓

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

### DEBT-007 · DOM-as-model selection drift ✓

**Problem:** No document kernel separate from the live SVG DOM. Selection and shape properties are re-derived from DOM after history events.

**Evidence**

- `SelectionReconcileService.reconcileFromLiveTree()` — single reconcile path; canvas `onHistoryRevision` + chrome apply delegate here
- History undo/redo triggers reconcile via `editorHistory.revision()` effect → `SelectionReconcileService.onHistoryRevision()`
- `documentRevision` signal exists but correctness relies on scattered invalidation

**Risk:** Stale selection, wrong inspector values, drill-in state after undo; scales poorly with complexity.

**Remediation**

1. Short term: centralize “history applied → selection reconcile” in one service listening to `EditorHistoryService.revision`.
2. Medium term: selection holds ids + cached `ShapeProperties` snapshots updated by commands, not DOM re-parse.
3. Long term (P3): only if product needs it — internal scene graph above SVG DOM.

**Depends on:** DEBT-006.

---

## P2 — Enforcement, tests, and doc drift

### DEBT-008 · Anti-patterns documented, not enforced ✓

**Problem:** ARCHITECTURE.md and `.cursor/rules/canvas-tools-ports.mdc` list anti-patterns; no lint/import guards.

**Evidence**

- No `no-restricted-imports` for tools → `SvgCanvasComponent`
- ~~Pen right-click duplicated (DEBT-001)~~ — closed
- Direct `getSVGInstance()` / `pushAndExecute` in canvas reduced but not zero (DEBT-003 residual)

**Remediation** (done)

1. ESLint `no-restricted-imports`: `src/app/tools/**` cannot import `svg-canvas.component` (`npm run lint`).
2. ESLint `no-restricted-imports`: `pen-tool-session/**` cannot import `SvgManipulationService` (use `*SvgPort`).
3. Architecture guard script: fail on new `getCurrentTool() === '` / `tool === '` branches in `svg-canvas.component.ts` — baseline **6** (`npm run lint:arch`; lowered after DEBT-001 refactor merged onto `2026-06-25-ao8i` branch features).

**Depends on:** DEBT-001 progress (avoid fighting active migration).

---

### DEBT-009 · Command test coverage monolith ✓

**Problem:** ~45 command classes across `history/commands/` share one spec file; port contracts lack dedicated tests.

**Evidence (resolved)**

- `editor-command-implementations.spec.ts` reduced to `CompositeCommand` only; domain specs under `paint/`, `transform/`, `layers/`, `document/`, `path/`
- `command-port-contracts.spec.ts` — thin port contract tests (`HistoryPaintPort`, `TransformGestureSvgPort`, `EditorShapeLifecycleSvgPort`)
- `components/svg-canvas/selector-canvas-click.spec.ts` — registry-routed click → selection integration test
- `src/app/testing/svg-geometry-test-harness.ts` — shared jsdom stubs for `getBBox` / `getCTM` / `getScreenCTM`

**Remediation (done)**

1. Split spec by domain mirroring `history/commands/` layout.
2. Add thin contract tests per port (mock implementation, assert command calls port methods).
3. Registry integration test: select shape via click with `ToolRegistryService` active.
4. Shared test harness for SVG geometry mocks.

**Depends on:** DEBT-001 (click routing) for integration test value.

---

### DEBT-010 · Stale architecture claims in epics ✓

**Problem:** Closed epics and ARCHITECTURE.md understate remaining gaps; line counts and fallback locations drift after debt closes.

**Evidence (2026-07-11 second pass)**

| Claim | Stale? | Actual |
|-------|--------|--------|
| Canvas line-count claims in old epics | Yes | Still a large hub; overlays and policy modules extracted; grew after branch merge |
| `PointerGestureRouter` ~77 lines with fallbacks | Yes | **65** lines; router dispatches registry only |
| Residual routing in `PointerGestureRouter` | Yes | Click/keyboard/cursor policy in named modules (`svg-canvas-click.controller.ts`, `svg-canvas-keyboard-policy.ts`, `pen-insert-hover-cursor.ts`) |
| Path-boolean preview inline in canvas template | Yes | `PathBooleanChromeReadout` + `BooleanPreviewOverlayComponent` (`svg-editor-bd1` ✓) |
| Phase 1–3 “closed” | OK | Epics closed; follow-on debt in this register — do not reopen j61/hnv/ywh |
| “All tools registered” | Partial | Descriptors at startup; canvas adapters deferred via `CanvasBoundToolRegistrar` |
| Coordinate service unwired | Yes | Wired (`svg-editor-my0.2` ✓) |

**Remediation**

1. ✓ “Architecture debt” section link in ARCHITECTURE.md → this file.
2. ✓ Epic doc post-close debt pointer — keep aligned with this register.
3. ✓ Refresh line counts and overlay extraction status (this pass).

**Depends on:** This file (DEBT-010 self).

---

### DEBT-011 · Pen preview chrome in canvas template ✓

**Problem:** Pen policy lives in `PenToolSession`; preview SVG still rendered from canvas template / component bindings.

**Evidence (resolved)**

- `PenPreviewOverlayComponent` (`overlays/pen-preview-overlay.component.*`) owns pen path/handle/rubber-band preview SVG
- Canvas template binds via `editorChrome` → `PenToolChromeReadout` fields on `app-pen-preview-overlay`
- `svg-canvas.component.html` pen preview blocks removed; boolean preview extracted to `BooleanPreviewOverlayComponent` (DEBT-012 ✓)

**Remediation (landed)**

1. Dedicated `pen-preview-overlay` component under `overlays/`.
2. Bind from `PenToolChromeReadout` via individual overlay inputs (`stroke` / `strokeWidth` from drawing defaults).
3. Remove inline pen preview readouts from canvas template.

**Depends on:** DEBT-003.

---

### DEBT-012 · Path-boolean preview chrome in canvas template ✓

**Problem:** Boolean preview policy lived in services/readouts; preview SVG still rendered from canvas template / component bindings (same pattern as pre–DEBT-011 pen preview).

**Evidence (resolved `svg-editor-my0.16`)**

- `BooleanPreviewOverlayComponent` (`overlays/boolean-preview-overlay.component.*`) owns path-boolean preview SVG
- `PathBooleanChromeReadout` supplies `pathBooleanPreviewOverlayD`; canvas template binds via `editorChrome`
- Getter removed from `SvgCanvasComponent` (`svg-editor-bd1` ✓)

**Remediation (landed)**

1. ✓ Dedicated `boolean-preview-overlay` component under `overlays/`.
2. ✓ Bind from chrome readout; remove inline preview block from canvas template.
3. ✓ Namespace probe spec passes.

**Depends on:** DEBT-003 (hub shrink).

---

## Suggested execution order

```text
Wave 1 (unblock correctness)
  DEBT-002 → DEBT-001 (click + pen dedup) → DEBT-010 doc sync

Wave 2 (shrink hub)
  DEBT-003 → DEBT-011 → DEBT-012

Wave 3 (honesty + safety net)
  DEBT-004 → DEBT-005 → DEBT-008 → DEBT-009 → DEBT-006 → DEBT-007
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
| Boolean preview in template | DEBT-012 |

---

## Tracking

| Debt ID | Beads | Priority | Status |
|---------|-------|----------|--------|
| DEBT-001 | `svg-editor-my0.1` · `svg-editor-my0.15` · `svg-editor-1sb` | P0 | ✓ Closed |
| DEBT-002 | `svg-editor-my0.2` | P0 | ✓ Closed |
| DEBT-003 | `svg-editor-my0.3` · `svg-editor-j7i` · `svg-editor-6xh` · `svg-editor-wkr` · `svg-editor-ait` | P0 | **Partial** — hub shrunk; pointer-intent debug follow-ups closed; keyboard context assembly + context-menu split remain |
| DEBT-004 | `svg-editor-my0.4` | P1 | ✓ Closed |
| DEBT-005 | `svg-editor-my0.5` | P1 | ✓ Closed |
| DEBT-006 | `svg-editor-my0.6` | P1 | ✓ Closed |
| DEBT-007 | `svg-editor-my0.7` | P1 | ✓ Closed |
| DEBT-008 | `svg-editor-my0.8` | P2 | ✓ Closed |
| DEBT-009 | `svg-editor-my0.9` | P2 | ✓ Closed |
| DEBT-010 | `svg-editor-my0.10` | P2 | ✓ Closed (re-sync when milestones land) |
| DEBT-011 | `svg-editor-my0.11` | P2 | ✓ Closed |
| DEBT-012 | `svg-editor-my0.16` · `svg-editor-bd1` | P2 | ✓ Closed |

**Epic:** `svg-editor-my0` — [epic] Architecture debt register (adversarial review 2026-07-10)

Close debt items here when acceptance criteria in beads issues are met.
