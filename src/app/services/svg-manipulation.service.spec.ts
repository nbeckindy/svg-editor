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
    }
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

  it('translateShape should move rect by dx, dy in SVG coordinates', () => {
    const svgContent = '<svg viewBox="0 0 100 100"><rect id="move-rect" x="10" y="20" width="30" height="40"/></svg>';
    service.initializeSVG(container, svgContent);
    service.translateShape('move-rect', 15, 25);
    const rect = container.querySelector('#move-rect');
    expect(rect?.getAttribute('x')).toBe('25');
    expect(rect?.getAttribute('y')).toBe('45');
  });

  it('translateShape should move circle by dx, dy (cx, cy)', () => {
    const svgContent = '<svg viewBox="0 0 100 100"><circle id="move-circle" cx="50" cy="50" r="20"/></svg>';
    service.initializeSVG(container, svgContent);
    service.translateShape('move-circle', -10, 5);
    const circle = container.querySelector('#move-circle');
    expect(circle?.getAttribute('cx')).toBe('40');
    expect(circle?.getAttribute('cy')).toBe('55');
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
});
