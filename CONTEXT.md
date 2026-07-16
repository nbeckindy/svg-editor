# SVG Editor (in-app)

Shared vocabulary for contributors: canonical names inside the **in-app SVG editor**’s **Editor runtime** (see **Language**). **Out of scope:** CI, e2e harness, issue tracker workflow, and general framework vocabulary unless it denotes a distinct editor concept.

## Language

**Editor runtime**:
The editing session’s conceptual scope—artwork (**Document**, **Live tree**, **Serialized**), viewport (**Canvas**), UI (**Chrome**), and mechanics (**Selection**, **Tool**, **Layer**, **History**)—as defined below, excluding the repo and delivery stack around the app.
_Avoid_: CI, Playwright, beads, issue workflow, and generic framework vocabulary unless the term names a distinct editor concept.

**Document**:
The logical SVG being edited—root `<svg>`, `viewBox`, and drawable content in document coordinates—treated as the user’s artwork.
_Avoid_: Browser DOM `document`; using **Canvas** or “the stage” to mean the **Document** itself; “file” unless you mean on-disk persistence.

**Artboard**:
The **Document**’s intended drawing frame—width, height (and origin via `viewBox`), plus an editor-facing background used while editing. For MVP the background may be **Chrome**-visual only and not part of **Serialized** content.
_Avoid_: Calling the whole **Canvas** viewport the **Artboard**; equating artboard chrome rects with shapes in the **Live tree**; assuming background always exports as a `<rect>` unless product says so.

**Document settings panel**:
An **Always-available dock panel** for **Artboard** attributes (size and editor background)—**Document**-level, not **Selection** paint and not viewport fit/zoom commands.
_Avoid_: Dumping snap, grid, file name, or fit-to-view into this panel by default; placing artboard size only behind **empty selection** in properties.

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

**Node-edit tool**:
The selector **Tool** variant (direct-select / node tool) used to edit **Path node**s and Bezier handles on `<path>` elements, rather than applying object-level bbox transforms.
_Avoid_: Using **Node-edit tool** for marquee multi-select or group drill-in unless the product explicitly unifies those modes; calling uncommitted pen preview anchors **Path node**s before the path is finalized.

**Primitive shape**:
A basic drawable element created by shape tools—typically `<rect>`, `<ellipse>` (ellipse tool), and `<line>` in this product—before any permanent **Outline to path** conversion. `<circle>` may appear in imported SVG; **Compound operand** eligibility includes rect, circle, and ellipse tags.
_Avoid_: Treating `<path>` as a **Primitive shape** in roadmap prose; using “primitive” for raw DOM nodes outside the editor’s shape-tool set; assuming boolean ops accept primitives unless product scope expands beyond **Boolean operand** (path-only today).

**Outline to path**:
An edit that replaces a **Primitive shape** with a `<path>` whose `d` geometry matches the former element (stroke/fill/transform preserved per command rules) so **Node-edit tool** workflows apply.
_Avoid_: Confusing with **Compound path** (many operands → one path, operands removed) or transient primitive sampling used only during **Make compound path**; confusing with “outline stroke” (stroke-to-path) unless the same command implements both; using for text-to-path without defining text scope separately.

**Path boolean operation**:
One of **Union (path boolean)**, **Subtract (path boolean)**, or **Intersect (path boolean)**—combines **Boolean operand** fill geometry into a single result `<path>` via polygon clipping after **Flatten (boolean geometry)**. Committed through **Path ops panel** with optional **Boolean preview** before Apply.
_Avoid_: Calling **Compound path** a boolean operation; implying curves survive in the result path today.

**Union (path boolean)**:
Merges overlapping fill regions of all **Boolean operand**s into one outline (order-independent for two operands; N-way fold for more).

**Subtract (path boolean)**:
Removes the union of back operands from the frontmost **Boolean operand** in paint order (Illustrator-style “minus front” for two shapes).

**Intersect (path boolean)**:
Keeps only the overlapping fill region shared by all **Boolean operand**s.

**Path node**:
A knot in a `<path>`’s segment model that **Node-edit tool** exposes as draggable, and that may support insertion, deletion, or type toggles (**Corner node** vs **Smooth node**).
_Avoid_: Equating every parsed `d` token with a user-facing **Path node**—helpers and degenerate segments may not get handles; using for uncommitted pen preview points before path commit.

**Path ops panel**:
The right-dock **Chrome** stack section (`pathOps`) for **Path boolean operation**s and **Make compound path**: operand summary, union/subtract/intersect (with **Boolean preview** Apply/Cancel), and compound. Not the generic properties section or **Editor chrome** on the **Canvas**.
_Avoid_: “Boolean panel” when compound is in scope; placing path booleans in the properties strip as the primary home (legacy union affordance may exist elsewhere but **Path ops panel** is the dedicated surface).

