# SVG Editor (in-app)

Shared vocabulary for contributors: canonical names inside the **in-app SVG editor**’s **Editor runtime** (see **Language**). **Out of scope:** CI, e2e harness, issue tracker workflow, and general framework vocabulary unless it denotes a distinct editor concept.

## Language

**Editor runtime**:
The editing session’s conceptual scope—artwork (**Document**, **Live tree**, **Serialized**), viewport (**Canvas**), UI (**Chrome**), and mechanics (**Selection**, **Tool**, **Layer**, **History**)—as defined below, excluding the repo and delivery stack around the app.
_Avoid_: CI, Playwright, beads, issue workflow, and generic framework vocabulary unless the term names a distinct editor concept.

**Document**:
The logical SVG being edited—root `<svg>`, `viewBox`, and drawable content in document coordinates—treated as the user’s artwork.
_Avoid_: Browser DOM `document`; using **Canvas** or “the stage” to mean the **Document** itself; “file” unless you mean on-disk persistence.

**Serialized**:
The **Document** as the SVG string produced for save or export.
_Avoid_: Calling clipboard payloads, undo/history snapshots, or ad hoc string copies of markup **Serialized** unless they are exactly that save/export string.

**Live tree**:
The editable SVG structure representing the **Document** during an open session, distinct from its **Serialized** save/export string.
_Avoid_: Using **Live tree** for the browser DOM as a whole; conflating it with the **Canvas**—the **Canvas** hosts the **Live tree** but is not the tree; or for any non-export string interchange—name those explicitly.

**Canvas**:
The pan/zoom viewport that maps pointer input to document coordinates and displays the **Live tree**, excluding **Editor chrome**.
_Avoid_: Using **Canvas** for the **Live tree** or **Document** themselves; calling an entire editor panel “the canvas” when the topic is really **Editor chrome** plus **Canvas** together.

**Chrome**:
In-app user interface that is not artwork in the **Live tree**—toolbars, docks, panels, and overlays—including **Editor chrome** on the drawing surface.
_Avoid_: Calling **Serialized** markup or **Document** logic **Chrome**; using **Chrome** for browser tabs, URL bar, or OS window frames—say **browser chrome** (outside this glossary’s main scope).

**Editor chrome**:
The slice of **Chrome** on the editing surface: selection handles, smart guides, marquee rectangles, and similar affordances outside the **Canvas** and not in the **Live tree**.
_Avoid_: Calling **Editor chrome** the **Canvas**, **Live tree**, or **Serialized** output; using “the editor” alone when you mean **Editor runtime** (session scope) vs on-screen affordances.

**Selection**:
The ordered set of shapes in the **Live tree** currently targeted by transforms and property edits, whose first member is primary when the UI applies to a single shape.
_Avoid_: Using **Selection** for the marquee rectangle while dragging before shapes are committed (**Editor chrome**); equating **Selection** with **Editor chrome** handles; using **Selection** when you mean only the **Canvas** view; calling zero shapes “a selection” without saying **empty selection**.

**Tool**:
The named pointer/keyboard interaction mode—select, direct node edit, shape creation, pan, zoom, pen, eyedropper, and similar—that routes input on the **Canvas** to the **Live tree** and **Selection**.
_Avoid_: Calling snap toggles or pen curve-variant flags a **Tool** when they only constrain the active **Tool**; using **Tool** for **Chrome** panels; conflating with browser DevTools “tools”.

**Layer**:
A shape or `<g>` subtree in **Live tree** DOM paint order that the layers list exposes for visibility and reorder—not **Selection** and not **Chrome**.
_Avoid_: Using **Layer** for **Selection** or for **Editor chrome**; assuming the list is exhaustive of every SVG node (structural tags like `<defs>` / `<clipPath>` / `<mask>` are not layer rows); using **Layer** for the **Canvas** viewport.

**History**:
The session’s undo and redo stacks of reversible edits to the **Live tree**, distinct from saved-file versioning or browser navigation history.
_Avoid_: Using **History** for Git commits or **Serialized** file timelines; conflating **History** with **Document** / **Live tree** reactive “revision” counters in code—say which counter or whether you mean undo/redo.

**Pen authoring session**:
The in-progress orchestration for the pen **Tool**—preview geometry, pending segment/handle drags, join/continue rules, discard-on-switch or replace-document policy—not stroke/fill appearance or the path-geometry value type alone.
_Avoid_: “Pen state” when you mean stroke props; “pen mode” as a UI theme; using **PenSession** for discard/confirm/preview policy—that headword is the path model only.

**PenSession**:
The path-geometry value carried while authoring a pen path (segments, closure, continuation)—pure structure and math helpers in code (`PenSession` in `pen-path.ts`), not DOM and not confirm/discard UI policy.
_Avoid_: Using **PenSession** for the whole **Pen authoring session**; using it for unrelated “session” lifetimes (browser tab, login).

**PenToolSession**:
The TypeScript class that implements **Pen authoring session** orchestration; it owns signals/readouts for previews and calls **PenSession** helpers; it does not own the DOM.
_Avoid_: User-facing product copy; conflating with **PenSession** the model instance.

**Ports**:
Narrow dependencies injected into **PenToolSession** (and similar tool orchestrators) so they can push **History**, update **Selection**, ask for user confirm, and apply svg.js mutations without importing the full component graph.
_Avoid_: “Dependencies” with no qualifier; calling every Angular provider a **Port**—here it means the explicit seam for a tool session.

