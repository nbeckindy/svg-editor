import { describe, expect, it } from 'vitest';
import {
  combinePrependContinuationForClose,
  findPenOpenPathEndpointHoverAtClient,
  findPenOpenPathPickupAtEvent,
  penClientPxWithinJoinToleranceVsSvgPoint,
  penSessionCloseTargetMv,
  penSvgUserPointToApproxClient,
  type PenContinuingPathRewrite
} from './pen-tool-session-path-continuation';
import { penPathSegmentsToD } from '../../../models/pen-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';

const OPEN_D = 'M 10 10 L 50 40';

function makePorts(): PenToolSessionPorts {
  const mainSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mainSvg.setAttribute('viewBox', '0 0 100 100');
  mainSvg.setAttribute('width', '100');
  mainSvg.setAttribute('height', '100');
  document.body.appendChild(mainSvg);
  const rect = { left: 0, top: 0, width: 100, height: 100 };
  mainSvg.getBoundingClientRect = () => rect as DOMRect;

  return {
    svgManipulation: {
      getSVGInstance: () => ({
        findOne: () => ({ node: { getAttribute: () => OPEN_D } })
      }),
      getLayerStackItems: () => [{ id: 'open-a', type: 'path' as const }]
    } as PenToolSessionPorts['svgManipulation'],
    shapeSelection: {} as PenToolSessionPorts['shapeSelection'],
    editorHistory: { pushAndExecute: () => {} } as PenToolSessionPorts['editorHistory'],
    getCurrentTool: () => 'pen',
    getMainSvgElement: () => mainSvg,
    parseOverlayViewBox: () => ({ vbMinX: 0, vbMinY: 0, vbW: 100, vbH: 100 }),
    markForCheck: () => {},
    setTool: () => {},
    setLastBbox: () => {},
    clearHighlightRectCache: () => {},
    clearPenPostInsertAnchorOverlay: () => {},
    clearSelectionForPenBackgroundStroke: () => {},
    isCanvasReadyForPenInput: () => true,
    isEditorContentShapeTarget: () => false,
    clientToEditorSvgPoint: () => null,
    isPenAltCurveMode: () => false,
    setPenAltCurveMode: () => {},
    confirmDiscardInProgressPath: () => true,
    armPenClosePostNodeEditEmptyClickSelectionGuard: () => {}
  };
}

function clientAtUser(ports: PenToolSessionPorts, x: number, y: number): { x: number; y: number } {
  const c = penSvgUserPointToApproxClient(ports, x, y);
  if (!c) throw new Error('mapping failed');
  return c;
}

