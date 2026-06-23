import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanvasBoundToolRegistrar } from './canvas-bound-tool-registrar.service';
import { CreationGesture } from '../components/svg-canvas/gestures/creation-gesture';
import { ToolRegistryService } from './tool-registry.service';
import type { GestureRuntimeContext } from '../components/svg-canvas/gestures/gesture-context';

const emptyRt = {
  pointer: {} as GestureRuntimeContext['pointer'],
  doc: {} as GestureRuntimeContext['doc'],
  transformDoc: {} as GestureRuntimeContext['transformDoc'],
  snap: {} as GestureRuntimeContext['snap']
};

describe('CanvasBoundToolRegistrar', () => {
  let registry: ToolRegistryService;
  let registrar: CanvasBoundToolRegistrar;
  let creation: CreationGesture;

  beforeEach(() => {
    registry = new ToolRegistryService();
    registrar = new CanvasBoundToolRegistrar(registry);
    creation = new CreationGesture();
  });

  it('registers creation tools once when bound', () => {
    registrar.registerCreationTools(creation, () => emptyRt, () => true);
    expect(registry.has('rect')).toBe(true);
    expect(registry.has('ellipse')).toBe(true);
    expect(registry.has('line')).toBe(true);

    registrar.registerCreationTools(creation, () => emptyRt, () => true);
    expect(registry.get('rect')).toBeDefined();
  });

  it('attach can re-target a different registry instance', () => {
    const otherRegistry = new ToolRegistryService();
    registrar.attach(otherRegistry);
    registrar.registerCreationTools(creation, () => emptyRt, () => true);
    expect(otherRegistry.has('rect')).toBe(true);
    expect(registry.has('rect')).toBe(false);
  });

  it('creation adapter onPointerMove delegates to CreationGesture.move', () => {
    vi.spyOn(creation, 'move');
    registrar.registerCreationTools(creation, () => emptyRt, () => true);
    const tool = registry.get('rect');
    tool?.onPointerMove?.({ clientX: 4, clientY: 5, shiftKey: true } as MouseEvent, { x: 0, y: 0 });
    expect(creation.move).toHaveBeenCalledWith(emptyRt, 4, 5, true);
  });

  it('registers pen tool once when bound', () => {
    registrar.registerPenTool(() => ({
      getPenTool: () => ({}) as never,
      getSnappedPenPoint: (x, y) => ({ x, y }),
      hasPathNodeEditState: () => false,
      tryStartPathNodeDrag: () => false,
      isCanvasReady: () => true,
      scheduleInsertHoverCursorHitTest: vi.fn()
    }));
    expect(registry.has('pen')).toBe(true);

    registrar.registerPenTool(() => ({
      getPenTool: () => ({}) as never,
      getSnappedPenPoint: (x, y) => ({ x, y }),
      hasPathNodeEditState: () => false,
      tryStartPathNodeDrag: () => false,
      isCanvasReady: () => true,
      scheduleInsertHoverCursorHitTest: vi.fn()
    }));
    expect(registry.get('pen')).toBeDefined();
  });
});
