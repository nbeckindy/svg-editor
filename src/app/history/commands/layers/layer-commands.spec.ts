import { Matrix } from '@svgdotjs/svg.js';
import { BASE_DRAWING_STYLE_DEFAULTS, type DrawingStyleDefaults } from '../../../models/drawing-style-defaults';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { DrawingStyleDefaultsWritePort } from '../../drawing-style-defaults.port';
import { mockSvc, makeMockSvgElement } from '../command-test-helpers';
import {
  CompositeCommand,
  ReorderCommand,
  buildReorderToExtremeCommand,
  ToggleVisibilityCommand,
  ToggleLayerLockCommand,
  ReorderBeforeSiblingCommand,
  GroupCommand,
  UngroupCommand,
  UngroupElementsCommand,
  ReparentElementsCommand,
} from '../../../models/editor-commands';

describe('ReorderCommand', () => {
  function buildParentWithChildren(ids: string[]) {
    const parent = document.createElement('div');
    const elements = new Map<string, { node: Element; matrix: ReturnType<typeof vi.fn> }>();
    for (const id of ids) {
      const child = document.createElement('div');
      child.id = id;
      parent.appendChild(child);
      elements.set(id, { node: child, matrix: vi.fn() });
    }
    return { parent, elements };
  }

  it('should call moveElementForward on execute for "forward"', () => {
    const { elements } = buildParentWithChildren(['a', 'target', 'b']);
    const findOne = vi.fn((sel: string) => {
      const id = sel.replace('#', '');
      return elements.get(id);
    });
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const cmd = new ReorderCommand(svc, 'target', 'forward');
    cmd.execute();
    expect(svc.moveElementForward).toHaveBeenCalledWith('target');
  });

  it('should call moveElementBackward on execute for "backward"', () => {
    const { elements } = buildParentWithChildren(['a', 'target', 'b']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const cmd = new ReorderCommand(svc, 'target', 'backward');
    cmd.execute();
    expect(svc.moveElementBackward).toHaveBeenCalledWith('target');
  });

  it('should call moveElementToFront on execute for "front"', () => {
    const { elements } = buildParentWithChildren(['target', 'a']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const cmd = new ReorderCommand(svc, 'target', 'front');
    cmd.execute();
    expect(svc.moveElementToFront).toHaveBeenCalledWith('target');
  });

  it('should call moveElementToBack on execute for "back"', () => {
    const { elements } = buildParentWithChildren(['a', 'target']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const cmd = new ReorderCommand(svc, 'target', 'back');
    cmd.execute();
    expect(svc.moveElementToBack).toHaveBeenCalledWith('target');
  });

  it('should restore element to old index on undo', () => {
    const { parent, elements } = buildParentWithChildren(['a', 'target', 'b']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      moveElementToFront: vi.fn(() => {
        parent.appendChild(elements.get('target')!.node);
      }),
      restoreElementSiblingOrder: vi.fn((id: string, oldIdx: number) => {
        const node = elements.get(id)?.node;
        if (!node) return;
        if (oldIdx >= parent.children.length) {
          parent.appendChild(node);
        } else {
          parent.insertBefore(node, parent.children[oldIdx]);
        }
      })
    });

    const cmd = new ReorderCommand(svc, 'target', 'front');
    cmd.execute();
    expect(Array.from(parent.children).map(c => c.id)).toEqual(['a', 'b', 'target']);

    cmd.undo();
    expect(Array.from(parent.children).map(c => c.id)).toEqual(['a', 'target', 'b']);
  });

  it('should have a non-empty description', () => {
    const svc = mockSvc();
    const cmd = new ReorderCommand(svc, 'target', 'forward');
    expect(cmd.description).toContain('forward');
  });
});

describe('buildReorderToExtremeCommand', () => {
  function buildParentWithChildren(ids: string[]) {
    const parent = document.createElement('div');
    const elements = new Map<string, { node: Element }>();
    for (const id of ids) {
      const child = document.createElement('div');
      child.id = id;
      parent.appendChild(child);
      elements.set(id, { node: child });
    }
    return { parent, elements };
  }

  it('returns null when SVG instance is missing', () => {
    const svc = mockSvc();
    expect(buildReorderToExtremeCommand(svc, ['a'], 'front')).toBeNull();
  });

  it('returns a single ReorderCommand for one valid id', () => {
    const { elements } = buildParentWithChildren(['a', 'b']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });
    const cmd = buildReorderToExtremeCommand(svc, ['a'], 'front');
    expect(cmd).toBeInstanceOf(ReorderCommand);
    expect(cmd!.description).toContain('front');
  });

  it('for front, runs same-parent moves in ascending DOM index (selection order independent)', () => {
    const { parent, elements } = buildParentWithChildren(['a', 'b', 'c', 'd']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const callOrder: string[] = [];
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      moveElementToFront: vi.fn((id: string) => {
        callOrder.push(id);
        parent.appendChild(elements.get(id)!.node);
      }),
    });
    const cmd = buildReorderToExtremeCommand(svc, ['c', 'b'], 'front');
    expect(cmd).toBeInstanceOf(CompositeCommand);
    expect(cmd!.description).toBe('Bring to front');
    cmd!.execute();
    expect(callOrder).toEqual(['b', 'c']);
    expect(Array.from(parent.children).map((n) => n.id)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('for back, runs same-parent moves in descending DOM index', () => {
    const { parent, elements } = buildParentWithChildren(['a', 'b', 'c', 'd']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const callOrder: string[] = [];
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      moveElementToBack: vi.fn((id: string) => {
        callOrder.push(id);
        const node = elements.get(id)!.node;
        parent.insertBefore(node, parent.firstElementChild);
      }),
    });
    const cmd = buildReorderToExtremeCommand(svc, ['b', 'c'], 'back');
    expect(cmd).toBeInstanceOf(CompositeCommand);
    expect(cmd!.description).toBe('Send to back');
    cmd!.execute();
    expect(callOrder).toEqual(['c', 'b']);
    expect(Array.from(parent.children).map((n) => n.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('ToggleVisibilityCommand', () => {
  it('should call toggleLayerVisibility on execute', () => {
    const svc = mockSvc();
    const cmd = new ToggleVisibilityCommand(svc, 'layer1');
    cmd.execute();
    expect(svc.toggleLayerVisibility).toHaveBeenCalledWith('layer1');
  });

  it('should call toggleLayerVisibility on undo (self-inverse)', () => {
    const svc = mockSvc();
    const cmd = new ToggleVisibilityCommand(svc, 'layer1');
    cmd.undo();
    expect(svc.toggleLayerVisibility).toHaveBeenCalledWith('layer1');
  });

  it('execute + undo should result in two toggleLayerVisibility calls', () => {
    const svc = mockSvc();
    const cmd = new ToggleVisibilityCommand(svc, 'layer1');
    cmd.execute();
    cmd.undo();
    expect(svc.toggleLayerVisibility).toHaveBeenCalledTimes(2);
  });

  it('should have description "Toggle visibility"', () => {
    expect(new ToggleVisibilityCommand(mockSvc(), 'l1').description).toBe('Toggle visibility');
  });
});

describe('ToggleLayerLockCommand', () => {
  it('execute toggles lock from ctor snapshot', () => {
    const svc = mockSvc({
      isElementDirectLocked: vi.fn().mockReturnValue(false),
      setLayerLocked: vi.fn(),
    });
    const cmd = new ToggleLayerLockCommand(svc, 'layer1');
    cmd.execute();
    expect(svc.setLayerLocked).toHaveBeenCalledWith('layer1', true);
    cmd.undo();
    expect(svc.setLayerLocked).toHaveBeenCalledWith('layer1', false);
  });

  it('execute sets locked false when ctor saw locked true', () => {
    const svc = mockSvc({
      isElementDirectLocked: vi.fn().mockReturnValue(true),
      setLayerLocked: vi.fn(),
    });
    const cmd = new ToggleLayerLockCommand(svc, 'g1');
    cmd.execute();
    expect(svc.setLayerLocked).toHaveBeenCalledWith('g1', false);
  });
});

describe('ReorderBeforeSiblingCommand', () => {
  function buildParentWithChildren(ids: string[]) {
    const parent = document.createElement('div');
    const elements = new Map<string, { node: Element }>();
    for (const id of ids) {
      const child = document.createElement('div');
      child.id = id;
      parent.appendChild(child);
      elements.set(id, { node: child });
    }
    return { parent, elements };
  }

  it('calls moveElementBeforeNextSibling on execute', () => {
    const { elements } = buildParentWithChildren(['a', 'b', 'c']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });
    const cmd = new ReorderBeforeSiblingCommand(svc, 'c', 'b');
    cmd.execute();
    expect(svc.moveElementBeforeNextSibling).toHaveBeenCalledWith('c', 'b');
  });

  it('undo restores sibling order', () => {
    const { parent, elements } = buildParentWithChildren(['a', 'b', 'c']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      moveElementBeforeNextSibling: vi.fn(() => {
        parent.insertBefore(elements.get('a')!.node, elements.get('c')!.node);
      }),
    });
    const cmd = new ReorderBeforeSiblingCommand(svc, 'a', 'c');
    cmd.execute();
    cmd.undo();
    expect(svc.restoreElementSiblingOrder).toHaveBeenCalled();
  });
});

describe('GroupCommand', () => {
  it('should call groupSelectedElements on execute', () => {
    const svc = mockSvc({
      groupSelectedElements: vi.fn().mockReturnValue('group-1'),
    });
    const cmd = new GroupCommand(svc, ['a', 'b']);
    cmd.execute();
    expect(svc.groupSelectedElements).toHaveBeenCalledWith(['a', 'b']);
  });

  it('should call ungroupElement with returned groupId on undo', () => {
    const svc = mockSvc({
      groupSelectedElements: vi.fn().mockReturnValue('group-1'),
    });
    const cmd = new GroupCommand(svc, ['a', 'b']);
    cmd.execute();
    cmd.undo();
    expect(svc.ungroupElement).toHaveBeenCalledWith('group-1');
  });

  it('should not call ungroupElement if execute was never called', () => {
    const svc = mockSvc();
    const cmd = new GroupCommand(svc, ['a', 'b']);
    cmd.undo();
    expect(svc.ungroupElement).not.toHaveBeenCalled();
  });

  it('should have description "Group elements"', () => {
    expect(new GroupCommand(mockSvc(), ['a']).description).toBe('Group elements');
  });

  it('createdGroupId reflects execute result', () => {
    const svc = mockSvc({
      groupSelectedElements: vi.fn().mockReturnValue('group-xyz'),
    });
    const cmd = new GroupCommand(svc, ['a', 'b']);
    expect(cmd.createdGroupId).toBeNull();
    cmd.execute();
    expect(cmd.createdGroupId).toBe('group-xyz');
  });
});

describe('UngroupCommand', () => {
  it('should call ungroupElement on execute', () => {
    const svc = mockSvc({
      ungroupElement: vi.fn().mockReturnValue(['a', 'b']),
    });
    const cmd = new UngroupCommand(svc, 'g1');
    cmd.execute();
    expect(svc.ungroupElement).toHaveBeenCalledWith('g1');
  });

  it('should call groupSelectedElements with returned childIds on undo', () => {
    const svc = mockSvc({
      ungroupElement: vi.fn().mockReturnValue(['a', 'b']),
    });
    const cmd = new UngroupCommand(svc, 'g1');
    cmd.execute();
    cmd.undo();
    expect(svc.groupSelectedElements).toHaveBeenCalledWith(['a', 'b']);
  });

  it('should not call groupSelectedElements if no children were returned', () => {
    const svc = mockSvc({
      ungroupElement: vi.fn().mockReturnValue([]),
    });
    const cmd = new UngroupCommand(svc, 'g1');
    cmd.execute();
    cmd.undo();
    expect(svc.groupSelectedElements).not.toHaveBeenCalled();
  });

  it('should have description "Ungroup elements"', () => {
    expect(new UngroupCommand(mockSvc(), 'g1').description).toBe('Ungroup elements');
  });
});

describe('ReparentElementsCommand', () => {
  it('addToGroup snapshots then calls addElementsToGroup', () => {
    const svc = mockSvc({
      snapshotElementParentOrder: vi.fn().mockReturnValue([
        { elementId: 'a', formerParentId: null, formerIndex: 1 }
      ]),
      addElementsToGroup: vi.fn().mockReturnValue(['a'])
    });
    const cmd = new ReparentElementsCommand(svc, ['a'], {
      kind: 'addToGroup',
      targetGroupId: 'g1'
    });
    cmd.execute();
    expect(svc.snapshotElementParentOrder).toHaveBeenCalledWith(['a']);
    expect(svc.addElementsToGroup).toHaveBeenCalledWith(['a'], 'g1', null);
    expect(cmd.reparentedElementIds).toEqual(['a']);
  });

  it('removeFromGroup restores snapshots on undo', () => {
    const svc = mockSvc({
      snapshotElementParentOrder: vi.fn().mockReturnValue([
        { elementId: 'a', formerParentId: 'inner', formerIndex: 0 }
      ]),
      removeElementsFromGroup: vi.fn().mockReturnValue(['a'])
    });
    const cmd = new ReparentElementsCommand(svc, ['a'], { kind: 'removeFromGroup' });
    cmd.execute();
    cmd.undo();
    expect(svc.restoreElementParentOrder).toHaveBeenCalledWith('a', 'inner', 0);
  });

  it('reparentToParent calls reparentElementsToParent', () => {
    const svc = mockSvc({
      reparentElementsToParent: vi.fn().mockReturnValue(['a'])
    });
    const cmd = new ReparentElementsCommand(svc, ['a'], {
      kind: 'reparentToParent',
      targetParentId: null,
      referenceNextSiblingId: 'b'
    });
    cmd.execute();
    expect(svc.reparentElementsToParent).toHaveBeenCalledWith(['a'], null, 'b');
  });
});

describe('UngroupElementsCommand', () => {
  it('should call ungroupElements on execute', () => {
    const svc = mockSvc({
      ungroupElements: vi
        .fn()
        .mockReturnValue({ allChildElementIds: ['a', 'b'], undoSnapshots: [['a', 'b']] }),
    });
    const cmd = new UngroupElementsCommand(svc, ['g1', 'g2']);
    cmd.execute();
    expect(svc.ungroupElements).toHaveBeenCalledWith(['g1', 'g2']);
    expect(cmd.ungroupedChildIds).toEqual(['a', 'b']);
  });

  it('should regroup each snapshot in reverse on undo', () => {
    const svc = mockSvc({
      ungroupElements: vi.fn().mockReturnValue({
        allChildElementIds: ['a', 'b', 'c'],
        undoSnapshots: [
          ['a', 'b'],
          ['c'],
        ],
      }),
    });
    const cmd = new UngroupElementsCommand(svc, ['g1', 'g2']);
    cmd.execute();
    cmd.undo();
    expect(svc.groupSelectedElements).toHaveBeenNthCalledWith(1, ['c']);
    expect(svc.groupSelectedElements).toHaveBeenNthCalledWith(2, ['a', 'b']);
  });

  it('should have description "Ungroup elements"', () => {
    expect(new UngroupElementsCommand(mockSvc(), ['g1']).description).toBe('Ungroup elements');
  });
});