describe('pen-tool-session-path-continuation', () => {
  it('pickup at tail continues append stitch', () => {
    const ports = makePorts();
    const tail = clientAtUser(ports, 50, 40);
    const hit = findPenOpenPathPickupAtEvent(ports, { clientX: tail.x, clientY: tail.y });
    expect(hit?.pathId).toBe('open-a');
    expect(hit?.stitch).toBe('appendToExistingTail');
    expect(hit?.endpoint).toEqual({ x: 50, y: 40 });
  });

  it('pickup at head continues prepend stitch', () => {
    const ports = makePorts();
    const head = clientAtUser(ports, 10, 10);
    const hit = findPenOpenPathPickupAtEvent(ports, { clientX: head.x, clientY: head.y });
    expect(hit?.pathId).toBe('open-a');
    expect(hit?.stitch).toBe('prependBeforeExisting');
    expect(hit?.endpoint).toEqual({ x: 10, y: 10 });
  });

  it('hover hit-test matches pickup endpoints', () => {
    const ports = makePorts();
    const head = clientAtUser(ports, 10, 10);
    const hover = findPenOpenPathEndpointHoverAtClient(ports, head.x, head.y);
    expect(hover?.role).toBe('head');

    const tail = clientAtUser(ports, 50, 40);
    const hoverTail = findPenOpenPathEndpointHoverAtClient(ports, tail.x, tail.y);
    expect(hoverTail?.role).toBe('tail');
  });

  it('penSessionCloseTargetMv uses frozen-path tail when prepending from head', () => {
    const rewrite: PenContinuingPathRewrite = {
      pathId: 'p',
      originalD: 'M 10 10 L 50 40',
      stitch: 'prependBeforeExisting',
      existingSegments: [
        { type: 'M', x: 10, y: 10 },
        { type: 'L', x: 50, y: 40 }
      ]
    };
    const target = penSessionCloseTargetMv(rewrite, [{ type: 'M', x: 10, y: 10 }]);
    expect(target).toEqual({ x: 50, y: 40 });
  });

  it('penSessionCloseTargetMv falls back to session M', () => {
    const target = penSessionCloseTargetMv(null, [
      { type: 'M', x: 1, y: 2 },
      { type: 'L', x: 3, y: 4 }
    ]);
    expect(target).toEqual({ x: 1, y: 2 });
  });

  it('combinePrependContinuationForClose: M-only close reuses existing open path', () => {
    const existing = [
      { type: 'M', x: 294.5, y: 105.609375 },
      { type: 'L', x: 264.5, y: 213.609375 },
      { type: 'L', x: 367.5, y: 285.609375 },
      { type: 'L', x: 502.5, y: 109.609375 }
    ] as const;
    const merged = combinePrependContinuationForClose([{ type: 'M', x: 294.5, y: 105.609375 }], existing);
    expect(penPathSegmentsToD(merged!)).toBe(penPathSegmentsToD(existing));
  });

  it('combinePrependContinuationForClose: new head extension closes after original path to tail', () => {
    const existing = [
      { type: 'M', x: 280, y: 312.609375 },
      { type: 'L', x: 372, y: 195.609375 },
      { type: 'L', x: 460, y: 341.609375 }
    ] as const;
    const newStroke = [
      { type: 'M', x: 280, y: 312.609375 },
      { type: 'L', x: 409, y: 400.609375 }
    ] as const;
    const merged = combinePrependContinuationForClose(newStroke, existing);
    expect(penPathSegmentsToD(merged!)).toBe(
      'M 280 312.609375 L 372 195.609375 L 460 341.609375 L 409 400.609375'
    );
  });

  it('combinePrependContinuationForClose: multiple head extensions close in reverse draw order', () => {
    const existing = [
      { type: 'M', x: 281, y: 189.609375 },
      { type: 'L', x: 413, y: 85.609375 },
      { type: 'L', x: 450, y: 233.609375 }
    ] as const;
    const newStroke = [
      { type: 'M', x: 281, y: 189.609375 },
      { type: 'L', x: 293, y: 259.609375 },
      { type: 'L', x: 369, y: 280.609375 }
    ] as const;
    const merged = combinePrependContinuationForClose(newStroke, existing);
    expect(penPathSegmentsToD(merged!)).toBe(
      'M 281 189.609375 L 413 85.609375 L 450 233.609375 L 369 280.609375 L 293 259.609375'
    );
  });

  it('combinePrependContinuationForClose: new vertex on existing interior is ignored', () => {
    const existing = [
      { type: 'M', x: 294.5, y: 105.609375 },
      { type: 'L', x: 264.5, y: 213.609375 },
      { type: 'L', x: 367.5, y: 285.609375 },
      { type: 'L', x: 502.5, y: 109.609375 }
    ] as const;
    const newStroke = [
      { type: 'M', x: 294.5, y: 105.609375 },
      { type: 'L', x: 264.5, y: 213.609375 }
    ] as const;
    const merged = combinePrependContinuationForClose(newStroke, existing);
    expect(penPathSegmentsToD(merged!)).toBe(penPathSegmentsToD(existing));
  });

  it('combinePrependContinuationForClose: stroke retracing to tail adds no extra vertices', () => {
    const existing = [
      { type: 'M', x: 294.5, y: 105.609375 },
      { type: 'L', x: 264.5, y: 213.609375 },
      { type: 'L', x: 367.5, y: 285.609375 },
      { type: 'L', x: 502.5, y: 109.609375 }
    ] as const;
    const newStroke = [
      { type: 'M', x: 294.5, y: 105.609375 },
      { type: 'L', x: 264.5, y: 213.609375 },
      { type: 'L', x: 367.5, y: 285.609375 },
      { type: 'L', x: 502.5, y: 109.609375 }
    ] as const;
    const merged = combinePrependContinuationForClose(newStroke, existing);
    expect(penPathSegmentsToD(merged!)).toBe(penPathSegmentsToD(existing));
  });
});
