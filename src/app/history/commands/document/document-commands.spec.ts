import { Matrix } from '@svgdotjs/svg.js';
import { BASE_DRAWING_STYLE_DEFAULTS, type DrawingStyleDefaults } from '../../../models/drawing-style-defaults';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { DrawingStyleDefaultsWritePort } from '../../drawing-style-defaults.port';
import { mockSvc, makeMockSvgElement } from '../command-test-helpers';
import {
  RemoveShapesCommand,
  AddShapeCommand,
  AddPathCommand,
  AddImageCommand,
  PasteCommand,
  DuplicateCommand,
} from '../../../models/editor-commands';

describe('RemoveShapesCommand', () => {
  function buildContentGroup(childIds: string[]) {
    const contentGroup = document.createElement('div');
    contentGroup.setAttribute('data-editor-content-group', '');
    const elements = new Map<string, { node: Element; outerHTML: string }>();
    for (const id of childIds) {
      const el = document.createElement('div');
      el.id = id;
      el.textContent = `content-${id}`;
      contentGroup.appendChild(el);
      elements.set(id, { node: el, outerHTML: el.outerHTML });
    }
    return { contentGroup, elements };
  }

  it('should call removeShapes on execute', () => {
    const { contentGroup, elements } = buildContentGroup(['s1', 's2']);
    const findOne = vi.fn((sel: string) => {
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      const id = sel.replace('#', '');
      const el = elements.get(id);
      return el ? { node: el.node } : undefined;
    });
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const cmd = new RemoveShapesCommand(svc, ['s1', 's2']);
    cmd.execute();
    expect(svc.removeShapes).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('should restore elements on undo', () => {
    const { contentGroup, elements } = buildContentGroup(['s1', 's2']);
    const findOne = vi.fn((sel: string) => {
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      const id = sel.replace('#', '');
      const el = elements.get(id);
      return el ? { node: el.node } : undefined;
    });
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      removeShapes: vi.fn(() => {
        for (const id of ['s1', 's2']) {
          const el = elements.get(id);
          if (el) el.node.remove();
        }
      }),
      restoreRemovedShapesInContentGroup: vi.fn((ids, serializedMarkup, insertionIndices) => {
        const sorted = [...ids]
          .filter((id) => serializedMarkup.has(id))
          .sort((a, b) => (insertionIndices.get(a) ?? 0) - (insertionIndices.get(b) ?? 0));
        for (const id of sorted) {
          const markup = serializedMarkup.get(id);
          if (!markup) continue;
          const idx = insertionIndices.get(id);
          const temp = document.createElement('div');
          temp.innerHTML = markup;
          const restored = temp.firstElementChild;
          if (!restored) continue;
          const ch = contentGroup.children;
          if (idx !== undefined && idx < ch.length) {
            contentGroup.insertBefore(restored, ch[idx]);
          } else {
            contentGroup.appendChild(restored);
          }
        }
      }),
    });

    const cmd = new RemoveShapesCommand(svc, ['s1', 's2']);
    cmd.execute();
    expect(contentGroup.children.length).toBe(0);

    cmd.undo();
    expect(contentGroup.children.length).toBe(2);
    expect(contentGroup.children[0].id).toBe('s1');
    expect(contentGroup.children[1].id).toBe('s2');
  });

  it('should no-op undo when svgInstance is null', () => {
    const { contentGroup, elements } = buildContentGroup(['s1']);
    const findOneForConstruction = vi.fn((sel: string) => {
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      const id = sel.replace('#', '');
      const el = elements.get(id);
      return el ? { node: el.node } : undefined;
    });
    const constructionSvg = { findOne: findOneForConstruction };
    const getSVGInstance = vi.fn()
      .mockReturnValueOnce(constructionSvg) // constructor call
      .mockReturnValue(null);               // undo call

    const svc = mockSvc({ getSVGInstance });
    const cmd = new RemoveShapesCommand(svc, ['s1']);
    expect(() => cmd.undo()).not.toThrow();
  });

  it('should have description "Remove shapes"', () => {
    const svc = mockSvc();
    expect(new RemoveShapesCommand(svc, ['s1']).description).toBe('Remove shapes');
  });
});