**Canvas adapter**:
The `svg-canvas` (and kin) responsibility: map DOM events to document coordinates on the **Canvas**, invoke **Tool** / **Pen authoring session** logic, then apply side effects to the **Live tree** and services.
_Avoid_: Using **Canvas adapter** when you mean the **Canvas** viewport alone; naming the whole editor panel “the adapter” when you mean **Chrome** plus **Canvas**.

## Relationships

- Every term in **Language** is in scope for **Editor runtime** only (see blurb above).
- The **Document** supplies document-space geometry via its root `viewBox`.
- At most one authoritative **Document** is being edited in a given **Editor runtime** session.
- **Serialized** is the persistence-oriented string form of a **Document**, not a generic name for every string interchange of its markup.
- In session, the editor mutates the **Live tree**; save/export emits **Serialized** SVG.
- The **Canvas** hosts the **Live tree** and maps the **Document**’s `viewBox` into screen space; **Editor chrome** sits outside **Canvas** in this vocabulary.
- **Editor chrome** is a subset of **Chrome**; not all **Chrome** is **Editor chrome** (e.g. toolbars and docks are **Chrome** but not **Editor chrome**).
- **Selection** names shapes in the **Live tree**; **Editor chrome** visualizes and manipulates **Selection** but is not **Selection** itself.
- **Tool** describes how pointers and keys are interpreted on the **Canvas**; **Selection** describes which shapes are targeted—app code may couple changes, but the concepts differ.
- **Editor chrome** (handles, marquee, guides) reacts to both **Tool** and **Selection**.
- **Layer** ordering is **Live tree** paint order under the artwork content; reordering changes how the **Document** draws.
- **History** records applied edits and their inverses; undo/redo walks those stacks and mutates the **Live tree** (and may change **Selection** or **Layer** order as a side effect).
- The pen **Tool** routes through a **Canvas adapter** into **PenToolSession**, which owns **Pen authoring session** policy while mutating or reading a **PenSession** model; **PenToolSession** uses **Ports** to touch **History**, **Selection**, and svg.js—not the full widget tree.

## Example dialogue

> **Dev:** "Should we document our Playwright page objects in CONTEXT?"
> **Contributor:** "No — only **Editor runtime** vocabulary belongs here."

> **Dev:** "Do I mean the **Serialized** string or the thing we’re editing in memory?"
> **Contributor:** "**Serialized** is save/export only; the mutable structure is the **Live tree**; name clipboard or other ephemeral string copies on their own—not **History**, which is undo/redo stacks."

> **Dev:** "Is the resize handle part of the canvas?"
> **Contributor:** "No — **Canvas** is viewport-only; handles are **Editor chrome**, not **Canvas**."

> **Dev:** "Is the properties panel chrome?"
> **Contributor:** "Yes — it’s **Chrome** (UI around the artwork); handles on the drawing surface are **Editor chrome**, a subset of **Chrome**."

> **Dev:** "Is the marquee my selection?"
> **Contributor:** "Not until shapes are chosen—the drag rect is **Editor chrome**; **Selection** is the committed set of shapes."

> **Dev:** "Is snap-to-grid a tool?"
> **Contributor:** "No — it’s an option on top of a **Tool**; **Tool** is the mode like select or pen."

> **Dev:** "Is the selected rect the same as its layer row?"
> **Contributor:** "Often one shape maps to one **Layer** row, but **Selection** can be multi-shape or drill into a group—don’t equate the two lists."

> **Dev:** "Does Git history count as **History** here?"
> **Contributor:** "No — **History** is in-app undo/redo only; Git is out of scope for this term."

> **Dev:** "When the user switches away from pen mid-path, does **PenSession** clear?"
> **Contributor:** "The value type isn’t the policy—**Pen authoring session** asks via **Ports**; if they cancel confirm, **PenSession** data stays and the **Tool** shouldn’t have switched."

## Flagged ambiguities

- The word “document” in casual prose often means the browser DOM — in editor discussion reserve **Document** for the logical SVG artwork.
- “Serialized” is often used for any string form of the SVG — here **Serialized** is **export/save only**; use other words for clipboard snapshots, debug dumps, or ad hoc markup strings—not **History** (undo/redo stacks).
- “Live SVG tree” in casual chat maps to **Live tree** here; don’t use **Live tree** for unrelated DOM subtrees outside the editor SVG.
- “Canvas” often names the whole `svg-canvas` surface — here **Canvas** is **viewport-only**; use **Editor chrome** when you mean handles, guides, or marquee; use **Canvas adapter** when you mean the component’s routing of DOM input into **Tool** / session code.
- “Chrome” in web platform speech usually means the browser shell — here **Chrome** means in-app UI that is not **Live tree** artwork; say **browser chrome** when you mean the browser’s own UI.
- Sidebars and panels that read or write selection properties are **Chrome** for now; we may introduce a narrower term (e.g. **Inspector**) later—don’t use that name until it is defined here.
- “Primary” is implied by **Selection** list order; a dedicated **Primary selection** (or **Primary shape**) headword is **deferred**—don’t introduce competing meanings for “primary” in prose until then.
- “Tool” labels toolbar buttons (**Chrome**) as well as modes—here **Tool** is the interaction mode; say **tool strip** or **tool button** when you mean the control, not the mode.
- A **Layer** row can be a `<g>` that acts as a clip/mask carrier in selection rules—still a **Layer** in the stack list, but behavior may differ from a user-authored group; see code and product rules before assuming “folder” semantics.
- The codebase exposes multiple “revision” style counters (e.g. logical **Document** bumps vs undo/redo navigation); they are not interchangeable—name which seam you mean in reviews.
- **PenSession**, **Pen authoring session**, and **PenToolSession** are three layers (model value, policy scope, class)—don’t swap names in reviews without saying which layer you mean.
