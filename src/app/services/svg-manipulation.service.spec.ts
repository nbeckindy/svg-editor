import { TestBed } from '@angular/core/testing';
import { SvgManipulationService } from './svg-manipulation.service';

describe('SvgManipulationService', () => {
  let service: SvgManipulationService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SvgManipulationService);
    
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
    // Force a deterministic mismatch in `uW/uH`:
    // source element is 100x50 (init ratio 2), but computed content bbox is 200x50 (current ratio 4).
    const originalComputeContentBbox = (service as any).computeContentBbox;
    (service as any).computeContentBbox = () => ({ x: 0, y: 0, width: 200, height: 50 });

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
      (service as any).computeContentBbox = originalComputeContentBbox;
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

  it('highlightShape and clearHighlight should not modify SVG (no-op)', () => {
    const svgContent = '<svg><path id="noop-test" d="M10 10 L50 50"/></svg>';
    service.initializeSVG(container, svgContent);
    const pathBefore = container.querySelector('#noop-test');
    expect(pathBefore?.classList.contains('selected-shape')).toBe(false);
    service.highlightShape('noop-test');
    const pathAfter = container.querySelector('#noop-test');
    expect(pathAfter?.classList.contains('selected-shape')).toBe(false);
    service.clearHighlight();
    expect(pathAfter?.classList.contains('selected-shape')).toBe(false);
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
      service.highlightShape('test');
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
  });

  describe('getLayerStackItems', () => {
    it('returns empty array when not initialized', () => {
      expect(service.getLayerStackItems()).toEqual([]);
    });

    it('returns editable shapes in DOM order with id/type/markup', () => {
      const svgContent = '<svg viewBox="0 0 100 100"><rect id="back-rect" x="0" y="0" width="20" height="20"/><g id="ignored"><rect width="1" height="1"/></g><circle id="front-circle" cx="30" cy="30" r="10"/></svg>';
      service.initializeSVG(container, svgContent);

      const items = service.getLayerStackItems();
      expect(items.map((item) => item.id)).toEqual(['back-rect', 'front-circle']);
      expect(items.map((item) => item.type)).toEqual(['rect', 'circle']);
      expect(items[0].elementMarkup).toContain('<rect');
      expect(items[1].elementMarkup).toContain('<circle');
    });
  });
});