describe('AddShapeCommand', () => {
  function buildContentGroupForAddShape(shapeId: string) {
    const contentGroup = document.createElement('div');
    contentGroup.setAttribute('data-editor-content-group', '');
    const existing = document.createElement('div');
    existing.id = 'existing';
    contentGroup.appendChild(existing);
    const shapeNode = document.createElement('div');
    shapeNode.id = shapeId;
    shapeNode.innerHTML = 'shape-content';
    contentGroup.appendChild(shapeNode);

    return { contentGroup, shapeNode };
  }

  function buildMockSvcsForAddShape(shapeId: string) {
    const { contentGroup, shapeNode } = buildContentGroupForAddShape(shapeId);

    const mockShapeProps = { id: shapeId, type: 'rect' as const };

    const findOne = vi.fn((sel: string) => {
      if (sel === `#${shapeId}`) return { node: shapeNode };
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      return undefined;
    });

    const svc = {
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      removeShape: vi.fn(),
      insertShapeMarkup: vi.fn(),
      getShapeProperties: vi.fn().mockReturnValue(mockShapeProps),
    } as unknown as SvgManipulationService;

    const selectionSvc = {
      selectShapes: vi.fn(),
      clearSelection: vi.fn(),
    } as unknown as ShapeSelectionService;

    return { svc, selectionSvc, contentGroup, shapeNode };
  }

  it('constructor captures serialized markup and insertion index', () => {
    const { svc, selectionSvc, shapeNode } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    expect(cmd.description).toBe('Create shape');
    expect(svc.getSVGInstance).toHaveBeenCalled();
    expect(shapeNode.outerHTML).toBeTruthy();
  });

  it('first execute() is a no-op (shape already exists)', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    cmd.execute();
    expect(svc.insertShapeMarkup).not.toHaveBeenCalled();
  });

  it('undo() removes the shape via removeShape()', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    cmd.undo();
    expect(svc.removeShape).toHaveBeenCalledWith('shape-1');
  });

  it('undo() clears selection', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    cmd.undo();
    expect(selectionSvc.clearSelection).toHaveBeenCalled();
  });

  it('second execute() (redo) re-inserts the shape via insertShapeMarkup()', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    cmd.execute(); // first call — no-op
    cmd.execute(); // second call — redo
    expect(svc.insertShapeMarkup).toHaveBeenCalledTimes(1);
  });

  it('redo re-selects the shape', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    cmd.execute(); // first — no-op
    cmd.execute(); // redo
    expect(selectionSvc.selectShapes).toHaveBeenCalled();
  });

  it('round-trip: create → undo → redo → shape methods called correctly', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);

    // first execute (no-op)
    cmd.execute();
    expect(svc.insertShapeMarkup).not.toHaveBeenCalled();

    // undo
    cmd.undo();
    expect(svc.removeShape).toHaveBeenCalledWith('shape-1');
    expect(selectionSvc.clearSelection).toHaveBeenCalled();

    // redo
    cmd.execute();
    expect(svc.insertShapeMarkup).toHaveBeenCalledTimes(1);
    expect(selectionSvc.selectShapes).toHaveBeenCalled();
  });
});