**Make compound path**:
User action in **Path ops panel** that commits a **Compound path** immediately—no **Boolean preview**—replacing **Compound operand**s with one `<path>` in one **History** step.
_Avoid_: Describing as boolean “union”; implying operands remain as separate elements after commit.

**Corner node**:
A **Path node** where segments meet with a sharp tangent discontinuity (no smooth outgoing handles).

**Smooth node**:
A **Path node** with Bezier control handles arranged so adjacent segments meet with tangent continuity (implementation defines symmetric vs independent handles).

**Automatic tool revert (after creation)**:
Policy where completing a new object with a shape-creation **Tool** immediately activates the primary Select **Tool**, so the user does not remain in draw mode by default.
_Avoid_: Applying the name to pen paths if pen policy differs (pen may stay active until closed or confirmed—say so in product rules).

**Boolean operand**:
A closed `<path>` in **Selection** eligible for a **Path boolean operation** (union, subtract, or intersect). Each operand must have closed subpaths (`Z` on every subpath); transforms bake into root user space before polygon clipping.
_Avoid_: Assuming **Primitive shape**s or **Compound operand**s are boolean operands unless product scope says so; using “operand” without saying boolean vs compound.

**Boolean preview**:
Non-destructive **Editor chrome** ghost of a pending **Path boolean operation** result on the **Canvas**, shown after the user picks union, subtract, or intersect and cleared on Apply or Cancel—no **History** entry until Apply commits.
_Avoid_: Using for **Make compound path** (compound applies immediately); conflating with pen preview geometry or **Editor chrome** selection outlines.

**Layer**:
A shape or `<g>` subtree in **Live tree** DOM paint order that the layers list exposes for visibility and reorder—not **Selection** and not **Chrome**.
_Avoid_: Using **Layer** for **Selection** or for **Editor chrome**; assuming the list is exhaustive of every SVG node (structural tags like `<defs>` / `<clipPath>` / `<mask>` are not layer rows); using **Layer** for the **Canvas** viewport.

**Group**:
A `<g>` subtree treated as an organizational container in the **Live tree**—often one **Layer** row with nested child rows—used to move, reorder, or hide collections of shapes together.
_Avoid_: Using **Group** for every `<g>` wrapper the serializer emits (some are structural); equating **Group** with **Selection** when the user has not actually selected that subtree.

**Layer visibility**:
Whether a **Layer** subtree paints on the **Canvas**; a hidden layer is omitted from normal drawing (or shown only via **Chrome** affordances like outlines, if product adds that), while still existing in the **Document**.
_Avoid_: Confusing hide with **Layer lock** (lock blocks edits; hide blocks display—product may combine UI but the concepts differ).

**Layer lock**:
A per-layer guard that blocks direct user edits to shapes under that row—transforms, drags, property writes, and path vertex edits—while the subtree may still paint unless also hidden; exact exceptions (e.g. unlock from panel only) are product rules.
_Avoid_: Implying lock prevents reorder in the panel unless product explicitly says so; using “lock” for version-control or file permissions.

**History**:
The session’s undo and redo stacks of reversible edits to the **Live tree**, distinct from saved-file versioning or browser navigation history.
_Avoid_: Using **History** for Git commits or **Serialized** file timelines; conflating **History** with **Document** / **Live tree** reactive “revision” counters in code—say which counter or whether you mean undo/redo.

**Provisional command**:
An `EditorCommand` marked `provisional: true` (e.g. `PenSegmentReplaceCommand`) pushed during an in-progress **Pen authoring session** so Ctrl+Z works on handle tweaks, then stripped from the undo stack via `EditorHistoryService.discardWhere` when the path finishes or the session is discarded — not a separate undo model.
_Avoid_: Treating provisional steps as permanent document history; using `discardWhere` for committed edits.

**Ghost preview**:
Ephemeral transform feedback during pointer drags: `GhostSession` clones selected subtrees into the **Live tree** (`data-editor-ghost`) while real shapes are hidden; commit pushes a transform `EditorCommand`, cancel removes the ghost without History. Distinct from overlay-only pen rubber-band previews.
_Avoid_: Expecting ghost DOM to participate in undo directly; conflating with **Pen authoring session** preview paths.

**Pen authoring session**:
The in-progress orchestration for the pen **Tool**—preview geometry, pending segment/handle drags, join/continue rules, discard-on-switch or replace-document policy—not stroke/fill appearance or the path-geometry value type alone.
_Avoid_: “Pen state” when you mean stroke props; “pen mode” as a UI theme; using **PenSession** for discard/confirm/preview policy—that headword is the path model only.

**PenSession**:
The path-geometry value carried while authoring a pen path (segments, closure, continuation)—pure structure and math helpers in code (`PenSession` in `pen-path.ts`), not DOM and not confirm/discard UI policy.
_Avoid_: Using **PenSession** for the whole **Pen authoring session**; using it for unrelated “session” lifetimes (browser tab, login).

