# Epic: Advanced path editing

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Advanced path editing |
| **Goal** | Extend path tooling so users can refine existing paths, perform node-level structural edits, and benefit from clearer bezier/pen UX guidance for future iterations. |
| **Labels** | `roadmap`, `phase2`, `paths`, `editing`, `pen` |
| **Type** | `epic` |
| **bd id** | `svg-editor-4nz` |

## Child issues (bd-mappable)

| Local ref | Title | bd id | Type | Acceptance criteria | Depends on | Est (min) |
|-----------|--------|-------|------|---------------------|------------|-----------|
| APE-0 | Investigate node-edit selector anchor mismatch and path corruption on drag | `svg-editor-4nz.1` | `bug` | Reproduce sparse/incorrect node overlays on complex paths, capture before/after `d` values when drag causes shape disappearance, identify parser/overlay/root-cause, and produce concrete fix beads. | `svg-editor-cfc.5` | 120 |
| APE-1 | Pen tool: insert node into existing path | `svg-editor-gh9` | `feature` | With pen tool active, user can click a path segment to insert a node at that location; path `d` remains valid; insertion is undoable/redoable; off-path clicks do not accidentally insert; tests cover representative segment types. | Pen/path model (`svg-editor-tfs`, `svg-editor-cfc.1`) | 180 |
| APE-2 | Path node editing: select and delete individual node | `svg-editor-9hh` | `feature` | Node can be explicitly selected and deleted via keyboard; invalid deletions are prevented with clear feedback; undo/redo works as one history step; tests cover valid and invalid delete flows. | `svg-editor-cfc.5` | 180 |
| APE-3 | Spike: node editing for non-path shapes via convert-to-path | `svg-editor-18f` | `task` | Document which shape types can be node-edited directly versus requiring conversion; propose convert-to-path flow preserving style/transform; identify destructive/irreversible risks; recommend MVP and follow-ups. | APE-2 (context), shape model | 120 |
| APE-4 | UX brainstorm: bezier anchor and handle interactions | `svg-editor-f31` | `task` | Compare interactions from common vector editors and propose anchor/handle states, modifier keys, and smooth/corner semantics suitable for this app; output implementable interaction spec and phased follow-up beads. | APE-2 | 120 |
| APE-5 | Gap analysis: missing pen tool capabilities | `svg-editor-f5z` | `task` | Produce prioritized backlog of missing pen capabilities, split MVP-critical vs post-MVP, and capture dependencies/risks with recommended implementation bead list. | `svg-editor-tfs`, APE-4 | 90 |

## Exit criteria

- Existing paths support structural refinement (insert/delete nodes) with undo/redo safety.
- Team has a concrete strategy for non-path object node editing (including convert-to-path implications).
- Bezier editing interactions have a documented UX baseline aligned with mainstream vector editors.
- Missing pen features are prioritized and translated into actionable follow-up work.

## Code touchpoints

- [`src/app/components/svg-canvas/svg-canvas.component.ts`](../../src/app/components/svg-canvas/svg-canvas.component.ts) — node-level interaction handling and tool gating
- [`src/app/components/tool-strip/tool-strip.component.ts`](../../src/app/components/tool-strip/tool-strip.component.ts) — pen and node-edit tool affordances
- [`src/app/services/svg-manipulation.service.ts`](../../src/app/services/svg-manipulation.service.ts) — path mutation helpers (insert/delete/conversion)
- [`src/app/models/editor-commands.ts`](../../src/app/models/editor-commands.ts) — command objects for undoable node operations

## Notes

- This epic is intentionally post-foundation: base path node editing is tracked in [path-node-editing](./path-node-editing.md), while this epic captures advanced editing and UX/discovery follow-ups.
- If APE-3 confirms convert-to-path is required for non-path node editing, follow-up implementation should include explicit user confirmation for lossy conversions.
