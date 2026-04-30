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

### 4) Compact width behavior

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
- **Center column:** canvas plus debug strip.
- **Right dock:** tabbed host for properties/layers.

## Playwright validation strategy

Add layout-oriented E2E coverage in addition to existing geometry-heavy gesture tests:

1. Shell structure is visible and stable by `data-testid`.
2. Right dock defaults to `Properties`.
3. Dock tab clicks switch visibility between `Properties` and `Layers`.
4. Compact viewport keeps tool rail and tab-only dock accessible.

### Selector standards

- Use `page.getByTestId(...)` for all shell-level assertions.
- Prefer regional screenshots (`locator.screenshot`) over full-page screenshots.
- Assert behavior first (visibility, toggle states), then optional snapshot checks.

### Suggested scenarios

- `editor-shell-layout.spec.ts`
  - verifies top bar / left rail / canvas / right dock presence
  - verifies default active dock tab
  - verifies tab switching
  - verifies compact mode structural fallback at narrow width