describe('AddPathCommand', () => {
  function buildContentGroupForAddPath(shapeId: string) {
    const contentGroup = document.createElement('div');
    contentGroup.setAttribute('data-editor-content-group', '');
    const existing = document.createElement('div');
    existing.id = 'existing';
    contentGroup.appendChild(existing);
    const pathNode = document.createElement('div');
    pathNode.id = shapeId;
    pathNode.innerHTML = 'path-content';
    contentGroup.appendChild(pathNode);

    return { contentGroup, pathNode };
  }

  function buildMockSvcsForAddPath(shapeId: string) {
    const { contentGroup, pathNode } = buildContentGroupForAddPath(shapeId);

    const mockShapeProps = { id: shapeId, type: 'path' as const };

    const findOne = vi.fn((sel: string) => {
      if (sel === `#${shapeId}`) return { node: pathNode };
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      return undefined;
    });

    const svc = {
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      removeShape: vi.fn(),
      insertShapeMarkup: vi.fn(),
      getShapeProperties: vi.fn().mockReturnValue(mockShapeProps),
    } as unknown as SvgManipulationService;

    const selectionSvc = {
      selectShapes: vi.fn(),
      clearSelection: vi.fn(),
    } as unknown as ShapeSelectionService;

    return { svc, selectionSvc, pathNode };
  }

  it('constructor captures serialized markup and insertion index', () => {
    const { svc, selectionSvc, pathNode } = buildMockSvcsForAddPath('shape-p1');
    const cmd = new AddPathCommand(svc, 'shape-p1', selectionSvc);
    expect(cmd.description).toBe('Add path');
    expect(pathNode.outerHTML).toBeTruthy();
  });

  it('first execute() is a no-op', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddPath('shape-p1');
    const cmd = new AddPathCommand(svc, 'shape-p1', selectionSvc);
    cmd.execute();
    expect(svc.insertShapeMarkup).not.toHaveBeenCalled();
  });

  it('undo() removes path and clears selection', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddPath('shape-p1');
    const cmd = new AddPathCommand(svc, 'shape-p1', selectionSvc);
    cmd.undo();
    expect(svc.removeShape).toHaveBeenCalledWith('shape-p1');
    expect(selectionSvc.clearSelection).toHaveBeenCalled();
  });

  it('redo re-inserts and re-selects', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddPath('shape-p1');
    const cmd = new AddPathCommand(svc, 'shape-p1', selectionSvc);
    cmd.execute();
    cmd.execute();
    expect(svc.insertShapeMarkup).toHaveBeenCalledTimes(1);
    expect(selectionSvc.selectShapes).toHaveBeenCalled();
  });
});

describe('AddImageCommand', () => {
  function buildContentGroupForAddImage(shapeId: string) {
    const contentGroup = document.createElement('div');
    contentGroup.setAttribute('data-editor-content-group', '');
    const existing = document.createElement('div');
    existing.id = 'existing';
    contentGroup.appendChild(existing);
    const imageNode = document.createElement('div');
    imageNode.id = shapeId;
    imageNode.innerHTML = 'image-content';
    contentGroup.appendChild(imageNode);

    return { contentGroup, imageNode };
  }

  function buildMockSvcsForAddImage(shapeId: string) {
    const { contentGroup, imageNode } = buildContentGroupForAddImage(shapeId);

    const mockShapeProps = { id: shapeId, type: 'image' as const };

    const findOne = vi.fn((sel: string) => {
      if (sel === `#${shapeId}`) return { node: imageNode };
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      return undefined;
    });

    const svc = {
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      removeShape: vi.fn(),
      insertShapeMarkup: vi.fn(),
      getShapeProperties: vi.fn().mockReturnValue(mockShapeProps),
    } as unknown as SvgManipulationService;

    const selectionSvc = {
      selectShapes: vi.fn(),
      clearSelection: vi.fn(),
    } as unknown as ShapeSelectionService;

    return { svc, selectionSvc, imageNode };
  }

  it('constructor captures serialized markup and insertion index', () => {
    const { svc, selectionSvc, imageNode } = buildMockSvcsForAddImage('shape-img1');
    const cmd = new AddImageCommand(svc, 'shape-img1', selectionSvc);
    expect(cmd.description).toBe('Add image');
    expect(imageNode.outerHTML).toBeTruthy();
  });

  it('first execute() is a no-op', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddImage('shape-img1');
    const cmd = new AddImageCommand(svc, 'shape-img1', selectionSvc);
    cmd.execute();
    expect(svc.insertShapeMarkup).not.toHaveBeenCalled();
  });

  it('undo() removes image and clears selection', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddImage('shape-img1');
    const cmd = new AddImageCommand(svc, 'shape-img1', selectionSvc);
    cmd.undo();
    expect(svc.removeShape).toHaveBeenCalledWith('shape-img1');
    expect(selectionSvc.clearSelection).toHaveBeenCalled();
  });

  it('redo re-inserts and re-selects', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddImage('shape-img1');
    const cmd = new AddImageCommand(svc, 'shape-img1', selectionSvc);
    cmd.execute();
    cmd.execute();
    expect(svc.insertShapeMarkup).toHaveBeenCalledTimes(1);
    expect(selectionSvc.selectShapes).toHaveBeenCalled();
  });
});