**PenToolSession**:
The TypeScript class that implements **Pen authoring session** orchestration; it owns signals/readouts for previews and calls **PenSession** helpers; it does not own the DOM.
_Avoid_: User-facing product copy; conflating with **PenSession** the model instance.

**Pen-over-shape input**:
Pointer routing where, with the pen **Tool** active, hits on existing artwork prefer starting or continuing the **Pen authoring session** (dropping anchors) instead of only transferring **Selection** to the shape under the cursor.
_Avoid_: Implying pen ignores modifiers or right-click policies; using for non-pen tools without stating the exception.

**Pending segment**:
The in-progress pen stroke leg between primary mousedown and mouseup during a **Pen authoring session**—preview geometry, handle drag, and commit target—not yet a committed segment in **PenSession** and not a **Path node**.
_Avoid_: Using for the **First-anchor P3 draft** gap after `M` before the second primary down; calling preview-only rubber-band geometry a committed segment.

**First-anchor P3 draft**:
The two-step first-segment curve workflow after placing `M`: step one drags mirrored outgoing handles from the moveto; step two plants the segment end (`P3`) on the next primary mousedown, then commits the first cubic (`C`) on release. Carried as `PenFirstAnchorP3Draft` in code until commit or discard.
_Avoid_: Treating step-one handle drag as a normal **Pending segment** (no planted chord end yet); using “first anchor” alone when you mean any path start **Path node** after finish.

**Flatten (boolean geometry)**:
Adaptive subdivision of operand outlines—including cubic/quadratic path segments and primitive corner/ellipse approximations—into line rings in root user space before polygon clipping. **Path boolean operation** results serialize as `M`/`L`/`Z` unless a future curve-preserving pipeline is adopted.
_Avoid_: Saying **Compound path** “flattens” paths (compound preserves curve commands on path operands); using “flatten” for **Outline to path** or layer UI metaphors.

**Join tolerance**:
The shared viewport-pixel hit radius (~8px; `PEN_SINGLE_CLICK_CLOSE_RADIUS_PX`) for **Single-click close**, **Close target** hover, **Open path continuation** pickup, and **Path finish join**. Mapping from document coordinates to screen space must succeed or the hit test fails closed (no accidental merge).
_Avoid_: Calling every pen proximity test “join tolerance” when it uses a different constant; assuming SVG-user distance alone defines close rings without screen mapping.

**Close target**:
The on-screen ring the user snaps to for **Single-click close** and close-hover **Editor chrome**. Usually the session moveto (`M`); when **Open path continuation** prepends from the path head, the frozen existing tail—not session `M`.
_Avoid_: Equating **Close target** with “path start” during prepend continuation; using for arbitrary **Path node** anchors away from close/join rings.

**Single-click close**:
Completing a **Path close** by releasing the pointer within **Join tolerance** of the **Close target** after a **Pending segment** began there—appends a closing `L` or `C` (per tip geometry) and `Z`, without requiring marquee-scale drag.
_Avoid_: Calling every `Z` append **Single-click close** when the user dragged a closing curve from the start anchor; conflating with **Path finish join** onto another open path.

**Path close**:
Looping the current pen subpath by appending a closing segment and `Z` so start and end meet—via **Single-click close**, drag-close from the **Close target**, or equivalent finish logic.
_Avoid_: Using **Path close** when the stroke simply ends open on the **Live tree**; saying “close” when you mean **Path finish** without `Z`.

**Path finish**:
Committing a **Pen authoring session** stroke to the **Live tree**—as a new `<path>`, a **Continuing path rewrite**, or a **Path finish join**—whether the result stays open or receives `Z` via **Path close**.
_Avoid_: Using **Path finish** only for closed paths; conflating with discarding the session or switching **Tool** without writing geometry.

**Open path continuation**:
Resuming pen authoring from an existing open `<path>` endpoint (head = moveto, tail = last committed vertex) within **Join tolerance**, then merging new stroke geometry into that path on **Path finish** rather than creating a second element.
_Avoid_: Using for **Insert on path** (splitting a segment interior); using for **Node-edit tool** drags on committed knots; implying continuation works on closed subpaths.

**Continuation stitch**:
How new pen geometry attaches during **Open path continuation**: `appendToExistingTail` (extend from tail) or `prependBeforeExisting` (draw from head backward into frozen existing segments).
_Avoid_: Inventing stitch names in prose that don’t match these two modes; calling either mode a separate **Tool**.

**Compound operand**:
A **Selection** member eligible for **Compound path**: a closed `<path>` or a **Primitive shape** (`<rect>`, `<circle>`, or `<ellipse>`). Primitives are sampled to closed subpath geometry in element-local space for the merge; operands are removed on commit (distinct from permanent **Outline to path** on a single shape).
_Avoid_: Applying **Boolean operand** rules (path-only today) to compound without checking scope; treating open `<line>` or arbitrary tags as compound-eligible.

