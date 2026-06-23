# Epic: Hexagonal architecture — tool plugin system & UI composition

| Phase | Beads epic | Status |
|-------|------------|--------|
| **1** | [`svg-editor-j61`](../../) | Closed 2026-06-23 |
| **2** | [`svg-editor-hnv`](../../) | Closed 2026-06-23 (18/18 children) |
| **3** | [`svg-editor-ywh`](../../) | Closed 2026-06-23 (7/7 children) |

**Handoff docs:** [ARCHITECTURE.md](../ARCHITECTURE.md) (current seams + gravity wells) · [CONTEXT.md](../../CONTEXT.md) (editor vocabulary)

## Goal

Improve editor extensibility toward hexagonal architecture: (1) a **tool plugin seam** so new canvas tools register without deep canvas edits, and (2) a **UI composition layer** for rapid layout/panel/visual iteration.

## Does it follow hexagonal architecture?

**Mostly at the seams — j61 laid foundations; hnv deepened them.**

### Existing strengths

- **Ports** — `PenToolSessionPorts`, `LayersPanelSvgPort`, `TransformGestureSvgPort`, `LayerLockReadPort`, `PathBooleanSelectionReadPort`, `GroupStructureChangePort`, etc.
- **`SvgManipulationService`** — façade implementing many ports over sub-services (`shape-content/*`, layer structure, gradient defs, …).
- **`EditorCommand` / `EditorHistoryService`** — intent vs execution; undoable mutations; implementations split under `history/commands/{paint,transform,layers,document,path}/`.
- **`PenToolSession` + ports** — testable without the full canvas.
- **`ToolRegistryService` + `CanvasTool`** — all editor tools registered; pointer and keyboard dispatch consult registry first.
- **Thin chrome apply façade** — `ChromeEditorApplyService` delegates to `chrome-apply/*` domain slices; group-structure notifications use `GroupStructureChangeService` (no canvas callback on chrome apply).

### Remaining gaps (post–phase 2)

| Problem | Where | Notes |
|---|---|---|
| **Large canvas adapter** | `SvgCanvasComponent` (~4.3k lines TS) | Overlays extracted; pen previews / inline text / keyboard glue remain inline. |
| **Legacy tool routing** | `PointerGestureRouter` | Residual fallbacks when a tool is not registered (e.g. unit tests); production tools use `CanvasTool` adapters. |
| **Angular in domain** | Most services | `@Injectable({ providedIn: 'root' })` — acceptable for this app; not pure hexagonal isolation. |
| **`SvgManipulationService` breadth** | Central façade | Narrow ports at panel boundaries (properties, boolean path, layers DnD); façade still wide for history commands. |

**Resolved in phase 2 (no longer gaps):**

| Was | Now |
|-----|-----|
| `ChromeEditorApplyService` mega-facade (~950 lines) | `chrome-apply/{paint,transform,layers,path-ops}` + support + `GroupStructureChangeService` |
| `editor-command-implementations.ts` monolith | `history/commands/*` by domain + barrel re-export |
| `svg-shape-content.service.ts` monolith | `shape-content/{paint,path-data,text}` + thin façade |
| Rulers / grid / smart guides in canvas template | `overlays/{ruler,grid,smart-guide}-overlay.component.*` |
| `afterGroupStructureChange` imperative callback | `GroupStructureChangeService` signal port |
| Layers panel DnD inline (~200 lines) | `LayersPanelDndService` |
| Duplicate path boolean DOM reads | `PathBooleanSelectionReadService` shared by panel + geometry |
| Unregistered selector / pen / zoom / pan / text / eyedropper | `CanvasTool` adapters + `registerDefaultTools()` in `app.config.ts` |
| Dock auto-show / shell layout ad hoc | `DockPanelAutoShowService`, `EditorLayoutService` |
| Hardcoded tool strip buttons | `ToolDescriptor` + `registerDefaultToolDescriptors()` + registry-driven strip |

---

## Phase 1 — `svg-editor-j61` (closed)

### Track 1 — Tool plugin system (j61.1–j61.3)

| Bead | Deliverable |
|------|-------------|
| j61.1 | [`CanvasTool`](../../src/app/tools/canvas-tool.interface.ts), [`CanvasToolHost`](../../src/app/tools/canvas-tool-host.interface.ts) |
| j61.2 | [`ToolRegistryService`](../../src/app/tools/tool-registry.service.ts); dispatch in [`PointerGestureRouter`](../../src/app/components/svg-canvas/gestures/pointer-gesture-router.ts) and `SvgCanvasComponent.onCanvasClick` |
| j61.3 | [`creation-canvas-tool.ts`](../../src/app/tools/creation-canvas-tool.ts) — `rect` / `ellipse` / `line` adapters |

