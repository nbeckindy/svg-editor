import type { GestureRuntimeContext } from './gesture-context';

/** True if any of `shapeIds` sits under a **Layer lock** (`data-editor-locked` on self or ancestor). */
export function isGestureSelectionLocked(ctx: GestureRuntimeContext, shapeIds: string[]): boolean {
  return shapeIds.some((id) => ctx.transformDoc.isElementOrAncestorLocked(id));
}
