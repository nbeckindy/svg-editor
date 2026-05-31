# Bezier anchor and handle interactions — UX baseline

This document compares mainstream vector-editor patterns, aligns **smooth vs corner** semantics with how SVG paths are actually stored, and proposes interaction behavior phased for **MVP vs later** for this Angular canvas app (`svg-canvas` overlays, `node-edit-selector` tool, pen session).

## Terminology

Words below are used consistently in UX plans and code comments for this app. They overlap with general vector-editor vocabulary; **anchor** is the usual synonym for the on-curve point in tools like Illustrator.

| Term | Definition |
|------|------------|
| **Vertex** | An **on-curve** point where path geometry is pinned: segment endpoints, join points between segments, and the start point after **`M`**. Moving a vertex changes the path’s shape at that joint. |
| **Knot** | Informal term for an on-curve **joint** where path segments meet—the same locus as a **vertex**. It is **not** a separate SVG construct or a different kind of point than a vertex here; speech and comments use “knot” where other tools say “anchor” or “point on the path.” |
| **Node** | **Editor shorthand** for an editable knot on a path—the **vertex** together with how the curve **enters and leaves** it (tangent **handles** and segment commands). Selecting a “node” in **Node Edit** means that vertex is the focus; operations like delete/remove refer to that knot. |
| **Handles** | **Off-curve** control points (**direction points**) that pull a **cubic** (**C**) or **quadratic** (**Q**) segment without lying on the stroke itself. In this app they appear as green grips with dashed lines to their **anchor**. Dragging a handle changes tangent direction and strength on that side of the vertex. |
| **Chord** | The **straight line** between two **on-curve** points—most often the segment between **consecutive anchors** (the endpoints of one logical edge of the path). Pen placement logic sometimes derives a control from **fractions along this chord** (e.g. “chord-thirds”: a point one-third of the way along the chord from one anchor toward the next). |

**Related words:** **Anchor** = the visible on-curve dot for a vertex in overlays (same idea as “anchor point” in Illustrator). **Segment** = one contiguous piece of `d` between two vertices (e.g. a single **L**, **C**, or **Q**).

---

## 1. Current implementation snapshot (this repo)

Understanding today’s behavior grounds the recommendations and avoids describing features that already exist.

| Area | Current behavior |
|------|------------------|
| **Enter / exit node edit** | Users switch to the **Node Edit** tool (`node-edit-selector`). Node-edit mode builds overlay geometry from parsed `d` (supports normalized **M / L / C / Q / Z**; arcs and smooth **S / T** are normalized where possible). **Escape** exits. **Click outside** the path and its node overlays exits. (Roadmap text mentioning double-click-to-enter is **not** the current entry path; the canvas test suite explicitly expects **no** node-edit entry from double-click on a path in plain selector mode.) |
| **Visual affordances** | **Anchors:** white fill, blue stroke (`#1E88E5`), radius ~4px in overlay space; selected anchors get a distinct class. **Handles:** green (`#43A047`), dashed connector lines, circular handle grips. |
| **Dragging** | **Anchor drag** moves the vertex and updates linked cubic/quadratic control coordinates (see `applyAnchorDrag` — outgoing/incoming handles move with the anchor in defined cases). **Handle drag** updates a **C** or **Q** control (`applyControlDrag`). For **cubic** segments, when the topological joint is **C–C** (including across `Z` on a closed subpath), dragging one handle **symmetrically mirrors** the opposite handle through the shared anchor (`applySymmetricCubicControlDragInPlace` in `path-node-cubic-handle-mirror.ts`); **L** / **Q** neighbors keep a single-handle update. |
| **Deletion** | With a selected anchor, **Delete** removes the vertex subject to minimum node count (open vs closed path). Feedback messages explain blocked deletes. |
| **Pen tool (creation)** | **Click** adds a corner (**L**). **Click + drag** (past the same screen threshold as marquee gestures) adds a curve: default **C** uses an **Illustrator / Inkscape–style** model — drag from the new anchor sets the **incoming tangent** at that vertex (`P2` back along the drag), with **`P1` on chord-thirds** from the previous anchor; **Alt** switches to **end-handle-only** (`P2` follows pointer, `P1` still chord-thirds). **Ctrl/Cmd + alternate curve types (`Q` / `S` / `T`)** are **off** until rediscovered with clear in-app affordance (`svg-editor-h76`). A future preference could expose other placement styles (e.g. SVGator-style). Pen can **insert** an anchor on an existing path when clicking near a segment (separate from node-edit mode). UX follow-up: [pen insert discoverability](./pen-insert-node-discoverability.md). **Close from start:** the path start is a small screen hit target (~8px). Curve preview and handle overlays still use the global marquee drag threshold for ordinary segments, but when the pending mousedown is within join tolerance of the path’s **`M`**, preview can appear after a **smaller** screen move (2px) or a tiny root-SVG drag so users can shape the closing cubic without leaving the ring; the committed closing segment’s **terminal anchor is always the exact `M` coordinates** before `Z` (not a snapped mouse release). See `plans/bugs/pen-close-from-start-preview-and-endpoint.md`. **Closing-node policy (M+Z parity):** we do **not** synthesize a **mirrored** smooth corrective **`C`** at the moveto (legacy `tryFinishPenPath` + `appendCubicToD`), and we do **not** add an **outgoing handle on `M`** that rewires the first segment — see `plans/bugs/pen-drag-close-m-z-parity.md`. Single-click and drag-close both commit a closing stroke that ends on session **`M`**, then **`Z`** only. |