**Compound path**:
One `<path>` whose `d` concatenates multiple closed subpaths (`M…Z` per **Compound operand** outline) without polygon clipping—overlapping fill follows `fill-rule` (typically `evenodd` for hole-style overlaps). Replaces operands in a single **History** step.
_Avoid_: Equating with **Union (path boolean)** (union merges overlapping regions via clip); describing as “grouping” when the DOM result is literally one path element.

**Continuing path rewrite**:
In-session record that the active stroke mutates an existing `<path>` (`pathId`, `originalD`, **Continuation stitch**, optional frozen `existingSegments` for prepend)—drives preview, **Close target**, and the `EditPath`-style **History** entry on **Path finish**.
_Avoid_: Using for brand-new paths with no prior `pathId`; conflating with **PenSession** segment math alone.

**Path finish join**:
Automatic merge on **Path finish** when the drawn endpoint lands within **Join tolerance** of another open path’s head or tail, producing one `<path>` without requiring idle endpoint pickup first.
_Avoid_: Equating with **Open path continuation** pickup (which starts the session at the endpoint); using “join” for welding interior segment hits.

**Insert on path**:
Idle pen **Tool** behavior: primary mousedown→drag on an existing `<path>` segment interior splits the path and inserts a new knot with handle authoring—distinct from **Open path continuation** (endpoints) and from ordinary **Node-edit tool** editing of committed geometry.
_Avoid_: Calling endpoint pickup **Insert on path**; using when a **Pen authoring session** stroke is already in progress.

**Pen cubic notation (P0–P3)**:
Informal pen-review labels for a cubic leg: **P0** = segment start anchor, **P1** / **P2** = outgoing / incoming control points, **P3** = segment end. **Vertex** and **Knot** in `plans/ux/bezier-anchor-handle-interactions.md` name the same on-curve loci for node-edit prose.
_Avoid_: Treating P-labels as separate **Path node** types; using P2/P3 interchangeably across quadratic (`Q`) segments without saying so.

**Ports**:
Narrow TypeScript interfaces (`*Port`, `*SvgPort`, `*ReadPort`) that decouple orchestrators, commands, and panels from wide services. A port exposes only the methods a caller needs — e.g. `PenToolSessionPorts`, `HistoryPaintPort`, `PathBooleanSelectionReadPort`, `SvgShapePaintPort`. Implementations usually live on `SvgManipulationService`, shape-content services, or the **Canvas adapter**.
_Avoid_: “Dependencies” with no qualifier; calling every Angular `@Injectable` a **Port**—here it means an explicit, named seam with a small surface; don’t inject `SvgManipulationService` where a port type exists.

**Canvas adapter**:
The `svg-canvas` component’s role as the **Canvas** boundary: map DOM events to document coordinates, dispatch to **ToolRegistryService** / **CanvasTool** adapters, implement port interfaces for tool orchestrators, and apply side effects to the **Live tree** via commands and services. The adapter **implements** ports; tool code **depends on** ports.
_Avoid_: Using **Canvas adapter** when you mean the **Canvas** viewport alone; naming the whole editor panel “the adapter” when you mean **Chrome** plus **Canvas**; putting tool policy inside the adapter instead of an orchestrator behind ports.

**CanvasTool**:
The pointer/keyboard contract (`CanvasTool` interface) a registered **Tool** implements — `onActivate`, `onPointerDown`, `onKeyDown`, etc. Adapters live in `src/app/tools/*-canvas-tool.ts` and stay thin: delegate to an orchestrator or gesture, consume events by returning `true`.
_Avoid_: Calling the whole **Canvas adapter** a **CanvasTool**; conflating with **ToolDescriptor** (UI metadata only).

**Tool registry**:
`ToolRegistryService` — holds registered **CanvasTool** instances and **ToolDescriptor** metadata; `PointerGestureRouter` and keyboard routing consult it first; the tool strip reads `stripGroups()`.
_Avoid_: Hardcoding tool buttons in templates when a descriptor + registry entry exists; bypassing the registry for new tools.

**Tool descriptor**:
UI metadata for a **Tool** (`ToolDescriptor`: label, icon, strip group, `interactionKind`, selector flags) registered alongside its **CanvasTool**. Mirrors the dock-panel descriptor pattern.
_Avoid_: Duplicating strip labels in HTML; using descriptor fields for runtime tool behavior (behavior belongs in the **CanvasTool** adapter or orchestrator).

**Tool strip**:
Left-dock **Chrome** that activates a **Tool** (and may hold compact **Creation paint defaults**)—not **Selection** property editing, not per-**Tool** option chrome, and not the lasting home for file open/import.
_Avoid_: Putting full properties or layer trees on the **tool strip**; calling tool buttons a **Tool** (the mode is the **Tool**; the control is a tool button); treating SVG open/import as permanently strip-owned once a **menu bar** exists.

