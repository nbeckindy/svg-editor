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
    
    const circle = container.querySelector('circle');
    const rect = container.querySelector('rect');
    
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

  it('should highlight a shape', () => {
    const svgContent = '<svg><path id="highlight-test" d="M10 10 L50 50" stroke="#000000"/></svg>';
    
    service.initializeSVG(container, svgContent);
    service.highlightShape('highlight-test');
    
    const svgInstance = service.getSVGInstance();
    const shape = svgInstance?.findOne('#highlight-test');
    
    expect(shape?.hasClass('selected-shape')).toBe(true);
  });

  it('should clear highlight', () => {
    const svgContent = '<svg><line id="clear-highlight-test" x1="0" y1="0" x2="100" y2="100" stroke="#000000"/></svg>';
    
    service.initializeSVG(container, svgContent);
    service.highlightShape('clear-highlight-test');
    
    const svgInstance = service.getSVGInstance();
    let shape = svgInstance?.findOne('#clear-highlight-test');
    expect(shape?.hasClass('selected-shape')).toBe(true);
    
    service.clearHighlight();
    shape = svgInstance?.findOne('#clear-highlight-test');
    expect(shape?.hasClass('selected-shape')).toBe(false);
  });

  it('should clear previous highlight when highlighting new shape', () => {
    const svgContent = '<svg><circle id="shape1" cx="50" cy="50" r="40"/><rect id="shape2" width="100" height="100"/></svg>';
    
    service.initializeSVG(container, svgContent);
    
    service.highlightShape('shape1');
    const svgInstance = service.getSVGInstance();
    let shape1 = svgInstance?.findOne('#shape1');
    expect(shape1?.hasClass('selected-shape')).toBe(true);
    
    service.highlightShape('shape2');
    shape1 = svgInstance?.findOne('#shape1');
    const shape2 = svgInstance?.findOne('#shape2');
    
    expect(shape1?.hasClass('selected-shape')).toBe(false);
    expect(shape2?.hasClass('selected-shape')).toBe(true);
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
    // These should not throw errors
    expect(() => {
      service.updateFillColor('test', '#FF0000');
      service.addStroke('test', '#000000', 2);
      service.removeStroke('test');
      service.updateStrokeColor('test', '#0000FF');
      service.highlightShape('test');
      service.clearHighlight();
    }).not.toThrow();
  });
});
