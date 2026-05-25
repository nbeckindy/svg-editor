# Epic: Pen and shape tool interaction UX

## Epic bead (`bd`)

| Field | Value |
|--------|--------|
| **Title** | Pen and shape tool interaction UX |
| **Goal** | With the pen **Tool** active, users can place nodes **over** existing artwork (pointer routing favors **Pen authoring session** over shape hit selection). After committing a **shape creation** stroke, the editor returns to the primary select **Tool** automatically. |
| **Labels** | `roadmap`, `pen`, `tools`, `ux` |
| **Type** | `epic` |
| **bd id** | `TBD` |

## Child issues (bd-mappable)

| Local ref | Title | Type | Acceptance criteria (summary) | Depends on |
|-----------|--------|------|--------------------------------|------------|
| PU-1 | Pen tool clicks through to path authoring | `story` | With pen active, first click on non-path UI still behaves as today; clicks on existing shapes add nodes / continue **Pen authoring session** per pen rules; no accidental selection-only swallow of first click; tests. | Pen tool (closed) |
| PU-2 | Auto-switch to select after shape creation | `story` | After rectangle/circle/line (and other creation tools in scope) commit a new shape, active **Tool** becomes select (not pen); consistent with product list; tests. | Shape creation (closed) |

## Exit criteria

- Pen placement works when clicking on top of existing objects.
- Post–shape-draw workflow returns user to select mode without extra clicks.

## Code touchpoints (initial)

- **Canvas adapter** hit-testing order, **PenToolSession** / **Tool** state in `EditorToolService`, shape tool completion handlers.

## Notes

- Vocabulary: **Pen hit-through** (or equivalent) in [CONTEXT.md](../../CONTEXT.md); **Tool** auto-switch after creation.
