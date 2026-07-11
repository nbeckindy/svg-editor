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

### DEBT-001 · Dual input routing (registry + canvas fallbacks)

**Problem:** The tool registry owns pointer down/move/up and most click/keyboard paths, but cursor policy and a few canvas-wide click guards remain outside adapters. New tools must know which events are “registry-pure” vs still canvas-owned.

**Evidence (2026-07-11)**

| Surface | Registry? | Still in canvas / elsewhere |
|---------|-----------|------------------------------|
| Pointer down/move/up | `pointer-gesture-router.ts` (~77 lines) | Path-node drag routed through `node-edit-selector` adapter (`selector-canvas-tool.ts` `onPointerDown`/`Move`/`Up`) |
| Click | `selector-canvas-tool.ts` `onClick` → `handleSelectorCanvasClick` | Canvas-wide gesture `consumeJustEnded` guards + inline-text commit in `onCanvasClick` |
| Double-click | `selector-canvas-tool.ts` `onDoubleClick` (text inline edit + group drill-in) | Pen-tool guard in `onCanvasDoubleClick` only |
| Keyboard | `dispatchRegisteredKeyDown` first (`svg-canvas-keyboard.controller.ts` 103–106) | Canvas-wide Escape gesture cancel + undo/redo + view shortcuts after registry |
| Cursor | Per-tool `getCursorHint` + `cursorHintForGestureInProgress` helper | Pen insert hover cursor RAF in canvas (~7 tool-literal branches, baseline-enforced) |
| Pen right-click | `pen-canvas-tool.ts` sole owner | ✓ duplicate removed from canvas |

**Risk:** Contributors follow ARCHITECTURE.md “register a `CanvasTool`” and still must edit the ~2,240-line canvas for cursor RAF, path-node exit guards, and boolean preview template chrome.

**Remediation**

1. ✓ `onClick` on selector/node-edit adapters + `selector-canvas-click.ts` helper.
2. ✓ Path-node pointer drag through node-edit adapter.
3. ✓ Keyboard registry-first; path-node delete in selector adapter.
4. ✓ **DEBT-001b** (`svg-editor-my0.15`): group drill-in double-click + path-node exit-on-click in selector/session; gesture cursor branches extracted to `canvas-cursor-hint.ts`.
5. ✓ Pen right-click deduped — adapter sole owner.

**Depends on:** DEBT-002 (coordinate mapping) ✓, DEBT-003 (canvas shrink) partial.

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

**Problem:** Extraction moved orchestrators and overlays out, but the canvas still wires sessions, gesture cursor RAF, debug HUD, path-boolean preview template chrome, and keyboard context assembly.

**Evidence (2026-07-11)**

- `svg-canvas.component.ts` — **~2,240** lines TS + **341** lines HTML (down from 2,531 pre-refactor)
- Direct `pushAndExecute` / `getSVGInstance()` call sites reduced via session bundle + document actions service
- Pen preview moved to `PenPreviewOverlayComponent` (DEBT-011 ✓); path-boolean preview still inline in canvas template (DEBT-012 / `svg-editor-my0.16`)

**Remediation (partial — landed + residual)**

1. ✓ `createCanvasSessionBundle` (`canvas-session-coordinator.ts`) owns pen, path-node edit, inline-text session lifecycle + pointer-stack assembly.
2. ✓ `CanvasDocumentActionsService` routes keyboard align/distribute/group/ungroup through chrome-apply; clipboard cut/paste/duplicate centralized.
3. ✓ `PenToolChromeReadout` + pen preview overlay — pen preview getters no longer on component.
4. **Residual:** path-boolean preview template block; `computeExpectedCursorHint` + pen insert hover cursor RAF.

**Depends on:** DEBT-001, DEBT-002.

---

## P1 — Structural honesty and extensibility

### DEBT-004 · “Hexagonal” is interface segregation, not isolation ✓

**Problem:** Docs and epics use hexagonal vocabulary; runtime is a **modular monolith** — many `*Port` types implemented by the same `@Injectable` singletons.

**Evidence (resolved 2026-07-10)**

- `SvgManipulationService` implements **14** port interfaces (~584 lines, ~104 public methods) — unchanged; ports remain typed slices on one façade
- ~~`CanvasToolHost` exposes full `SvgManipulationService`, `ShapeSelectionService`, `EditorHistoryService`~~ → `CanvasToolHost` is now a `CanvasAdapterContext` alias; tools use per-tool `*CanvasToolDeps`
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
- Pen right-click duplicated (DEBT-001)
- Direct `getSVGInstance()` / `pushAndExecute` in canvas (DEBT-003)

**Remediation** (done)

