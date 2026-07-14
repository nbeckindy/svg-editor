/** jsdom-safe `document.elementFromPoint` for canvas pointer sampling. */
export function sampleCanvasPointerTarget(clientX: number, clientY: number): Element | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') {
    return null;
  }
  return document.elementFromPoint(clientX, clientY) as Element | null;
}
