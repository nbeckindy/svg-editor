# Epic: Text editing refinement

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Text editing refinement |
| **Goal** | While adding and editing text, typography (size, weight, style, family) is **previewed** as the user will see it on the canvas; **text outline** (stroke on `<text>`) is a supported, discoverable workflow with clear SVG paint semantics. |
| **Labels** | `roadmap`, `text`, `typography` |
| **Type** | `epic` |
| **bd id** | `svg-editor-79x` |

**Foundation:** Builds on the closed [text editing](./text-editing.md) epic (`svg-editor-nkz`). This epic does **not** reopen `nkz`; it tracks new UX and styling work only.

## Child issues (bd-mappable)

**Status (beads):** epic **`svg-editor-79x`** and children **79x.1–79x.4** are **closed** as of 2026-05-22.

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on (bd) | Est (min) |
|-----------|--------|-------|------|----------------------|-----------------|----------:|
| TER-1 | Text tool: live preview of size and style before placement | `svg-editor-79x.1` | `feature` | With the text tool active, show a WYSIWYG preview (ghost or cursor-attached) using **drawing defaults** (font family, size, weight, style, text-anchor). Preview updates when defaults change; first click still places real `<text>` and pushes history once. Works across zoom/pan. | — | 120 |
| TER-2 | Inline text edit: live preview of font size and style | `svg-editor-79x.2` | `feature` | During inline edit, the edit surface reflects the **active** font size, weight, style, and family in real time, consistent with SVG user space and canvas transform. Escape / click-out commit behavior unchanged. Document limitations (system fonts vs embedded SVG fonts). | — | 180 |
| TER-3 | Text outline: stroke controls and paint semantics for `<text>` | `svg-editor-79x.3` | `feature` | First-class **outline** for text: stroke color, width, and dash on `<text>` (and multi-select) via properties; document **paint order** (fill vs stroke stacking) and optional `vector-effect` policy for non-scaling stroke when zooming. Export round-trip preserves intent. | — | 180 |
| TER-4 | Text refinement: tests and UX polish | `svg-editor-79x.4` | `task` | Vitest and/or Playwright for preview and outline flows; tooltips/a11y for inline editor; reduce flake. | `79x.1`, `79x.2`, `79x.3` | 120 |

## Dependency graph (summary)

```text
79x.1 (text-tool preview)     ─┐
79x.2 (inline preview)       ─┼→ 79x.4 (tests + polish)
79x.3 (text outline / stroke) ─┘
```

## Exit criteria

- Text tool shows a **live typographic preview** before placement.
- Inline edit shows **live** size and style while typing or when properties change.
- Users can apply and adjust a **visible text outline** with documented SVG behavior.
- Automated tests cover the above where feasible; gaps documented.

## Code touchpoints (expected)

- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — text tool placement, inline overlay, preview/ghost wiring
- [`src/app/components/properties-panel/properties-panel.component.ts`](../../src/app/components/properties-panel/properties-panel.component.ts) — text stroke/outline when selection is `<text>`; font controls may drive live preview
- [`src/app/services/drawing-style-defaults.service.ts`](../../src/app/services/drawing-style-defaults.service.ts) — defaults source for text-tool preview
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — `getShapeProperties` / paint readout for text stroke
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — extend or reuse stroke commands for `<text>` if needed

## Notes

- Prefer **svg.js** for mutations inside the canvas per project rules.
- **Outline vs fill:** SVG paints stroke after fill by default; “stroke behind fill” may require `paint-order` where supported—call out in TER-3 if we rely on it.
- **TER-2** may share styling logic with **TER-1** (single typography preview helper) to avoid drift.
