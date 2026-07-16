# Editor Chrome ownership (strip, context bar, dock, menus)

We locked where **Chrome** lives so new UI does not keep dumping globals into the wrong shelf. **Tool strip** (left) activates a **Tool** and holds **Creation paint defaults** only. **Tool context bar** shows options of the *active* **Tool** only and remains a permanent row. **Dock panel**s (right) hold **Document** / **Selection** / **Layer** data: tabs are always listed; each panel declares whether it is an **Always-available dock panel** or a **Selection-aware dock panel**. **Creation paint defaults** update next-draw defaults only—they do not rewrite **Selection** paint; selection paint stays Selection-gated in properties. **Artboard** size/background live in the **Document settings panel**, not behind empty selection in properties. Session/app commands (snap, New/Download, open/import, fit-to-view) stay in the **editor top bar** (and interim load affordances) until a **menu bar** ships; they do not permanently belong on the **tool strip** or in the **tool context bar**.

## Considered options (rejected)

- **Dual-write strip paint into Selection** — blurs defaults vs selection paint.
- **Hide Selection-aware dock tabs until relevant** — hurts discoverability; prefer empty/disabled body + optional auto-show.
- **Park snap permanently on the tool strip** — fights the planned **menu bar**; leave snap where it is until menus exist.
- **Merge menu commands into the tool context bar** — context bar is mode options, not File/View.

## Consequences

- Move **Creation paint defaults** out of the properties empty state onto the **tool strip**.
- Promote existing `DocumentSettings` into its own registered **Dock panel** / stack section; stop embedding it as the main empty-selection properties story.
- Prefer a scrollable **collapsible panel stack** on the right (Document → Properties → Colors → Stroke → Align & distribute → Layers → Path Ops) over tab switching—see `svg-editor-uos`; update this ADR when that ships if wording still assumes tabs.
- Path-node anchor tools belong on the **tool context bar** under **Node-edit tool**, not Path Ops / dock.
- Defer **menu bar** as a larger chrome epic; do not invent interim homes that conflict with that destination.
