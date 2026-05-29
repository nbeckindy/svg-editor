# Plan: Pen drag-close from start — exact `M` + `Z` parity (mousedown + drag)

## Goal

Closing the path by **mousedown on the start anchor + drag** (curve preview) should match **click / no-drag close** for what users care about: a **closed** subpath (`Z`) whose **visible join** at the start is smooth and whose **final geometry** lands on the session **`M`** — no persistent "almost closed" endpoint off `M`, and no missing `Z` when the user intended to close.

Whether the **last committed** cubic already ends exactly on `M`, or **`tryFinishPenPath`** adds a **corrective** segment before **`Z`**, is partly an engineering choice — but see **Closing node policy** below: we are **not** aiming for the same **mirrored smooth `C`** model at the start anchor as on interior nodes.

## Closing node policy (start anchor)

- **No mirrored closing `C`** at the **closing / start** node in the sense used elsewhere on the chain (reflected P1 / symmetric smooth continuation from the previous segment's outgoing handle). The start anchor is **not** treated like an interior smooth join for that purpose.
- The **only** way to get a "full" smooth continuation through `M` that also **reshapes the first segment** would be to introduce an **outgoing handle on the moveto** that couples back into the first drawable segment — **we will not do this.** It would be **unexpected UX**: users do not expect the start point to sprout a handle that silently changes the first leg of the path, on top of the usual implementation costs (extra affordance on `M`, hidden coupling to the first curve, harder mental model, and trickier node-edit rules).

**Implications**

- **`tryFinishPenPath`** today can still append a **reflected** corrective `C` when `geometryAlreadyMeetsStart` is false and `canReflectCubic` — that matches **legacy single-click close** tests, but it conflicts with this policy for the **closing** interaction we care about here. Follow-up implementation should **stop relying on that mirrored branch** as the desired end state for drag-close (and align click-close with the same rule if product wants one model).
- Prefer **exact terminal on `M`** from `commitPenDraggedCurve` / session moveto, then **`Z`**, or at most a **non-mirrored** closing treatment (e.g. implicit straight close only), rather than a synthetic smooth mirror at `M`.

## Symptoms (from manual QA)

- Example bad `d` (user): last `C` ended at `(260, 132.5)` while `M` was `(261, 132.5)`; snippet had **no `Z`** (may be partial export or a path finished as "open" in another code path — still worth ruling out).
- Example good `d` (user): last `C` endpoint matched `M` and **`Z`** present when **not** using drag-close on the start node.

## Tests (Vitest)

1. **`pen: drag-close from start commits last cubic endpoint exactly on moveto`** (`svg-canvas.component.spec.ts`)  
   - Tightened to **`expect(ex).toBe(mx)`** / **`expect(ey).toBe(my)`** (strict numeric equality on parsed `d`), not only `toBeCloseTo`.

2. **`pen: drag-close from start (fractional viewBox) M+Z parity — two C, parsed end, tokens`**  
   - `viewBox="0 0 100.3 100.7"` + linear client map → fractional root user coords.  
   - Asserts: `d` ends with `Z`; **exactly two** `C` commands; `openD.split(/ C /).length === 3`; last `C` equals `M`; last endpoint **tokens** match `M` tokens.  
   - **Note:** If **`tryFinishPenPath`** still emits an **extra** segment before `Z` during migration, relax counts — but **do not** reframe tests around a **mirrored** third `C` as the goal; see **Closing node policy**.

3. **Repro gap (expected RED, not yet in CI)**  
   - Vitest + jsdom + `getScreenCTM = null` does not exercise **`screenPointToRootSvgUserPoint`** (see `SvgCanvasComponent.clientToEditorSvgPoint`). Real browsers may return **different** root-user points than the legacy rect/viewBox map for the **same** `clientX/Y`, which could split "where `M` was stored" vs "where mouseup / join math thinks the start is".  
   - **Next step:** add a **Playwright** (or unit test with a fake `DOMMatrix` / non-null `getScreenCTM`) repro, or temporarily mock `screenPointToRootSvgUserPoint` to diverge from legacy mapping on **mouseup only** and assert the strict tests fail — then fix.

## Root-cause hypotheses (ordered)

1. **Dual coordinate pipelines**  
   - `getSnappedPenPoint` / `clientToEditorSvgPoint` vs `screenPointToRootSvgUserPoint` when CTM exists — different results for start vs release.

2. **`tryFinishPenPath` "geometry already meets start"** (`penSvgDistanceSq` vs `1e-10`)  
   - False negative → legacy path may **`appendCubicToD`** a **reflected** segment before **`Z`** (see **Extra segment before `Z`**).  
   - False positive (unlikely) → only `Z` while last point is visibly off `M` (would violate strict `toBe`).

3. **`flushPenPendingAsCurrentPointer` before `tryFinishPenPath`**  
   - If any pending state slips through, extra `appendCubic` / `L` could run with **`end = startSvg`** instead of session `M`.

4. **`insertPathIntoContentGroup(..., { closedPath })`**  
   - `closedPath` only affects default fill today; confirm **`d`** always includes `Z` when `closePath === true` and no later command strips it.

5. **Snap / modifiers**  
   - Shift angle snap adjusts controls only; still verify **no** future snap touches the **terminal** anchor when `segmentEnd` / session moveto is authoritative.

## Extra segment before `Z` (`tryFinishPenPath`) — current code vs closing-node policy

When `closePath === true`, `tryFinishPenPath` compares **`lastCommittedVertex`** to **`firstSeg` (moveto)** with `penSvgDistanceSq(...) < 1e-10`:

- **If true (`geometryAlreadyMeetsStart`)**  
  The open `d` from `finishPath()` already ends on `M` in user space. The code only appends a closing **`Z`** to the open path string (no extra segment).

- **If false**  
  The last drawn vertex is **not** treated as coincident with `M`. Then:
  - If **`penReflectStateAfterCommitted`** says **`canReflectCubic`**, the code appends one more **`C`** via **`appendCubicToD`** using the **reflected smooth** construction (P1 from reflection, P2 and end at **`(firstSeg.x, firstSeg.y)`**), then **`Z`**. This matches legacy **single-click close** tests ("reflected P1…").
  - Otherwise it appends **`Z`** only (implicit straight segment from last point to start).

**Tension with closing-node policy**

- That **reflected** segment is the **mirrored smooth close** we are **not** pursuing at the **start / closing** node (**Closing node policy**). It is **legacy safety net** behavior in code, not the target UX for drag-close (and may be retired or gated for click-close too if we unify).

**Why `Z` alone is still acceptable under this policy**

- If the **last anchor is not exactly `M`**, `Z` closes with an implicit **straight** segment — visually kinked, but it does **not** introduce a fake smooth mirror at `M` and does **not** add a moveto **outgoing handle** that rewires the first segment (that handle pattern is rejected as unexpected UX; see **Closing node policy**). The **primary fix** is to **commit the closing segment exactly on `M`**, then **`d` + `Z`**, not to paper over drift with reflection.

**Product direction (revised)**

- **Option A (aligned with policy):** **`geometryAlreadyMeetsStart`** true after correct commit; **`d` + `Z` only**; no reflected append at close.  
- **Option B (deprecated for this policy):** keep reflected **`appendCubicToD`** as a broad safety net — **conflicts** with "no mirrored `C` at closing node"; only keep behind an explicit legacy flag if needed.  
- **Option C:** tiny gap → **rewrite** the last segment's endpoint to `firstSeg` (no extra `C`, no mirror).

The Vitest that requires **exactly two `C`** matches **Option A**; relax only for non-mirrored migration artifacts, not as endorsement of a third **reflected** cubic.

## Fix strategy (implementation order)

1. **Single source of truth for moveto**  
   - When committing a drag-close cubic, always set the terminal anchor from **`penPathStartMv()`** (or the same value written to segment `[0]`) immediately before `appendCubic` / serialization — no secondary "hit point" or CTM-only point for the end vertex.

2. **Unify pointer → root user for pen**  
   - Prefer one helper used for: initial `beginPath`, pending `startSvg`, `releaseSvg` in the close-with-curve branch, and join tests — or document why CTM vs legacy must differ and assert they **converge** for the same physical pixel on the start anchor.

3. **`tryFinishPenPath` vs closing policy**  
   - Prefer **`d` + `Z`** once the authored closing segment ends on **`M`**; **remove or gate** the **reflected** `appendCubicToD` branch for pen close-from-start (and optionally unify single-click close) so we do **not** synthesize a **mirrored** cubic at the moveto. **Do not** add a moveto **outgoing handle** that edits the first segment as a substitute — **out of scope** (unexpected UX; see **Closing node policy**).

4. **Regression**  
   - Vitest: exact **`M`**, **`Z`**, no unexpected **mirrored** third `C` at close once implementation matches policy. Playwright / matrix mock when ready.  
   - Update `plans/ux/bezier-anchor-handle-interactions.md`: closing node has **no** mirrored `C` like interior joins; **no** moveto outgoing handle that rewires the first segment (**rejected** — unexpected UX).

## References

- Original close-from-start plan: `plans/bugs/pen-close-from-start-preview-and-endpoint.md`  
- Code: `PenToolSession.commitPenPendingSegment`, `commitPenDraggedCurve`, `tryFinishPenPath`, `clientToEditorSvgPoint`, `getSnappedPenPoint`