describe('PasteCommand', () => {
  it('executes paste payload, selects inserted shapes, and supports undo/redo', () => {
    const shapeNode = document.createElement('rect');
    shapeNode.id = 'shape-copy';
    const svc = mockSvc({
      pasteClipboardPayload: vi.fn().mockReturnValue({
        insertedIds: ['shape-copy'],
        insertedMarkup: ['<rect id="shape-copy" />']
      }),
      insertShapeMarkup: vi.fn(),
      getSVGInstance: vi.fn().mockReturnValue({
        findOne: vi.fn().mockReturnValue({ node: shapeNode })
      }),
      getShapeProperties: vi.fn().mockReturnValue({ id: 'shape-copy', type: 'rect' })
    });
    const selectionSvc = {
      selectShapes: vi.fn(),
      clearSelection: vi.fn()
    } as unknown as ShapeSelectionService;

    const cmd = new PasteCommand(
      svc,
      { shapes: [{ id: 'shape-a', markup: '<rect id="shape-a" />' }] },
      { dx: 10, dy: 10 },
      selectionSvc
    );
    cmd.execute();
    expect(svc.pasteClipboardPayload).toHaveBeenCalledTimes(1);
    expect(selectionSvc.selectShapes).toHaveBeenCalled();

    cmd.undo();
    expect(svc.removeShapes).toHaveBeenCalledWith(['shape-copy']);
    expect(selectionSvc.clearSelection).toHaveBeenCalled();

    cmd.execute();
    expect(svc.insertShapeMarkup).toHaveBeenCalledWith('<rect id="shape-copy" />');
  });
});

describe('DuplicateCommand', () => {
  it('duplicates from live snapshot and supports undo/redo', () => {
    const shapeNode = document.createElement('rect');
    shapeNode.id = 'shape-dup';
    const svc = mockSvc({
      createClipboardPayload: vi.fn().mockReturnValue({
        shapes: [{ id: 'shape-1', markup: '<rect id="shape-1" />' }]
      }),
      pasteClipboardPayload: vi.fn().mockReturnValue({
        insertedIds: ['shape-dup'],
        insertedMarkup: ['<rect id="shape-dup" />']
      }),
      insertShapeMarkup: vi.fn(),
      getSVGInstance: vi.fn().mockReturnValue({
        findOne: vi.fn().mockReturnValue({ node: shapeNode })
      }),
      getShapeProperties: vi.fn().mockReturnValue({ id: 'shape-dup', type: 'rect' })
    });
    const selectionSvc = {
      selectShapes: vi.fn(),
      clearSelection: vi.fn()
    } as unknown as ShapeSelectionService;

    const cmd = new DuplicateCommand(svc, ['shape-1'], { dx: 10, dy: 10 }, selectionSvc);
    cmd.execute();
    expect(svc.createClipboardPayload).toHaveBeenCalledWith(['shape-1']);
    expect(svc.pasteClipboardPayload).toHaveBeenCalledTimes(1);
    expect(selectionSvc.selectShapes).toHaveBeenCalled();

    cmd.undo();
    expect(svc.removeShapes).toHaveBeenCalledWith(['shape-dup']);

    cmd.execute();
    expect(svc.insertShapeMarkup).toHaveBeenCalledWith('<rect id="shape-dup" />');
  });
});
