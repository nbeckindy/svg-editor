import type { PenInsertOnPathEvaluateResult } from './pen-tool-session/pen-tool-session-insert-on-path';
import type { PenToolSessionPorts } from './pen-tool-session/pen-tool-session-ports';

export type PenPrimaryMouseDownIntentHost = {
  readonly ports: Pick<
    PenToolSessionPorts,
    'isCanvasReady' | 'isEditorContentShapeTarget'
  >;
  isPenInsertOnPathDragActive(): boolean;
  getInsertOnPathPathId(): string | null;
  isPenSessionActive(): boolean;
  hasPendingSegment(): boolean;
  segmentCount(): number;
  wouldPickUpOpenPathContinuationAt(clientX: number, clientY: number): boolean;
  evaluateInsertOnPathAt(penTarget: Element, clientX: number, clientY: number): PenInsertOnPathEvaluateResult;
  hasOutgoingHandleAtTip(): boolean;
};

/** Debug HUD: predict primary mousedown outcome while **Pen** is active. */
export function describePenPrimaryMouseDownIntent(
  host: PenPrimaryMouseDownIntentHost,
  penTarget: Element | null,
  clientX: number,
  clientY: number,
  getSnappedPenPoint: (clientX: number, clientY: number, suspendSnap: boolean) => { x: number; y: number } | null
): { headline: string; details: string[] } {
  const details: string[] = [];
  if (host.isPenInsertOnPathDragActive()) {
    const pathId = host.getInsertOnPathPathId();
    details.push(`pathId=${pathId}`, 'mousemove updates preview; mouseup commits or cancels');
    return { headline: 'Pen: insert-on-path drag in progress', details };
  }
  if (!host.ports.isCanvasReady()) {
    return { headline: 'Pen: canvas not ready (no SVG / view)', details };
  }
  const outgoingKnob = penTarget?.closest?.('[data-pen-outgoing-handle]');
  if (outgoingKnob && host.isPenSessionActive() && !host.hasPendingSegment()) {
    if (host.hasOutgoingHandleAtTip()) {
      return { headline: 'Pen: drag last outgoing handle', details: ['Hit: pen outgoing handle knob'] };
    }
  }
  if (penTarget && host.ports.isEditorContentShapeTarget(penTarget)) {
    if (host.segmentCount() === 0 && !host.hasPendingSegment()) {
      if (host.wouldPickUpOpenPathContinuationAt(clientX, clientY)) {
        return { headline: 'Pen: continue open path at endpoint', details: ['Hit: open path head/tail'] };
      }
      const ins = host.evaluateInsertOnPathAt(penTarget, clientX, clientY);
      if (ins.ok) {
        details.push(`pathId=${ins.pathId}`, 'mousedown starts insert-drag; mouseup commits');
        return { headline: 'Pen: insert anchor on existing path', details };
      }
      details.push(`insert skipped: ${ins.reason}`);
    } else {
      details.push(
        `segments=${host.segmentCount()} pendingSegment=${host.hasPendingSegment() ? 'yes' : 'no'}`,
        'insert-on-path disabled while session active'
      );
    }
  }
  const pt = getSnappedPenPoint(clientX, clientY, false);
  if (!pt) {
    return { headline: 'Pen: snap/grid produced no SVG point', details };
  }
  details.push(`svg (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`);
  return {
    headline: 'Pen: new stroke / pickup / continue (handlePenCanvasMouseDown)',
    details
  };
}
