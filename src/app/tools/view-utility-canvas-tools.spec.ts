import { describe, it, expect, vi } from 'vitest';
import { ZoomMarqueeGesture } from '../components/svg-canvas/gestures/zoom-marquee-gesture';
import { createZoomCanvasTool } from './zoom-canvas-tool';
import { createPanCanvasTool } from './pan-canvas-tool';
import { createTextCanvasTool } from './text-canvas-tool';
import { createEyedropperCanvasTool } from './eyedropper-canvas-tool';
import { ToolRegistryService } from './tool-registry.service';
import { registerZoomCanvasTool } from './zoom-canvas-tool';
import { registerPanCanvasTool } from './pan-canvas-tool';
import { registerTextCanvasTool } from './text-canvas-tool';
import { registerEyedropperCanvasTool } from './eyedropper-canvas-tool';
import type { EditorTool } from '../services/editor-tool.service';

const ALL_EDITOR_TOOLS: EditorTool[] = [
  'selector',
  'node-edit-selector',
  'eyedropper',
  'zoom',
  'pan',
  'rect',
  'ellipse',
  'line',
  'text',
  'pen'
];

describe('view and utility canvas tools', () => {
  it('zoom tool starts marquee on pointer down', () => {
    const zoomMarquee = new ZoomMarqueeGesture();
    vi.spyOn(zoomMarquee, 'startAt');
    const tool = createZoomCanvasTool(() => ({
      getZoomMarquee: () => zoomMarquee,
      isZoomMarquee: () => false,
      commitZoomMarquee: vi.fn(),
      isCanvasReady: () => true,
      consumeZoomMarqueeJustEnded: () => false,
      screenToSvg: () => ({ x: 1, y: 2 }),
      zoomInAt: vi.fn(),
      zoomOutAt: vi.fn(),
      refreshViewAfterZoomClick: vi.fn()
    }));
    tool.onPointerDown?.({ clientX: 4, clientY: 5 } as MouseEvent, { x: 0, y: 0 });
    expect(zoomMarquee.startAt).toHaveBeenCalledWith(4, 5);
  });

  it('pan tool begins pan session on pointer down', () => {
    const beginPanSession = vi.fn();
    const tool = createPanCanvasTool(() => ({
      beginPanSession,
      isPanning: () => false,
      applyPanDragFromEvent: vi.fn(),
      clearPanningFlag: vi.fn()
    }));
    const ev = { clientX: 1, clientY: 2 } as MouseEvent;
    tool.onPointerDown?.(ev, { x: 0, y: 0 });
    expect(beginPanSession).toHaveBeenCalledWith(ev);
  });

  it('text tool creates text on click', () => {
    const createTextAtPoint = vi.fn().mockReturnValue(undefined);
    const tool = createTextCanvasTool(() => ({
      isCanvasReady: () => true,
      updateTextToolPreviewFromClient: vi.fn(),
      createTextAtPoint,
      tryEnterTextEditAfterCreate: vi.fn(),
      destroyTextToolPreview: vi.fn()
    }));
    tool.onClick?.({ clientX: 10, clientY: 20 } as MouseEvent, { x: 0, y: 0 });
    expect(createTextAtPoint).toHaveBeenCalledWith(10, 20);
  });

  it('eyedropper tool samples on click', () => {
    const sampleAt = vi.fn();
    const tool = createEyedropperCanvasTool(() => ({
      isCanvasReady: () => true,
      sampleAt
    }));
    const ev = { clientX: 3, clientY: 4 } as MouseEvent;
    tool.onClick?.(ev, { x: 0, y: 0 });
    expect(sampleAt).toHaveBeenCalledWith(ev);
  });

  it('registers all remaining EditorTool values', () => {
    const registry = new ToolRegistryService();
    registerZoomCanvasTool(registry, () => ({
      getZoomMarquee: () => new ZoomMarqueeGesture(),
      isZoomMarquee: () => false,
      commitZoomMarquee: vi.fn(),
      isCanvasReady: () => true,
      consumeZoomMarqueeJustEnded: () => false,
      screenToSvg: () => null,
      zoomInAt: vi.fn(),
      zoomOutAt: vi.fn(),
      refreshViewAfterZoomClick: vi.fn()
    }));
    registerPanCanvasTool(registry, () => ({
      beginPanSession: vi.fn(),
      isPanning: () => false,
      applyPanDragFromEvent: vi.fn(),
      clearPanningFlag: vi.fn()
    }));
    registerTextCanvasTool(registry, () => ({
      isCanvasReady: () => true,
      updateTextToolPreviewFromClient: vi.fn(),
      createTextAtPoint: vi.fn().mockReturnValue(undefined),
      tryEnterTextEditAfterCreate: vi.fn(),
      destroyTextToolPreview: vi.fn()
    }));
    registerEyedropperCanvasTool(registry, () => ({
      isCanvasReady: () => true,
      sampleAt: vi.fn()
    }));
    for (const toolId of ['zoom', 'pan', 'text', 'eyedropper'] as const) {
      expect(registry.has(toolId)).toBe(true);
    }
    expect(ALL_EDITOR_TOOLS.length).toBe(10);
  });
});
