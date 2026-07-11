# Spike: Boolean operations with primitive operands (BO-8)

**Epic:** [Boolean path operations](../epics/boolean-path-operations.md) (`svg-editor-0zh`)  
**Bead:** `svg-editor-0zh.8`  
**Date:** 2026-06-27

---

## 1. Goal

Decide how `<rect>`, `<circle>`, and `<ellipse>` participate in **path boolean operations** (union / subtract / intersect) without reopening core geometry or SVG output decisions from [BO-1](./boolean-path-operations.md).

**Out of scope:** permanent **Outline to path** per shape (`svg-editor-0zh.15`); curve-preserving boolean output (`svg-editor-0zh.12`).

---

## 2. Reuse from compound path (BO-13 / BO-14)

| Concern | Existing module | Notes |
|--------|-----------------|-------|
| Element-local geometry | [`primitive-to-path.ts`](../../src/app/models/primitive-to-path.ts) | `rectToClosedSubpath`, `ellipseToClosedSubpath`, `primitiveElementToClosedSubpath` |
| Operand dispatch | [`path-boolean.ts`](../../src/app/models/path-boolean.ts) `shapeLocalClosedSubpaths` | Paths via `parsePathDForNodeEditing`; primitives via `primitiveElementToClosedSubpath` |
| Transform to root user | `PathBooleanGeometryPort.mapPathLocalToRootUser` | Works for any shape id (not path-only) |
| Flatten for martinez | `flattenSubpathToRing` + `BOOLEAN_FLATTEN_TOLERANCE` (0.25) | Subdivides C/Q segments adaptively |
| Result serialization | `ringsToPathD` → M/L/Z only | Same as path-only booleans |
| Apply / undo | `BooleanPathCommand` | Operands removed; one `<path>` inserted at topmost index |
| Selection eligibility | `isCompoundOperandType` | `path`, `rect`, `circle`, `ellipse` |

**Recommendation:** Reuse the compound operand pipeline for sampling; diverge only at the martinez clip step (booleans) vs subpath concatenation (compound).

---

## 3. Conversion strategy

| Question | Decision |
|----------|----------|
| Transient vs destructive sampling? | **Transient** — sample geometry for martinez input only; operands are removed on Apply (same as path booleans). No separate Outline to path step. |
| Coordinate space | **Element-local `d` sampling → map to root user for clip → result `d` in root user** (identity transform on result path). Matches BO-1 path pipeline. |
| Rounded rect (`rx`/`ry`) | Four corner cubics via κ approximation in `rectToClosedSubpath`; flatten tolerance 0.25. |
| Circle / ellipse | Four cubics via `ellipseToClosedSubpath`; same flatten tolerance. |
| Mixed selections | Allowed (e.g. rect + path, circle + rect). Stack order for subtract/intersect unchanged (document order, front = topmost). |

---

## 4. Code touchpoints

| File | Change |
|------|--------|
| `path-boolean.ts` | `evaluatePathBooleanSelection` accepts primitives; `operandToGeometry` uses `shapeLocalClosedSubpaths`; sort via `sortCompoundOperandIdsByDocumentOrder` |
| `path-boolean-geometry.service.ts` | Validate operands with `shapeLocalClosedSubpaths`; style from `getCompoundOperandElement` |
| `chrome-editor-path-ops-apply.service.ts` | Boolean apply uses compound operand element lookup |
| `boolean-path-panel/*` | Eligibility + copy for mixed selections |
| `e2e/path-boolean-operations.spec.ts` | Rect/circle boolean flows |

**Not changed:** `PathBooleanGeometryPort` interface (already has `getCompoundOperandElement`).

---

## 5. Tolerance targets

| Source | Approximation | Acceptable error |
|--------|---------------|------------------|
| Circle/ellipse cubics | κ = 0.5522847498 | ≤ `BOOLEAN_FLATTEN_TOLERANCE` (0.25 user units) at clip boundary |
| Rounded rect corners | Same κ corners | Same |
| Path C/Q segments | Adaptive flatten | Same |

Visual parity with Illustrator is not required at this tolerance; E2E asserts valid `<path>` output and undo restoration.

---

## 6. Implementation order

1. **BO-9** — Rect operands (validates shared helper for one primitive type)
2. **BO-10** — Circle / ellipse (parallel once BO-9 lands; same `operandToGeometry`)
3. **BO-11** — Panel copy + Playwright

---

## 7. Non-goals (unchanged from BO-1)

- Bézier-preserving boolean output (see BO-12)
- `<line>`, `<polyline>`, `<polygon>`, `<text>`, groups as operands
- User-facing Outline to path command (see `svg-editor-0zh.15`)
