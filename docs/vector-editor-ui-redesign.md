# Vector Editor UI Redesign Spec

## Benchmark-driven UX architecture

This workspace follows a balanced vector-editing model based on recurring patterns from Illustrator, Affinity Designer, Adobe Animate, and SVGator:

- Left rail for tool-first muscle memory.
- Top command bar for document actions and global toggles.
- Context-sensitive inspector that defaults to document controls when no shape is selected.
- Docked right-side panel model (`Properties` and `Layers`) with quick switching.
- Canvas stays central and highest priority for pointer workflows.

### Product alignment decisions

- **Illustrator/Affinity alignment:** maintain a strong center canvas with tool rail + inspector model.
- **SVGator/Animate alignment:** keep a timeline-ready extension point without forcing animation UI now.
- **Current product balance:** optimize for static vector editing first while retaining an extensible shell.

## Phasing (tracker alignment)

Work is split so **responsive / small-viewport behavior** can be designed deliberately without blocking shell polish:

| Bead | Scope |
|------|--------|
| **`svg-editor-8x1.4`** (Phase 4) | **Debug strip off the primary path:** **collapsed by default** in all builds (expand to view XML). Does **not** include breakpoints, min canvas viewport, or compact-width shell layout. |
| **`svg-editor-8x1.6`** (backlog) | **Responsive shell:** tokenized breakpoints, compact-width wireframe behavior, minimum canvas viewport, replacing hardcoded layout numbers. |
| **`svg-editor-8x1.5`** (follows 8x1.4) | Playwright **structural** layout (shell, dock tabs, selection states). **Compact-width / narrow-viewport** E2E assertions wait until **`svg-editor-8x1.6`** ships. |

The wireframes below remain the **target UX**; only the **schedule** for compact width is deferred.

## Low-fidelity wireframes

### 1) Default editing workspace

```text
+----------------------------------------------------------------------------------------+
| Angular SVG Editor                                 [New] [Download SVG]               |
+----------------------+------------------------------------------+----------------------+
| Tool rail            | Canvas workspace                         | Properties | Layers  |
| [Select]             |                                          | ------------------- |
| [Node]               |                SVG Canvas                | Properties panel     |
| [Zoom ]              |                                          | (selection-aware)    |
| [Pan  ]              |                                          |                      |
| [Rect ]              |                                          |                      |
| [Ellipse]            |                                          |                      |
| [Line ]              |                                          |                      |
| [Text ]              |                                          |                      |
| [Pen  ]              |                                          |                      |
|----------------------|------------------------------------------|----------------------|
| Assets / Library     | Debug strip (collapsible)                                      |
+----------------------------------------------------------------------------------------+
```

### 2) Layers-focused workspace

```text
+----------------------------------------------------------------------------------------+
| Angular SVG Editor                                 [New] [Download SVG]               |
+----------------------+------------------------------------------+----------------------+
| Tool rail            | Canvas workspace                         | Properties | Layers* |
| ...                  |                                          | ------------------- |
|                      |                SVG Canvas                | Layers tree          |
| Assets / Library     |                                          | eye / lock / order   |
|                      |                                          | group / ungroup      |
+----------------------+------------------------------------------+----------------------+
```

### 3) Selection-state variants (right dock behavior)

```text
No selection      -> Properties shows Document Settings (artboard/global controls)
Single selection  -> Properties shows transform, appearance, type-specific controls
Multi selection   -> Properties emphasizes shared controls + align/distribute actions
```

### 4) Compact width behavior *(implementation: `svg-editor-8x1.6`)*

Target layout when the shell is narrow or on small screens; **not** part of Phase 4 (`svg-editor-8x1.4`).

```text
+--------------------------------------------------------------------+
| Top bar                                                            |
+---------+------------------------------------------+---------------+
| Tools   | Canvas                                   | P             |
| icons   |                                          | L             |
| only    |                                          | tabs          |
+---------+------------------------------------------+---------------+
```

## Angular implementation map

### Shell decomposition and boundaries

- `src/app/app.ts`: shell state and document-level actions.
- `src/app/app.html`: composition of top bar, left rail, center canvas, right dock tabs.
- `src/app/app.css`: layout tokens and responsive rules.
- Existing business components remain mounted and unchanged in responsibility:
  - `src/app/components/svg-canvas/*`
  - `src/app/components/properties-panel/*`
  - `src/app/components/layers-panel/*`
  - `src/app/components/svg-debug-panel/*`

### UI container responsibilities

- **Top bar:** title, document actions, global command affordances.
- **Left rail:** tool switching and quick creation controls.
- **Center column:** canvas plus debug strip. Phase 4 (`svg-editor-8x1.4`): debug body is **collapsed until the user expands it** (see phasing table).
- **Right dock:** tabbed host for properties/layers.

## Playwright validation strategy

Add layout-oriented E2E coverage in addition to existing geometry-heavy gesture tests:

1. Shell structure is visible and stable by `data-testid`.
2. Right dock defaults to `Properties`.
3. Dock tab clicks switch visibility between `Properties` and `Layers`.
4. After **`svg-editor-8x1.6`**: compact viewport keeps tool rail and tab-only dock accessible (defer narrow-width assertions until then).

### Selector standards

- Use `page.getByTestId(...)` for all shell-level assertions.
- Prefer regional screenshots (`locator.screenshot`) over full-page screenshots.
- Assert behavior first (visibility, toggle states), then optional snapshot checks.

### Suggested scenarios

- `editor-shell-layout.spec.ts`
  - verifies top bar / left rail / canvas / right dock presence
  - verifies default active dock tab
  - verifies tab switching
  - after responsive shell (`svg-editor-8x1.6`): compact mode structural fallback at narrow width
