# Epic: Groups and layer management

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Groups and layer management |
| **Goal** | Users can work with grouped elements (`<g>`) and a practical layer list (order/visibility) aligned with the SVG structure. |
| **Labels** | `roadmap`, `post-mvp`, `layers` |
| **Type** | `epic` |
| **bd id** | `svg-editor-0l4` |

## Child issues (bd-mappable)

| Local ref | Title | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|------|---------------------|------------|-----------|
| GL-1 | Spike: SVG.js patterns for groups and ordering | `spike` | Documents how groups appear in the DOM, selection pitfalls, and reorder operations (insertBefore, etc.). | — | 120 |
| GL-2 | Select and drill into grouped content | `story` | Click behavior defined (group vs child); selection service can represent group members without breaking SVG.js rules. | GL-1 | 300 |
| GL-3 | Layers panel: visibility and reorder | `story` | Toggles and moves map to real SVG order; errors surfaced if invalid. | GL-1 | 360 |
| GL-4 | Align layers UI with existing component | `task` | [`layers-panel`](../../src/app/components/layers-panel/layers-panel.component.ts) wired or refactored per spike; no dead controls. | GL-2, GL-3 | 180 |
| GL-5 | Tests for group/layer operations | `task` | Service tests for reorder/visibility; component tests as feasible. | GL-3 | 150 |

## Exit criteria

- Documented selection behavior for nested groups.
- Layers panel actions reflect in canvas and export.

## Code touchpoints

- [`src/app/components/layers-panel/layers-panel.component.ts`](../../src/app/components/layers-panel/layers-panel.component.ts)
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts)
- [`src/app/services/shape-selection.service.ts`](../../src/app/services/shape-selection.service.ts)

## Optional batch create

Replace `EPIC_ID` with the epic’s `bd` id.

```bash
bd create "Spike: SVG.js patterns for groups and ordering" -t spike --parent EPIC_ID -l roadmap,layers --estimate 120
bd create "Select and drill into grouped content" -t story --parent EPIC_ID -l roadmap,layers --estimate 300
```

## Beads execution notes

1. `bd create "Groups and layer management" -t epic -l roadmap,post-mvp -d "Groups, layers panel, ordering."`
2. Create GL-1…GL-5 with `--parent` and dependency links between ordered work.
