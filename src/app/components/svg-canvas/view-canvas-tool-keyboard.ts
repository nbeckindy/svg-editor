/** View-tool keyboard actions (zoom / fit) implemented by the canvas adapter. */
export interface ViewKeyboardActionsPort {
  zoomInAtViewportCenter(): void;
  zoomOutAtViewportCenter(): void;
  resetZoomAndRefreshOverlay(): void;
  fitArtboardToViewport(): void;
  fitContentToViewport(): void;
}

/** Returns true when the key was consumed by view shortcuts. */
export function tryHandleViewKeyDown(actions: ViewKeyboardActionsPort, event: KeyboardEvent): boolean {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return false;

  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') {
    actions.zoomInAtViewportCenter();
    return true;
  }

  if (event.key === '-' || event.code === 'NumpadSubtract') {
    actions.zoomOutAtViewportCenter();
    return true;
  }

  if (event.key === '0') {
    actions.resetZoomAndRefreshOverlay();
    return true;
  }

  if (event.key === '1') {
    actions.fitArtboardToViewport();
    return true;
  }

  if (event.key === '2') {
    actions.fitContentToViewport();
    return true;
  }

  return false;
}
