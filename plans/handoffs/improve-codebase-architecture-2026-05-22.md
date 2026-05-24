# Handoff: improve-codebase-architecture (2026-05-22)

**Purpose:** Paste or `@`-reference this file at the start of a **new agent session** to continue the architecture review without re-running exploration.

**Skill:** `/.claude/skills/improve-codebase-architecture/SKILL.md`  
**Vocabulary:** `/.claude/skills/improve-codebase-architecture/LANGUAGE.md` — use terms *module*, *interface*, *implementation*, *depth* / *shallow* / *deep*, *seam*, *adapter*, *leverage*, *locality* (not “service/boundary/API” as substitutes).

**Domain glossary:** Read repo-root `CONTEXT.md` if it exists (not verified in the session that produced this file).

**ADRs:** No `docs/adr/` was found at exploration time.

---

## Exploration summary (readonly pass)

Explored the Angular svg-editor around canvas, tools, commands, and manipulation services.

| Theme | Detail |
|--------|--------|
| Gravity wells | `svg-canvas.component.ts` (~4k+ lines) and `svg-manipulation.service.ts` (~2.9k+ lines) centralize orchestration |
| Shallow split | `editor-tool.service.ts` is mostly signals; substantive tool behavior lives on the canvas |
| Layering | `src/app/models/editor-commands.ts` imports Angular services — blurs command data vs application wiring |
| Duplication | `selection-paint-apply.service.ts` mirrors properties-panel command patterns; panel still orchestrates heavily |
| Gesture coupling | `gestures/gesture-context.ts` bundles many services + callbacks — second orchestrator alongside canvas |
| Properties panel | `properties-panel.component.ts` mixes matrix math, freshness signals, and `EditorCommand` construction |
| Pass-through UI | `editor-dock-panel.ts` (types only), thin `tool-strip`, `editor-right-dock`, `editor-tool-context-bar` |
| Tests | Strong on pure models (`pen-path`, `path-d`, `path-pen-insert`); gaps on `selection-paint-apply.service`, `editor-tool.service`; canvas spec very large (integration-style) |

---

## Deepening opportunities (numbered — pick one to grill)

### 1. Canvas orchestration vs tool policy

**Files:** `src/app/components/svg-canvas/svg-canvas.component.ts`, `src/app/components/svg-canvas/gestures/gesture-context.ts`, `src/app/services/editor-tool.service.ts`

**Problem:** Tool behavior (pen, node edit, keyboard routing, effects) lives mainly on the canvas; `EditorToolService` is a small signal holder. The seam for “which tool is active” is small, but the seam for “how tools behave” is the whole canvas + gesture context — a **shallow** split.

**Solution:** Move coherent tool sessions (pen lifecycle, path node edit lifecycle, etc.) behind one orchestration module whose **interface** is event-in / commands-out (or similar), with the canvas as a thin adapter for DOM and coordinates.

**Benefits:** **Locality** for tool bugs; **leverage** for tests without full canvas construction; **interface as test surface** for tool policy.

---

### 2. `SvgManipulationService` as a single façade

**Files:** `src/app/services/svg-manipulation.service.ts` and its call sites (canvas, properties panel, history)

**Problem:** One module exposes a very wide **interface** (document, layers, bbox, highlights, gradients, clipboard-adjacent ops, etc.). Unrelated changes collide; test doubles are heavy.

**Solution:** Split along stable conceptual lines (document/layer tree vs selection presentation vs defs/gradients vs geometry readouts), each with a smaller **interface**; keep SVG.js inside implementations per project rules.

**Benefits:** Narrower seams, better **locality**, deletion test passes per slice.

**Status (2026-05):** `SvgManipulationService` already **delegates** to focused injectables (`SvgEditorDocumentService`, `SvgShapeContentService`, `SvgSelectionGeometryService`, `SvgLayerStructureService`, `SvgGradientDefsService`). Further **file** splits are optional. Remaining #2 work is **typed seams at call sites** so consumers do not depend on the full class surface unless necessary (e.g. `TransformGestureDocSvgPort`, `TransformGestureSvgPort`, `SelectionTransformApplySvgPort` on `SelectionTransformApplyService`, `HistoryPaintPort`, `implements TransformGestureDocSvgPort` / `SelectionTransformApplySvgPort` on the façade class).

---

### 3. Commands living beside Angular services

**Files:** `src/app/models/editor-commands.ts`, `svg-manipulation.service.ts`, `shape-selection.service.ts`, related specs

**Problem:** Command types in `models/` import concrete Angular **services**. Couples “what is a command” with “how the app applies it,” cycle risk, hard to reason about commands alone.

**Solution:** Invert deps: pure command data + narrow ports; **adapters** in the app layer. Or relocate command construction so `models/` has no service imports.

**Benefits:** **Locality** for undo/redo; commands testable without full DI graph; less leakage across seams.

---

### 4. Properties panel as geometry + command hub

**Files:** `src/app/components/properties-panel/properties-panel.component.ts`, `src/app/services/selection-paint-apply.service.ts`, `src/app/services/svg-manipulation.service.ts`

**Problem:** Panel mixes read-model math (matrices, bbox, skew/rotation) with command orchestration; overlaps `SelectionPaintApplyService` and manipulation — two homes, wide UI seam.

**Solution:** Extract selection → transform readout module; single write path for “apply paint/style from UI” so the panel is mostly binding.

**Benefits:** **Locality** for transform bugs; **leverage** for context bar / future inspectors; one test surface for style + history + selection patches.

---

### 5. Gesture context as a second orchestrator

**Files:** `src/app/components/svg-canvas/gestures/gesture-context.ts`, gestures under `svg-canvas/gestures/`, `svg-canvas.component.ts`

**Problem:** Fat context duplicates canvas orchestration; gesture **interface** is large (many fields/callbacks).

**Solution:** Align with (1): one orchestration module; gestures receive smaller stable slices per family (pointer vs keyboard).

**Benefits:** **Locality** for new gestures; clearer seam between input events and editor effects.

---

### 6. Canvas spec as the only fine-grained test surface

**Files:** `src/app/components/svg-canvas/svg-canvas.component.spec.ts`; gaps on `selection-paint-apply.service`, `editor-tool.service`

**Problem:** Huge integration-style specs; **interface as test surface** is often the whole canvas.

**Solution:** Deepen modules from (1)–(4) so their **interfaces** own tests that today need full canvas setup.

**Benefits:** Faster failures; less churn on giant spec; **leverage** across features.

---

### 7. Thin UI shells (lower priority)

**Files:** `tool-strip`, `editor-right-dock`, `editor-tool-context-bar`, `editor-dock-panel.ts`

**Problem:** Intentionally thin; deletion test barely moves complexity.

**Solution:** Revisit only if a second **adapter** (e.g. alternate layout) needs the same forwarding contract.

---

## Next step for the new session

User has **not** yet chosen a candidate to grill.

**Prompt to continue:**  
> Read `plans/handoffs/improve-codebase-architecture-2026-05-22.md` and `CONTEXT.md`. I want to explore deepening opportunity **#N** (from that handoff). Follow the improve-codebase-architecture skill grilling loop; do not propose concrete TypeScript interfaces until I ask.

Replace **#N** with 1–7 (or a combo like “1 + 3”).
