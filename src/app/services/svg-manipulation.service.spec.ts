import { TestBed } from '@angular/core/testing';
import { editorPortTestProviders } from '../testing/editor-port-test-providers';
import type { LiveTreeMarkup } from '../utils/svg-sanitize';
import { SvgManipulationService, CreatableShapeType } from './svg-manipulation.service';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { AddPathCommand, AddImageCommand, ArtboardSizeCommand, ArtboardBackgroundCommand } from '../models/editor-commands';
import { ShapeSelectionService } from './shape-selection.service';
import { DrawingStyleDefaultsService } from './drawing-style-defaults.service';
import { EditorHistoryService } from './editor-history.service';
import { MAX_DATA_IMAGE_HREF_CHARS_WITHOUT_CONFIRM } from '../utils/svg-export-image-href-policy';

describe('SvgManipulationService', () => {
  let service: SvgManipulationService;
  let drawingDefaults: DrawingStyleDefaultsService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: editorPortTestProviders });
    service = TestBed.inject(SvgManipulationService);
    drawingDefaults = TestBed.inject(DrawingStyleDefaultsService);
    
    // Create a container element for SVG
    container = document.createElement('div');
    container.id = 'test-svg-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize SVG with content', () => {
    const svgContent = '<svg><circle cx="50" cy="50" r="40" fill="#FF0000"/></svg>';
    
    service.initializeSVG(container, svgContent);
    
    const svgElement = container.querySelector('svg');
    expect(svgElement).not.toBeNull();
    
    const circleElement = container.querySelector('circle');
    expect(circleElement).not.toBeNull();
    expect(circleElement?.getAttribute('cx')).toBe('50');
  });

  it('should expand stage viewBox to match source aspect ratio (prevents squashing)', () => {
    const doc = TestBed.inject(SvgEditorDocumentService) as unknown as {
      computeContentBbox(svgElement: Element): { x: number; y: number; width: number; height: number };
    };
    const originalComputeContentBbox = doc.computeContentBbox.bind(doc);
    doc.computeContentBbox = () => ({ x: 0, y: 0, width: 200, height: 50 });

    try {
      const svgContent = '<svg width="100" height="50"><rect x="0" y="0" width="200" height="50" fill="#000"/></svg>';
      service.initializeSVG(container, svgContent);

      const svgElement = container.querySelector('svg') as SVGSVGElement | null;
      expect(svgElement).toBeTruthy();

      const vb = svgElement?.getAttribute('viewBox');
      expect(vb).toBeTruthy();

      const parts = vb!.trim().split(/\s+/).map((n) => Number(n));
      expect(parts.length).toBe(4);
      const [_x, _y, vbW, vbH] = parts;

      // Stage viewBox should be expanded so vbW/vbH matches initW/initH = 2.
      expect(vbW / vbH).toBeCloseTo(2, 5);
      expect(vbW).toBeCloseTo(200, 0);
      expect(vbH).toBeCloseTo(100, 0);
    } finally {
      doc.computeContentBbox = originalComputeContentBbox;
    }
  });

  it('should get SVG instance after initialization', () => {
    const svgContent = '<svg><rect width="100" height="100"/></svg>';
    
    service.initializeSVG(container, svgContent);
    
    const instance = service.getSVGInstance();
    expect(instance).not.toBeNull();
  });

  it('should return null SVG instance before initialization', () => {
    expect(service.getSVGInstance()).toBeNull();
  });

  it('should add IDs to shapes without IDs', () => {
    const svgContent = '<svg><circle cx="50" cy="50" r="40"/><rect x="0" y="0" width="50" height="50"/></svg>';
    
    service.initializeSVG(container, svgContent);
    
    const contentGroup = container.querySelector('[data-editor-content-group]');
    const circle = contentGroup?.querySelector('circle');
    const rect = contentGroup?.querySelector('rect');
    
    expect(circle?.id).toBeTruthy();
    expect(rect?.id).toBeTruthy();
  });

  it('should get shape properties', () => {
    const svgContent = '<svg><circle id="test-circle" cx="50" cy="50" r="40" fill="#FF0000" stroke="#000000" stroke-width="2" opacity="0.8"/></svg>';
    
    service.initializeSVG(container, svgContent);
    
    const svgInstance = service.getSVGInstance();
    const shape = svgInstance?.findOne('#test-circle') as any;
    
    if (shape) {
      const properties = service.getShapeProperties(shape);
      
      expect(properties.id).toBe('test-circle');
      expect(properties.type).toBe('circle');
      expect(properties.fill).toBe('#FF0000');
      expect(properties.stroke).toBe('#000000');
      expect(properties.strokeWidth).toBe(2);
      expect(properties.opacity).toBe(0.8);
      expect(properties.fillSource?.kind).toBe('presentation-attr');
      expect(properties.strokeSource?.kind).toBe('presentation-attr');
    }
  });

  it('getNearestGroupAncestorId returns first g ancestor with id inside content group', () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <g id="layer-a"><rect id="leaf" x="0" y="0" width="5" height="5" fill="red"/></g>
    </svg>`;
    service.initializeSVG(container, svgContent);
    expect(service.getNearestGroupAncestorId('leaf')).toBe('layer-a');
  });

  it('bakeEffectiveFillToLocal moves inline fill to presentation attribute', () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect id="child" x="0" y="0" width="5" height="5" style="fill: #00aa00"/>
    </svg>`;
    service.initializeSVG(container, svgContent);
    service.bakeEffectiveFillToLocal('child');
    const rect = container.querySelector('#child') as HTMLElement | null;
    expect(rect?.style.fill).toBe('');
    const fillAttr = rect?.getAttribute('fill');
    expect(fillAttr?.toLowerCase()).toBe('#00aa00');
  });

  it('getShapeProperties omits stroke when no stroke is painted (no UA rgb black noise)', () => {
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="no-stroke" cx="50" cy="50" r="40" fill="#FF0000"/></svg>';
    service.initializeSVG(container, svgContent);
    const shape = service.getSVGInstance()?.findOne('#no-stroke') as any;
    expect(shape).toBeTruthy();
    const properties = service.getShapeProperties(shape);
    expect(properties.stroke).toBeUndefined();
    expect(properties.strokeWidth).toBe(0);
  });

  it('getShapeProperties omits fill when element has fill="none"', () => {
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="no-fill-rect" x="0" y="0" width="10" height="10" fill="none"/></svg>';
    service.initializeSVG(container, svgContent);
    const shape = service.getSVGInstance()?.findOne('#no-fill-rect') as any;
    expect(shape).toBeTruthy();
    const properties = service.getShapeProperties(shape);
    expect(properties.fill).toBeUndefined();
    expect(properties.stroke).toBeUndefined();
  });

  it('getShapeProperties uses default fill source when no ancestor sets fill (not false inherited)', () => {
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="solo-fill" width="10" height="10"/></svg>';
    service.initializeSVG(container, svgContent);
    const shape = service.getSVGInstance()?.findOne('#solo-fill') as any;
    expect(shape).toBeTruthy();
    const properties = service.getShapeProperties(shape);
    expect(properties.fillSource?.kind).not.toBe('inherited');
  });

  it('getShapeProperties fill is inherited when a parent sets fill attribute', () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <g fill="#ff0000"><rect id="inherited-fill" width="10" height="10"/></g>
    </svg>`;
    service.initializeSVG(container, svgContent);
    const shape = service.getSVGInstance()?.findOne('#inherited-fill') as any;
    expect(shape).toBeTruthy();
    const properties = service.getShapeProperties(shape);
    expect(properties.fillSource?.kind).toBe('inherited');
  });

  it('getShapeProperties detects inline style fill over presentation attribute', () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle id="inline-circle" style="fill: rgb(0, 0, 255)" cx="50" cy="50" r="40" fill="#ff0000"/>
    </svg>`;
    service.initializeSVG(container, svgContent);
    const shape = service.getSVGInstance()?.findOne('#inline-circle') as any;
    expect(shape).toBeTruthy();
    const properties = service.getShapeProperties(shape);
    expect(properties.fillSource?.kind).toBe('inline-style');
    expect(properties.fill).toBe('#0000FF');
  });

  it('getSelectorSelectionForShape returns clip geometry for clipped content', () => {
    const svgContent = `<svg viewBox="0 0 100 100">
      <defs><clipPath id="cp"><rect id="cp-geom" x="0" y="0" width="50" height="50"/></clipPath></defs>
      <g clip-path="url(#cp)"><rect id="inner" x="5" y="5" width="10" height="10"/></g>
    </svg>`;
    service.initializeSVG(container, svgContent);
    const inner = service.getSVGInstance()?.findOne('#inner') as any;
    const selection = service.getSelectorSelectionForShape(inner);
    expect(selection).toHaveLength(1);
    expect(selection[0].id).toMatch(/^clip-geom-/);
  });

  it('getShapePropertiesInSameClipGroup returns all shapes under the clip-path ancestor', () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs><clipPath id="cp"><rect x="0" y="0" width="50" height="100"/></clipPath></defs>
      <g clip-path="url(#cp)">
        <rect id="r-a" x="0" y="0" width="5" height="5" fill="red"/>
        <rect id="r-b" x="10" y="10" width="5" height="5" fill="blue"/>
      </g>
    </svg>`;
    service.initializeSVG(container, svgContent);
    const svgInstance = service.getSVGInstance();
    const shape = svgInstance?.findOne('#r-a') as any;
    expect(shape).toBeTruthy();
    const group = service.getShapePropertiesInSameClipGroup(shape);
    expect(group.map((p) => p.id).sort()).toEqual(['r-a', 'r-b'].sort());
  });

  it('getShapePropertiesInSameClipGroup returns only the shape when not under clip-path', () => {
    const svgContent = '<svg viewBox="0 0 100 100"><rect id="solo" x="0" y="0" width="10" height="10"/></svg>';
    service.initializeSVG(container, svgContent);
    const shape = service.getSVGInstance()?.findOne('#solo') as any;
    expect(shape).toBeTruthy();
    const group = service.getShapePropertiesInSameClipGroup(shape);
    expect(group).toHaveLength(1);
    expect(group[0].id).toBe('solo');
  });

  it('expandSelectionByClipGroups merges clip siblings and dedupes', () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs><clipPath id="cp"><rect x="0" y="0" width="100" height="100"/></clipPath></defs>
      <g clip-path="url(#cp)">
        <rect id="x1" x="0" y="0" width="5" height="5"/>
        <rect id="x2" x="10" y="0" width="5" height="5"/>
      </g>
    </svg>`;
    service.initializeSVG(container, svgContent);
    const hit = service.getShapeProperties(service.getSVGInstance()!.findOne('#x1') as any);
    const expanded = service.expandSelectionByClipGroups([hit]);
    expect(expanded.map((p) => p.id).sort()).toEqual(['x1', 'x2'].sort());
  });

  it('expandSelectionForClipPathTransform includes clip geometry with clipped content', () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect id="back" x="0" y="0" width="40" height="40" fill="red"/>
      <rect id="front" x="10" y="10" width="30" height="30" fill="blue"/>
    </svg>`;
    service.initializeSVG(container, svgContent);
    const made = service.makeClipPathFromSelection(['back'], 'front');
    expect(made).not.toBeNull();

    const expanded = service.expandSelectionForClipPathTransform([made!.clipGeometryId]);
    expect(expanded.sort()).toEqual([made!.clipGeometryId, 'back'].sort());
  });

  it('should update fill color', () => {
    const svgContent = '<svg><circle id="color-test" cx="50" cy="50" r="40" fill="#FF0000"/></svg>';
    
    service.initializeSVG(container, svgContent);
    service.updateFillColor('color-test', '#00FF00');
    
    const circle = container.querySelector('#color-test');
    const fillColor = circle?.getAttribute('fill');
    
    // SVG.js normalizes colors to lowercase
    expect(fillColor?.toLowerCase()).toBe('#00ff00');
  });

  it('should add stroke to a shape', () => {
    const svgContent = '<svg><rect id="stroke-test" width="100" height="100" fill="#FF0000"/></svg>';
    
    service.initializeSVG(container, svgContent);
    service.addStroke('stroke-test', '#0000FF', 3);
    
    const rect = container.querySelector('#stroke-test');
    const strokeColor = rect?.getAttribute('stroke');
    const strokeWidth = rect?.getAttribute('stroke-width');
    
    // SVG.js normalizes colors to lowercase
    expect(strokeColor?.toLowerCase()).toBe('#0000ff');
    expect(strokeWidth).toBe('3');
  });

  it('should update stroke color', () => {
    const svgContent = '<svg><ellipse id="stroke-color-test" cx="100" cy="100" rx="50" ry="30" stroke="#FF0000" stroke-width="2"/></svg>';
    
    service.initializeSVG(container, svgContent);
    service.updateStrokeColor('stroke-color-test', '#FFFF00');
    
    const ellipse = container.querySelector('#stroke-color-test');
    const strokeColor = ellipse?.getAttribute('stroke');
    
    // SVG.js normalizes colors to lowercase
    expect(strokeColor?.toLowerCase()).toBe('#ffff00');
  });

  it('should remove stroke from a shape', () => {
    const svgContent = '<svg><polygon id="remove-stroke-test" points="50,0 100,100 0,100" stroke="#000000" stroke-width="2"/></svg>';
    
    service.initializeSVG(container, svgContent);
    service.removeStroke('remove-stroke-test');
    
    const polygon = container.querySelector('#remove-stroke-test');
    const stroke = polygon?.getAttribute('stroke');
    
    expect(stroke).toBe('none');
  });

  it('removeShapes removes elements and bumps documentRevision', () => {
    const svgContent =
      '<svg viewBox="0 0 100 100"><rect id="ra" x="0" y="0" width="10" height="10"/><rect id="rb" x="20" y="0" width="10" height="10"/></svg>';
    service.initializeSVG(container, svgContent);
    const before = service.documentRevision();
    service.removeShapes(['ra']);
    expect(service.documentRevision()).toBe(before + 1);
    expect(container.querySelector('#ra')).toBeNull();
    expect(container.querySelector('#rb')).not.toBeNull();
  });

  it('removeShapes is a no-op for empty or unknown ids', () => {
    const svgContent = '<svg viewBox="0 0 100 100"><rect id="only" x="0" y="0" width="10" height="10"/></svg>';
    service.initializeSVG(container, svgContent);
    const rev = service.documentRevision();
    service.removeShapes([]);
    service.removeShapes(['nope']);
    expect(service.documentRevision()).toBe(rev);
    expect(container.querySelector('#only')).not.toBeNull();
  });

  it('getShapeBBox should return bounding box in SVG coordinates', () => {
    const svgContent = '<svg viewBox="0 0 100 100"><rect id="bbox-test" x="10" y="20" width="30" height="40"/></svg>';
    service.initializeSVG(container, svgContent);
    const rectEl = container.querySelector('#bbox-test');
    if (rectEl && typeof (rectEl as SVGGraphicsElement).getBBox !== 'function') {
      (rectEl as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
        ({ x: 10, y: 20, width: 30, height: 40 } as DOMRect);
    }
    const bbox = service.getShapeBBox('bbox-test');
    expect(bbox).not.toBeNull();
    expect(bbox!.x).toBe(10);
    expect(bbox!.y).toBe(20);
    expect(bbox!.width).toBe(30);
    expect(bbox!.height).toBe(40);
  });

  it('getShapeBBox should return null when shape does not exist', () => {
    const svgContent = '<svg><circle id="c1" cx="50" cy="50" r="40"/></svg>';
    service.initializeSVG(container, svgContent);
    expect(service.getShapeBBox('nonexistent')).toBeNull();
  });

  it('getShapeBBox should return null when SVG not initialized', () => {
    expect(service.getShapeBBox('any-id')).toBeNull();
  });

  it('getUnionBBox should return null for empty array', () => {
    const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
    service.initializeSVG(container, svgContent);
    expect(service.getUnionBBox([])).toBeNull();
  });

  it('getUnionBBox should return single shape bbox for one id', () => {
    const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="20" width="30" height="40"/></svg>';
    service.initializeSVG(container, svgContent);
    const rectEl = container.querySelector('#r1');
    if (rectEl && typeof (rectEl as SVGGraphicsElement).getBBox !== 'function') {
      (rectEl as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
        ({ x: 10, y: 20, width: 30, height: 40 } as DOMRect);
    }
    const union = service.getUnionBBox(['r1']);
    expect(union).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('getUnionBBox should return union of two shapes', () => {
    const svgContent =
      '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="50" y="60" width="20" height="15"/></svg>';
    service.initializeSVG(container, svgContent);
    const elA = container.querySelector('#a');
    const elB = container.querySelector('#b');
    if (elA && typeof (elA as SVGGraphicsElement).getBBox !== 'function') {
      (elA as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 } as DOMRect);
    }
    if (elB && typeof (elB as SVGGraphicsElement).getBBox !== 'function') {
      (elB as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
        ({ x: 50, y: 60, width: 20, height: 15 } as DOMRect);
    }
    const union = service.getUnionBBox(['a', 'b']);
    expect(union).toEqual({ x: 0, y: 0, width: 70, height: 75 });
  });

  it('should export SVG as string', () => {
    const svgContent = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    
    service.initializeSVG(container, svgContent);
    const exported = service.exportSVG();
    
    expect(exported).toContain('circle');
    expect(exported).toContain('cx');
  });

  it('should return empty string when exporting without initialization', () => {
    const exported = service.exportSVG();
    expect(exported).toBe('');
  });

  it('should handle operations gracefully when not initialized', () => {
    expect(service.getShapeBBox('test')).toBeNull();
    expect(() => {
      service.updateFillColor('test', '#FF0000');
      service.addStroke('test', '#000000', 2);
      service.removeStroke('test');
      service.updateStrokeColor('test', '#0000FF');
      service.clearHighlight();
    }).not.toThrow();
  });

  it('translateShape should move rect bbox by dx, dy in SVG user space', () => {
    const svgContent = '<svg viewBox="0 0 100 100"><rect id="move-rect" x="10" y="20" width="30" height="40"/></svg>';
    service.initializeSVG(container, svgContent);
    const rectEl = container.querySelector('#move-rect');
    if (rectEl && typeof (rectEl as SVGGraphicsElement).getBBox !== 'function') {
      (rectEl as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
        ({ x: 10, y: 20, width: 30, height: 40 } as DOMRect);
    }
    const before = service.getShapeBBox('move-rect');
    expect(before).toBeTruthy();
    service.translateShape('move-rect', 15, 25);
    const after = service.getShapeBBox('move-rect');
    expect(after!.x).toBeCloseTo(before!.x + 15, 5);
    expect(after!.y).toBeCloseTo(before!.y + 25, 5);
    expect(after!.width).toBeCloseTo(before!.width, 5);
    expect(after!.height).toBeCloseTo(before!.height, 5);
  });

  it('translateShape should move circle bbox by dx, dy in SVG user space', () => {
    const svgContent = '<svg viewBox="0 0 100 100"><circle id="move-circle" cx="50" cy="50" r="20"/></svg>';
    service.initializeSVG(container, svgContent);
    const circleEl = container.querySelector('#move-circle');
    if (circleEl && typeof (circleEl as SVGGraphicsElement).getBBox !== 'function') {
      (circleEl as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
        ({ x: 30, y: 30, width: 40, height: 40 } as DOMRect);
    }
    const before = service.getShapeBBox('move-circle');
    expect(before).toBeTruthy();
    service.translateShape('move-circle', -10, 5);
    const after = service.getShapeBBox('move-circle');
    expect(after!.x).toBeCloseTo(before!.x - 10, 5);
    expect(after!.y).toBeCloseTo(before!.y + 5, 5);
  });

  it('translateShape after proportional resize should move bbox by dx, dy in user space (matches drag ghost)', () => {
    const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="10" y="20" width="100" height="50"/></svg>';
    service.initializeSVG(container, svgContent);
    const unionBefore = { x: 10, y: 20, width: 100, height: 50 };
    const unionAfter = { x: 10, y: 20, width: 200, height: 100 };
    const snap = service.snapshotSelectionTransforms(['r1']);
    service.applyUnionScaleFromSnapshot(['r1'], unionBefore, unionAfter, snap, 'se');
    const rectEl = container.querySelector('#r1');
    if (rectEl && typeof (rectEl as SVGGraphicsElement).getBBox !== 'function') {
      (rectEl as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
        ({ x: 10, y: 20, width: 100, height: 50 } as DOMRect);
    }
    const before = service.getShapeBBox('r1');
    expect(before).toBeTruthy();
    service.translateShape('r1', 7, -3);
    const after = service.getShapeBBox('r1');
    expect(after!.x).toBeCloseTo(before!.x + 7, 5);
    expect(after!.y).toBeCloseTo(before!.y - 3, 5);
    expect(after!.width).toBeCloseTo(before!.width, 5);
    expect(after!.height).toBeCloseTo(before!.height, 5);
  });

  it('translateShape should do nothing when shape does not exist', () => {
    const svgContent = '<svg><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
    service.initializeSVG(container, svgContent);
    expect(() => service.translateShape('nonexistent', 5, 5)).not.toThrow();
  });

  it('translateShape should do nothing when SVG not initialized', () => {
    expect(() => service.translateShape('any-id', 1, 1)).not.toThrow();
  });

  it('setShapeVisibility should hide shape when visible is false', () => {
    const svgContent = '<svg><rect id="vis-test" x="0" y="0" width="10" height="10"/></svg>';
    service.initializeSVG(container, svgContent);
    service.setShapeVisibility('vis-test', false);
    const rect = container.querySelector('#vis-test');
    expect(rect?.getAttribute('visibility')).toBe('hidden');
  });

  it('setShapeVisibility should show shape when visible is true', () => {
    const svgContent = '<svg><rect id="vis-test2" x="0" y="0" width="10" height="10" visibility="hidden"/></svg>';
    service.initializeSVG(container, svgContent);
    service.setShapeVisibility('vis-test2', true);
    const rect = container.querySelector('#vis-test2');
    expect(rect?.getAttribute('visibility')).not.toBe('hidden');
  });

  it('setShapeVisibility should do nothing when shape does not exist', () => {
    const svgContent = '<svg><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
    service.initializeSVG(container, svgContent);
    expect(() => service.setShapeVisibility('nonexistent', false)).not.toThrow();
  });

  describe('documentRevision', () => {
    it('should be 0 before initializeSVG', () => {
      expect(service.documentRevision()).toBe(0);
    });

    it('should increment after successful initializeSVG', () => {
      const svgContent = '<svg><circle cx="50" cy="50" r="40" fill="#FF0000"/></svg>';
      service.initializeSVG(container, svgContent);
      expect(service.documentRevision()).toBe(1);
    });

    it('should not increment when initializeSVG cannot find an svg root', () => {
      service.initializeSVG(container, '<div/>');
      expect(service.documentRevision()).toBe(0);
    });

    it('should increment after updateFillColor when shape exists', () => {
      const svgContent =
        '<svg><circle id="doc-rev-fill-target" cx="50" cy="50" r="40" fill="#FF0000"/></svg>';
      service.initializeSVG(container, svgContent);
      const afterInit = service.documentRevision();
      service.updateFillColor('doc-rev-fill-target', '#00FF00');
      expect(service.documentRevision()).toBe(afterInit + 1);
    });

    it('should not increment for setShapeVisibility', () => {
      const svgContent = '<svg><rect id="vis-test" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const afterInit = service.documentRevision();
      service.setShapeVisibility('vis-test', false);
      expect(service.documentRevision()).toBe(afterInit);
    });
  });

  describe('viewBox visibility in editor', () => {
    it('exportSVG should preserve original viewBox and content and omit editor-only nodes', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="20" width="30" height="40"/></svg>';
      service.initializeSVG(container, svgContent);
      const exported = service.exportSVG();
      expect(exported).toContain('viewBox="0 0 100 100"');
      expect(exported).toContain('<rect');
      expect(exported).toContain('id="r1"');
      // Editor stage adds grey rect and viewBox rect; export must be logical document only
      expect(exported).not.toMatch(/data-editor-outside-rect|data-editor-viewbox-rect/);
    });

    it('exportSVG with content outside viewBox should still export that content', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="inside" x="10" y="10" width="20" height="20"/><rect id="outside" x="150" y="150" width="30" height="30"/></svg>';
      service.initializeSVG(container, svgContent);
      const exported = service.exportSVG();
      expect(exported).toContain('id="inside"');
      expect(exported).toContain('id="outside"');
      expect(exported).toContain('viewBox="0 0 100 100"');
    });
  });

  describe('getSvgExportImagePolicyResult (e4s.7)', () => {
    it('returns not blocked when there are no images', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const p = service.getSvgExportImagePolicyResult();
      expect(p.blocked).toBe(false);
      expect(p.hasOversizedDataUrl).toBe(false);
    });

    it('strips blob: image href at ingest (sanitizer fires before export policy)', () => {
      // ADR 0002: ingest sanitizer removes blob: hrefs, so the export policy never sees one.
      vi.spyOn(window, 'alert').mockImplementation(() => undefined);
      const svgContent =
        '<svg viewBox="0 0 100 100"><image id="i1" href="blob:http://localhost/x" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      // Blob: href was stripped — image element has no href
      const img = container.querySelector('#i1');
      expect(img?.getAttribute('href') ?? null).toBeFalsy();
      // Export policy is not blocked (nothing to block — ingest already cleaned it)
      const p = service.getSvgExportImagePolicyResult();
      expect(p.blocked).toBe(false);
      // Sanitizer should have alerted the user about the blocked href
      expect(window.alert).toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    it('flags oversized data URL without blocking', { timeout: 15000 }, () => {
      const prefix = 'data:image/png;base64,';
      const padLen = MAX_DATA_IMAGE_HREF_CHARS_WITHOUT_CONFIRM - prefix.length + 1;
      const huge = prefix + 'x'.repeat(Math.max(0, padLen));
      const svgContent = `<svg viewBox="0 0 100 100"><image id="i1" href="${huge}" width="10" height="10"/></svg>`;
      service.initializeSVG(container, svgContent);
      const p = service.getSvgExportImagePolicyResult();
      expect(p.blocked).toBe(false);
      expect(p.hasOversizedDataUrl).toBe(true);
      expect(p.oversizedConfirmMessage).toBeTruthy();
    });
  });

  describe('selection resize', () => {
    it('snapshotSelectionTransforms should clone matrices', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r-scale" x="10" y="20" width="30" height="40"/></svg>';
      service.initializeSVG(container, svgContent);
      const snap = service.snapshotSelectionTransforms(['r-scale']);
      expect(snap.size).toBe(1);
      const m = snap.get('r-scale');
      expect(m).toBeDefined();
      expect(m?.a).toBe(1);
    });

    it('applyUnionScaleFromSnapshot should scale rect from SE anchor (NW fixed)', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="10" y="20" width="100" height="50"/></svg>';
      service.initializeSVG(container, svgContent);
      const unionBefore = { x: 10, y: 20, width: 100, height: 50 };
      const unionAfter = { x: 10, y: 20, width: 200, height: 100 };
      const snap = service.snapshotSelectionTransforms(['r1']);
      service.applyUnionScaleFromSnapshot(['r1'], unionBefore, unionAfter, snap, 'se');
      const rect = container.querySelector('#r1');
      expect(rect?.getAttribute('transform')).toBeTruthy();
    });

    it('getShapeBBox should reflect transformed bounds after applyUnionScaleFromSnapshot', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="10" y="20" width="100" height="50"/></svg>';
      service.initializeSVG(container, svgContent);
      const unionBefore = { x: 10, y: 20, width: 100, height: 50 };
      const unionAfter = { x: 10, y: 20, width: 200, height: 100 };
      const snap = service.snapshotSelectionTransforms(['r1']);
      service.applyUnionScaleFromSnapshot(['r1'], unionBefore, unionAfter, snap, 'se');
      // jsdom: stub *local* getBBox (pre-transform); getShapeBBox applies matrixify() so union matches 2× scale from SE.
      const rectEl = container.querySelector('#r1');
      if (rectEl && typeof (rectEl as SVGGraphicsElement).getBBox !== 'function') {
        (rectEl as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
          ({ x: 10, y: 20, width: 100, height: 50 } as DOMRect);
      }
      const after = service.getShapeBBox('r1');
      expect(after).toBeTruthy();
      expect(after!.width).toBeCloseTo(200, 0);
      expect(after!.height).toBeCloseTo(100, 0);
    });

    it('applyUnionScaleFromCenter scales while preserving union center', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="10" y="20" width="100" height="50"/></svg>';
      service.initializeSVG(container, svgContent);
      const unionBefore = { x: 10, y: 20, width: 100, height: 50 };
      const unionAfter = { x: -40, y: -5, width: 200, height: 100 };
      const snap = service.snapshotSelectionTransforms(['r1']);
      service.applyUnionScaleFromCenter(['r1'], unionBefore, unionAfter, snap);
      const rectEl = container.querySelector('#r1');
      if (rectEl && typeof (rectEl as SVGGraphicsElement).getBBox !== 'function') {
        (rectEl as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
          ({ x: 10, y: 20, width: 100, height: 50 } as DOMRect);
      }
      const after = service.getShapeBBox('r1');
      expect(after).toBeTruthy();
      expect(after!.width).toBeCloseTo(200, 0);
      expect(after!.height).toBeCloseTo(100, 0);
      expect(after!.x + after!.width / 2).toBeCloseTo(unionBefore.x + unionBefore.width / 2, 5);
      expect(after!.y + after!.height / 2).toBeCloseTo(unionBefore.y + unionBefore.height / 2, 5);
    });

    it('applyUnionScaleFromCenter scales multi-shape selection while preserving union center', () => {
      const svgContent = `<svg viewBox="0 0 300 200">
        <rect id="r1" x="10" y="20" width="40" height="20"/>
        <rect id="r2" x="80" y="50" width="60" height="30"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const ids = ['r1', 'r2'];
      const r1El = container.querySelector('#r1');
      const r2El = container.querySelector('#r2');
      (r1El as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
        ({ x: 10, y: 20, width: 40, height: 20 } as DOMRect);
      (r2El as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
        ({ x: 80, y: 50, width: 60, height: 30 } as DOMRect);
      const unionBefore = service.getUnionBBox(ids);
      expect(unionBefore).toBeTruthy();
      const centerBefore = {
        x: unionBefore!.x + unionBefore!.width / 2,
        y: unionBefore!.y + unionBefore!.height / 2
      };
      const unionAfter = {
        x: unionBefore!.x - unionBefore!.width / 2,
        y: unionBefore!.y - unionBefore!.height / 2,
        width: unionBefore!.width * 2,
        height: unionBefore!.height * 2
      };
      const snap = service.snapshotSelectionTransforms(ids);
      service.applyUnionScaleFromCenter(ids, unionBefore!, unionAfter, snap);
      const after = service.getUnionBBox(ids);
      expect(after).toBeTruthy();
      expect(after!.width).toBeCloseTo(unionBefore!.width * 2, 5);
      expect(after!.height).toBeCloseTo(unionBefore!.height * 2, 5);
      expect(after!.x + after!.width / 2).toBeCloseTo(centerBefore.x, 5);
      expect(after!.y + after!.height / 2).toBeCloseTo(centerBefore.y, 5);
    });

    it('applyUnionScaleFromSnapshot strips non-scaling-stroke; restoreVectorEffectsForShapeSubtrees undoes it', () => {
      const svgContent =
        '<svg viewBox="0 0 200 200"><rect id="r1" x="10" y="20" width="100" height="50" stroke="#f00" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
      service.initializeSVG(container, svgContent);
      const unionBefore = { x: 10, y: 20, width: 100, height: 50 };
      const unionAfter = { x: 10, y: 20, width: 200, height: 100 };
      const snap = service.snapshotSelectionTransforms(['r1']);
      const veBefore = service.snapshotVectorEffectsForShapes(['r1']);
      service.applyUnionScaleFromSnapshot(['r1'], unionBefore, unionAfter, snap, 'se');
      const rect = container.querySelector('#r1');
      expect(rect?.getAttribute('vector-effect')).toBeNull();
      service.restoreVectorEffectsForShapeSubtrees(['r1'], veBefore);
      expect(rect?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    });
  });

  describe('selection rotate', () => {
    it('applyUnionRotationFromSnapshot should rotate rect 90° about union center; bbox width/height swap', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="10" y="20" width="100" height="50"/></svg>';
      service.initializeSVG(container, svgContent);
      const union = { x: 10, y: 20, width: 100, height: 50 };
      const pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
      const snap = service.snapshotSelectionTransforms(['r1']);
      service.applyUnionRotationFromSnapshot(['r1'], pivot, 90, snap);
      const rectEl = container.querySelector('#r1');
      if (rectEl && typeof (rectEl as SVGGraphicsElement).getBBox !== 'function') {
        (rectEl as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
          ({ x: 10, y: 20, width: 100, height: 50 } as DOMRect);
      }
      const after = service.getShapeBBox('r1');
      expect(after).toBeTruthy();
      expect(after!.width).toBeCloseTo(50, 0);
      expect(after!.height).toBeCloseTo(100, 0);
    });

    it('applyUnionRotationFromSnapshot full turn should leave bbox similar (mod floating point)', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="10" y="20" width="100" height="50"/></svg>';
      service.initializeSVG(container, svgContent);
      const union = { x: 10, y: 20, width: 100, height: 50 };
      const pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
      const snap = service.snapshotSelectionTransforms(['r1']);
      service.applyUnionRotationFromSnapshot(['r1'], pivot, 360, snap);
      const rectEl = container.querySelector('#r1');
      if (rectEl && typeof (rectEl as SVGGraphicsElement).getBBox !== 'function') {
        (rectEl as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
          ({ x: 10, y: 20, width: 100, height: 50 } as DOMRect);
      }
      const after = service.getShapeBBox('r1');
      expect(after).toBeTruthy();
      expect(after!.width).toBeCloseTo(100, 0);
      expect(after!.height).toBeCloseTo(50, 0);
    });

    it('applyUnionRotationFromSnapshot should not throw when shape missing', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const snap = new Map();
      expect(() =>
        service.applyUnionRotationFromSnapshot(['nope'], { x: 5, y: 5 }, 15, snap)
      ).not.toThrow();
    });

    it('applyUnionSkewFromSnapshot skews rect about pivot (transform present)', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="10" y="20" width="100" height="50"/></svg>';
      service.initializeSVG(container, svgContent);
      const union = { x: 10, y: 20, width: 100, height: 50 };
      const pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
      const snap = service.snapshotSelectionTransforms(['r1']);
      const before = service.documentRevision();
      service.applyUnionSkewFromSnapshot(['r1'], 'x', 15, pivot, snap);
      expect(service.documentRevision()).toBe(before + 1);
      const rect = container.querySelector('#r1');
      expect(rect?.getAttribute('transform')).toBeTruthy();
    });

    it('getSelectionRotationPivot returns union center when local bbox path unavailable (e.g. jsdom)', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="10" y="20" width="100" height="50"/></svg>';
      service.initializeSVG(container, svgContent);
      const rectEl = container.querySelector('#r1');
      if (rectEl && typeof (rectEl as SVGGraphicsElement).getBBox !== 'function') {
        (rectEl as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
          ({ x: 10, y: 20, width: 100, height: 50 } as DOMRect);
      }
      const p = service.getSelectionRotationPivot(['r1']);
      const u = service.getUnionBBox(['r1']);
      expect(u).toBeTruthy();
      expect(p).toEqual({ x: u!.x + u!.width / 2, y: u!.y + u!.height / 2 });
    });
  });

  describe('getShapePropertiesIntersectingRect', () => {
    /** Marquee selection uses fill/stroke hit-testing; stub so jsdom rects behave like filled geometry. */
    function stubPaintAlwaysHits(...elements: (Element | null | undefined)[]) {
      for (const el of elements) {
        if (!el) continue;
        const g = el as SVGGeometryElement;
        g.isPointInFill = () => true;
        g.isPointInStroke = () => false;
      }
    }

    it('returns empty array when not initialized', () => {
      expect(service.getShapePropertiesIntersectingRect({ x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
    });

    it('returns only shapes whose bbox intersects the marquee', () => {
      const svgContent =
        '<svg viewBox="0 0 100 100"><rect id="lefty" x="10" y="10" width="15" height="15"/><rect id="righty" x="60" y="60" width="15" height="15"/></svg>';
      service.initializeSVG(container, svgContent);
      for (const id of ['lefty', 'righty']) {
        const el = container.querySelector(`#${id}`);
        if (el && typeof (el as SVGGraphicsElement).getBBox !== 'function') {
          const r = id === 'lefty' ? { x: 10, y: 10, width: 15, height: 15 } : { x: 60, y: 60, width: 15, height: 15 };
          (el as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () => r as DOMRect;
        }
      }
      stubPaintAlwaysHits(container.querySelector('#lefty'), container.querySelector('#righty'));
      const hits = service.getShapePropertiesIntersectingRect({ x: 0, y: 0, width: 40, height: 40 });
      expect(hits.map((h) => h.id)).toEqual(['lefty']);
    });

    it('returns all intersecting shapes in DOM order', () => {
      const svgContent =
        '<svg viewBox="0 0 100 100"><rect id="a" x="5" y="5" width="10" height="10"/><rect id="b" x="20" y="20" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      for (const id of ['a', 'b']) {
        const el = container.querySelector(`#${id}`);
        if (el && typeof (el as SVGGraphicsElement).getBBox !== 'function') {
          const r = id === 'a' ? { x: 5, y: 5, width: 10, height: 10 } : { x: 20, y: 20, width: 10, height: 10 };
          (el as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () => r as DOMRect;
        }
      }
      stubPaintAlwaysHits(container.querySelector('#a'), container.querySelector('#b'));
      const hits = service.getShapePropertiesIntersectingRect({ x: 0, y: 0, width: 100, height: 100 });
      expect(hits.map((h) => h.id)).toEqual(['a', 'b']);
    });

    it('does not select shape when marquee overlaps bbox but no sample hits fill/stroke (e.g. hole)', () => {
      const svgContent =
        '<svg viewBox="0 0 100 100"><path id="compound" d="M0 0 H100 V100 H0 Z M40 40 H60 V60 H40 Z" fill-rule="evenodd" fill="#000"/></svg>';
      service.initializeSVG(container, svgContent);
      const el = container.querySelector('#compound');
      if (el && typeof (el as SVGGraphicsElement).getBBox !== 'function') {
        (el as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
          ({ x: 0, y: 0, width: 100, height: 100 } as DOMRect);
      }
      const g = el as SVGGeometryElement;
      g.isPointInFill = (p) => (p?.x ?? 0) >= 50;
      g.isPointInStroke = () => false;
      const hitsLeft = service.getShapePropertiesIntersectingRect({ x: 5, y: 5, width: 20, height: 20 });
      expect(hitsLeft.map((h) => h.id)).toEqual([]);
      const hitsRight = service.getShapePropertiesIntersectingRect({ x: 55, y: 5, width: 20, height: 20 });
      expect(hitsRight.map((h) => h.id)).toEqual(['compound']);
    });

    it('selects shape when bbox is fully inside marquee even if no marquee sample hits paint', () => {
      const svgContent =
        '<svg viewBox="0 0 100 100"><rect id="tiny" x="45" y="45" width="2" height="2" fill="#000"/></svg>';
      service.initializeSVG(container, svgContent);
      const el = container.querySelector('#tiny');
      if (el && typeof (el as SVGGraphicsElement).getBBox !== 'function') {
        (el as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
          ({ x: 45, y: 45, width: 2, height: 2 } as DOMRect);
      }
      const g = el as SVGGeometryElement;
      g.isPointInFill = () => false;
      g.isPointInStroke = () => false;
      const hits = service.getShapePropertiesIntersectingRect({ x: 0, y: 0, width: 100, height: 100 });
      expect(hits.map((h) => h.id)).toEqual(['tiny']);
    });

    it('selects when a marquee edge crosses painted geometry that interior grid misses', () => {
      const svgContent =
        '<svg viewBox="0 0 100 100"><rect id="sliver" x="0" y="0" width="100" height="100" fill="#000"/></svg>';
      service.initializeSVG(container, svgContent);
      const el = container.querySelector('#sliver');
      if (el && typeof (el as SVGGraphicsElement).getBBox !== 'function') {
        (el as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
          ({ x: 0, y: 0, width: 100, height: 100 } as DOMRect);
      }
      const g = el as SVGGeometryElement;
      g.isPointInFill = (p) => {
        const x = p?.x ?? 0;
        const y = p?.y ?? 0;
        return x >= 10 && x <= 25 && y >= 1.5 && y <= 2.5;
      };
      g.isPointInStroke = () => false;
      const hits = service.getShapePropertiesIntersectingRect({ x: 0, y: 2, width: 100, height: 96 });
      expect(hits.map((h) => h.id)).toEqual(['sliver']);
    });

    it('partial marquee selects after translateShape when isPointInFill uses local coordinates', () => {
      const svgContent =
        '<svg viewBox="0 0 100 100"><rect id="moved" x="10" y="10" width="15" height="15" fill="#000"/></svg>';
      service.initializeSVG(container, svgContent);
      service.translateShape('moved', 30, 0);
      // Re-resolve node after matrix update (svg.js may replace the underlying element).
      const shapeWrapper = service.getSVGInstance()?.findOne('#moved') as { node: SVGGraphicsElement } | undefined;
      const el = shapeWrapper?.node;
      expect(el).toBeTruthy();
      // Always stub local getBBox: jsdom's native value can break matrixified user-space bbox.
      (el as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
        ({ x: 10, y: 10, width: 15, height: 15 } as DOMRect);
      const g = el as SVGGeometryElement;
      g.isPointInFill = (p) => {
        const x = p?.x ?? 0;
        const y = p?.y ?? 0;
        return x >= 10 && x <= 25 && y >= 10 && y <= 25;
      };
      g.isPointInStroke = () => false;
      const hits = service.getShapePropertiesIntersectingRect({ x: 45, y: 12, width: 20, height: 6 });
      expect(hits.map((h) => h.id)).toEqual(['moved']);
    });

    it('image partial marquee selects when isPointInFill always misses (opaque raster box)', () => {
      const tinyPngDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.insertRasterImageIntoContentGroup({
        href: tinyPngDataUrl,
        x: 12,
        y: 34,
        width: 64,
        height: 48
      });
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`) as SVGGraphicsElement;
      (el as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () =>
        ({ x: 12, y: 34, width: 64, height: 48 } as DOMRect);
      const g = el as SVGGeometryElement;
      g.isPointInFill = () => false;
      g.isPointInStroke = () => false;
      const hits = service.getShapePropertiesIntersectingRect({ x: 30, y: 40, width: 40, height: 40 });
      expect(hits.map((h) => h.id)).toEqual([id!]);
    });
  });

  describe('getLayerStackItems', () => {
    it('returns empty array when not initialized', () => {
      expect(service.getLayerStackItems()).toEqual([]);
    });

    it('returns editable shapes in DOM order with id/type/markup', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="back-rect" x="0" y="0" width="20" height="20"/><g id="group1"><rect id="nested-rect" width="1" height="1"/></g><circle id="front-circle" cx="30" cy="30" r="10"/></svg>';
      service.initializeSVG(container, svgContent);

      const items = service.getLayerStackItems();
      expect(items.map((item) => item.id)).toEqual(['back-rect', 'nested-rect', 'front-circle']);
      expect(items.map((item) => item.type)).toEqual(['rect', 'rect', 'circle']);
      expect(items[0].elementMarkup).toContain('<rect');
      expect(items[2].elementMarkup).toContain('<circle');
    });
  });

  describe('getLayerTree', () => {
    it('returns empty array when not initialized', () => {
      expect(service.getLayerTree()).toEqual([]);
    });

    it('returns flat list of shapes at top level (no groups)', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
        <circle id="c1" cx="50" cy="50" r="5"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const tree = service.getLayerTree();
      expect(tree.length).toBe(2);
      expect(tree[0].id).toBe('r1');
      expect(tree[0].type).toBe('rect');
      expect(tree[1].id).toBe('c1');
      expect(tree[1].type).toBe('circle');
      expect(tree[0].children).toBeUndefined();
      expect(tree[1].children).toBeUndefined();
    });

    it('returns groups with children array', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="layer1">
          <rect id="r1" x="0" y="0" width="10" height="10"/>
          <circle id="c1" cx="50" cy="50" r="5"/>
        </g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const tree = service.getLayerTree();
      expect(tree.length).toBe(1);
      expect(tree[0].type).toBe('g');
      expect(tree[0].kind).toBe('group');
      expect(tree[0].id).toBe('layer1');
      expect(tree[0].children).toBeDefined();
      expect(tree[0].children!.length).toBe(2);
      expect(tree[0].children![0].id).toBe('r1');
      expect(tree[0].children![1].id).toBe('c1');
    });

    it('nested groups create nested children', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="outer">
          <g id="inner">
            <rect id="r1" x="0" y="0" width="10" height="10"/>
          </g>
        </g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const tree = service.getLayerTree();
      expect(tree.length).toBe(1);
      expect(tree[0].id).toBe('outer');
      expect(tree[0].children!.length).toBe(1);
      expect(tree[0].children![0].id).toBe('inner');
      expect(tree[0].children![0].children!.length).toBe(1);
      expect(tree[0].children![0].children![0].id).toBe('r1');
    });

    it('skips defs, clipPath, mask elements', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <defs><clipPath id="cp"><rect x="0" y="0" width="50" height="50"/></clipPath></defs>
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const tree = service.getLayerTree();
      expect(tree.length).toBe(1);
      expect(tree[0].id).toBe('r1');
    });

    it('includes visibility info', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="vis" x="0" y="0" width="10" height="10"/>
        <rect id="hid" x="20" y="0" width="10" height="10" visibility="hidden"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const tree = service.getLayerTree();
      expect(tree.length).toBe(2);
      expect(tree[0].visible).toBe(true);
      expect(tree[1].visible).toBe(false);
    });

    it('includes locked flag from data-editor-locked', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="free" x="0" y="0" width="10" height="10"/>
        <circle id="lck" cx="5" cy="5" r="3" data-editor-locked="true"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const tree = service.getLayerTree();
      expect(tree.find((n) => n.id === 'free')?.locked).toBe(false);
      expect(tree.find((n) => n.id === 'lck')?.locked).toBe(true);
    });

    it('represents clip-path carriers as clip branches with clipped preview markup', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <defs>
          <clipPath id="cp">
            <rect id="clip-geom" data-editor-clip-source-id="mask-rect" x="0" y="0" width="40" height="40"/>
          </clipPath>
        </defs>
        <g id="clip-carrier" clip-path="url(#cp)">
          <rect id="inner" x="10" y="10" width="80" height="80" fill="red"/>
        </g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const tree = service.getLayerTree();
      expect(tree.length).toBe(1);
      expect(tree[0].type).toBe('clip');
      expect(tree[0].kind).toBe('clipMask');
      expect(tree[0].name).toBe('mask-rect');
      expect(tree[0].children?.length).toBe(1);
      expect(tree[0].children![0].type).toBe('rect');
      expect(tree[0].previewMarkup).toContain('<clipPath id="cp">');
      expect(tree[0].previewMarkup).toContain('clip-path="url(#cp)"');
      expect(tree[0].previewMarkup).toContain('id="inner"');
    });

    it('uses carrier data-name for clip-path carrier when set', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <defs>
          <clipPath id="cp">
            <rect id="clip-geom" data-editor-clip-source-id="mask-rect" x="0" y="0" width="40" height="40"/>
          </clipPath>
        </defs>
        <g id="clip-carrier" clip-path="url(#cp)" data-name="Custom mask label">
          <rect id="inner" x="10" y="10" width="80" height="80" fill="red"/>
        </g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const tree = service.getLayerTree();
      expect(tree[0].name).toBe('Custom mask label');
    });
  });

  describe('moveElementForward / moveElementBackward', () => {
    it('moveElementForward swaps with next sibling', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="a" x="0" y="0" width="10" height="10"/>
        <rect id="b" x="20" y="0" width="10" height="10"/>
        <rect id="c" x="40" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const result = service.moveElementForward('a');
      expect(result).toBe(true);
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const ids = Array.from(contentGroup.children).map((el) => el.id).filter(Boolean);
      expect(ids).toEqual(['b', 'a', 'c']);
    });

    it('moveElementBackward swaps with previous sibling', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="a" x="0" y="0" width="10" height="10"/>
        <rect id="b" x="20" y="0" width="10" height="10"/>
        <rect id="c" x="40" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const result = service.moveElementBackward('c');
      expect(result).toBe(true);
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const ids = Array.from(contentGroup.children).map((el) => el.id).filter(Boolean);
      expect(ids).toEqual(['a', 'c', 'b']);
    });

    it('moveElementForward returns false when already last', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="a" x="0" y="0" width="10" height="10"/>
        <rect id="b" x="20" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.moveElementForward('b')).toBe(false);
    });

    it('moveElementBackward returns false when already first', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="a" x="0" y="0" width="10" height="10"/>
        <rect id="b" x="20" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.moveElementBackward('a')).toBe(false);
    });

    it('bumps documentRevision on success', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="a" x="0" y="0" width="10" height="10"/>
        <rect id="b" x="20" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      service.moveElementForward('a');
      expect(service.documentRevision()).toBe(before + 1);
    });
  });

  describe('moveElementToFront / moveElementToBack', () => {
    it('moveElementToFront moves to last child', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="a" x="0" y="0" width="10" height="10"/>
        <rect id="b" x="20" y="0" width="10" height="10"/>
        <rect id="c" x="40" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const result = service.moveElementToFront('a');
      expect(result).toBe(true);
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const ids = Array.from(contentGroup.children).map((el) => el.id).filter(Boolean);
      expect(ids).toEqual(['b', 'c', 'a']);
    });

    it('moveElementToBack moves to first child', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="a" x="0" y="0" width="10" height="10"/>
        <rect id="b" x="20" y="0" width="10" height="10"/>
        <rect id="c" x="40" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const result = service.moveElementToBack('c');
      expect(result).toBe(true);
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const ids = Array.from(contentGroup.children).map((el) => el.id).filter(Boolean);
      expect(ids).toEqual(['c', 'a', 'b']);
    });

    it('moveElementToFront returns false when already at position', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="a" x="0" y="0" width="10" height="10"/>
        <rect id="b" x="20" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.moveElementToFront('b')).toBe(false);
    });

    it('moveElementToBack returns false when already at position', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="a" x="0" y="0" width="10" height="10"/>
        <rect id="b" x="20" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.moveElementToBack('a')).toBe(false);
    });
  });

  describe('toggleLayerVisibility', () => {
    it('toggles from visible to hidden (adds display:none)', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const nowVisible = service.toggleLayerVisibility('r1');
      expect(nowVisible).toBe(false);
      const el = container.querySelector('#r1');
      expect(el?.getAttribute('display')).toBe('none');
    });

    it('toggles from hidden to visible (removes display:none)', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.toggleLayerVisibility('r1');
      const nowVisible = service.toggleLayerVisibility('r1');
      expect(nowVisible).toBe(true);
      const el = container.querySelector('#r1');
      expect(el?.getAttribute('display')).not.toBe('none');
    });

    it('returns new visibility state', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.toggleLayerVisibility('r1')).toBe(false);
      expect(service.toggleLayerVisibility('r1')).toBe(true);
      expect(service.toggleLayerVisibility('r1')).toBe(false);
    });

    it('bumps documentRevision', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      service.toggleLayerVisibility('r1');
      expect(service.documentRevision()).toBe(before + 1);
    });
  });

  describe('isElementVisible', () => {
    it('returns true for visible element', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.isElementVisible('r1')).toBe(true);
    });

    it('returns false for display:none element', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10" display="none"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.isElementVisible('r1')).toBe(false);
    });

    it('returns false for visibility:hidden element', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10" visibility="hidden"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.isElementVisible('r1')).toBe(false);
    });
  });

  describe('groupSelectedElements', () => {
    it('creates a <g> element wrapping the given shapes', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
        <circle id="c1" cx="50" cy="50" r="5"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const groupId = service.groupSelectedElements(['r1', 'c1']);
      expect(groupId).toBeTruthy();
      const group = container.querySelector(`#${groupId}`);
      expect(group?.tagName.toLowerCase()).toBe('g');
      expect(group?.querySelector('#r1')).toBeTruthy();
      expect(group?.querySelector('#c1')).toBeTruthy();
    });

    it('group is inserted at position of first element in DOM order', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="stay" x="0" y="0" width="5" height="5"/>
        <rect id="r1" x="0" y="0" width="10" height="10"/>
        <circle id="c1" cx="50" cy="50" r="5"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const groupId = service.groupSelectedElements(['r1', 'c1']);
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const topChildren = Array.from(contentGroup.children);
      const groupIndex = topChildren.findIndex((el) => el.id === groupId);
      const stayIndex = topChildren.findIndex((el) => el.id === 'stay');
      expect(groupIndex).toBe(stayIndex + 1);
    });

    it('returns the new group id', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const groupId = service.groupSelectedElements(['r1']);
      expect(groupId).toBeTruthy();
      expect(typeof groupId).toBe('string');
      expect(groupId!.startsWith('group-')).toBe(true);
    });

    it('elements inside group maintain relative order', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
        <rect id="r2" x="20" y="0" width="10" height="10"/>
        <rect id="r3" x="40" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const groupId = service.groupSelectedElements(['r3', 'r1', 'r2']);
      const group = container.querySelector(`#${groupId}`)!;
      const childIds = Array.from(group.children).map((el) => el.id);
      expect(childIds).toEqual(['r1', 'r2', 'r3']);
    });

    it('returns null for empty array', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.groupSelectedElements([])).toBeNull();
    });

    it('bumps documentRevision', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
        <circle id="c1" cx="50" cy="50" r="5"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      service.groupSelectedElements(['r1', 'c1']);
      expect(service.documentRevision()).toBe(before + 1);
    });

    it('removes empty former parent groups when grouping across separate groups', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="g-left"><rect id="r1" x="0" y="0" width="10" height="10"/></g>
        <g id="g-right"><rect id="r2" x="20" y="0" width="10" height="10"/></g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.groupSelectedElements(['r1', 'r2']);
      expect(container.querySelector('#g-left')).toBeNull();
      expect(container.querySelector('#g-right')).toBeNull();
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const groups = contentGroup.querySelectorAll('g');
      expect(groups.length).toBe(1);
      expect(groups[0].querySelector('#r1')).toBeTruthy();
      expect(groups[0].querySelector('#r2')).toBeTruthy();
    });

    it('wraps two sibling groups in a new outer group', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="ga"><rect id="r1" width="5" height="5"/></g>
        <g id="gb"><rect id="r2" width="5" height="5"/></g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const gid = service.groupSelectedElements(['ga', 'gb']);
      expect(gid).toBeTruthy();
      const outer = container.querySelector(`#${gid}`);
      expect(outer?.querySelector('#ga')).toBeTruthy();
      expect(outer?.querySelector('#gb')).toBeTruthy();
    });

    it('wraps a group and a top-level shape together', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="ga"><rect id="r1" width="5" height="5"/></g>
        <rect id="r2" width="5" height="5"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const gid = service.groupSelectedElements(['ga', 'r2']);
      expect(gid).toBeTruthy();
      const outer = container.querySelector(`#${gid}`);
      expect(outer?.querySelector('#ga')).toBeTruthy();
      expect(outer?.querySelector('#r2')).toBeTruthy();
    });
  });

  describe('ungroupElement', () => {
    it('moves children to parent at group position', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="before" x="0" y="0" width="5" height="5"/>
        <g id="grp">
          <rect id="r1" x="0" y="0" width="10" height="10"/>
          <circle id="c1" cx="50" cy="50" r="5"/>
        </g>
        <rect id="after" x="80" y="0" width="5" height="5"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.ungroupElement('grp');
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const ids = Array.from(contentGroup.children).map((el) => el.id).filter(Boolean);
      expect(ids).toEqual(['before', 'r1', 'c1', 'after']);
    });

    it('removes the empty group', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="grp"><rect id="r1" x="0" y="0" width="10" height="10"/></g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.ungroupElement('grp');
      expect(container.querySelector('#grp')).toBeNull();
    });

    it('returns child ids', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="grp">
          <rect id="r1" x="0" y="0" width="10" height="10"/>
          <circle id="c1" cx="50" cy="50" r="5"/>
        </g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const ids = service.ungroupElement('grp');
      expect(ids).toEqual(['r1', 'c1']);
    });

    it('returns empty array for non-group element', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.ungroupElement('r1')).toEqual([]);
    });

    it('bumps documentRevision', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="grp"><rect id="r1" x="0" y="0" width="10" height="10"/></g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      service.ungroupElement('grp');
      expect(service.documentRevision()).toBe(before + 1);
    });

    it('hoists nested group children to the outer group', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="outer">
          <g id="inner">
            <rect id="r1" x="0" y="0" width="10" height="10"/>
            <rect id="r2" x="20" y="0" width="10" height="10"/>
          </g>
        </g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.ungroupElement('inner');
      const outer = container.querySelector('#outer')!;
      expect(outer.querySelector('#inner')).toBeNull();
      const ids = Array.from(outer.children).map((el) => el.id);
      expect(ids).toEqual(['r1', 'r2']);
    });
  });

  describe('addElementsToGroup', () => {
    it('moves root shapes into an existing group', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="grp"><rect id="inside" width="2" height="2"/></g>
        <rect id="r1" x="0" y="0" width="10" height="10"/>
        <circle id="c1" cx="50" cy="50" r="5"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const moved = service.addElementsToGroup(['r1', 'c1'], 'grp');
      expect(moved).toEqual(['r1', 'c1']);
      const group = container.querySelector('#grp')!;
      expect(group.querySelector('#r1')).toBeTruthy();
      expect(group.querySelector('#c1')).toBeTruthy();
    });

    it('moves a shape from one nested group into another', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="ga"><rect id="r1" width="5" height="5"/></g>
        <g id="gb"><rect id="r2" width="5" height="5"/></g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.addElementsToGroup(['r1'], 'gb');
      expect(container.querySelector('#gb')?.querySelector('#r1')).toBeTruthy();
      expect(container.querySelector('#ga')).toBeNull();
    });

    it('returns null when target is a clip carrier', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="clipper" clip-path="url(#c)"><rect id="r1" width="5" height="5"/></g>
        <rect id="r2" width="5" height="5"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.addElementsToGroup(['r2'], 'clipper')).toBeNull();
    });

    it('returns null when moving group into itself or descendant', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="outer"><g id="inner"><rect id="r1" width="2" height="2"/></g></g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.addElementsToGroup(['outer'], 'inner')).toBeNull();
      expect(service.addElementsToGroup(['inner'], 'inner')).toBeNull();
    });
  });

  describe('removeElementsFromGroup', () => {
    it('hoists one child from inner group to outer group', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="outer">
          <g id="inner">
            <rect id="r1" x="0" y="0" width="10" height="10"/>
            <rect id="r2" x="20" y="0" width="10" height="10"/>
          </g>
        </g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const moved = service.removeElementsFromGroup(['r1']);
      expect(moved).toEqual(['r1']);
      const outer = container.querySelector('#outer')!;
      expect(outer.querySelector('#inner')?.querySelector('#r1')).toBeNull();
      expect(outer.querySelector('#r1')).toBeTruthy();
      expect(outer.querySelector('#inner')?.querySelector('#r2')).toBeTruthy();
    });

    it('prunes empty inner group after removing its only child', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="outer"><g id="inner"><rect id="r1" width="2" height="2"/></g></g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.removeElementsFromGroup(['r1']);
      expect(container.querySelector('#inner')).toBeNull();
      expect(container.querySelector('#outer')?.querySelector('#r1')).toBeTruthy();
    });

    it('hoists from outer group to content root and prunes empty group', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="before" width="2" height="2"/>
        <g id="grp"><rect id="r1" width="5" height="5"/></g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.removeElementsFromGroup(['r1']);
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const ids = Array.from(contentGroup.children).map((el) => el.id).filter(Boolean);
      expect(ids).toEqual(['before', 'r1']);
      expect(container.querySelector('#grp')).toBeNull();
    });
  });

  describe('reparentElementsToParent / restoreElementParentOrder', () => {
    it('reparentElementsToParent moves element to content root before sibling', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="grp"><rect id="r1" width="5" height="5"/><rect id="r1b" width="3" height="3"/></g>
        <rect id="after" width="2" height="2"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const moved = service.reparentElementsToParent(['r1'], null, 'after');
      expect(moved).toEqual(['r1']);
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const ids = Array.from(contentGroup.children).map((el) => el.id).filter(Boolean);
      expect(ids).toEqual(['grp', 'r1', 'after']);
    });

    it('restoreElementParentOrder undoes a reparent', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="grp"><rect id="r1" width="5" height="5"/><rect id="r1b" width="3" height="3"/></g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const snap = service.snapshotElementParentOrder(['r1']);
      service.reparentElementsToParent(['r1'], null, null);
      expect(container.querySelector('#grp')?.querySelector('#r1')).toBeNull();
      service.restoreElementParentOrder(
        snap[0].elementId,
        snap[0].formerParentId,
        snap[0].formerIndex
      );
      expect(container.querySelector('#grp')?.querySelector('#r1')).toBeTruthy();
    });
  });

  describe('ungroupElements', () => {
    it('ungroups two sibling groups in one revision', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="g1"><rect id="a" width="2" height="2"/></g>
        <g id="g2"><rect id="b" width="2" height="2"/></g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      const { allChildElementIds, undoSnapshots } = service.ungroupElements(['g1', 'g2']);
      expect(service.documentRevision()).toBe(before + 1);
      expect(container.querySelector('#g1')).toBeNull();
      expect(container.querySelector('#g2')).toBeNull();
      expect(allChildElementIds).toEqual(['a', 'b']);
      expect(undoSnapshots).toEqual([['a'], ['b']]);
    });

    it('with nested selection, ungroups only the inner selected group', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <g id="outer">
          <g id="inner">
            <rect id="r1" width="2" height="2"/>
          </g>
        </g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.ungroupElements(['outer', 'inner']);
      expect(container.querySelector('#inner')).toBeNull();
      expect(container.querySelector('#outer')).toBeTruthy();
      const outer = container.querySelector('#outer')!;
      expect(outer.querySelector('#r1')).toBeTruthy();
    });
  });

  describe('renameElement / getElementName', () => {
    it('sets and gets data-name attribute', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.renameElement('r1', 'My Rectangle');
      expect(service.getElementName('r1')).toBe('My Rectangle');
      const el = container.querySelector('#r1');
      expect(el?.getAttribute('data-name')).toBe('My Rectangle');
    });

    it('falls back to element id when no data-name', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.getElementName('r1')).toBe('r1');
    });

    it('removes data-name when rename receives empty string', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10" data-name="Named"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.renameElement('r1', '   ');
      expect(service.getElementDataName('r1')).toBeNull();
      expect(service.getElementName('r1')).toBe('r1');
    });
  });

  describe('layer display name port helpers', () => {
    it('resolveLayerDisplayName matches clip carrier tree fallback', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <defs>
          <clipPath id="cp">
            <rect id="clip-geom" data-editor-clip-source-id="mask-rect" x="0" y="0" width="40" height="40"/>
          </clipPath>
        </defs>
        <g id="clip-carrier" clip-path="url(#cp)">
          <rect id="inner" x="10" y="10" width="80" height="80" fill="red"/>
        </g>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.resolveLayerDisplayName('clip-carrier', 'clipMask')).toBe('mask-rect');
      expect(service.getElementDataName('clip-carrier')).toBeNull();
    });

    it('setElementDataName round-trips through getElementDataName', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="10" height="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.setElementDataName('r1', 'Custom');
      expect(service.getElementDataName('r1')).toBe('Custom');
      service.setElementDataName('r1', null);
      expect(service.getElementDataName('r1')).toBeNull();
    });
  });

  describe('stroke dash array', () => {
    it('getShapeProperties reads stroke-dasharray from presentation attribute', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#000" stroke-width="2" stroke-dasharray="5,3"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.strokeDasharray).toBe('5,3');
    });

    it('getShapeProperties returns undefined strokeDasharray when no dash is set', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#000" stroke-width="2"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.strokeDasharray).toBeUndefined();
    });

    it('getShapeProperties reads stroke-dashoffset', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#000" stroke-width="2" stroke-dasharray="5,3" stroke-dashoffset="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.strokeDashoffset).toBe(10);
    });

    it('getShapeProperties returns 0 strokeDashoffset when unset', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#000" stroke-width="2"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.strokeDashoffset).toBe(0);
    });

    it('updateStrokeDasharray sets stroke-dasharray attribute', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#000" stroke-width="2"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.updateStrokeDasharray('r1', '8,4');
      const el = container.querySelector('#r1');
      expect(el?.getAttribute('stroke-dasharray')).toBe('8,4');
    });

    it('updateStrokeDasharray removes dasharray when set to none', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#000" stroke-width="2" stroke-dasharray="5,3"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.updateStrokeDasharray('r1', 'none');
      const el = container.querySelector('#r1');
      expect(el?.getAttribute('stroke-dasharray')).toBeNull();
    });

    it('updateStrokeDasharray removes dasharray when set to empty string', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#000" stroke-width="2" stroke-dasharray="5,3"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.updateStrokeDasharray('r1', '');
      const el = container.querySelector('#r1');
      expect(el?.getAttribute('stroke-dasharray')).toBeNull();
    });

    it('updateStrokeDashoffset sets stroke-dashoffset attribute', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#000" stroke-width="2" stroke-dasharray="5,3"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.updateStrokeDashoffset('r1', 7);
      const el = container.querySelector('#r1');
      expect(el?.getAttribute('stroke-dashoffset')).toBe('7');
    });

    it('updateStrokeDashoffset removes attribute when set to 0', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#000" stroke-width="2" stroke-dashoffset="10"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.updateStrokeDashoffset('r1', 0);
      const el = container.querySelector('#r1');
      expect(el?.getAttribute('stroke-dashoffset')).toBeNull();
    });

    it('updateStrokeDasharray bumps documentRevision', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#000" stroke-width="2"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      service.updateStrokeDasharray('r1', '5,3');
      expect(service.documentRevision()).toBeGreaterThan(before);
    });

    it('getShapeProperties reads rect corner radius', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="30" rx="8"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const el = service.getSVGInstance()!.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.rx).toBe(8);
      expect(props.ry).toBe(8);
      expect(props.rectMaxCornerRadius).toBe(15);
    });

    it('updateRectCornerRadius sets rx and ry attributes', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="30"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.updateRectCornerRadius('r1', 6);
      const node = container.querySelector('#r1');
      expect(node?.getAttribute('rx')).toBe('6');
      expect(node?.getAttribute('ry')).toBe('6');
    });

    it('restoreRectCornerRadii restores asymmetric radii', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="30" rx="8" ry="8"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      service.restoreRectCornerRadii('r1', 8, 4);
      const node = container.querySelector('#r1');
      expect(node?.getAttribute('rx')).toBe('8');
      expect(node?.getAttribute('ry')).toBe('4');
    });
  });

  describe('paint type classification (gradient/pattern/solid)', () => {
    it('getShapeProperties sets fillPaintType to solid for hex fill', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" fill="#FF0000"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.fillPaintType).toBe('solid');
      expect(props.fillUrl).toBeUndefined();
    });

    it('getShapeProperties sets fillPaintType to none when fill is none', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" fill="none"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.fillPaintType).toBe('none');
    });

    it('getShapeProperties detects gradient fill from url(#...)', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="grad1">
            <stop offset="0%" stop-color="#FF0000"/>
            <stop offset="100%" stop-color="#0000FF"/>
          </linearGradient>
        </defs>
        <rect id="r1" x="0" y="0" width="50" height="50" fill="url(#grad1)"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.fillPaintType).toBe('gradient');
      expect(props.fillUrl).toContain('url(#grad1)');
      expect(props.fill).toBeUndefined();
    });

    it('getShapeProperties detects pattern fill from url(#...)', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <defs>
          <pattern id="pat1" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="3" fill="red"/>
          </pattern>
        </defs>
        <rect id="r1" x="0" y="0" width="50" height="50" fill="url(#pat1)"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.fillPaintType).toBe('pattern');
      expect(props.fillUrl).toContain('url(#pat1)');
      expect(props.fill).toBeUndefined();
    });

    it('gradient fill does not bleed into fill hex (normalizeColorForPicker guard)', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="g1">
            <stop offset="0%" stop-color="#FF0000"/>
            <stop offset="100%" stop-color="#0000FF"/>
          </linearGradient>
        </defs>
        <rect id="r1" x="0" y="0" width="50" height="50" fill="url(#g1)"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.fill).toBeUndefined();
      expect(props.fillPaintType).not.toBe('solid');
    });

    it('preserves gradient classification when rendered fill is rgb but raw fill is url(#...)', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="g1">
            <stop offset="0%" stop-color="#FF0000"/>
            <stop offset="100%" stop-color="#0000FF"/>
          </linearGradient>
        </defs>
        <rect id="r1" x="0" y="0" width="50" height="50" fill="url(#g1)" style="fill: rgb(255, 0, 0)"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.fillPaintType).toBe('gradient');
      expect(props.fillUrl).toContain('url(#g1)');
      expect(props.fill).toBeUndefined();
    });

    it('getShapeProperties returns solid strokePaintType for hex stroke', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <rect id="r1" x="0" y="0" width="50" height="50" stroke="#00FF00" stroke-width="2"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#r1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.strokePaintType).toBe('solid');
    });
  });

  describe('gradient fill API (e1x)', () => {
    it('createLinearGradientFillForShape assigns url fill and defs entry', () => {
      const svgContent = `<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="50" fill="#808080"/></svg>`;
      service.initializeSVG(container, svgContent);
      const gradId = service.createLinearGradientFillForShape('r1', '#808080', '#ffffff');
      expect(gradId.length).toBeGreaterThan(0);
      const svg = service.getSVGInstance()!;
      const rect = svg.findOne('#r1')!.node as SVGRectElement;
      expect(rect.getAttribute('fill')).toContain(`url(#${gradId})`);
      expect(service.findGradientDomElement(gradId)).not.toBeNull();
    });

    it('exportSVG includes editor-created gradient defs from content group', () => {
      const svgContent = `<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="50" fill="#808080"/></svg>`;
      service.initializeSVG(container, svgContent);
      const gradId = service.createLinearGradientFillForShape('r1', '#808080', '#ffffff');
      const exported = service.exportSVG();
      expect(exported).toContain('<linearGradient');
      expect(exported).toContain(`id="${gradId}"`);
      expect(exported).toContain(`url(#${gradId})`);
    });

    it('updateFillColor to solid purges orphaned gradient def from export', () => {
      const svgContent = `<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="50" fill="#808080"/></svg>`;
      service.initializeSVG(container, svgContent);
      const gradId = service.createLinearGradientFillForShape('r1', '#808080', '#ffffff');
      service.updateFillColor('r1', '#123456');
      expect(service.findGradientDomElement(gradId)).toBeNull();
      const exported = service.exportSVG();
      expect(exported).not.toContain('linearGradient');
      expect(exported).not.toContain(gradId);
    });

    it('ensureDedicatedPaintGradient clones when two shapes share a gradient', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="sharedG"><stop offset="0%" stop-color="#f00"/><stop offset="100%" stop-color="#00f"/></linearGradient>
        </defs>
        <rect id="r1" x="0" y="0" width="10" height="10" fill="url(#sharedG)"/>
        <rect id="r2" x="20" y="0" width="10" height="10" fill="url(#sharedG)"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const newId = service.ensureDedicatedPaintGradient('r1', 'fill');
      expect(newId).not.toBe('sharedG');
      const svg = service.getSVGInstance()!;
      const f1 = (svg.findOne('#r1')!.node as SVGRectElement).getAttribute('fill');
      const f2 = (svg.findOne('#r2')!.node as SVGRectElement).getAttribute('fill');
      expect(f1).toContain(`url(#${newId})`);
      expect(f2).toContain('url(#sharedG)');
    });

    it('applyPaintGradientSnapshot restores solid and removes orphan def on manual undo pattern', () => {
      const svgContent = `<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="50" fill="#abc"/></svg>`;
      service.initializeSVG(container, svgContent);
      const before = service.capturePaintGradientSnapshot('r1', 'fill');
      const gid = service.createLinearGradientFillForShape('r1', '#abc', '#def');
      const after = service.capturePaintGradientSnapshot('r1', 'fill');
      service.applyPaintGradientSnapshot('r1', 'fill', before);
      if (service.countPaintUrlReferencesToDefId(gid) === 0) {
        service.removeGradientDefById(gid);
      }
      const svg = service.getSVGInstance()!;
      const rect = svg.findOne('#r1')!.node as SVGRectElement;
      const fill = rect.getAttribute('fill')?.toLowerCase() ?? '';
      expect(['#abc', '#aabbcc']).toContain(fill);
      expect(service.findGradientDomElement(gid)).toBeNull();
    });

    it('countPaintUrlReferencesToDefId counts fill attributes', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <defs><linearGradient id="g1"><stop offset="0%" stop-color="#000"/></linearGradient></defs>
        <rect id="r1" width="10" height="10" fill="url(#g1)"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      expect(service.countPaintUrlReferencesToDefId('g1')).toBeGreaterThanOrEqual(1);
    });
  });

  describe('line/polyline fill behavior', () => {
    it('getShapeProperties for line still returns fill info from DOM', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <line id="l1" x1="0" y1="0" x2="50" y2="50" stroke="#000" stroke-width="2"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#l1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.type).toBe('line');
    });

    it('getShapeProperties for polyline returns type polyline', () => {
      const svgContent = `<svg viewBox="0 0 100 100">
        <polyline id="pl1" points="0,0 50,50 100,0" stroke="#000" stroke-width="2" fill="none"/>
      </svg>`;
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const el = svg.findOne('#pl1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(el);
      expect(props.type).toBe('polyline');
    });
  });

  describe('artboard model', () => {
    it('populates artboard from viewBox on initialization', () => {
      const svgContent = '<svg viewBox="10 20 300 200"><rect id="r1" x="0" y="0" width="50" height="50"/></svg>';
      service.initializeSVG(container, svgContent);
      const ab = service.getArtboard();
      expect(ab.width).toBe(300);
      expect(ab.height).toBe(200);
      expect(ab.minX).toBe(10);
      expect(ab.minY).toBe(20);
    });

    it('defaults artboard to width/height when no viewBox', () => {
      const svgContent = '<svg width="400" height="300"><rect id="r1" x="0" y="0" width="50" height="50"/></svg>';
      service.initializeSVG(container, svgContent);
      const ab = service.getArtboard();
      expect(ab.width).toBe(400);
      expect(ab.height).toBe(300);
    });

    it('artboard has white background by default', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const ab = service.getArtboard();
      expect(ab.backgroundColor).toBe('#ffffff');
    });

    it('setArtboardSize updates artboard and documentViewBox', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.setArtboardSize(500, 400);
      const ab = service.getArtboard();
      expect(ab.width).toBe(500);
      expect(ab.height).toBe(400);
      expect(service.getDocumentViewBox()).toBe('0 0 500 400');
    });

    it('setArtboardSize with bottom-right anchor keeps bottom-right corner fixed', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.setArtboardResizeAnchor('bottom-right');
      service.setArtboardSize(200, 150);
      const ab = service.getArtboard();
      expect(ab.minX).toBe(-100);
      expect(ab.minY).toBe(-50);
      expect(ab.width).toBe(200);
      expect(ab.height).toBe(150);
      expect(service.getDocumentViewBox()).toBe('-100 -50 200 150');
    });

    it('setArtboardSize explicitOrigin bypasses anchor math', () => {
      const svgContent = '<svg viewBox="10 20 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.setArtboardResizeAnchor('center');
      service.setArtboardSize(200, 200, { minX: 10, minY: 20 });
      const ab = service.getArtboard();
      expect(ab.minX).toBe(10);
      expect(ab.minY).toBe(20);
      expect(ab.width).toBe(200);
      expect(ab.height).toBe(200);
    });

    it('setArtboardSize rejects zero dimensions', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.setArtboardSize(0, 400);
      expect(service.getArtboard().width).toBe(100);
    });

    it('setArtboardSize rejects negative dimensions', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.setArtboardSize(-50, 400);
      expect(service.getArtboard().width).toBe(100);
    });

    it('setBackgroundColor updates artboard background', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.setBackgroundColor('#ff0000');
      expect(service.getArtboard().backgroundColor).toBe('#ff0000');
    });

    it('setBackgroundColor updates the viewbox rect fill', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.setBackgroundColor('#00ff00');
      const svg = service.getSVGInstance()!;
      const viewBoxRect = svg.findOne('[data-editor-viewbox-rect]') as import('@svgdotjs/svg.js').Element;
      expect(viewBoxRect).toBeTruthy();
      const fill = viewBoxRect.attr('fill');
      expect(fill).toBe('#00ff00');
    });

    it('exportSVG includes width and height attributes', () => {
      const svgContent = '<svg viewBox="0 0 200 150"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const exported = service.exportSVG();
      expect(exported).toContain('width="200"');
      expect(exported).toContain('height="150"');
    });

    it('exportSVG reflects updated artboard size', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.setArtboardSize(500, 400);
      const exported = service.exportSVG();
      expect(exported).toContain('width="500"');
      expect(exported).toContain('height="400"');
      expect(exported).toContain('viewBox="0 0 500 400"');
    });

    it('artboard document rect has no stroke (outline is on zoom-independent overlay)', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const viewBoxRect = svg.findOne('[data-editor-viewbox-rect]');
      expect(viewBoxRect).toBeTruthy();
      expect(String(viewBoxRect!.attr('stroke') ?? 'none').toLowerCase()).toBe('none');
    });

    it('artboard document rect has no filter (shadow is on zoom-independent overlay)', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const viewBoxRect = svg.findOne('[data-editor-viewbox-rect]');
      expect(viewBoxRect).toBeTruthy();
      expect(viewBoxRect!.attr('filter')).toBeFalsy();
    });
  });

  describe('artboard commands undo/redo', () => {
    it('ArtboardSizeCommand undo restores original size', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);

      const cmd = new ArtboardSizeCommand(service, 100, 100, 0, 0, 500, 400);
      cmd.execute();
      expect(service.getArtboard().width).toBe(500);
      expect(service.getArtboard().height).toBe(400);

      cmd.undo();
      expect(service.getArtboard().width).toBe(100);
      expect(service.getArtboard().height).toBe(100);
    });

    it('ArtboardSizeCommand undo restores origin after center-anchored resize', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.setArtboardResizeAnchor('center');

      const cmd = new ArtboardSizeCommand(service, 100, 100, 0, 0, 200, 200);
      cmd.execute();
      expect(service.getArtboard().minX).toBe(-50);
      expect(service.getArtboard().minY).toBe(-50);

      cmd.undo();
      expect(service.getArtboard().minX).toBe(0);
      expect(service.getArtboard().minY).toBe(0);
      expect(service.getArtboard().width).toBe(100);
      expect(service.getArtboard().height).toBe(100);
    });

    it('ArtboardBackgroundCommand undo restores original color', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);

      const cmd = new ArtboardBackgroundCommand(service, '#ffffff', '#ff0000');
      cmd.execute();
      expect(service.getArtboard().backgroundColor).toBe('#ff0000');

      cmd.undo();
      expect(service.getArtboard().backgroundColor).toBe('#ffffff');
    });
  });

  describe('addShape', () => {
    it('creates a rect with correct attributes', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="existing" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('rect', { x: 10, y: 20, width: 50, height: 30 });
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el).not.toBeNull();
      expect(el?.tagName.toLowerCase()).toBe('rect');
      expect(el?.getAttribute('width')).toBe('50');
      expect(el?.getAttribute('height')).toBe('30');
      expect(el?.getAttribute('x')).toBe('10');
      expect(el?.getAttribute('y')).toBe('20');
    });

    it('creates an ellipse with correct attributes', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="existing" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('ellipse', { cx: 60, cy: 40, rx: 30, ry: 20 });
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el).not.toBeNull();
      expect(el?.tagName.toLowerCase()).toBe('ellipse');
      expect(el?.getAttribute('rx')).toBe('30');
      expect(el?.getAttribute('ry')).toBe('20');
      expect(el?.getAttribute('cx')).toBe('60');
      expect(el?.getAttribute('cy')).toBe('40');
    });

    it('creates a line with correct attributes', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="existing" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('line', { x1: 5, y1: 10, x2: 80, y2: 90 });
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el).not.toBeNull();
      expect(el?.tagName.toLowerCase()).toBe('line');
      expect(el?.getAttribute('x1')).toBe('5');
      expect(el?.getAttribute('y1')).toBe('10');
      expect(el?.getAttribute('x2')).toBe('80');
      expect(el?.getAttribute('y2')).toBe('90');
    });

    it('creates text with default content at the given position', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('text', { x: 24, y: 36, textContent: 'Text' });
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el).not.toBeNull();
      expect(el?.tagName.toLowerCase()).toBe('text');
      expect(el?.getAttribute('x')).toBe('24');
      expect(el?.getAttribute('y')).toBe('36');
      expect(el?.textContent).toBe('Text');
    });

    it('applies canonical default paint for rect when no overrides given', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('rect', {});
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el?.getAttribute('fill')?.toLowerCase()).toBe('#000000');
      expect(el?.getAttribute('stroke')?.toLowerCase()).toBe('#000000');
      expect(el?.getAttribute('stroke-width')).toBe('2');
    });

    it('applies canonical default paint for ellipse when no overrides given', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('ellipse', {});
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el?.getAttribute('fill')?.toLowerCase()).toBe('#000000');
      expect(el?.getAttribute('stroke')?.toLowerCase()).toBe('#000000');
      expect(el?.getAttribute('stroke-width')).toBe('2');
    });

    it('applies default paint (black stroke, fill none) for line when no overrides given', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('line', {});
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el?.getAttribute('stroke')?.toLowerCase()).toBe('#000000');
      expect(el?.getAttribute('stroke-width')).toBe('2');
      expect(el?.getAttribute('fill')).toBe('none');
    });

    it('applies default paint and typography for text when no overrides given', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('text', {});
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el?.getAttribute('fill')?.toLowerCase()).toBe('#000000');
      expect(el?.getAttribute('stroke')?.toLowerCase()).toBe('#000000');
      expect(el?.getAttribute('stroke-width')).toBe('2');
      expect(el?.getAttribute('font-size')).toBe('16');
      expect(el?.getAttribute('font-weight')).toBe('normal');
      expect(el?.getAttribute('font-style')).toBe('normal');
      expect(el?.getAttribute('text-anchor')).toBe('start');
      expect(el?.textContent).toBe('Text');
    });

    it('uses updated canonical defaults across rect/ellipse/line/text creation', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      drawingDefaults.updateDefaults({
        fill: '#123456',
        stroke: '#abcdef',
        strokeWidth: 7
      });

      const rectId = service.addShape('rect', {});
      const ellipseId = service.addShape('ellipse', {});
      const lineId = service.addShape('line', {});
      const textId = service.addShape('text', {});

      expect(container.querySelector(`#${rectId}`)?.getAttribute('fill')?.toLowerCase()).toBe('#123456');
      expect(container.querySelector(`#${rectId}`)?.getAttribute('stroke')?.toLowerCase()).toBe('#abcdef');
      expect(container.querySelector(`#${ellipseId}`)?.getAttribute('fill')?.toLowerCase()).toBe('#123456');
      expect(container.querySelector(`#${ellipseId}`)?.getAttribute('stroke-width')).toBe('7');
      expect(container.querySelector(`#${textId}`)?.getAttribute('fill')?.toLowerCase()).toBe('#123456');
      expect(container.querySelector(`#${textId}`)?.getAttribute('stroke')?.toLowerCase()).toBe('#abcdef');
      expect(container.querySelector(`#${lineId}`)?.getAttribute('fill')).toBe('none');
      expect(container.querySelector(`#${lineId}`)?.getAttribute('stroke')?.toLowerCase()).toBe('#abcdef');
      expect(container.querySelector(`#${lineId}`)?.getAttribute('stroke-width')).toBe('7');
    });

    it('line creation ignores fill even when fill override is provided', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('line', { fill: '#ff00ff' });
      const el = container.querySelector(`#${id}`);
      expect(el?.getAttribute('fill')).toBe('none');
    });

    it('getShapeProperties includes text typography fields', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><text id="t1" x="10" y="20" font-family="Verdana" font-size="18" font-weight="bold" font-style="italic" text-anchor="middle">Hello</text></svg>';
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const text = svg.findOne('#t1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(text);
      expect(props.textContent).toBe('Hello');
      expect(props.fontFamily).toBe('Verdana');
      expect(props.fontSize).toBe(18);
      expect(props.fontWeight).toBe('bold');
      expect(props.fontStyle).toBe('italic');
      expect(props.textAnchor).toBe('middle');
    });

    it('getShapeProperties reads paint-order and vector-effect on text', () => {
      const svgContent =
        '<svg viewBox="0 0 200 200"><text id="t1" x="0" y="20" paint-order="stroke fill" vector-effect="non-scaling-stroke">Hi</text></svg>';
      service.initializeSVG(container, svgContent);
      const svg = service.getSVGInstance()!;
      const text = svg.findOne('#t1') as import('@svgdotjs/svg.js').Element;
      const props = service.getShapeProperties(text);
      expect(props.paintOrder).toBe('stroke fill');
      expect(props.vectorEffect).toBe('non-scaling-stroke');
    });

    it('exportSVG preserves text stroke dash paint-order and vector-effect', () => {
      const svgContent =
        '<svg viewBox="0 0 200 200"><text id="t1" x="1" y="2" fill="#ffffff" stroke="#111111" stroke-width="2" stroke-dasharray="4 2" paint-order="stroke fill" vector-effect="non-scaling-stroke">OK</text></svg>';
      service.initializeSVG(container, svgContent);
      const out = service.exportSVG();
      expect(out).toContain('stroke="#111111"');
      expect(out).toContain('stroke-width="2"');
      expect(out).toContain('stroke-dasharray="4 2"');
      expect(out).toContain('paint-order="stroke fill"');
      expect(out).toContain('vector-effect="non-scaling-stroke"');
    });

    it('applies fill override', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('rect', { fill: '#ff0000' });
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el?.getAttribute('fill')?.toLowerCase()).toBe('#ff0000');
    });

    it('applies stroke override on rect', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('rect', { stroke: '#00ff00', strokeWidth: 3 });
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el?.getAttribute('stroke')?.toLowerCase()).toBe('#00ff00');
      expect(el?.getAttribute('stroke-width')).toBe('3');
    });

    it('applies stroke color override on line', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('line', { stroke: '#0000ff', strokeWidth: 5 });
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el?.getAttribute('stroke')?.toLowerCase()).toBe('#0000ff');
      expect(el?.getAttribute('stroke-width')).toBe('5');
    });

    it('generates a unique ID following shape-XXXXX pattern', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('rect', {});
      expect(id).toBeTruthy();
      expect(id!.startsWith('shape-')).toBe(true);
    });

    it('generates unique IDs across multiple calls', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const id = service.addShape('rect', {});
        expect(id).toBeTruthy();
        expect(ids.has(id!)).toBe(false);
        ids.add(id!);
      }
      expect(ids.size).toBe(10);
    });

    it('bumps documentRevision after creation', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      service.addShape('rect', {});
      expect(service.documentRevision()).toBe(before + 1);
    });

    it('returns null when svgInstance is not initialized', () => {
      const id = service.addShape('rect', { width: 50, height: 50 });
      expect(id).toBeNull();
    });

    it('new shape is inside the content group', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="existing" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('rect', {});
      expect(id).toBeTruthy();
      const contentGroup = container.querySelector('[data-editor-content-group]');
      expect(contentGroup?.querySelector(`#${id}`)).not.toBeNull();
    });
  });

  describe('insertPathIntoContentGroup', () => {
    it('creates a path with d and default stroke', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.insertPathIntoContentGroup('M 0 0 L 10 20');
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`);
      expect(el?.tagName.toLowerCase()).toBe('path');
      expect(el?.getAttribute('d')).toBe('M 0 0 L 10 20');
      expect(el?.getAttribute('fill')).toBe('none');
      expect(el?.getAttribute('stroke')?.toLowerCase()).toBe('#000000');
    });

    it('places path inside content group', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="existing" x="0" y="0" width="5" height="5"/></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.insertPathIntoContentGroup('M 1 1 L 2 2');
      const contentGroup = container.querySelector('[data-editor-content-group]');
      expect(contentGroup?.querySelector(`#${id}`)).not.toBeNull();
    });

    it('uses canonical fill only when path is closed', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      drawingDefaults.updateDefaults({ fill: '#fedcba', stroke: '#654321', strokeWidth: 4 });

      const openId = service.insertPathIntoContentGroup('M 1 1 L 2 2');
      const closedId = service.insertPathIntoContentGroup('M 3 3 L 4 4 Z', undefined, { closedPath: true });
      const openEl = container.querySelector(`#${openId}`);
      const closedEl = container.querySelector(`#${closedId}`);

      expect(openEl?.getAttribute('fill')).toBe('none');
      expect(openEl?.getAttribute('stroke')?.toLowerCase()).toBe('#654321');
      expect(openEl?.getAttribute('stroke-width')).toBe('4');
      expect(closedEl?.getAttribute('fill')?.toLowerCase()).toBe('#fedcba');
      expect(closedEl?.getAttribute('stroke')?.toLowerCase()).toBe('#654321');
      expect(closedEl?.getAttribute('stroke-width')).toBe('4');
    });
  });

  describe('insertRasterImageIntoContentGroup', () => {
    const tinyPngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    function readImageHref(el: Element): string {
      return (
        el.getAttribute('href') ??
        el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
        ''
      );
    }

    it('inserts <image> with href, geometry, stable id, pointer, and bumps revision', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      const id = service.insertRasterImageIntoContentGroup({
        href: tinyPngDataUrl,
        x: 12,
        y: 34,
        width: 64,
        height: 48
      });
      expect(id).toBeTruthy();
      expect(service.documentRevision()).toBeGreaterThan(before);

      const contentGroup = container.querySelector('[data-editor-content-group]');
      const el = contentGroup?.querySelector(`#${id}`) as Element | null | undefined;
      expect(el?.tagName.toLowerCase()).toBe('image');
      expect(readImageHref(el!)).toBe(tinyPngDataUrl);
      expect(el?.getAttribute('x')).toBe('12');
      expect(el?.getAttribute('y')).toBe('34');
      expect(el?.getAttribute('width')).toBe('64');
      expect(el?.getAttribute('height')).toBe('48');
      expect(el?.getAttribute('preserveAspectRatio')).toBeNull();

      const svgInstance = service.getSVGInstance();
      const shape = svgInstance?.findOne(`#${id}`) as import('@svgdotjs/svg.js').Element | undefined;
      expect(shape).toBeTruthy();
      expect(service.getShapeProperties(shape!).type).toBe('image');
    });

    it('allocates unique ids for successive inserts', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const a = service.insertRasterImageIntoContentGroup({
        href: tinyPngDataUrl,
        x: 0,
        y: 0,
        width: 1,
        height: 1
      });
      const b = service.insertRasterImageIntoContentGroup({
        href: tinyPngDataUrl,
        x: 1,
        y: 1,
        width: 1,
        height: 1
      });
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      expect(a).not.toBe(b);
    });

    it('writes preserveAspectRatio when provided', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.insertRasterImageIntoContentGroup({
        href: tinyPngDataUrl,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        preserveAspectRatio: 'xMaxYMax slice'
      });
      const el = container.querySelector(`#${id}`) as Element | null;
      expect(el?.getAttribute('preserveAspectRatio')).toBe('xMaxYMax slice');
    });

    it('translateShape prepends translation on inserted <image>', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.insertRasterImageIntoContentGroup({
        href: tinyPngDataUrl,
        x: 12,
        y: 34,
        width: 64,
        height: 48
      });
      expect(id).toBeTruthy();
      service.translateShape(id!, 3, -2);
      const el = container.querySelector(`#${id}`) as Element;
      expect(el.getAttribute('transform')).toBeTruthy();
    });

    it('applyUnionScaleFromSnapshot sets transform on inserted <image>', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.insertRasterImageIntoContentGroup({
        href: tinyPngDataUrl,
        x: 10,
        y: 20,
        width: 100,
        height: 50
      });
      expect(id).toBeTruthy();
      const unionBefore = { x: 10, y: 20, width: 100, height: 50 };
      const unionAfter = { x: 10, y: 20, width: 200, height: 100 };
      const snap = service.snapshotSelectionTransforms([id!]);
      service.applyUnionScaleFromSnapshot([id!], unionBefore, unionAfter, snap, 'se');
      const el = container.querySelector(`#${id}`) as Element;
      expect(el.getAttribute('transform')).toBeTruthy();
    });

    it('applyUnionRotationFromSnapshot rotates inserted <image>', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.insertRasterImageIntoContentGroup({
        href: tinyPngDataUrl,
        x: 10,
        y: 20,
        width: 100,
        height: 50
      });
      expect(id).toBeTruthy();
      const union = { x: 10, y: 20, width: 100, height: 50 };
      const pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
      const snap = service.snapshotSelectionTransforms([id!]);
      service.applyUnionRotationFromSnapshot([id!], pivot, 15, snap);
      const el = container.querySelector(`#${id}`) as Element;
      expect(el.getAttribute('transform')).toBeTruthy();
    });
  });

  describe('text typography updates', () => {
    it('updates text typography and anchor attributes', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><text id="t1" x="10" y="20">Hello</text></svg>';
      service.initializeSVG(container, svgContent);
      service.updateTextFontFamily('t1', 'Georgia, serif');
      service.updateTextFontSize('t1', 22);
      service.updateTextFontWeight('t1', 'bold');
      service.updateTextFontStyle('t1', 'italic');
      service.updateTextAnchor('t1', 'end');
      const el = container.querySelector('#t1');
      expect(el?.getAttribute('font-family')).toBe('Georgia, serif');
      expect(el?.getAttribute('font-size')).toBe('22');
      expect(el?.getAttribute('font-weight')).toBe('bold');
      expect(el?.getAttribute('font-style')).toBe('italic');
      expect(el?.getAttribute('text-anchor')).toBe('end');
    });

    it('updates text paint-order and vector-effect via svg.js', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><text id="t1" x="10" y="20">Hello</text></svg>';
      service.initializeSVG(container, svgContent);
      service.updateTextPaintOrder('t1', 'stroke fill');
      service.updateTextVectorEffect('t1', 'non-scaling-stroke');
      const el = container.querySelector('#t1');
      expect(el?.getAttribute('paint-order')).toBe('stroke fill');
      expect(el?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
      service.updateTextPaintOrder('t1', undefined);
      service.updateTextVectorEffect('t1', undefined);
      expect(el?.getAttribute('paint-order')).toBeNull();
      expect(el?.getAttribute('vector-effect')).toBeNull();
    });
  });

  describe('AddPathCommand (real SvgManipulationService + DOM)', () => {
    it('undo/redo round-trip: no duplicate on first execute, DOM and selection', () => {
      const selectionSvc = TestBed.inject(ShapeSelectionService);
      selectionSvc.clearSelection();

      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);

      const pathD = 'M 0 0 L 10 10';
      const id = service.insertPathIntoContentGroup(pathD);
      expect(id).toBeTruthy();

      const svgInstance = service.getSVGInstance()!;
      const pathEl = svgInstance.findOne(`#${id!}`)! as import('@svgdotjs/svg.js').Element;
      expect(pathEl).toBeTruthy();
      selectionSvc.selectShape(service.getShapeProperties(pathEl));

      const beforePaths = container.querySelectorAll('path');
      expect(beforePaths.length).toBe(1);

      const cmd = new AddPathCommand(service, id!, selectionSvc);
      cmd.execute();
      expect(container.querySelectorAll('path').length).toBe(1);

      cmd.undo();
      expect(container.querySelector(`#${id!}`)).toBeNull();
      expect(selectionSvc.getSelectedShapes().length).toBe(0);

      cmd.execute();
      const reinserted = container.querySelector(`#${id!}`) as Element | null;
      expect(reinserted).not.toBeNull();
      expect(reinserted?.getAttribute('d')).toBe(pathD);
      expect(selectionSvc.selectedShape()?.id).toBe(id!);
    });
  });

  describe('AddImageCommand (real SvgManipulationService + DOM)', () => {
    const tinyPngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    it('undo/redo round-trip: DOM and selection', () => {
      const selectionSvc = TestBed.inject(ShapeSelectionService);
      selectionSvc.clearSelection();

      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);

      const id = service.insertRasterImageIntoContentGroup({
        href: tinyPngDataUrl,
        x: 1,
        y: 2,
        width: 8,
        height: 6
      });
      expect(id).toBeTruthy();

      const svgInstance = service.getSVGInstance()!;
      const imageEl = svgInstance.findOne(`#${id!}`)! as import('@svgdotjs/svg.js').Element;
      selectionSvc.selectShape(service.getShapeProperties(imageEl));

      expect(container.querySelectorAll('image').length).toBe(1);

      const cmd = new AddImageCommand(service, id!, selectionSvc);
      cmd.execute();
      expect(container.querySelectorAll('image').length).toBe(1);

      cmd.undo();
      expect(container.querySelector(`#${id!}`)).toBeNull();
      expect(selectionSvc.getSelectedShapes().length).toBe(0);

      cmd.execute();
      const reinserted = container.querySelector(`#${id!}`) as SVGImageElement | null;
      expect(reinserted).not.toBeNull();
      expect(reinserted?.getAttribute('width')).toBe('8');
      expect(reinserted?.getAttribute('height')).toBe('6');
      expect(selectionSvc.selectedShape()?.id).toBe(id!);
    });

    it('EditorHistoryService pushAndExecute, undo, redo', () => {
      const selectionSvc = TestBed.inject(ShapeSelectionService);
      const history = TestBed.inject(EditorHistoryService);
      history.clear();
      selectionSvc.clearSelection();

      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);

      const id = service.insertRasterImageIntoContentGroup({
        href: tinyPngDataUrl,
        x: 0,
        y: 0,
        width: 4,
        height: 4
      });
      expect(id).toBeTruthy();
      const svgInstance = service.getSVGInstance()!;
      const imageEl = svgInstance.findOne(`#${id!}`)! as import('@svgdotjs/svg.js').Element;
      selectionSvc.selectShape(service.getShapeProperties(imageEl));

      const cmd = new AddImageCommand(service, id!, selectionSvc);
      history.pushAndExecute(cmd);
      expect(container.querySelector(`#${id!}`)).not.toBeNull();

      history.undo();
      expect(container.querySelector(`#${id!}`)).toBeNull();
      expect(selectionSvc.getSelectedShapes().length).toBe(0);

      history.redo();
      expect(container.querySelector(`#${id!}`)).not.toBeNull();
      expect(selectionSvc.selectedShape()?.id).toBe(id!);
    });
  });

  describe('removeShape', () => {
    it('removes a single shape by ID', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="0" y="0" width="10" height="10"/><rect id="r2" x="20" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.removeShape('r1');
      expect(container.querySelector('#r1')).toBeNull();
      expect(container.querySelector('#r2')).not.toBeNull();
    });

    it('bumps documentRevision', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      service.removeShape('r1');
      expect(service.documentRevision()).toBe(before + 1);
    });

    it('does not bump documentRevision when shape not found', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      service.removeShape('nonexistent');
      expect(service.documentRevision()).toBe(before);
    });

    it('does nothing when not initialized', () => {
      expect(() => service.removeShape('any-id')).not.toThrow();
    });

    it('can remove a shape created by addShape', () => {
      const svgContent = '<svg viewBox="0 0 200 200"></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('ellipse', { cx: 50, cy: 50, rx: 20, ry: 20 });
      expect(container.querySelector(`#${id}`)).not.toBeNull();
      service.removeShape(id!);
      expect(container.querySelector(`#${id}`)).toBeNull();
    });
  });

  describe('insertShapeMarkup', () => {
    it('inserts markup into content group', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.insertShapeMarkup('<circle id="inserted-circle" cx="50" cy="50" r="20" fill="#ff0000"/>' as unknown as LiveTreeMarkup);
      const el = container.querySelector('#inserted-circle');
      expect(el).not.toBeNull();
      expect(el?.tagName.toLowerCase()).toBe('circle');
    });

    it('inserts at the specified DOM index', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="0" y="0" width="10" height="10"/><rect id="r2" x="20" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.insertShapeMarkup('<circle id="mid" cx="5" cy="5" r="2"/>' as unknown as LiveTreeMarkup, 1);
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const ids = Array.from(contentGroup.children).map((el) => el.id).filter(Boolean);
      expect(ids.indexOf('mid')).toBe(1);
    });

    it('appends when insertionIndex is omitted', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      service.insertShapeMarkup('<rect id="appended" x="0" y="0" width="5" height="5"/>' as unknown as LiveTreeMarkup);
      const contentGroup = container.querySelector('[data-editor-content-group]')!;
      const lastChild = contentGroup.lastElementChild;
      expect(lastChild?.id).toBe('appended');
    });

    it('bumps documentRevision', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const before = service.documentRevision();
      service.insertShapeMarkup('<rect id="new" x="0" y="0" width="5" height="5"/>' as unknown as LiveTreeMarkup);
      expect(service.documentRevision()).toBe(before + 1);
    });

    it('does nothing when not initialized', () => {
      expect(() => service.insertShapeMarkup('<rect id="noop" x="0" y="0" width="5" height="5"/>' as unknown as LiveTreeMarkup)).not.toThrow();
    });

    it('round-trips with removeShape (add → serialize → remove → reinsert)', () => {
      const svgContent = '<svg viewBox="0 0 200 200"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const id = service.addShape('rect', { x: 5, y: 5, width: 20, height: 20, fill: '#00ff00' });
      expect(id).toBeTruthy();
      const el = container.querySelector(`#${id}`)!;
      const markup = el.outerHTML;
      service.removeShape(id!);
      expect(container.querySelector(`#${id}`)).toBeNull();
      service.insertShapeMarkup(markup as unknown as LiveTreeMarkup);
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    });
  });

  describe('clipboard payload + paste', () => {
    it('createClipboardPayload serializes selected shape markup in dom order', () => {
      const svgContent =
        '<svg viewBox="0 0 200 200"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="20" y="0" width="10" height="10"/></svg>';
      service.initializeSVG(container, svgContent);
      const payload = service.createClipboardPayload(['b', 'a']);
      expect(payload.shapes.map((shape) => shape.id)).toEqual(['a', 'b']);
      expect(payload.shapes[0].markup).toContain('id="a"');
      expect(payload.shapes[1].markup).toContain('id="b"');
    });

    it('pasteClipboardPayload remaps ids and internal url references', () => {
      const svgContent =
        '<svg viewBox="0 0 200 200"><rect id="existing" x="0" y="0" width="10" height="10"/><defs><linearGradient id="gradA"><stop offset="0%" stop-color="#f00"/></linearGradient></defs></svg>';
      service.initializeSVG(container, svgContent);
      const payload = {
        shapes: [
          {
            id: 'shape-1',
            markup:
              '<g id="shape-1"><defs><linearGradient id="gradA"><stop offset="100%" stop-color="#00f"/></linearGradient></defs><rect id="shape-child" x="5" y="5" width="10" height="10" fill="url(#gradA)"/></g>'
          }
        ]
      };

      const pasted = service.pasteClipboardPayload(payload, { dx: 10, dy: 10 });
      expect(pasted.insertedIds.length).toBe(1);
      const root = container.querySelector(`#${pasted.insertedIds[0]}`) as Element | null;
      expect(root).not.toBeNull();
      const child = root?.querySelector('rect');
      expect(child?.id).not.toBe('shape-child');
      expect(child?.getAttribute('fill')).toMatch(/^url\(#.+\)$/);
      expect(child?.getAttribute('transform')).toBeNull();
      expect(root?.getAttribute('transform')).toContain('translate(10 10)');
    });
  });
});
