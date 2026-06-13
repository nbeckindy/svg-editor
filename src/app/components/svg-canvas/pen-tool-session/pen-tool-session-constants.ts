/** Toast duration when the user tries to finish a path with too few points. */
export const PEN_FINISH_FEEDBACK_DURATION_MS = 1200;

/** Single-click close / join hit test radius in viewport pixels. */
export const PEN_SINGLE_CLICK_CLOSE_RADIUS_PX = 8;

/**
 * Close-from-start: mousedown is on a small hit target (~{@link PEN_SINGLE_CLICK_CLOSE_RADIUS_PX} px).
 * The global marquee minimum drag constant is intentionally not lowered globally; this threshold
 * applies only when **Pen authoring session** pending start is near path moveto (see
 * `plans/bugs/pen-close-from-start-preview-and-endpoint.md`).
 */
export const PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SCREEN_PX = 2;

export const PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SVG_DRAG_SQ = 1e-6;

/**
 * Curve-preview close-from-start: if the release sample is within this squared distance of the moveto
 * in editor SVG space, treat it as a collapsed click and mirror the opening explicit `C` **P1**
 * through `M` for the closing segment (same as no-preview close).
 */
export const PEN_CLOSE_CURVE_PREVIEW_RELEASE_NEAR_MOVETO_MAX_SQ = 12 * 12;

/** When finishing closed paths: absorb CTM / float mismatch vs session `M` without a mirrored closing `C`. */
export const PEN_CLOSE_MOVETO_REWRITE_MAX_SQ = 1e-8;