---

## 2. Interaction patterns in mainstream tools (comparison)

The following summarizes **typical** user-visible patterns (product names only; behavior can vary slightly by version and preference). Use them as a **mental model**, not as a requirement to clone every shortcut.

### 2.1 Figma

- **Node types:** Explicit modes such as **corner**, **straight** (broken tangents but axis-aligned feel in some workflows), **mirrored** (equal-length opposed handles), and **asymmetric** (collinear but different lengths).
- **Direct manipulation:** Click a vector point to select; drag points and handles. **Pen tool** and **edit** modes are distinct but feel continuous.
- **Breaking “smoothness”:** Dragging one side of a mirrored pair or converting point type yields **independent** handles while preserving the underlying path geometry until the user changes it.
- **Affordances:** Clear hit targets; hover often enlarges or highlights control points; bend handles show relationship to the curve.

### 2.2 Adobe Illustrator

- **Anchor vs direction points:** **Anchor points** and **direction handles** are separate draggable artifacts; curvature is cubic by default in the Pen / Direct Selection model learners expect.
- **Corner vs smooth:** **Corner points** have broken or no linked tangents; **smooth points** keep tangents **collinear**; **symmetric** smooth keeps equal handle lengths (until broken).
- **Breaking handles:** **Option/Alt-drag** on a handle is the classic pattern to **break** direction lines so each side moves independently (when the model supports it).
- **Modifiers:** **Shift** often constrains handle angle to 45° increments; **Shift** on path editing may also constrain point movement depending on tool.

### 2.3 Inkscape

- **Node tool:** Dedicated node editing with **corner / smooth / symmetric auto-smooth** style toggles (exact naming has evolved across versions).
- **Handle locking:** Can make handles **collinear** (smooth) or **independent** (cusp / corner), including retracting handles onto the node for sharp corners.
- **Keyboard-heavy workflow:** Power users rely on shortcuts to change node type and to preserve angles while dragging.

### 2.4 Shared themes (takeaways for this app)

1. Users expect **anchors** and **handles** to be **first-class targets** with clear hover, selection, and drag feedback.
2. **Smoothness** is about **tangent continuity** (or intentional lack of it), not a magic flag inside SVG — it must be expressed via control point positions in **C** / **Q** (or normalized from **S** / **T**).
3. **Breaking** handles is synonymous with allowing **independent** control points on either side of a vertex.
4. **Locking / mirroring** is a **constraint applied during manipulation**; the serialized `d` still stores explicit coordinates.

---

## 3. SVG path reality: smooth vs corner, lock vs break

SVG `<path d="…">` stores **parametric segments**, not editor “point types.”

