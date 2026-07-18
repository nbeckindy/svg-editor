# Epic: Text panel

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Text panel |
| **Goal** | Typography (and text-outline semantics) live in a dedicated selection-aware **Dock panel**; Properties stays geometry-only for shapes; users get vertical baseline + letter-spacing in addition to existing face/size/style/align. |
| **Labels** | `roadmap`, `text`, `typography`, `chrome` |
| **Type** | `epic` |
| **bd id** | `svg-editor-q5p` |

**Foundation:** Builds on the closed [text editing](./text-editing.md) (`svg-editor-nkz`) and [text editing refinement](./text-editing-refinement.md) (`svg-editor-79x`) epics. This epic does **not** reopen those; it extracts typography chrome into its own panel and adds deferred presentation attributes.

## SVG text tags (scope)

| Element | Role in this editor / epic |
|---------|----------------------------|
| **`<text>`** | First-class target: create, select, inline edit, style via Text panel |
| **`<tspan>`** | Resolved to parent `<text>` for selection/edit; not authored in this epic |
| **`<textPath>`** | Out of scope |
| Deprecated SVG 1.1 glyph / `altGlyph` / SVG fonts | Ignore |
| **`<foreignObject>`** (HTML text) | Out of scope |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on (bd) | Est (min) |
|-----------|--------|-------|------|---------------------|-----------------|----------:|
| TP-1 | Register Text dock panel; update ADR/CONTEXT ownership | `svg-editor-q5p.1` | `feature` | (1) Register a selection-aware dock panel `id: 'text'`, label **Text**, immediately after Properties (locked order: Document → Properties → **Text** → Colors → Stroke → Align & distribute → Layers → Path Ops). (2) Auto-show when selection includes `<text>` or text tool is active (`relevantTools: ['text']` + `isRelevantWhen`). (3) Update [`CONTEXT.md`](../../CONTEXT.md) locked stack order and chrome ownership so typography (and text-outline semantics) live under the Text panel, not Properties. (4) Update ADR [`0003-editor-chrome-ownership.md`](../../docs/adr/0003-editor-chrome-ownership.md) the same way (geometry under Properties; typography under Text). (5) Panel shell renders (empty or stub body OK if TP-2 not yet landed); `data-testid`s for section header/area. | — | 90 |
| TP-2 | Extract typography UI from Properties → Text panel | `svg-editor-q5p.2` | `feature` | (1) Move font family, size, bold/italic, text-anchor, paint-order, and non-scaling-stroke controls from Properties into the Text panel. (2) Move text-tool placement-defaults empty state (no selection + text tool) into Text panel. (3) Properties no longer shows typography or text-outline controls. (4) Reuse existing `ChromeEditorApplyService` / paint-slice `applyText*FromChrome` and `FontCommand` / `TextAlignCommand` / outline commands — no new apply APIs unless required. (5) Mixed multi-select and locked-shape disable behavior preserved. (6) Colors/Stroke remain the home for fill/outline paint (no duplication). | `q5p.1` | 180 |
| TP-3 | `dominant-baseline` control + command | `svg-editor-q5p.3` | `feature` | (1) Extend `ShapeProperties` / `SvgShapeTextPort` with `dominantBaseline`. (2) Coalescable undoable command; chrome apply path. (3) Text panel preset control (e.g. `auto` / `middle` / `hanging` / `text-before-edge`). (4) Multi-select Mixed; locked disable. (5) Drawing defaults + text-tool placement preview honor the attribute. | `q5p.2` | 120 |
| TP-4 | `letter-spacing` (+ optional `word-spacing`) | `svg-editor-q5p.4` | `feature` | (1) Extend `ShapeProperties` / port with `letterSpacing` (and `wordSpacing` if shipped in the same slice). (2) Coalescable undoable command(s); chrome apply. (3) Numeric control(s) in Text panel. (4) Mixed + locked behavior. (5) Defaults / text-tool placement honor the attribute(s). | `q5p.2` | 120 |
| TP-5 | Text panel: tests and a11y/testids | `svg-editor-q5p.5` | `task` | (1) Vitest for new commands and property readback. (2) Panel registration / relevance tests. (3) Mixed multi-select coverage for new attrs. (4) Retarget any Playwright/e2e that asserted typography under Properties to Text panel testids. (5) a11y labels / `data-testid`s on new controls. | `q5p.3`, `q5p.4` | 120 |

## Dependency graph (summary)

```text
q5p.1 (register + ADR/CONTEXT)
  └→ q5p.2 (extract UI)
        ├→ q5p.3 (dominant-baseline)
        ├→ q5p.4 (letter-spacing)
        └→ q5p.5 (tests)  ← waits on q5p.3 and q5p.4
```

## Exit criteria

- Dock stack includes a **Text** section; typography and text-outline-order controls are gone from Properties.
- Font family, size, weight, style, and text-anchor still work (including text-tool defaults + Mixed).
- `dominant-baseline` and `letter-spacing` are editable and undoable.
- [`CONTEXT.md`](../../CONTEXT.md) and ADR [`0003`](../../docs/adr/0003-editor-chrome-ownership.md) reflect Text-panel ownership of typography.
- Tests green for moved and new controls.

## Code touchpoints (expected)

- [`src/app/panels/register-default-dock-panels.ts`](../../src/app/panels/register-default-dock-panels.ts) — register `text`
- New `src/app/components/text-panel/` (Path Ops / Stroke panel pattern)
- [`src/app/components/properties-panel/`](../../src/app/components/properties-panel/) — remove typography blocks
- [`src/app/services/chrome-apply/chrome-editor-paint-apply.service.ts`](../../src/app/services/chrome-apply/chrome-editor-paint-apply.service.ts)
- [`src/app/history/commands/paint/text-commands.ts`](../../src/app/history/commands/paint/text-commands.ts)
- [`src/app/services/shape-content/svg-shape-text.service.ts`](../../src/app/services/shape-content/svg-shape-text.service.ts)
- [`src/app/models/shape-properties.interface.ts`](../../src/app/models/shape-properties.interface.ts)
- [`src/app/models/drawing-style-defaults.ts`](../../src/app/models/drawing-style-defaults.ts)
- [`CONTEXT.md`](../../CONTEXT.md), [`docs/adr/0003-editor-chrome-ownership.md`](../../docs/adr/0003-editor-chrome-ownership.md)

## Out of scope / deferred

- Multi-line / `<tspan>` authoring and per-span styling
- `<textPath>`
- `writing-mode` / `direction` / `text-orientation` (vertical / RTL)
- `text-decoration` (spotty SVG support)
- `textLength` / `lengthAdjust`
- Per-glyph or per-tspan `dx` / `dy` / `rotate`
- Embedded / `@font-face` fonts (product feature separate; CSP already allows Google Fonts URLs)
- Text-to-path
- Duplicating fill/stroke/opacity/dash in the Text panel (Colors / Stroke stay authoritative)

## Notes

- Prefer **svg.js** for canvas mutations per project rules.
- Outline **paint** (color, width, dash) stays in Colors/Stroke; only text-specific outline **semantics** (`paint-order`, `vector-effect`) move with typography.
- `word-spacing` is optional alongside TP-4 if letter-spacing lands cleanly; do not block TP-5 on it.
- Path Ops ([`boolean-path-operations.md`](./boolean-path-operations.md)) is the process precedent for extracting a dedicated dock panel.
