import { vi } from 'vitest';
import { Matrix } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../services/svg-manipulation.service';

export function mockSvc(overrides: Partial<Record<keyof SvgManipulationService, unknown>> = {}) {
  return {
    updateFillColor: vi.fn(),
    updateStrokeColor: vi.fn(),
    addStroke: vi.fn(),
    removeStroke: vi.fn(),
    updateOpacity: vi.fn(),
    updateFillOpacity: vi.fn(),
    updateStrokeOpacity: vi.fn(),
    translateShape: vi.fn(),
    applyUnionScaleFromSnapshot: vi.fn(),
    applyUnionScaleFromCenter: vi.fn(),
    restoreVectorEffectsForShapeSubtrees: vi.fn(),
    applyUnionRotationFromSnapshot: vi.fn(),
    applyUnionSkewFromSnapshot: vi.fn(),
    restoreSelectionTransformsFromSnapshot: vi.fn(),
    moveElementForward: vi.fn(),
    moveElementBackward: vi.fn(),
    moveElementToFront: vi.fn(),
    moveElementToBack: vi.fn(),
    restoreElementSiblingOrder: vi.fn(),
    toggleLayerVisibility: vi.fn(),
    moveElementBeforeNextSibling: vi.fn(),
    isElementDirectLocked: vi.fn().mockReturnValue(false),
    isElementOrAncestorLocked: vi.fn().mockReturnValue(false),
    setLayerLocked: vi.fn(),
    groupSelectedElements: vi.fn(),
    ungroupElement: vi.fn(),
    ungroupElements: vi.fn().mockReturnValue({ allChildElementIds: [], undoSnapshots: [] }),
    addElementsToGroup: vi.fn().mockReturnValue(['a']),
    removeElementsFromGroup: vi.fn().mockReturnValue(['a']),
    reparentElementsToParent: vi.fn().mockReturnValue(['a']),
    snapshotElementParentOrder: vi.fn().mockReturnValue([
      { elementId: 'a', formerParentId: 'g1', formerIndex: 0 }
    ]),
    restoreElementParentOrder: vi.fn(),
    isUserGroupId: vi.fn().mockReturnValue(true),
    isGroupClipMaskCarrier: vi.fn().mockReturnValue(false),
    removeShapes: vi.fn(),
    restoreRemovedShapesInContentGroup: vi.fn(),
    restoreBakedFillPresentation: vi.fn(),
    restoreBakedStrokePresentation: vi.fn(),
    insertShapeMarkup: vi.fn(),
    removeShape: vi.fn(),
    getShapeProperties: vi.fn(),
    changeElementId: vi.fn().mockReturnValue(true),
    setElementDataName: vi.fn(),
    getElementDataName: vi.fn().mockReturnValue(null),
    createClipboardPayload: vi.fn().mockReturnValue({ shapes: [] }),
    pasteClipboardPayload: vi.fn().mockReturnValue({ insertedIds: [], insertedMarkup: [] }),
    updatePathData: vi.fn(),
    updateTextContent: vi.fn(),
    updateTextFontFamily: vi.fn(),
    updateTextFontSize: vi.fn(),
    updateTextFontWeight: vi.fn(),
    updateTextFontStyle: vi.fn(),
    updateTextAnchor: vi.fn(),
    updateTextPaintOrder: vi.fn(),
    updateTextVectorEffect: vi.fn(),
    getShapeBBox: vi.fn(),
    getUnionBBox: vi.fn(),
    snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map()),
    getSVGInstance: vi.fn().mockReturnValue(null),
    ...overrides,
  } as unknown as SvgManipulationService;
}

export function makeMockSvgElement(id: string, matrixValue = new Matrix()) {
  const node = document.createElement('div');
  node.id = id;
  return {
    node,
    matrix: vi.fn().mockImplementation((m?: Matrix) => (m ? undefined : matrixValue)),
  };
}
