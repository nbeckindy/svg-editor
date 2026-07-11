/** Context for per-tool idle / hover cursor hints (gesture-in-progress stays on the canvas). */
export interface CanvasCursorHintContext {
  clientX: number;
  clientY: number;
  hitTarget: Element | null;
  overCanvas: boolean;
  viewportInlineCursor?: string;
  altKeyPressed: boolean;
  isPanning: boolean;
  isCreationToolActive: boolean;
  penInsertCopyCursorWouldApply: boolean;
}

export function expectedCursorForResizeHandle(h: string): string {
  switch (h) {
    case 'nw':
      return 'nw-resize';
    case 'ne':
      return 'ne-resize';
    case 'sw':
      return 'sw-resize';
    case 'se':
      return 'se-resize';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    default:
      return 'default';
  }
}

export function expectedCursorForSkewEdge(e: string): string {
  if (e === 'n' || e === 's') return 'ew-resize';
  if (e === 'e' || e === 'w') return 'ns-resize';
  return 'default';
}

export function selectorCursorHintFromHitTarget(hitTarget: Element): string | null {
  const rh = hitTarget.closest?.('[data-resize-handle]')?.getAttribute('data-resize-handle');
  if (rh) {
    const c = expectedCursorForResizeHandle(rh);
    return `Expected cursor: ${c} (selection resize .selection-resize-${rh})`;
  }
  const sk = hitTarget.closest?.('[data-skew-handle]')?.getAttribute('data-skew-handle');
  if (sk === 'n' || sk === 's' || sk === 'e' || sk === 'w') {
    const c = expectedCursorForSkewEdge(sk);
    return `Expected cursor: ${c} (selection skew .selection-skew-${sk})`;
  }
  if (hitTarget.closest?.('[data-rotate-handle]')) {
    return 'Expected cursor: grab (selection rotate; .selection-rotate-handle)';
  }
  return null;
}

/** Gesture-in-progress cursor hints — idle/hover policy stays on per-tool `getCursorHint`. */
export interface GestureCursorHintState {
  pathNodeDragActive: boolean;
  creationActive: boolean;
  isDraggingShape: boolean;
  isResizingSelection: boolean;
  isSkewingSelection: boolean;
  isRotatingSelection: boolean;
  isPanning: boolean;
  currentTool: string;
  isPenInsertOnPathDragActive: boolean;
}

export function cursorHintForGestureInProgress(state: GestureCursorHintState): string | null {
  if (state.pathNodeDragActive) {
    return 'Expected cursor: move (path node drag in progress)';
  }
  if (state.creationActive) {
    return 'Expected cursor: crosshair (creation in progress)';
  }
  if (state.isDraggingShape) {
    return 'Expected cursor: move (shape drag in progress)';
  }
  if (state.isResizingSelection) {
    return 'Expected cursor: (resize — axis from active handle; .selection-resize-*)';
  }
  if (state.isSkewingSelection) {
    return 'Expected cursor: (skew — .selection-skew-*)';
  }
  if (state.isPanning && state.currentTool === 'pan') {
    return 'Expected cursor: grabbing (.canvas-container.pan-dragging)';
  }
  if (state.isRotatingSelection && typeof document !== 'undefined') {
    const bodyCursor = document.body.style.cursor?.trim();
    if (bodyCursor) return `Expected cursor: ${bodyCursor} (rotate gesture on document.body)`;
  }
  if (state.isPenInsertOnPathDragActive) {
    return 'Expected cursor: copy (pen insert-on-path drag; #canvasViewport inline)';
  }
  return null;
}

export function cursorHintForPathNodeEditHover(
  hitTarget: Element | null,
  overCanvas: boolean,
  hasPathNodeEditState: boolean
): string | null {
  if (!overCanvas || !hitTarget || !hasPathNodeEditState) return null;
  if (hitTarget.closest?.('[data-path-node-anchor-index]')) {
    return 'Expected cursor: move (path node anchor; .path-node-anchor)';
  }
  if (hitTarget.closest?.('[data-path-node-handle-index]')) {
    return 'Expected cursor: move (path control handle; .path-node-control-handle)';
  }
  return null;
}
