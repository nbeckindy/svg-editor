/**
 * Pointer-intent debug sampling for the **Canvas adapter** — DOM hit-test,
 * cursor-hint line, and dev-strip snapshot publish. Lives outside the Angular
 * component; the adapter builds {@link SvgCanvasPointerIntentDebugContext} on
 * each document mousemove (see {@link refreshSvgCanvasPointerIntentDebug}).
 */
import type { EditorPointerIntentSnapshot } from '../../services/editor-pointer-intent-debug.service';
import {
  buildPointerIntentSnapshot,
  type PointerIntentDebugInput
} from './gestures/pointer-intent-debug';

/** Fields assembled on the canvas adapter; hit-test and cursor line are added here. */
export type PointerIntentDebugSampleFields = Omit<
  PointerIntentDebugInput,
  'clientX' | 'clientY' | 'hitTarget' | 'overCanvas' | 'expectedCursorLine' | 'sampledAtMs'
>;

export interface SvgCanvasPointerIntentDebugContext {
  isSamplingEnabled(): boolean;
  getCanvasViewportElement(): HTMLElement | null | undefined;
  computeExpectedCursorLine(
    clientX: number,
    clientY: number,
    hitTarget: Element | null,
    overCanvas: boolean
  ): string;
  getPointerIntentDebugFields(clientX: number, clientY: number): PointerIntentDebugSampleFields;
  publish(snapshot: EditorPointerIntentSnapshot): void;
}

/** Samples pointer position for the dev-strip HUD and publishes when enabled. */
export function refreshSvgCanvasPointerIntentDebug(
  ctx: SvgCanvasPointerIntentDebugContext,
  clientX: number,
  clientY: number
): void {
  if (!ctx.isSamplingEnabled()) return;

  const vpEl = ctx.getCanvasViewportElement();
  const hitTarget =
    typeof document !== 'undefined' && typeof document.elementFromPoint === 'function'
      ? (document.elementFromPoint(clientX, clientY) as Element | null)
      : null;
  const overCanvas = !!(hitTarget && vpEl && typeof vpEl.contains === 'function' && vpEl.contains(hitTarget));

  ctx.publish(
    buildPointerIntentSnapshot({
      ...ctx.getPointerIntentDebugFields(clientX, clientY),
      clientX,
      clientY,
      hitTarget,
      overCanvas,
      expectedCursorLine: ctx.computeExpectedCursorLine(clientX, clientY, hitTarget, overCanvas),
      sampledAtMs: typeof performance !== 'undefined' ? performance.now() : Date.now()
    })
  );
}
