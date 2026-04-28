# Epic: Shape transforms (rotate, scale, skew)

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Shape transforms |
| **Goal** | Users can rotate, scale, and skew selected shapes using explicit controls while preserving SVG.js as the source of truth for geometry. |
| **Labels** | `roadmap`, `post-mvp`, `transforms` |
| **Type** | `epic` |
| **bd id** | `svg-editor-2zo` |

## Child issues (bd-mappable)

| Local ref | Title | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|------|---------------------|------------|-----------|
| ST-1 | Spike: bbox and handle UX for transforms | `spike` | Defines handle layout, modifier keys, and numeric precision; references existing helpers if any. | — | 90 |
| ST-2 | Rotate selection using SVG.js transforms | `story` | Rotation updates `transform` or equivalent consistently; selection outline follows. | ST-1 | 240 |
| ST-3 | Scale selection (uniform and non-uniform if specified) | `story` | Scaling preserves stroke behavior per product decision in spike; tests for matrix math. | ST-1 | 300 |
| ST-4 | Skew or defer with documented cut line | `story` | Either basic skew support **or** issue closed with explicit “out of scope” and link to follow-up epic. **Implemented:** basic skew in [transform-ux-polish](./transform-ux-polish.md) (TUX-8a–8c); bd `svg-editor-w1t` closed. | ST-2 | 120 |
| ST-5 | Automated tests for transform utilities | `task` | Coverage for [`selection-rotate`](../../src/app/utils/selection-rotate.ts) / related utils per implementation. | ST-2, ST-3 | 120 |

## Exit criteria

- At least rotate + scale shipped per acceptance; skew per ST-4 outcome.
- Visual check on sample SVG; unit tests pass.

## Code touchpoints

- [`src/app/utils/selection-rotate.ts`](../../src/app/utils/selection-rotate.ts)
- [`src/app/utils/selection-resize.ts`](../../src/app/utils/selection-resize.ts)
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts)
- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts)

## Optional batch create

Replace `EPIC_ID` with the epic’s `bd` id.

```bash
bd create "Spike: bbox and handle UX for transforms" -t spike --parent EPIC_ID -l roadmap,transforms --estimate 90
bd create "Rotate selection using SVG.js transforms" -t story --parent EPIC_ID -l roadmap,transforms --estimate 240
```

## Beads execution notes

1. `bd create "Shape transforms" -t epic -l roadmap,post-mvp -d "Rotate, scale, skew via SVG.js."`
2. Add children with `--parent`; use `--deps` from ST-1 to ST-2/ST-3 as needed.
