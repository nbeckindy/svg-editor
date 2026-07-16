# Editor Chrome ownership (strip, context bar, dock, menus)

We locked where **Chrome** lives so new UI does not keep dumping globals into the wrong shelf. **Tool strip** (left) activates a **Tool** and holds **Creation paint defaults** only. **Tool context bar** shows options of the *active* **Tool** only and remains a permanent row. The right dock is a scrollable **collapsible panel stack** of **Dock panel**s (Document → Properties → Colors → Stroke → Align & distribute → Layers → Path Ops)—not a tab switcher. Each panel declares whether it is an **Always-available dock panel** or a **Selection-aware dock panel**; sections stay listed, with empty/disabled bodies when inapplicable. **Creation paint defaults** update next-draw defaults only—they do not rewrite **Selection** paint. Fill/opacity live under Colors; stroke styling under Stroke; geometry/typography under Properties; **Artboard** size/background under the **Document settings panel**. Session/app commands (snap, New/Download, open/import, fit-to-view) stay in the **editor top bar** until a **menu bar** ships; they do not permanently belong on the **tool strip** or in the **tool context bar**.

## Considered options (rejected)

- **Dual-write strip paint into Selection** — blurs defaults vs selection paint.
- **Hide Selection-aware dock sections until relevant** — hurts discoverability; prefer empty/disabled body + optional auto-expand/scroll.
- **Exclusive tab switcher for the right dock** — replaced by the collapsible stack (`svg-editor-uos`).
- **Park snap permanently on the tool strip** — fights the planned **menu bar**; leave snap where it is until menus exist.
- **Merge menu commands into the tool context bar** — context bar is mode options, not File/View.

## Consequences

- **Creation paint defaults** belong on the **tool strip** (`svg-editor-w9n`), not in Colors/Properties empty states.
- Document / Colors / Stroke / Align & distribute / Layers / Path Ops / Properties are separate stack sections (see `svg-editor-uos` children).
- Path-node anchor tools belong on the **tool context bar** under **Node-edit tool** (`svg-editor-dub`), not Path Ops / Properties.
- Prefer separate fill/stroke opacity in Colors when implemented (`svg-editor-3r7`).
- Defer **menu bar** as a larger chrome epic; do not invent interim homes that conflict with that destination.