**Tool context bar**:
Top **Chrome** *directly above the workspace* that shows options of the *active* **Tool** only (e.g. pen alternate-curve, **Node-edit tool** path-node anchor tools)—constraints and variants of the current interaction mode, independent of **Selection**. Distinct from the **editor top bar**.
_Avoid_: Hosting **Selection** or **Document** attributes here; duplicating **Dock panel** property editors; treating empty slots for tools with no options as a missing panel; stuffing session snap / file actions into this bar; burying path-node tools in Path Ops or the right dock.

**Editor top bar**:
App-level **Chrome** above the **tool context bar**: brand, document actions (new/download today), and session constraints currently parked here (snap popover). Interim home until a fuller **menu bar** exists—not the per-**Tool** options strip.
_Avoid_: Calling the **editor top bar** the **tool context bar**; treating snap toggles as a **Tool**; relocating snap to the **tool strip** as the lasting plan.

**Menu bar** (planned):
Future Windows-style dropdown menus along the top (File / View / …) for session and document commands—intended long-term home for snap, New/Download, open/import, fit-to-view, and similar globals. Not implemented yet; until then leave those controls in the **editor top bar** (and any interim left-rail load affordances). The **tool context bar** stays a separate row forever (active-**Tool** options)—menus do not absorb it. After menus ship, the left rail stays **Tool** + **Creation paint defaults** (plus creation-tool actions like raster insert if product treats them that way)—not File open.
_Avoid_: Designing as if **menu bar** already exists; merging **menu bar** with **tool context bar** in prose; treating New/Download/open as permanently “top-bar or strip buttons only” once menus ship.

**Creation paint defaults**:
Compact fill/stroke (and related) defaults on the **tool strip** used when creating new shapes—session draw defaults only. Changing a default does not rewrite paint on the current **Selection**; selected-shape paint is edited only in a **Selection-aware dock panel**, which need not expose or own those defaults.
_Avoid_: Equating defaults with selected-shape paint; dual-writing strip changes into **Selection**; putting the full paint editor in the **tool context bar**; assuming the properties **Dock panel** must keep a “defaults when empty” paint UI.

**Dock panel**:
A registered collapsible section in the right-dock **Chrome** stack—e.g. Document, Properties, Colors, Stroke, Align & distribute, layers, **Path ops panel**—not **Editor chrome** on the **Canvas**. Sections share one scrollable column (no exclusive tab switcher); each has a header that collapses/expands its body. Do not repeat the section title as an inner `h3`.
_Avoid_: Calling a **Dock panel** a **Tool**; using “inspector” until that headword is defined here; equating the dock shell with any one panel’s content; describing the right dock as tabbed UI.

**Always-available dock panel**:
A **Dock panel** whose primary subject is independent of **Selection**—e.g. layers (**Live tree** paint order) or the **Document settings panel**—so it remains meaningful when the **Selection** is empty.
_Avoid_: Saying “always available” for panels that only make sense with a non-empty **Selection**; conflating with auto-show relevance (a panel can be always available and still never auto-suggest).

**Selection-aware dock panel**:
A **Dock panel** whose primary subject is the current **Selection** (or a Selection-derived gate)—e.g. Properties, Colors, Stroke, Align & distribute, or **Path ops panel**—so empty or ineligible **Selection** yields an empty/disabled body rather than document-wide state. Its section stays listed in the stack even when irrelevant; relevance may still auto-expand and scroll the section into view, not hide it.
_Avoid_: Treating selection-awareness as “hidden from the dock until relevant”; using for tools or the **tool context bar**.

## Relationships

