import { describe, expect, it, vi } from 'vitest';
import { InlineTextEditSession } from './inline-text-edit-session';
import type { InlineTextEditSessionPorts } from './inline-text-edit-session-ports';

function createPorts(overrides: Partial<InlineTextEditSessionPorts> = {}): InlineTextEditSessionPorts {
  return {
    svgManipulation: {
      getTextContent: vi.fn(() => 'Hello'),
      getShapeBBox: vi.fn(() => ({ x: 0, y: 0, width: 40, height: 16 })),
      getSVGInstance: vi.fn(() => null),
      getShapeProperties: vi.fn()
    } as unknown as InlineTextEditSessionPorts['svgManipulation'],
    shapeSelection: {
      getSelectedShapes: vi.fn(() => [{ id: 't1', type: 'text' }])
    } as unknown as InlineTextEditSessionPorts['shapeSelection'],
    editorHistory: {
      pushAndExecute: vi.fn()
    } as unknown as InlineTextEditSessionPorts['editorHistory'],
    svgBboxToOverlayPixels: (b) => ({ ...b }),
    markForCheck: vi.fn(),
    focusInlineTextEditor: vi.fn(),
    getInlineTextEditorElement: vi.fn(() => null),
    ...overrides
  };
}

describe('InlineTextEditSession', () => {
  it('does not push TextContentCommand when draft is unchanged', () => {
    const ports = createPorts();
    const session = new InlineTextEditSession(() => ports);
    session.enterInlineTextEditMode('t1');
    expect(session.commitIfActive()).toBe(true);
    expect(ports.editorHistory.pushAndExecute).not.toHaveBeenCalled();
  });

  it('pushes TextContentCommand when draft changes', () => {
    const ports = createPorts();
    const session = new InlineTextEditSession(() => ports);
    session.enterInlineTextEditMode('t1');
    session.onInput('Hello\nworld');
    expect(session.commitIfActive()).toBe(true);
    expect(ports.editorHistory.pushAndExecute).toHaveBeenCalledTimes(1);
  });

  it('grows overlay height with draft line count', () => {
    const ports = createPorts();
    const session = new InlineTextEditSession(() => ports);
    session.enterInlineTextEditMode('t1');
    const single = session.overlayHeightPx({ height: 16 });
    session.onInput('a\nb\nc');
    const multi = session.overlayHeightPx({ height: 16 });
    expect(multi).toBeGreaterThan(single);
  });

  it('mentions Enter for new lines in the editor hint', () => {
    const session = new InlineTextEditSession(() => createPorts());
    expect(session.inlineTextEditorHint).toMatch(/Enter/i);
  });
});