1. ESLint `no-restricted-imports`: `src/app/tools/**` cannot import `svg-canvas.component` (`npm run lint`).
2. ESLint `no-restricted-imports`: `pen-tool-session/**` cannot import `SvgManipulationService` (use `*SvgPort`).
3. Architecture guard script: fail on new `getCurrentTool() === '` / `tool === '` branches in `svg-canvas.component.ts` — baseline **16** (`npm run lint:arch`).

**Depends on:** DEBT-001 progress (avoid fighting active migration).

---

### DEBT-009 · Command test coverage monolith ✓

**Problem:** ~45 command classes across `history/commands/` share one spec file; port contracts lack dedicated tests.

**Evidence (resolved)**

- `editor-command-implementations.spec.ts` reduced to `CompositeCommand` only; domain specs under `paint/`, `transform/`, `layers/`, `document/`, `path/`
- `command-port-contracts.spec.ts` — thin port contract tests (`HistoryPaintPort`, `TransformGestureSvgPort`, `EditorShapeLifecycleSvgPort`)
- `selector-canvas-click.spec.ts` — registry-routed click → selection integration test
- `src/app/testing/svg-geometry-test-harness.ts` — shared jsdom stubs for `getBBox` / `getCTM` / `getScreenCTM`

**Remediation (done)**

1. Split spec by domain mirroring `history/commands/` layout.
2. Add thin contract tests per port (mock implementation, assert command calls port methods).
3. Registry integration test: select shape via click with `ToolRegistryService` active.
4. Shared test harness for SVG geometry mocks.

**Depends on:** DEBT-001 (click routing) for integration test value.

---

### DEBT-010 · Stale architecture claims in epics

**Problem:** Closed epics and ARCHITECTURE.md understate remaining gaps; line counts and fallback locations are wrong.

**Evidence**

| Claim | Stale? | Actual |
|-------|--------|--------|
| Canvas ~4.3k / ~2.7k lines TS | Yes | **~2,240** (post DEBT-003 shrink) |
| Residual routing in `PointerGestureRouter` | Yes | Router is clean; residuals in cursor RAF, path-node exit click guard, boolean preview template |
| Phase 1–3 “closed” | Partial | Coordinate service wired (`svg-editor-my0.2`); selector `onClick` in registry; DEBT-001b policy gaps remain |
| “All tools registered” | Partial | Descriptors at startup; canvas adapters deferred via `CanvasBoundToolRegistrar` |

**Remediation**

1. Add “Architecture debt” section link in ARCHITECTURE.md → this file.
2. Annotate epic doc with post-close debt pointer; do not reopen epics — track here or via `bd`.
3. Refresh line counts when DEBT-003 milestones land.

**Depends on:** This file (DEBT-010 self).

---

### DEBT-011 · Pen preview chrome in canvas template ✓

**Problem:** Pen policy lives in `PenToolSession`; preview SVG still rendered from canvas template / component bindings.

**Evidence (resolved)**

- `PenPreviewOverlayComponent` (`overlays/pen-preview-overlay.component.*`) owns pen path/handle/rubber-band preview SVG
- Canvas template binds via `editorChrome` → `PenToolChromeReadout` fields on `app-pen-preview-overlay`
- `svg-canvas.component.html` pen preview blocks removed (path-boolean preview and `path-node-overlay` unchanged)

**Remediation (landed)**

1. Dedicated `pen-preview-overlay` component under `overlays/`.
2. Bind from `PenToolChromeReadout` via individual overlay inputs (`stroke` / `strokeWidth` from drawing defaults).
3. Remove inline pen preview readouts from canvas template.

**Depends on:** DEBT-003.

---

## Suggested execution order

```text
Wave 1 (unblock correctness)
  DEBT-002 → DEBT-001 (click + pen dedup) → DEBT-010 doc sync

Wave 2 (shrink hub)
  DEBT-003 → DEBT-011

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

---

## Tracking

| Debt ID | Beads | Priority |
|---------|-------|----------|
| DEBT-001 | `svg-editor-my0.1` partial · `svg-editor-my0.15` (001b) | P0 |
| DEBT-002 | `svg-editor-my0.2` ✓ | P0 |
| DEBT-003 | `svg-editor-my0.3` | P0 |
| DEBT-004 | `svg-editor-my0.4` ✓ | P1 |
| DEBT-005 | `svg-editor-my0.5` ✓ | P1 |
| DEBT-006 | `svg-editor-my0.6` ✓ | P1 |
| DEBT-007 | `svg-editor-my0.7` ✓ | P1 |
| DEBT-008 | `svg-editor-my0.8` ✓ | P2 |
| DEBT-009 | `svg-editor-my0.9` ✓ | P2 |
| DEBT-010 | `svg-editor-my0.10` ✓ | P2 |
| DEBT-011 | `svg-editor-my0.11` ✓ | P2 |

**Epic:** `svg-editor-my0` — [epic] Architecture debt register (adversarial review 2026-07-10)

Close debt items here when acceptance criteria in beads issues are met.