- Every term in **Language** is in scope for **Editor runtime** only (see blurb above).
- The **Document** supplies document-space geometry via its root `viewBox`.
- The **Artboard** frames that geometry for editing (and, when exported rules say so, for **Serialized** width/height); the **Document settings panel** edits **Artboard** attributes without requiring **Selection**.
- At most one authoritative **Document** is being edited in a given **Editor runtime** session.
- **Serialized** is the persistence-oriented string form of a **Document**, not a generic name for every string interchange of its markup.
- In session, the editor mutates the **Live tree**; save/export emits **Serialized** SVG.
- The **Canvas** hosts the **Live tree** and maps the **Document**’s `viewBox` into screen space; **Editor chrome** sits outside **Canvas** in this vocabulary.
- **Editor chrome** is a subset of **Chrome**; not all **Chrome** is **Editor chrome** (e.g. toolbars and docks are **Chrome** but not **Editor chrome**).
- The right dock hosts a scrollable stack of **Dock panel**s; each panel declares for itself whether it is an **Always-available dock panel** or a **Selection-aware dock panel** (descriptor / panel policy—not a global dock mode). Sections are always listed; selection-awareness and auto-show affect body emptiness and expand/scroll, not whether the section appears.
- **Tool strip** chooses the **Tool** (plus optional **Creation paint defaults**); **tool context bar** hosts active-**Tool** options only (permanent row); **editor top bar** holds app/document actions and interim session options (snap); planned **menu bar** absorbs those session/document menus (New, Download, open/import, snap, fit-to-view, …) later—without moving them onto the **tool strip** or folding the **tool context bar** into menus.
- **Dock panel**s host **Document** / **Selection** / **Layer** data—not mode options. Locked stack order: Document → Properties → Colors → Stroke → Align & distribute → Layers → Path Ops.
- Fill paint and opacity live under Colors; stroke paint/styling under Stroke; geometry/typography under Properties; artboard under **Document settings panel**.
- **Creation paint defaults** affect subsequent creation only; they do not apply to **Selection**. A **Selection-aware dock panel**’s paint UI can be Selection-gated (hidden/empty when **empty selection**) without owning defaults.
- **Selection** names shapes in the **Live tree**; **Editor chrome** visualizes and manipulates **Selection** but is not **Selection** itself.
- **Tool** describes how pointers and keys are interpreted on the **Canvas**; **Selection** describes which shapes are targeted—app code may couple changes, but the concepts differ.
- **Editor chrome** (handles, marquee, guides) reacts to both **Tool** and **Selection**.
- **Layer** ordering is **Live tree** paint order under the artwork content; reordering changes how the **Document** draws.
- **Group** rows in the layers list reflect `<g>` containers; reparent and intra-group order change the same paint-order structure as **Layer** reorder.
- **Layer visibility** and **Layer lock** are independent axes on a row: hidden vs visible, editable vs guarded—UI may present them together but prose should stay precise.
- **History** records applied edits and their inverses; undo/redo walks those stacks and mutates the **Live tree** (and may change **Selection** or **Layer** order as a side effect).
- **Outline to path** turns **Primitive shape**s into `<path>` so **Path node**, **Corner node**, and **Smooth node** edits apply; until conversion, bbox handles own the shape.
- **Compound path** may sample **Primitive shape** geometry transiently without a separate **Outline to path** command per operand; the committed artifact is still one `<path>`.
- **Path boolean operation** (union / subtract / intersect) applies only to **Boolean operand**s (closed paths today); **Compound path** accepts **Compound operand**s including primitives.
- **Boolean preview** is **Editor chrome** on the **Canvas**; **Path ops panel** is **Chrome** in the right dock—preview ghost is not artwork in the **Live tree** until Apply.
- **Make compound path** and **Path boolean operation** Apply both push one **History** command that removes operands and inserts the result path.
- **Node-edit tool** is still a **Tool** variant: it changes pointer routing on the **Canvas** like other tools and cooperates with **Editor chrome** overlays for knots and handles.
- Every registered **Tool** is a **CanvasTool** adapter in `ToolRegistryService`; pointer and keyboard input hit the registry before legacy canvas branches.
- The pen **Tool** routes through a **Canvas adapter** into **PenToolSession**, which owns **Pen authoring session** policy while mutating or reading a **PenSession** model; **PenToolSession** uses **Ports** to touch **History**, **Selection**, and svg.js—not the full widget tree. New complex tools should follow the same orchestrator + **Ports** pattern rather than expanding **Canvas adapter** inline logic.
- **Pen-over-shape input** is a hit-test priority policy in the **Canvas adapter** / pen stack, not a separate **Tool** name.
- **Pending segment** and **First-anchor P3 draft** are in-session draft states in **Pen authoring session**; neither is a **Path node** until committed to the **Live tree**.
- **Join tolerance** is shared by **Single-click close**, **Close target** affordances, **Open path continuation**, and **Path finish join**; failed screen mapping must not merge paths.
- **Close target** may differ from session `M` when **Continuing path rewrite** uses `prependBeforeExisting`.
- **Open path continuation**, **Path finish join**, and **Continuing path rewrite** extend **Pen authoring session** join rules; they are not separate **Tool**s and write **History** via path edit commands on **Path finish**.
- **Insert on path** applies on segment interiors while the pen session is idle; **Open path continuation** applies at open path endpoints—both use the pen **Tool** but different hit targets and outcomes.
- **Path close** adds `Z` (and closing geometry); **Path finish** is the broader commit to the **Live tree** and may leave the path open or merge via join/continuation.
- **Automatic tool revert (after creation)** couples shape-creation tools with the Select **Tool**; it does not by itself change **History** beyond the creation command already pushed.

## Shell UI (thin **Chrome**)

The workspace **Chrome** around the **Canvas** includes intentionally shallow components: the **editor top bar**, the **tool strip**, the **tool context bar**, the right dock of registered **Dock panel**s (mix of **Always-available dock panel**s and **Selection-aware dock panel**s), and the shared dock-panel id / descriptor type. They are not **Editor chrome** (handles, guides, marquee on the drawing surface) but they are **Chrome** in this glossary. A **menu bar** is planned but not shipped—don’t invent interim homes that fight that destination (especially don’t park snap permanently on the **tool strip**). Ownership map: [ADR 0003](docs/adr/0003-editor-chrome-ownership.md).

