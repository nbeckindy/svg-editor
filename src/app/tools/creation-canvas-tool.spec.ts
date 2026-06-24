import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { CreationGesture } from '../components/svg-canvas/gestures/creation-gesture';
import type { GestureRuntimeContext } from '../components/svg-canvas/gestures/gesture-context';
import { createCreationCanvasTool, registerCreationCanvasTools } from './creation-canvas-tool';
import { ToolRegistryService } from './tool-registry.service';

function makeRuntime(): GestureRuntimeContext {
  return {
    pointer: {
      cdr: { detectChanges: vi.fn() } as unknown as ChangeDetectorRef,
      clientToEditorSvgPoint: () => ({ x: 10, y: 20 }),
      svgBboxToOverlayPixels: (bbox: { x: number; y: number; width: number; height: number }) => bbox,
      invalidateHighlightCache: vi.fn(),
      setLastBbox: vi.fn(),
      highlightOverlayContainer: vi.fn()
    },
    doc: {
      svgManipulation: {
        getSVGInstance: () => ({})
      },
      shapeSelection: {},
      editorHistory: {}
    },
    transformDoc: {} as GestureRuntimeContext['transformDoc'],
    snap: {
      snap: { snapToGrid: (p: { x: number; y: number }) => p, shapeEnabled: () => false },
      getSmartGuideCandidates: () => [],
      isSnapTemporarilyDisabled: () => false
    }
  } as unknown as GestureRuntimeContext;
}

describe('createCreationCanvasTool', () => {
  let creation: CreationGesture;
  let runtime: GestureRuntimeContext;

  beforeEach(() => {
    creation = new CreationGesture();
    runtime = makeRuntime();
    vi.spyOn(creation, 'start').mockReturnValue(true);
    vi.spyOn(creation, 'move');
    vi.spyOn(creation, 'end');
    vi.spyOn(creation, 'abort');
  });

  it('starts creation on pointer down when canvas is ready', () => {
    const tool = createCreationCanvasTool('rect', creation, () => runtime, () => true);
    const event = { clientX: 1, clientY: 2, shiftKey: false } as MouseEvent;
    expect(tool.onPointerDown!(event, { x: 10, y: 20 })).toBe(true);
    expect(creation.start).toHaveBeenCalledWith(runtime, 'rect', event);
  });

  it('returns false on pointer down when canvas is not ready', () => {
    const tool = createCreationCanvasTool('ellipse', creation, () => runtime, () => false);
    expect(tool.onPointerDown!({ clientX: 0, clientY: 0 } as MouseEvent, { x: 0, y: 0 })).toBe(false);
    expect(creation.start).not.toHaveBeenCalled();
  });

  it('routes move and up to CreationGesture', () => {
    const tool = createCreationCanvasTool('line', creation, () => runtime, () => true);
    const move = { clientX: 3, clientY: 4, shiftKey: true } as MouseEvent;
    const up = { clientX: 5, clientY: 6, shiftKey: false } as MouseEvent;
    tool.onPointerMove!(move, { x: 0, y: 0 });
    tool.onPointerUp!(up, { x: 0, y: 0 });
    expect(creation.move).toHaveBeenCalledWith(runtime, 3, 4, true);
    expect(creation.end).toHaveBeenCalledWith(runtime, 5, 6, false);
  });

  it('aborts in-progress creation on deactivate', () => {
    const tool = createCreationCanvasTool('rect', creation, () => runtime, () => true);
    tool.onDeactivate?.();
    expect(creation.abort).toHaveBeenCalled();
  });
});

describe('registerCreationCanvasTools', () => {
  it('registers rect, ellipse, and line tools', () => {
    const registry = new ToolRegistryService();
    const creation = new CreationGesture();
    registerCreationCanvasTools(registry, creation, makeRuntime, () => true);
    expect(registry.has('rect')).toBe(true);
    expect(registry.has('ellipse')).toBe(true);
    expect(registry.has('line')).toBe(true);
  });
});
