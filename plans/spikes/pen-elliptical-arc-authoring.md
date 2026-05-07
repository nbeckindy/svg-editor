# Spike: Pen tool — elliptical arc (`A`) authoring

**Epic:** `svg-editor-j24` (tool parity / pen authoring)  
**Bead:** `svg-editor-j24.7`  
**Date:** 2026-05-07  
**Depends on:** `svg-editor-j24.2` (Q / S / T pen phase 1) — session/parser shape should be stable before locking arc integration details.

---

## 1. Parameterization: endpoint-first vs center-first

### 1.1 SVG native form (endpoint parameterization)

The path command `A rx ry x-axis-rotation large-arc-flag sweep-flag x y` is **endpoint-parameterized**: the author fixes the **start** (previous subpath point), **end** `(x,y)`, ellipse **radii** `rx, ry`, **x-axis rotation** `φ`, and two booleans **large-arc** and **sweep** that pick one of the up-to-four mathematical solutions.

**Pros for this editor**

- **Round-trip fidelity:** Emitted `d` matches what authors expect from SVG references and diff-friendly output.
- **Reuse of existing math:** `path-d.ts` already implements SVG’s center computation + cubic approximation (`arcToCubicSegments`) for parse; pen authoring can share the same geometric conventions.
- **Consistent with “pen = append segment to open subpath”** mental model: each click extends from the current point.

**Cons**

- **Non-obvious toggles:** `large-arc` and `sweep` are not visual until you see the curve; new users need affordances or defaults.
- **Radii inflation:** When the chord is too long for the given radii, SVG scales `rx, ry` equally (λ correction in the spec). Pure dragging “radius handles” without rechecking constraints can feel jumpy unless the UI reflects that correction.

### 1.2 Center parameterization (CAD-style)

Fix **center**, **radii**, **start angle**, **end angle**, and **φ**. Convert to endpoint `A` for serialization.

**Pros**

- Natural **rotate ellipses** and **symmetric edits** around a visible center.
- Some illustration UIs teach arcs as “drag from center” or “drag rim.”

**Cons**

- Extra state during authoring; must map back to `A` with correct flags.
- Pen subpaths are fundamentally a polyline in **image** space; center form is awkward when the **previous point** is the only hard anchor (you still need a consistent start angle).

### 1.3 Recommendation

**Primary:** **endpoint parameterization** aligned with SVG `A`, with **derived center/ellipse** shown as a ghost during drag for predictability.

**Secondary (later):** Optional “center snap” or inspector fields (`rx`, `ry`, `φ`, flags) for precision; still serialize as `A`.

---

## 2. `large-arc` and `sweep` semantics (SVG)

Given start `P1`, end `P2`, radii (after λ scaling), and rotation `φ`, there are generally **four** candidate ellipses. The flags collapse this to **one** arc:

| Flag | Meaning |
|------|--------|
| **large-arc** (`0` or `1`) | `0` = smaller arc span along the ellipse; `1` = larger span (≥ 180° of the ellipse parameter). |
| **sweep** (`0` or `1`) | `1` = arc runs **positive angular direction** in the ellipse’s **local** frame (SVG: “positive angle” = clockwise in the **transformed** coordinate system as used in the spec’s derivation); `0` = the other direction. |

**Practical interpretation for UX**

- Flipping **sweep** mirrors which “side” of the chord the bulge sits on (for a given large-arc choice).
- Flipping **large-arc** switches between the **short** and **long** route between the same endpoints on the same ellipse.

**Degenerate / edge cases** (must be documented in tests later)

- Start ≈ end, or `rx`/`ry` → 0: SVG collapses behavior; current parser path uses cubics or empty; pen must not emit invalid `A` or corrupt prior segments.
- Chord length forces **radius scaling:** visual “radius handle” may not equal stored `rx, ry` after correction.

---

## 3. Proposed on-canvas affordances

These are **proposals** for implementation follow-up, not commitments.