### Track 2 — UI composition (j61.4–j61.6)

| Bead | Deliverable |
|------|-------------|
| j61.4 | [`src/styles/tokens.scss`](../../src/styles/tokens.scss) — `--editor-*` design tokens |
| j61.5 | [`DockPanelRegistryService`](../../src/app/panels/dock-panel-registry.service.ts), [`registerDefaultDockPanels()`](../../src/app/panels/register-default-dock-panels.ts) |
| j61.6 | [`SelectionOverlayComponent`](../../src/app/components/svg-canvas/overlays/selection-overlay.component.ts), [`PathNodeOverlayComponent`](../../src/app/components/svg-canvas/overlays/path-node-overlay.component.ts) |

---

## Phase 2 — `svg-editor-hnv` (deepen seams)

**Epic:** `svg-editor-hnv` · **Plan source:** architecture improvement review (handoff `improve-codebase-architecture` 2026-05-22)

### Children (bead status)

| Bead | ARCH | Summary | Status |
|------|------|---------|--------|
| hnv.1 | ARCH-7 | Tool registry foundation — creation routing | ✓ |
| hnv.2 | ARCH-8 | `registerDefaultTools()` in `app.config.ts` | ✓ |
| hnv.3 | ARCH-9 | `ToolRegistry` `onKeyDown` in keyboard controller | ✓ |
| hnv.4 | ARCH-10 | `ToolDescriptor` metadata + registry-driven tool strip | ✓ |
| hnv.5 | ARCH-11 | `PenToolSession` as `CanvasTool` adapter | ✓ |
| hnv.6 | ARCH-12 | Selector as `CanvasTool` adapter | ✓ |
| hnv.7 | ARCH-13 | `DockPanelDescriptor.relevantTools` auto-show | ✓ |
| hnv.8 | ARCH-14 | `EditorLayoutService` shell layout signals | ✓ |
| hnv.9 | ARCH-15 | Split `editor-command-implementations` by domain | ✓ |
| hnv.10 | ARCH-16 | Split `svg-shape-content` by domain | ✓ |
| hnv.11 | ARCH-20 | Split `ChromeEditorApplyService` + `GroupStructureChangePort` | ✓ |
| hnv.12 | ARCH-21 | Ruler / grid / smart-guide overlay components | ✓ |
| hnv.13 | ARCH-19 | Narrow ports at properties + boolean path panels | ✓ |
| hnv.14 | ARCH-17 | `LayersPanelDndService` | ✓ |
| hnv.15 | ARCH-22 | `PathBooleanSelectionReadPort` shared read model | ✓ |
| hnv.16 | ARCH-23 | Tool classification in registry metadata | ✓ |
| hnv.17 | ARCH-24 | Remaining tools as `CanvasTool` (zoom, pan, text, eyedropper, …) | ✓ |
| hnv.18 | ARCH-25 | Update architecture docs (this file + ARCHITECTURE.md) | ✓ |

### Phase 2 deliverables (by area)

**Tools**

- [`register-default-tools.ts`](../../src/app/tools/register-default-tools.ts) — bootstrap all `CanvasTool` adapters at app startup.
- Adapters: creation, selector, pen, zoom, pan, text, eyedropper (+ node-edit where applicable).

**Commands & content**

- [`history/commands/`](../../src/app/history/commands/) — paint, transform, layers, document, path command implementations.
- [`shape-content/`](../../src/app/services/shape-content/) — paint, path-data, text slices behind `SvgShapeContentService` façade.

**Chrome apply**

- [`chrome-apply/`](../../src/app/services/chrome-apply/) — paint / transform / layers / path-ops apply services.
- [`GroupStructureChangeService`](../../src/app/services/chrome-apply/group-structure-change.service.ts) — canvas drill-in sync via signal (replaces `afterGroupStructureChange`).

**UI composition**

- [`EditorLayoutService`](../../src/app/services/editor-layout.service.ts) — dock tab, collapse, rail/dock width signals.
- [`DockPanelAutoShowService`](../../src/app/panels/dock-panel-auto-show.service.ts) — `relevantTools` panel suggestions.
- Overlays: ruler, grid, smart-guide child components under `svg-canvas/overlays/`.
- [`LayersPanelDndService`](../../src/app/components/layers-panel/layers-panel-dnd.service.ts) — layer drag-and-drop intent + apply.

**Typed ports (panel boundaries)**

- [`LayerLockReadPort`](../../src/app/history/layer-lock-read.port.ts) — properties panel lock readout.
- [`PathBooleanSelectionReadPort`](../../src/app/history/path-boolean-selection-read.port.ts) — path ops panel + `PathBooleanGeometryService`.