**Single-layout wiring today**

- **`EditorRightDockComponent`** renders the registered stack: section headers toggle expand/collapse via **`EditorLayoutService`**; Path Ops auto-expand/scroll uses **`DockPanelAutoShowService`**. Whole-dock collapse remains.
- **`ToolStripComponent`** and **`EditorToolContextBarComponent`** call **`EditorToolService`** directly (constructor injection or `inject()`). That is appropriate while there is only one shell: there is no duplicated forwarding to deduplicate, and extracting `input()` / `output()` boundaries would add noise without a second consumer.
- **`DockPanelRegistryService`** + **`registerDefaultDockPanels()`** register the seven stack sections; ids are free-form strings (`document`, `properties`, `colors`, `stroke`, `alignDistribute`, `layers`, `pathOps`).
- **`ChromeEditorApplyService`** is the thin **Chrome** → **History** façade for dock panels and eyedropper; domain logic lives in **`chrome-apply/*`** slices. Panels call the façade; it batches `EditorCommand`s and reconciles **Selection** with the **Live tree**.
- **`EditorLayoutService`** owns per-section expand map, dock collapse, scroll-into-view requests, and rail/dock width signals for the shell ([hnv.8](plans/epics/hexagonal-architecture-extensibility.md)).

**When to deepen**

Revisit tool strip / context bar seams (e.g. mirror the right-dock `input`/`output` style, or a tiny chrome-facing slice next to **`EditorToolService`**) only when a **second adapter** needs the same tool or pen-option contract—reuse in another route, compact layout, or tests that must mock **Tool** state at the template boundary without providing the full service graph.

For **new canvas tools**, deepen via **orchestrator + Ports** (pen pattern) rather than growing **`SvgCanvasComponent`** — see [plans/ARCHITECTURE.md](plans/ARCHITECTURE.md) § Adding a canvas tool.

**Stable anchors**

Shell templates expose `data-testid` on major regions (e.g. tool strip, right dock, tool context bar). Renaming or removing those nodes is a deliberate breaking change for automated regional layout checks; update snapshot baselines when the shell’s pixels are meant to change.

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

> **Dev:** "Is clicking an open path’s end cap the same as insert-on-path?"
> **Contributor:** "No — endpoint pickup is **Open path continuation**; splitting a segment mid-span is **Insert on path**."

> **Dev:** "Does close target always mean the first point I placed?"
> **Contributor:** "Usually session `M`, but prepend continuation freezes the existing tail as **Close target**—not the new stroke’s moveto."

> **Dev:** "Did the user close the path or just finish drawing?"
> **Contributor:** "**Path close** means `Z` looped the subpath; **Path finish** is the commit either way—they might finish open or merge via **Path finish join**."

> **Dev:** "Is compound the same as union?"
> **Contributor:** "No — **Union (path boolean)** clips and merges overlapping fill; **Compound path** keeps each **Compound operand** outline as its own subpath without clipping."

> **Dev:** "Does compound convert my rect to a path like outline-to-path?"
> **Contributor:** "It samples primitive geometry into the result `d` and removes the rect element—similar outcome to **Outline to path** on each shape, but **Make compound path** is one **History** step for the whole **Selection**, not a permanent per-shape conversion command."

> **Dev:** "Where does the blue boolean ghost live?"
> **Contributor:** "**Boolean preview** — **Editor chrome** on the **Canvas**; cleared on Apply or Cancel. **Path ops panel** buttons live in right-dock **Chrome**."

> **Dev:** "I'm adding a gradient tool — do I put logic in `SvgCanvasComponent`?"
> **Contributor:** "No — add a **Tool descriptor**, a **CanvasTool** adapter, and if it has session state, an orchestrator with **Ports** the **Canvas adapter** implements. See ARCHITECTURE.md § Adding a canvas tool."

> **Dev:** "Is layers selection-aware like properties?"
> **Contributor:** "No — layers is an **Always-available dock panel** (paint order of the **Live tree**); properties is a **Selection-aware dock panel**. Each **Dock panel** declares that itself— the dock is not one global mode."

> **Dev:** "Where do pen alt-curve and shape fill live?"
> **Contributor:** "Alt-curve is **tool context bar** (active **Tool** option). Selected-shape fill is a **Selection-aware dock panel**. New-shape fill/stroke defaults are **Creation paint defaults** on the **tool strip**—three homes, don't merge them."

> **Dev:** "I changed the strip fill while a rect is selected—did the rect repaint?"
> **Contributor:** "No — strip only updates **Creation paint defaults**. Edit the rect’s fill in the Colors **Dock panel**."

> **Dev:** "Where do artboard width and fit-to-artboard live?"
> **Contributor:** "Width/height/background → **Document settings panel**. Fit-to-artboard is a **Canvas** view command—don’t stuff it into document settings as if it were an **Artboard** attribute."

