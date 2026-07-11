/**
 * Click orchestration for the **Canvas adapter** — inline-text commit, gesture
 * `consumeJustEnded` guards, path-node exit, then registry `onClick` dispatch.
 */
export interface SvgCanvasClickContext {
  commitInlineTextEditIfNotTarget: (clickTarget: Element) => void;
  consumePathNodeDragJustEnded: () => boolean;
  consumeDragJustEnded: () => boolean;
  consumeResizeJustEnded: () => boolean;
  consumeSkewJustEnded: () => boolean;
  consumeRotateJustEnded: () => boolean;
  consumeCreationJustEnded: () => boolean;
  maybeExitPathNodeEditOnClick: (clickTarget: Element) => void;
  dispatchRegisteredClick: (event: MouseEvent) => boolean;
}

/** Handles canvas `click` before and through tool registry dispatch. */
export function handleSvgCanvasClick(ctx: SvgCanvasClickContext, event: MouseEvent): void {
  const clickTarget = event.target as Element;
  ctx.commitInlineTextEditIfNotTarget(clickTarget);
  if (ctx.consumePathNodeDragJustEnded()) return;
  if (ctx.consumeDragJustEnded()) return;
  if (ctx.consumeResizeJustEnded()) return;
  if (ctx.consumeSkewJustEnded()) return;
  if (ctx.consumeRotateJustEnded()) return;
  if (ctx.consumeCreationJustEnded()) return;
  ctx.maybeExitPathNodeEditOnClick(clickTarget);
  ctx.dispatchRegisteredClick(event);
}