---

## Target architecture (current)

```mermaid
flowchart TB
  subgraph Shell["Editor Shell"]
    TopBar[EditorTopBar]
    LeftRail[EditorLeftRail + tool strip]
    Canvas[SvgCanvasComponent]
    RightDock["EditorRightDock + EditorLayoutService"]
  end

  subgraph Overlays["Canvas Overlays"]
    SelOverlay[SelectionOverlay]
    NodeOverlay[PathNodeOverlay]
    Rulers[RulerOverlay]
    Grid[GridOverlay]
    Guides[SmartGuideOverlay]
  end

  subgraph ToolLayer["Tool Layer"]
    Registry[ToolRegistryService]
    DefaultTools["registerDefaultTools — all CanvasTool adapters"]
  end

  subgraph ChromeApply["Chrome write path"]
    ApplyFacade[ChromeEditorApplyService]
    ApplySlices["chrome-apply/*"]
    GroupChange[GroupStructureChangeService]
  end

  subgraph Domain["Domain Core"]
    Commands["EditorCommand + history/commands/*"]
    Ports["*Port interfaces"]
  end

  subgraph SVG["SVG Adapter"]
    Manip[SvgManipulationService]
    ShapeContent["shape-content/*"]
    SvgJs["@svgdotjs/svg.js"]
  end

  Canvas --> Registry
  Registry --> DefaultTools
  Canvas --> Overlays
  RightDock --> DockRegistry[DockPanelRegistryService]
  ApplyFacade --> ApplySlices --> Commands
  ApplySlices --> GroupChange
  Commands --> Ports --> Manip --> SvgJs
  Manip --> ShapeContent
```

---

## Recommended next steps

See **Phase 3 — `svg-editor-ywh`** below (dedup legacy routing, unified tool bundles). After that:

1. Shrink `SvgCanvasComponent` further — pen preview / inline text extraction (if warranted).
2. Optional: `InjectionToken` per port for explicit DI at remaining call sites.
3. Optional: drive tool context bar from `ToolDescriptor.contextBarComponent`.

---

## Phase 3 — `svg-editor-ywh` (dedup & unify)

**Epic:** `svg-editor-ywh` · **Plan source:** post–Phase 2 architecture review (2026-06-23)

Phase 2 introduced `CanvasTool` adapters but kept parallel **legacy** paths in `PointerGestureRouter` for tests, scattered tool metadata across 4+ files, and duplicate keyboard/HUD routing. Phase 3 removes that debt so new tools have one registration path.

### Children (bead status)

| Bead | ARCH | Summary | Depends on | Priority |
|------|------|---------|------------|----------|
| ywh.1 | ARCH-26 | Shared test helper registers full default `CanvasTool` set | — | P2 | ✓ |
| ywh.2 | ARCH-28 | Remove dead pen Enter/Backspace keyboard fallbacks | — | P2 | ✓ |
| ywh.3 | ARCH-29 | Fix `CanvasSvgPoint` mapping on pointer move/up | — | P2 | ✓ |
| ywh.4 | ARCH-30 | Unified tool bundle (descriptor + adapter + shortcut) | — | P2 | ✓ |
| ywh.5 | ARCH-27 | Remove `PointerGestureRouter` legacy routing paths | ywh.1 | P2 | ✓ |
| ywh.6 | ARCH-31 | Pointer-intent debug HUD uses registry routing | ywh.5 | P3 | ✓ |
| ywh.7 | ARCH-32 | Consolidate canvas host context interfaces | — | P4 | ✓ |

### Suggested grab order

1. **ywh.1** (test helper) — unblocks legacy router removal  
2. **ywh.2**, **ywh.3**, **ywh.4** — parallel quick wins  
3. **ywh.5** — delete ~200 lines of duplicated routing  
4. **ywh.6** — trim debug HUD third copy  
5. **ywh.7** — optional host-interface consolidation  

### Out of scope (defer)

- Pen preview / inline text extraction from `SvgCanvasComponent`
- Removing `SvgShapeContentService` / `ChromeEditorApplyService` façade pass-throughs (stable panel APIs)
- `InjectionToken` per port

---

## Commits reference

**Phase 1 (j61, 2026-06):** `736e7fb`, `49c1b80`, `7c7adee`, `d448a5a`, `472ac2d`, `8afe5a0`

**Phase 2 (hnv, 2026-06):** see `git log --oneline --grep=hnv` on `master` — includes command/shape-content/chrome-apply splits, overlay extraction, `GroupStructureChangeService`, layers DnD, path boolean read port, typed panel ports.