- A **corner** at a vertex means the incoming and outgoing curve tangents are **not** constrained to be collinear: control points may form a cusp or a straight corner (**L** / degenerate handles).
- A **smooth** (tangent-continuous) joint means the **incoming** handle direction, **anchor**, and **outgoing** handle direction lie on a **single line**. For cubics, this is a geometric relationship between the end control of the previous segment and the start control of the next **C** (and analogously for **Q**).
- **Mirrored / symmetric** smooth is a **stricter** case: equal distances from anchor along that line (Illustrator “symmetric”; similar to Figma “mirrored”).
- **Breaking** a smooth point **does not** add metadata — it **moves** (or decouples editing of) control points so collinearity or length equality no longer holds.
- **Locking** during a drag is implemented by updating **both** handles whenever one moves, until the user breaks the link — still stored as plain numbers in **`C`** commands after serialize.

**Quadratic (`Q`) note:** A single off-curve control is shared for that segment; “broken” tangents at an intermediate point typically require **elevating** to a **C** or splitting the path — the product should document when conversion happens (MVP can stay **C**-centric for knot editing UI).

---

## 4. Proposed model for this Angular canvas app

### 4.1 Anchor and handle **states**

| State | Meaning | Suggested visual (extends current blue/green language) |
|------|---------|--------------------------------------------------------|
| **Default** | No hover, no drag | Current static styling. |
| **Hover** | Pointer over hit region | Slightly **larger** hit radius (already important for `vector-effect: non-scaling-stroke` at zoom); **brighter stroke** or **scale transform** on overlay only. |
| **Selected** | Anchor is the edit target | Keep distinct from hover; optional **short tangent preview** line if handles exist. |
| **Dragging** | Active gesture | Stronger contrast; optional **live coordinates** in status or properties (later). |
| **Disabled / read-only** | Path not parseable for edit | Existing feedback strip; do not render interactive handles. |

**Multi-path (later):** When multiple paths are eligible in node-edit mode, use **active path** emphasis (stroke tint or label) so users know which path owns the focused selection.

### 4.2 Hover and selection **affordances**

- **Hit testing:** Prefer generous **screen-pixel** tolerances scaled by zoom (similar to pen insert tolerance) so handles stay usable on high-DPI canvases.
- **Depth order:** Handles on top of anchors for hit testing when they coincide visually.
- **Keyboard focus (later):** For accessibility, mirror selection state in an **aria-live** region (the canvas already uses live regions for some feedback).
- **Segment highlight (later):** Hovering near a segment (not just on handles) could highlight the segment under the cursor for insert/delete context.

### 4.3 Modifier keys — **recommended** mapping

Align with common expectations and existing app tools (**Shift** already appears elsewhere in the editor ecosystem for constraints).

| Modifier | MVP proposal | Later / polish |
|----------|--------------|----------------|
| **Shift (during handle drag)** | **Constrain** handle angle to 15° or 45° increments (match global app convention if one exists). | **Constrain anchor motion** to horizontal/vertical from drag start. |
| **Alt / Option (during handle drag)** | **Break tangent:** first movement after Alt starts **decoupled** edit — opposite handle stays fixed until user drags it (Illustrator-like). | Persist “broken” affordance (e.g. small tick on anchor). |
| **Alt / Option (click anchor)** | — | **Cycle** or toggle node “style” between corner-like and smooth **if** a type system is added in the model. |
| **Shift + Alt (optional)** | — | **Symmetric mirror** drag: enforce equal handle lengths on a smooth joint. |
| **Cmd/Ctrl (platform)** | Reserve for multi-select nodes (later) to avoid fighting browser zoom/menu defaults. Document final choice in tool help. | Multi-node marquee + nudge. |

**Pen tool coherence:** Pen already uses **click vs drag** for **L vs C**. Node-edit modifiers should **not** overload the same stripes unless documented in one place (this doc + tool-tip copy).

---

## 5. Smooth vs corner — **expected editing behavior**

### 5.1 Derived typing (recommended internal model)

Even if SVG has no stored “type,” the UI can **classify** each anchor for labeling and for default gestures:

