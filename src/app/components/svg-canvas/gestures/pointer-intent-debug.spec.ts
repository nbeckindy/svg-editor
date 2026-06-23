import { describe, it, expect } from 'vitest';
import { buildPointerIntentSnapshot } from './pointer-intent-debug';
import type { ToolDescriptor } from '../../../tools/tool-descriptor';

const selectorDescriptor: ToolDescriptor = {
  id: 'selector',
  label: 'Selector',
  title: 'Selector',
  icon: 'selector',
  stripTestId: 'tool-selector',
  ariaLabel: 'Selector',
  stripGroup: 'selection-view',
  stripGroupLabel: 'Selection',
  order: 0,
  interactionKind: 'edit',
  selectorInteraction: true
};

function baseInput(over: Partial<Parameters<typeof buildPointerIntentSnapshot>[0]> = {}) {
  return {
    tool: 'selector' as const,
    clientX: 10,
    clientY: 20,
    hitTarget: null,
    overCanvas: true,
    expectedCursorLine: 'Expected cursor: default',
    sampledAtMs: 100,
    isCreationInProgress: false,
    pathNodeDragPathId: null,
    isPenInsertOnPathDragActive: false,
    isPenSessionActive: false,
    isSelectionMarquee: false,
    isZoomMarquee: false,
    isResizingSelection: false,
    isSkewingSelection: false,
    isRotatingSelection: false,
    isPanning: false,
    isDraggingShape: false,
    isCanvasReady: true,
    getDescriptor: () => selectorDescriptor,
    hasRegisteredTool: () => true,
    ...over
  };
}

describe('buildPointerIntentSnapshot', () => {
  it('reports active selection marquee over idle tool routing', () => {
    const snap = buildPointerIntentSnapshot(baseInput({ isSelectionMarquee: true }));
    expect(snap.primaryLine).toBe('Selection marquee drag');
  });

  it('uses registry label for idle canvas primary-mousedown prediction', () => {
    const snap = buildPointerIntentSnapshot(baseInput());
    expect(snap.primaryLine).toBe('Selector: primary mousedown → registered tool handler');
    expect(snap.detailLines).toContain('label=Selector');
    expect(snap.detailLines.some((l) => l.includes('CanvasTool.onPointerDown'))).toBe(true);
  });

  it('reports pointer outside canvas without per-target selector logic', () => {
    const snap = buildPointerIntentSnapshot(baseInput({ overCanvas: false }));
    expect(snap.primaryLine).toBe('Selector: pointer not on canvas');
  });
});