1. **Three-point / chord + bulge flow (matches pen rhythm)**  
   - After the segment anchor (previous point): **click** end point (like a line).  
   - Without releasing / or on drag: **pull perpendicular “bulge”** (signed distance or mouse away from chord) to choose **one** smooth solution.  
   - **Defaults:** `large-arc = 0`, `sweep` chosen by bulge sign relative to chord (consistent with SVG sweep in editor coords).

2. **Modifier to swap solution**  
   - e.g. **Alt/Option** or **cycle key** toggles **large-arc** when chord geometry supports two materially different major/minor arcs; second modifier or repeated key toggles **sweep** if users need the mirror solution.

3. **Ghost overlay**  
   - While dragging: faint **ellipse outline**, **center**, and **start/end** on the ellipse to show why the arc bends “the long way” when large-arc is on.

4. **HUD / status strip (minimal)**  
   - Short labels: `LA` / `SW` or icons when flags flip; avoid modal text during draw.

5. **Snap**  
   - Respect existing snap pipeline for end point; arc-specific tangency snaps are **out of scope** for first ship unless trivial reuse exists.

---

## 4. Comparison notes: Illustrator vs Inkscape (high level)

| Area | Adobe Illustrator | Inkscape |
|------|-------------------|----------|
| **Pen mental model** | Anchor / direction handles; smooth corners; **no native elliptical `A` in one click** in the classic Pen in the same way SVG path `A` is parameterized. Users often approximate arcs with beziers or use the **Ellipse** tool then convert. | Pen / Bezier tools; elliptical segments can be authored in path workflows with tool modes; more explicit **metric** editing in XML/object props. |
| **Arc flags exposed** | Rarely surfaced in-tool; curve is **WYSIWYG** | More paths lead to **numeric** `d` or XML; easier for power users to reason about `A` |
| **Implication for us** | Competing on **SVG-native paths** suggests **endpoint `A`** + simple cycling for ambiguous cases, not Illustrator-perfect handle algebra. | Inkscape-aligned users may expect **inspectable `rx, ry, φ`** and flag toggles; consider a property panel hook later. |

---

## 5. Implementation risks (project-specific)

1. **`PenPathSegment` is today `M | L | C` only** (`src/app/models/pen-path.ts`). Adding arcs implies extending the union, **`penPathSegmentsToD`**, validation, preview assembly in `SvgCanvasComponent`, and finish/commit paths — all coordinated with **`svg-editor-j24.2`** so Q/S/T types and session invariants stay coherent.

2. **Parser vs pen output mismatch:** General parsing turns `A` into **cubic** segments (`arcToCubicSegments` in `path-d.ts`), while pen would emit **native `A`**. That is fine for display, but **node-edit** and other tools that re-serialize from cubic internal form may **rewrite** user arcs (known behavior for imported paths). Communicate in UI/docs or consider preserving `A` in a parallel representation later (out of scope for this spike).

3. **Ambiguous solutions:** Mapping pointer motion to `(large-arc, sweep, rx, ry, φ)` needs deterministic rules; **jitter** near the chord line can flip solutions — thresholding and hysteresis required.

4. **Testing burden:** Acceptance calls for **`d` round-trip tests** for representative `A` cases (quarters, large arc, rotated φ, relative `a`, λ-scaled radii). Ellipse math must match SVG golden vectors.

5. **Touch / low-modifier environments:** If modifier-based flag cycling is the only disambiguation, tablet users suffer — plan for on-canvas control or long-press cycle.

---

## 6. Next steps (for `svg-editor-j24.7` — issue stays open)

1. Land / confirm **`svg-editor-j24.2`** pen model (Q/S/T) so segment types and preview patterns are stable.  
2. Finalize **one** primary interaction (recommend §3.1 + modifier from §3.2) and a **default flag** policy.  
3. Extend `PenPathSegment` + serialization + preview; wire pen tool state machine in `svg-canvas.component.ts`.  
4. Add **`path-d` / pen integration tests** for authored arcs (parse → expected geometry or stable `d` strings).  
5. Decide whether **inspector** exposes raw `A` parameters in v1 or defers to v2.

---

## 7. References

- SVG path elliptical arc: [Paths — Elliptical arc curves](https://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands)  
- In-repo implementation sketch: `arcToCubicSegments` in `src/app/models/path-d.ts`