- **Corner:** Incoming/outgoing tangents **not** collinear (within epsilon), or segment meets at **L** with no outgoing/incoming curve handle.
- **Smooth:** Collinear opposing handles.
- **Symmetric:** Smooth **and** handle lengths equal (within epsilon).

### 5.2 Operations

| User intent | Behavior | Serialization |
|-------------|----------|----------------|
| **Move anchor** | Preserve current handle vectors relative to anchor **where the existing `applyAnchorDrag` already does**; extend rules if new constraints are added. | Updated coordinates in **C** / **Q** / **L** / **M**. |
| **Drag handle (default)** | **MVP — optional branch:** If joint is currently smooth/symmetric, **maintain collinearity** (and optionally length ratio) until **broken**. **Current code:** independent per handle — treat as **implicit corner** editing until MVP constraint work lands. | Plain **C** updates. |
| **Break handles** | Stop enforcing collinearity; opposite handle fixed at break moment. | Same. |
| **“Make smooth”** | Snap opposing handles to collinear; optionally set symmetric lengths. | Same. |
| **Retract handle to anchor** | Collapse distance so handle sits on node → sharp corner on that side. | May produce **L** or degenerate **C** depending on policy;must stay parseable and undo-safe. |

---

## 6. Implementable interaction spec — **phased**

### Phase A — **MVP** (minimum shippable clarity)

1. **Document entry UX** in UI copy: Node Edit tool + selection + Escape/outside-click exit (match implementation).
2. **Hover states** on anchors and handles (visual only; no behavior change).
3. **Consistent hit slop** for overlays at all zoom levels (reuse or share helper with resize handle / pen insert logic).
4. **Single-undo** per drag (already intended via `EditPathNodesCommand`).
5. **Explicit spec for handle drag** in MVP: either **(a)** keep **independent** handles as today and label anchors geometrically corner vs smooth in UI only, or **(b)** implement **collinear constraint** for smooth joints only — pick one in implementation planning to avoid half-broken “magnetic” feels.

### Phase B — **Core pro parity**

1. **Alt-drag** (or dedicated affordance) to **break** tangents.
2. **Shift-drag** angle constraint for handles (and anchors if desired).
3. **Convert point** gestures: corner ↔ smooth ↔ symmetric with clear epsilon and tests on round-trip `d`.
4. **Keyboard nudge** for selected anchor (**arrow keys**) with optional Shift multiplier.

### Phase C — **Advanced**

1. **Multi-node selection** and **segment** operations (delete segment, add midpoint preserving curvature).
2. **Snap** during node edit (grid / smart guides) consistent with pen snapping epic direction.
3. **Quadratic elevation:** when “breaking” a **Q** joint needs a **C**, convert with minimal visual change.
4. **Touch / trackpad:** larger handles and long-press to break smooth.

---

## 7. Candidate follow-up **bead titles** (phased)

Use as `bd`-style issue titles or epic children; adjust IDs to your tracker.

**MVP / near-term**

- Node edit: overlay hover affordances and zoom-stable handle hit targets  
- Node edit: document Node Edit tool entry/exit in in-app help or onboarding tip  
- Path nodes: define MVP handle-drag policy — independent vs collinear smooth locking  
- Path `d` round-trip: tests for break-smooth and corner-collapse edge cases  

**Mid-term**

- Node edit: Alt-drag to break tangents on cubic anchors  
- Node edit: Shift-constrain handle angle and anchor motion  
- Node edit: convert-anchor command (corner / smooth / symmetric) with undo  
- Node edit: keyboard nudge for selected anchors  

**Later**

- Node edit: multi-node selection and batch nudge  
- Node edit: segment-level insert/delete with curvature preservation  
- Path quality: quadratic-to-cubic elevation on asymmetric breaks  
- Node edit + snap: grid and smart guides in edit mode  

---

## 8. Traceability

- Canvas implementation: `src/app/components/svg-canvas/svg-canvas.component.{ts,html}`  
- Path parsing / normalization: `src/app/models/path-d.ts`  
- Related epics: `plans/epics/path-node-editing.md`, `plans/epics/advanced-path-editing.md`, `plans/epics/pen-path-tool.md`  

---

*Prepared for bd issue `svg-editor-f31` (APE-4 UX brainstorm).*
