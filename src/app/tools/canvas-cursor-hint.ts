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
