# Epic: Gradient paint popover + stroke gradients

Unify fill/stroke paint editing behind a single swatch popover with mode tabs (Solid, Linear, Radial, No paint), add stroke gradient parity using existing gradient snapshot APIs, and implement explicit gradient removal that reverts to the first stop color and purges orphaned defs.

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Epic: Gradient paint popover and stroke gradients |
| **Goal** | Replace the separate "Add gradient fill" button and read-only gradient reference blocks with a unified paint swatch popover; support stroke gradients end-to-end; remove gradients cleanly (solid from first stop or no paint) with def GC. |
| **Labels** | `roadmap`, `ui`, `styling`, `gradients` |
| **Type** | `epic` |
| **bd id** | `svg-editor-qpk` |
| **Depends on** | `svg-editor-e1x` (gradient editor foundation — **closed**) |

## Child issues

| Local ref | Title | bd id | Type | Notes |
|-----------|--------|-------|------|-------|
| GP-1 | Paint swatch popover component + gradient preview helpers | `svg-editor-qpk.1` | feature | `PaintSwatchPopoverComponent`; `firstStopColor`, `cssGradientPreviewFromModel` in `svg-gradient.ts` |
| GP-2 | Chrome apply paint mode commands | `svg-editor-qpk.2` | feature | `applyPaintModeFromChrome`, add/revert/switch gradient for fill **and** stroke |
| GP-3 | Stroke gradient editor (`paintProperty` on gradient editor) | `svg-editor-qpk.3` | feature | Generalize `GradientFillEditorComponent` for stroke |
| GP-4 | Properties panel: wire paint swatch popover | `svg-editor-qpk.4` | feature | Replace color-picker/reference blocks; remove "Add gradient fill" button |
| GP-5 | Regression tests for paint popover and stroke gradients | `svg-editor-qpk.5` | task | Popover, chrome apply, panel, stroke editor specs |
| GP-6.1 | Gradient model helpers + bbox port | `svg-editor-qpk.7` | feature | Math angle, endpoint span, span-aware CSS preview, normalization |
| GP-6.2 | GradientStopSliderComponent | `svg-editor-qpk.8` | feature | Visual stop slider with live track preview |
| GP-6.3 | Linear visual gradient panel editor | `svg-editor-qpk.9` | feature | commitLive, angle control, no Apply/raw fields |
| GP-6.4 | Radial controls + GP-6 docs polish | `svg-editor-qpk.10` | task | Center/radius sliders; kind switch via history |

## Future follow-up (separate bead)

| Local ref | Title | bd id | Notes |
|-----------|--------|-------|-------|
| GP-F1 | Visual gradient editor on canvas | `svg-editor-qpk.6` | Draggable stops, angle/focal handles on canvas; GP-6 panel defers focal editing to GP-F1 |

Aligns with [svg-js-gradient-pattern-support spike](../spikes/svg-js-gradient-pattern-support.md) §4 phase 3.

## Dependencies (child level)

- GP-4 depends on GP-1, GP-2, GP-3
- GP-5 depends on GP-4

## UX summary

### Popover mode tabs

**Fill:** Solid · Linear · Radial · No fill  
**Stroke:** Solid · Linear · Radial · No stroke

| Mode | Behavior |
|------|----------|
| **Solid** | HEX + native color. From gradient → solid uses **first stop (0%)**; purges orphaned def. |
| **Linear / Radial** | Create or switch gradient immediately (undoable). Seeds solid → `#ffffff`. |
| **No paint** | Fill: `none`. Stroke: `RemoveStrokeCommand` (purges gradient def). |

### Constraints

- Gradient modes: single selection only; disabled when locked or mixed paint.
- Line/polyline: no fill modes.
- Stroke gradient on shape with no width: ensure width **1**.

## Code touchpoints

- [`../../src/app/components/paint-swatch-popover/`](../../src/app/components/paint-swatch-popover/) — **new**
- [`../../src/app/models/svg-gradient.ts`](../../src/app/models/svg-gradient.ts)
- [`../../src/app/services/chrome-editor-apply.service.ts`](../../src/app/services/chrome-editor-apply.service.ts)
- [`../../src/app/services/svg-gradient-defs.service.ts`](../../src/app/services/svg-gradient-defs.service.ts)
- [`../../src/app/components/gradient-fill-editor/`](../../src/app/components/gradient-fill-editor/)
- [`../../src/app/components/properties-panel/`](../../src/app/components/properties-panel/)

## Exit criteria

- Fill and stroke use a unified swatch popover with Solid / Linear / Radial / No paint modes.
- User can add linear or radial gradient to **stroke** (not fill-only).
- Switching gradient → Solid reverts to first-stop color and removes unreferenced def.
- Switching to No paint clears fill or removes stroke and purges def.
- Undo/redo preserves `url(#id)` integrity (dedicated def on edit).
- Technical gradient editor in panel for stops/geometry until on-canvas editor ships (GP-6 panel editor shipped in `qpk.7`–`qpk.10`; GP-F1 remains on-canvas).

## Full plan

See also the Cursor plan: [gradient_paint_popover](../../.cursor/plans/gradient_paint_popover_019a07d2.plan.md) (session artifact).