> **Dev:** "Move snap onto the tool strip?"
> **Contributor:** "No — leave it in the **editor top bar** for now; long-term it belongs in a **menu bar**, not the **tool strip** or **tool context bar**."

> **Dev:** "When menus ship, does the tool context bar go away?"
> **Contributor:** "No — **menu bar** takes File/View/session commands; **tool context bar** remains the active-**Tool** options row."

> **Dev:** "Does open SVG stay on the left forever?"
> **Contributor:** "No — File open/import moves into the **menu bar**; left stays **tool strip** + **Creation paint defaults**."

> **Dev:** "Can my tool call `SvgManipulationService` directly?"
> **Contributor:** "Only through a declared **Port** type if one exists; otherwise define a narrow `*SvgPort` and implement it on the canvas adapter or an existing service — don't widen the façade from tool code."

## Flagged ambiguities

- The word “document” in casual prose often means the browser DOM — in editor discussion reserve **Document** for the logical SVG artwork.
- “Serialized” is often used for any string form of the SVG — here **Serialized** is **export/save only**; use other words for clipboard snapshots, debug dumps, or ad hoc markup strings—not **History** (undo/redo stacks).
- “Live SVG tree” in casual chat maps to **Live tree** here; don’t use **Live tree** for unrelated DOM subtrees outside the editor SVG.
- “Canvas” often names the whole `svg-canvas` surface — here **Canvas** is **viewport-only**; use **Editor chrome** when you mean handles, guides, or marquee; use **Canvas adapter** when you mean the component’s routing of DOM input into **Tool** / session code.
- “Chrome” in web platform speech usually means the browser shell — here **Chrome** means in-app UI that is not **Live tree** artwork; say **browser chrome** when you mean the browser’s own UI.
- Sidebars and panels that read or write selection properties are **Chrome** / **Dock panel** for now; we may introduce a narrower term (e.g. **Inspector**) later—don’t use that name until it is defined here.
- “Selection-aware” on a **Dock panel** means the panel’s *subject* is **Selection**-gated and its body may be empty/disabled; stack sections stay listed—say **auto-show** when you mean relevance-driven expand/scroll.
- “Top bar” / “top rail” in casual speech may mean the **editor top bar** (app actions, snap) or the **tool context bar** (active **Tool** options)—name which; planned **menu bar** is a third top-of-app concept.
- Do not call the right dock “tabbed”; it is a collapsible **Dock panel** stack.
- Union bbox and matrix-derived skew/rotation **readouts** for properties-style **Chrome** live in `SelectionTransformReadoutService`; **Canvas** skew gesture math (`selection-skew.ts` and gestures) is a different seam—don’t merge the two without an explicit shared primitive.
- “Primary” is implied by **Selection** list order; a dedicated **Primary selection** (or **Primary shape**) headword is **deferred**—don’t introduce competing meanings for “primary” in prose until then.
- “Tool” labels toolbar buttons (**Chrome**) as well as modes—here **Tool** is the interaction mode; say **tool strip** or **tool button** when you mean the control, not the mode.
- A **Layer** row can be a `<g>` that acts as a clip/mask carrier in selection rules—still a **Layer** in the stack list, but behavior may differ from a user-authored group; see code and product rules before assuming “folder” semantics.
- The codebase exposes multiple “revision” style counters (e.g. logical **Document** bumps vs undo/redo navigation); they are not interchangeable—name which seam you mean in reviews.
- **PenSession**, **Pen authoring session**, and **PenToolSession** are three layers (model value, policy scope, class)—don’t swap names in reviews without saying which layer you mean.
- “Close” in pen chat may mean **Path close** (`Z`), snapping to **Close target**, or merely **Path finish**—name which you mean.
- “Join” may mean **Path finish join**, **Open path continuation** stitch, or collinear handle behavior at a **Smooth node**—don’t overload without context.
- **Close target** is not always session `M` during `prependBeforeExisting` **Continuation stitch**—check **Continuing path rewrite** before reviewing close-ring bugs.
- **First-anchor P3 draft** is not a **Pending segment**; reviews of first-segment curve bugs should say which step failed (mirrored handle drag vs `P3` plant vs commit).
- “Combine paths” in casual speech may mean **Union (path boolean)**, **Compound path**, or Illustrator “compound path” (evenodd holes)—name which operation and whether clipping ran.
- **Boolean operand** (path-only for booleans today) vs **Compound operand** (paths + rect/circle/ellipse)—don’t say “selected paths” when primitives are in **Selection** for compound.
- **Flatten (boolean geometry)** reduces curves to polylines for clipping; **Compound path** on path operands preserves `C`/`Q` in the result `d`—don’t describe both as “flattening.”
- Permanent **Outline to path** vs transient sampling during **Compound path**—reviews should say whether operands should survive as separate elements after the edit.
