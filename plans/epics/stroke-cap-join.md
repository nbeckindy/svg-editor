# Epic: Stroke cap, join, and miter limit

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Stroke cap, join, and miter limit |
| **Goal** | Users can edit native SVG stroke endpoint and corner styling on selected shapes via the properties panel, with undo/redo. |
| **Labels** | `roadmap`, `styling` |
| **Type** | `epic` |
| **bd id** | `svg-editor-kym` |

## Scope

Expose `stroke-linecap`, `stroke-linejoin`, and `stroke-miterlimit` in the selection model, paint read/write pipeline, history commands, chrome apply layer, and properties panel.

| UI label | SVG attribute | Values |
|----------|---------------|--------|
| End caps | `stroke-linecap` | Butt, Round, Square |
| Corners | `stroke-linejoin` | Miter, Round, Bevel |
| Miter limit | `stroke-miterlimit` | number (when join = Miter; default 4) |

**Out of scope:** drawing defaults for new shapes; `stroke-opacity`; path-boolean inline-style propagation.

## Child issues (bd-mappable)

| Local ref | Title | Type | Acceptance criteria | Depends on | Est (min) | bd id |
|-----------|--------|------|---------------------|------------|-----------|-------|
| SCJ-1 | Stroke linecap end-to-end | `story` | `ShapeProperties.strokeLinecap`; read/write in `SvgShapePaintService`; `StrokeLinecapCommand`; chrome apply; one End caps select in panel (inside `hasAnyStroke()`); service + apply + panel tests. | — | 120 | `svg-editor-kym.1` |
| SCJ-2 | Stroke linejoin and miter limit end-to-end | `story` | `strokeLinejoin` + `strokeMiterlimit` on model; read/write; `StrokeLinejoinCommand` + `StrokeMiterlimitCommand`; chrome apply; Corners select + conditional miter limit input; mixed-selection states; tests. | SCJ-1 | 120 | `svg-editor-kym.2` |
| SCJ-3 | Stroke cap/join follow-ups (deferred product) | `task` | Beads filed or closed with rationale for: drawing defaults on shape creation; `bakeEffectiveStrokeToLocal` snapshot; path-boolean inline-style cap/join copy. | SCJ-2 | 30 | `svg-editor-kym.3` |

## Architecture

Mirror the existing stroke dash pattern:

```
PropertiesPanel → ChromeEditorPaintApplyService → paint commands → SelectionPaintStrokeDashSvgPort → SvgShapePaintService → shape.attr(...)
```

## Code touchpoints

- [`src/app/models/shape-properties.interface.ts`](../../src/app/models/shape-properties.interface.ts)
- [`src/app/services/shape-content/svg-shape-paint.service.ts`](../../src/app/services/shape-content/svg-shape-paint.service.ts)
- [`src/app/history/commands/paint/paint-commands.ts`](../../src/app/history/commands/paint/paint-commands.ts)
- [`src/app/services/chrome-apply/chrome-editor-paint-apply.service.ts`](../../src/app/services/chrome-apply/chrome-editor-paint-apply.service.ts)
- [`src/app/components/properties-panel/properties-panel.component.ts`](../../src/app/components/properties-panel/properties-panel.component.ts)

## Exit criteria

- User can set cap, join, and miter limit on stroked shapes from the properties panel.
- Changes are undoable and survive selection re-sync from DOM.
- Multi-select mixed states show “Mixed” like dash and stroke width.

## Related

- Parent styling epic: [advanced-styling.md](./advanced-styling.md) (`svg-editor-v77`) — dash already delivered; cap/join is complementary.
- [`path-boolean.ts`](../../src/app/models/path-boolean.ts) already lists cap/join in `STYLE_ATTRS`.
