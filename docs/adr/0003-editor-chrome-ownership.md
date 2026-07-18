# Editor Chrome ownership (strip, context bar, dock, menus)

We locked where **Chrome** lives so new UI does not keep dumping globals into the wrong shelf. **Tool strip** (left) activates a **Tool** and holds compact fill/stroke swatches (**Creation paint defaults** when **empty selection**; **Selection** paint when shapes are selected—same apply path as Colors). **Tool context bar** shows options of the *active* **Tool** only and remains a permanent row. The right dock is a scrollable **collapsible panel stack** of **Dock panel**s (Document → Properties → Text → Colors → Stroke → Align & distribute → Layers → Path Ops)—not a tab switcher. Each panel declares whether it is an **Always-available dock panel** or a **Selection-aware dock panel**; sections stay listed, with empty/disabled bodies when inapplicable. Fill/opacity live under Colors; stroke styling under Stroke; geometry under Properties; typography (and text-outline semantics) under Text; **Artboard** size/background under the **Document settings panel**. Session/app commands (snap, New/Download, open/import, fit-to-view) stay in the **editor top bar** until a **menu bar** ships; they do not permanently belong on the **tool strip** or in the **tool context bar**.

## Considered options (rejected)

- **Strip paint as creation-defaults-only even with Selection** — fights user expectation that rail swatches recolor selected art; superseded by selection-aware strip paint (`svg-editor-7qb`). Empty selection still edits **Creation paint defaults** only.
- **Expose gradient mode tabs on the tool strip** — full gradient editing stays in Colors; strip stays solid/none (preview of existing gradients is fine).
- **Hide Selection-aware dock sections until relevant** — hurts discoverability; prefer empty/disabled body + optional auto-expand/scroll.
- **Exclusive tab switcher for the right dock** — replaced by the collapsible stack (`svg-editor-uos`).
- **Park snap permanently on the tool strip** — fights the planned **menu bar**; leave snap where it is until menus exist.
- **Merge menu commands into the tool context bar** — context bar is mode options, not File/View.

## Consequences

- Compact fill/stroke swatches belong on the **tool strip** (`svg-editor-w9n` / `svg-editor-7qb`), not in Colors/Properties empty states. With **Selection**, they share Colors’ apply path (selection + defaults dual-write). With **empty selection**, they update **Creation paint defaults** only.
- Document / Properties / Text / Colors / Stroke / Align & distribute / Layers / Path Ops are separate stack sections (see `svg-editor-uos` children and Text panel epic `svg-editor-q5p`).
- Path-node anchor tools belong on the **tool context bar** under **Node-edit tool** (`svg-editor-dub`), not Path Ops / Properties.
- Prefer separate fill/stroke opacity in Colors (`svg-editor-3r7`). Element-level `opacity` remains readable for layers/import fidelity; Colors does not expose it as the primary control.
- Defer **menu bar** as a larger chrome epic; do not invent interim homes that conflict with that destination.
