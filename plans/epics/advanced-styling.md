# Epic: Advanced stroke and fill

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Advanced stroke and fill |
| **Goal** | Users can edit stroke dash patterns and move toward gradients/patterns where feasible, closing gaps noted for line-like elements. |
| **Labels** | `roadmap`, `post-mvp`, `styling` |
| **Type** | `epic` |
| **bd id** | `svg-editor-v77` |

## Child issues (bd-mappable)

| Local ref | Title | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|------|---------------------|------------|-----------|
| AS-1 | Spike: gradient/pattern support in SVG.js path | `spike` | Lists what SVG.js supports for fills; proposal for minimal gradient editor vs defer. | — | 120 |
| AS-2 | Stroke dash array editor | `story` | UI + SVG.js updates for `stroke-dasharray` / `stroke-dashoffset` on supported shapes; validation for bad input. | AS-1 | 240 |
| AS-3 | Line and polyline fill behavior | `task` | Behavior matches [PROJECT_SUMMARY](../PROJECT_SUMMARY.md) matrix or issue documents explicit change. | AS-2 | 90 |
| AS-4 | Gradient or pattern fill (phase 1) | `story` | Per spike: either simple linear gradient on rect/path **or** deferred with linked follow-up issue. | AS-1 | 360 |
| AS-5 | Tests for styling edge cases | `task` | Service tests for dash and any new fill pipeline. | AS-2, AS-4 | 120 |

## Exit criteria

- Dash editing works for representative shapes.
- Spike outcomes for gradients are either implemented (phase 1) or captured as a scoped follow-up.

## Code touchpoints

- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts)
- [`src/app/components/properties-panel/properties-panel.component.ts`](../../src/app/components/properties-panel/properties-panel.component.ts)
- [`src/app/components/color-picker/color-picker.component.ts`](../../src/app/components/color-picker/color-picker.component.ts)

## Optional batch create

Replace `EPIC_ID` with the epic’s `bd` id.

```bash
bd create "Spike: gradient/pattern support in SVG.js path" -t spike --parent EPIC_ID -l roadmap,styling --estimate 120
bd create "Stroke dash array editor" -t story --parent EPIC_ID -l roadmap,styling --estimate 240
```

## Beads execution notes

1. `bd create "Advanced stroke and fill" -t epic -l roadmap,post-mvp -d "Dash, gradients, line fill gaps."`
2. Create AS-1…AS-5 with `--parent`; sequence deps from spike to implementation stories.
