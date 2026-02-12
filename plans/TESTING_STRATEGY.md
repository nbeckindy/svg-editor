# Testing Strategy - Angular SVG Editor

## Overview
This document outlines the comprehensive testing strategy for the Angular SVG Editor application using Vitest.

## Testing Pyramid

```
        /\
       /  \
      / E2E \         <- Few (Integration tests)
     /______\
    /        \
   /  Unit    \       <- Many (Component & Service tests)
  /____________\
```

## Test Categories

### 1. Unit Tests

#### Service Tests

**SVG Service Tests** (`svg.service.spec.ts`)
- ✅ Service creation
- ✅ Valid SVG validation
- ✅ Invalid SVG rejection
- ✅ File loading from File object
- ✅ Error handling for malformed files
- ✅ Current SVG content retrieval

**Shape Selection Service Tests** (`shape-selection.service.spec.ts`)
```typescript
describe('ShapeSelectionService', () => {
  let service: ShapeSelectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ShapeSelectionService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should select a shape', (done) => {
    const mockShape: ShapeProperties = {
      id: 'circle-1',
      type: 'circle',
      fill: '#ff0000'
    };

    service.selectedShape$.subscribe(shape => {
      if (shape) {
        expect(shape.id).toBe('circle-1');
        expect(shape.type).toBe('circle');
        expect(shape.fill).toBe('#ff0000');
        done();
      }
    });

    service.selectShape(mockShape);
  });

  it('should clear selection', (done) => {
    const mockShape: ShapeProperties = {
      id: 'rect-1',
      type: 'rect',
      fill: '#00ff00'
    };

    service.selectShape(mockShape);
    service.clearSelection();

    service.selectedShape$.subscribe(shape => {
      expect(shape).toBeNull();
      done();
    });
  });

  it('should update selected shape properties', () => {
    const mockShape: ShapeProperties = {
      id: 'path-1',
      type: 'path',
      fill: '#0000ff'
    };

    service.selectShape(mockShape);
    service.updateSelectedShape({ fill: '#ff00ff' });

    const updated = service.getSelectedShape();
    expect(updated?.fill).toBe('#ff00ff');
    expect(updated?.id).toBe('path-1');
  });
});
```

**SVG Manipulation Service Tests** (`svg-manipulation.service.spec.ts`)
```typescript
describe('SvgManipulationService', () => {
  let service: SvgManipulationService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SvgManipulationService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should initialize SVG', () => {
    const svgContent = '<svg><circle id="c1" cx="50" cy="50" r="40"/></svg>';
    service.initializeSVG(container, svgContent);
    
    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeTruthy();
  });

  it('should update fill color', () => {
    const svgContent = '<svg><circle id="c1" cx="50" cy="50" r="40" fill="#000000"/></svg>';
    service.initializeSVG(container, svgContent);
    
    service.updateFillColor('c1', '#ff0000');
    
    const circle = container.querySelector('#c1');
    expect(circle?.getAttribute('fill')).toBe('#ff0000');
  });

  it('should add stroke', () => {
    const svgContent = '<svg><rect id="r1" width="100" height="100"/></svg>';
    service.initializeSVG(container, svgContent);
    
    service.addStroke('r1', '#0000ff', 2);
    
    const rect = container.querySelector('#r1');
    expect(rect?.getAttribute('stroke')).toBe('#0000ff');
    expect(rect?.getAttribute('stroke-width')).toBe('2');
  });

  it('should remove stroke', () => {
    const svgContent = '<svg><rect id="r1" width="100" height="100" stroke="#000000"/></svg>';
    service.initializeSVG(container, svgContent);
    
    service.removeStroke('r1');
    
    const rect = container.querySelector('#r1');
    expect(rect?.getAttribute('stroke')).toBe('none');
  });

  it('should export SVG', () => {
    const svgContent = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    service.initializeSVG(container, svgContent);
    
    const exported = service.exportSVG();
    expect(exported).toContain('<circle');
    expect(exported).toContain('cx="50"');
  });
});
```

#### Component Tests

**File Upload Component Tests** (`file-upload.component.spec.ts`)
```typescript
describe('FileUploadComponent', () => {
  let component: FileUploadComponent;
  let fixture: ComponentFixture<FileUploadComponent>;
  let svgService: SvgService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileUploadComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FileUploadComponent);
    component = fixture.componentInstance;
    svgService = TestBed.inject(SvgService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display error for non-SVG file', () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const event = { target: { files: [file] } } as any;
    
    component.onFileSelected(event);
    fixture.detectChanges();
    
    expect(component.errorMessage).toContain('SVG');
  });

  it('should emit svgLoaded event on valid SVG', (done) => {
    const svgContent = '<svg><rect width="100" height="100"/></svg>';
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const file = new File([blob], 'test.svg', { type: 'image/svg+xml' });

    component.svgLoaded.subscribe((content: string) => {
      expect(content).toContain('<svg>');
      done();
    });

    const event = { target: { files: [file] } } as any;
    component.onFileSelected(event);
  });

  it('should handle drag over', () => {
    const event = new DragEvent('dragover');
    event.preventDefault = vi.fn();
    
    component.onDragOver(event);
    
    expect(component.isDragOver).toBe(true);
  });

  it('should handle drag leave', () => {
    component.isDragOver = true;
    const event = new DragEvent('dragleave');
    event.preventDefault = vi.fn();
    
    component.onDragLeave(event);
    
    expect(component.isDragOver).toBe(false);
  });
});
```

**SVG Canvas Component Tests** (`svg-canvas.component.spec.ts`)
```typescript
describe('SvgCanvasComponent', () => {
  let component: SvgCanvasComponent;
  let fixture: ComponentFixture<SvgCanvasComponent>;
  let svgManipulation: SvgManipulationService;
  let shapeSelection: ShapeSelectionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SvgCanvasComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SvgCanvasComponent);
    component = fixture.componentInstance;
    svgManipulation = TestBed.inject(SvgManipulationService);
    shapeSelection = TestBed.inject(ShapeSelectionService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize SVG on content change', () => {
    const initSpy = vi.spyOn(svgManipulation, 'initializeSVG');
    const svgContent = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    
    component.svgContent = svgContent;
    component.ngOnChanges();
    
    expect(initSpy).toHaveBeenCalled();
  });

  it('should select shape on click', () => {
    const selectSpy = vi.spyOn(shapeSelection, 'selectShape');
    const mockShape = { id: 'circle-1', type: 'circle', fill: '#000000' };
    
    vi.spyOn(svgManipulation, 'getShapeProperties').mockReturnValue(mockShape);
    
    const mockEvent = {
      target: { tagName: 'circle', id: 'circle-1' }
    } as any;
    
    component.onCanvasClick(mockEvent);
    
    expect(selectSpy).toHaveBeenCalledWith(mockShape);
  });

  it('should clear selection when clicking canvas background', () => {
    const clearSpy = vi.spyOn(shapeSelection, 'clearSelection');
    
    const mockEvent = {
      target: { tagName: 'svg' }
    } as any;
    
    component.onCanvasClick(mockEvent);
    
    expect(clearSpy).toHaveBeenCalled();
  });
});
```

**Properties Panel Component Tests** (`properties-panel.component.spec.ts`)
```typescript
describe('PropertiesPanelComponent', () => {
  let component: PropertiesPanelComponent;
  let fixture: ComponentFixture<PropertiesPanelComponent>;
  let shapeSelection: ShapeSelectionService;
  let svgManipulation: SvgManipulationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PropertiesPanelComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PropertiesPanelComponent);
    component = fixture.componentInstance;
    shapeSelection = TestBed.inject(ShapeSelectionService);
    svgManipulation = TestBed.inject(SvgManipulationService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display selected shape info', (done) => {
    const mockShape: ShapeProperties = {
      id: 'rect-1',
      type: 'rect',
      fill: '#ff0000'
    };

    shapeSelection.selectShape(mockShape);
    
    fixture.detectChanges();
    
    setTimeout(() => {
      expect(component.selectedShape).toEqual(mockShape);
      const compiled = fixture.nativeElement;
      expect(compiled.textContent).toContain('rect');
      done();
    }, 100);
  });

  it('should update fill color', () => {
    const mockShape: ShapeProperties = {
      id: 'circle-1',
      type: 'circle',
      fill: '#000000'
    };
    
    component.selectedShape = mockShape;
    const updateSpy = vi.spyOn(svgManipulation, 'updateFillColor');
    
    component.onFillColorChange('#00ff00');
    
    expect(updateSpy).toHaveBeenCalledWith('circle-1', '#00ff00');
  });

  it('should toggle stroke', () => {
    const mockShape: ShapeProperties = {
      id: 'rect-1',
      type: 'rect',
      fill: '#000000'
    };
    
    component.selectedShape = mockShape;
    component.strokeEnabled = true;
    
    const addStrokeSpy = vi.spyOn(svgManipulation, 'addStroke');
    
    component.onStrokeToggle();
    
    expect(addStrokeSpy).toHaveBeenCalled();
  });

  it('should export SVG', () => {
    const exportSpy = vi.spyOn(svgManipulation, 'exportSVG').mockReturnValue('<svg></svg>');
    
    // Mock blob and URL creation
    global.URL.createObjectURL = vi.fn();
    global.URL.revokeObjectURL = vi.fn();
    
    component.exportSVG();
    
    expect(exportSpy).toHaveBeenCalled();
  });
});
```

**Color Picker Component Tests** (`color-picker.component.spec.ts`)
```typescript
describe('ColorPickerComponent', () => {
  let component: ColorPickerComponent;
  let fixture: ComponentFixture<ColorPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColorPickerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ColorPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit color change from color input', (done) => {
    component.colorChange.subscribe((color: string) => {
      expect(color).toBe('#ff0000');
      done();
    });

    const event = {
      target: { value: '#ff0000' }
    } as any;

    component.onColorChange(event);
  });

  it('should emit color change from text input with valid hex', (done) => {
    component.colorChange.subscribe((color: string) => {
      expect(color).toBe('#00FF00');
      done();
    });

    const event = {
      target: { value: '#00FF00' }
    } as any;

    component.onTextChange(event);
  });

  it('should not emit for invalid hex color', () => {
    const emitSpy = vi.spyOn(component.colorChange, 'emit');

    const event = {
      target: { value: 'invalid' }
    } as any;

    component.onTextChange(event);

    expect(emitSpy).not.toHaveBeenCalled();
  });
});
```

### 2. Integration Tests

**SVG Editing Workflow Tests**

```typescript
describe('SVG Editing Workflow Integration', () => {
  let svgService: SvgService;
  let svgManipulation: SvgManipulationService;
  let shapeSelection: ShapeSelectionService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svgService = TestBed.inject(SvgService);
    svgManipulation = TestBed.inject(SvgManipulationService);
    shapeSelection = TestBed.inject(ShapeSelectionService);
    
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should complete full editing workflow', async () => {
    // 1. Load SVG
    const svgContent = `
      <svg width="200" height="200">
        <circle id="circle1" cx="100" cy="100" r="50" fill="#ff0000"/>
        <rect id="rect1" x="10" y="10" width="80" height="80" fill="#00ff00"/>
      </svg>
    `;
    
    const isValid = svgService.validateSVG(svgContent);
    expect(isValid).toBe(true);

    // 2. Initialize SVG canvas
    svgManipulation.initializeSVG(container, svgContent);
    
    const svgInstance = svgManipulation.getSVGInstance();
    expect(svgInstance).toBeTruthy();

    // 3. Select a shape
    const circle = svgInstance?.findOne('#circle1');
    expect(circle).toBeTruthy();
    
    if (circle) {
      const properties = svgManipulation.getShapeProperties(circle);
      shapeSelection.selectShape(properties);
      
      const selected = shapeSelection.getSelectedShape();
      expect(selected?.id).toBe('circle1');
      expect(selected?.fill).toBe('#ff0000');
    }

    // 4. Modify fill color
    svgManipulation.updateFillColor('circle1', '#0000ff');
    
    const circleElement = container.querySelector('#circle1');
    expect(circleElement?.getAttribute('fill')).toBe('#0000ff');

    // 5. Add stroke
    svgManipulation.addStroke('circle1', '#000000', 3);
    
    expect(circleElement?.getAttribute('stroke')).toBe('#000000');
    expect(circleElement?.getAttribute('stroke-width')).toBe('3');

    // 6. Export modified SVG
    const exportedSVG = svgManipulation.exportSVG();
    expect(exportedSVG).toContain('fill="#0000ff"');
    expect(exportedSVG).toContain('stroke="#000000"');
  });

  it('should handle multiple shape selections', () => {
    const svgContent = `
      <svg>
        <circle id="c1" cx="50" cy="50" r="25" fill="#ff0000"/>
        <rect id="r1" x="100" y="100" width="50" height="50" fill="#00ff00"/>
      </svg>
    `;
    
    svgManipulation.initializeSVG(container, svgContent);
    const svgInstance = svgManipulation.getSVGInstance();

    // Select circle
    const circle = svgInstance?.findOne('#c1');
    if (circle) {
      const props1 = svgManipulation.getShapeProperties(circle);
      shapeSelection.selectShape(props1);
      expect(shapeSelection.getSelectedShape()?.id).toBe('c1');
    }

    // Select rect (should replace previous selection)
    const rect = svgInstance?.findOne('#r1');
    if (rect) {
      const props2 = svgManipulation.getShapeProperties(rect);
      shapeSelection.selectShape(props2);
      expect(shapeSelection.getSelectedShape()?.id).toBe('r1');
    }
  });
});
```

## Test Coverage Goals

### Minimum Coverage Requirements
- **Overall Coverage**: 80%
- **Services**: 90%
- **Components**: 75%
- **Critical Paths**: 100%

### Critical Paths to Cover
1. SVG file upload and validation
2. SVG rendering in canvas
3. Shape selection
4. Fill color modification
5. Stroke addition/removal
6. SVG export

## Testing Best Practices

### 1. Arrange-Act-Assert Pattern
```typescript
it('should update fill color', () => {
  // Arrange
  const shapeId = 'test-shape';
  const newColor = '#ff0000';
  
  // Act
  service.updateFillColor(shapeId, newColor);
  
  // Assert
  const element = container.querySelector(`#${shapeId}`);
  expect(element?.getAttribute('fill')).toBe(newColor);
});
```

### 2. Use Descriptive Test Names
- ✅ `should update fill color when valid color is provided`
- ❌ `test1`

### 3. Test One Thing at a Time
- Each test should verify a single behavior
- Avoid testing multiple unrelated behaviors in one test

### 4. Mock External Dependencies
```typescript
it('should load SVG file', () => {
  const mockFileReader = {
    readAsText: vi.fn(),
    onload: null,
    result: '<svg></svg>'
  };
  
  // Use mock in test
});
```

### 5. Clean Up After Tests
```typescript
afterEach(() => {
  // Remove DOM elements
  document.body.innerHTML = '';
  
  // Clear subscriptions
  // Reset services to initial state
});
```

## Running Tests

### Run All Tests
```bash
npm run test
```

### Run Tests in Watch Mode
```bash
npm run test -- --watch
```

### Run Tests with UI
```bash
npm run test:ui
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npm run test src/app/services/svg.service.spec.ts
```

### Run Tests Matching Pattern
```bash
npm run test -- --grep "SVG Service"
```

## Continuous Integration

### GitHub Actions Example
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm run test:coverage
        
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Test Data

### Sample SVG Files for Testing

Create in `src/assets/sample-svgs/`:

**simple-circle.svg**
```xml
<svg width="100" height="100">
  <circle id="c1" cx="50" cy="50" r="40" fill="#ff0000"/>
</svg>
```

**multiple-shapes.svg**
```xml
<svg width="200" height="200">
  <rect id="r1" x="10" y="10" width="80" height="80" fill="#00ff00"/>
  <circle id="c1" cx="150" cy="150" r="30" fill="#0000ff"/>
  <path id="p1" d="M 50 150 L 100 150 L 75 100 Z" fill="#ffff00"/>
</svg>
```

**complex-svg.svg**
```xml
<svg width="300" height="300">
  <g id="group1">
    <rect x="10" y="10" width="50" height="50" fill="#ff0000"/>
    <circle cx="100" cy="100" r="30" fill="#00ff00"/>
  </g>
  <polygon points="200,10 250,100 150,100" fill="#0000ff"/>
</svg>
```

## Debugging Tests

### Enable Verbose Output
```bash
npm run test -- --reporter=verbose
```

### Debug Specific Test
```typescript
it.only('should debug this test', () => {
  console.log('Debug information');
  expect(true).toBe(true);
});
```

### Skip Test Temporarily
```typescript
it.skip('skip this test', () => {
  // Test code
});
```

## Performance Testing

### Measure Render Time
```typescript
it('should render large SVG quickly', () => {
  const start = performance.now();
  
  // Render large SVG
  svgManipulation.initializeSVG(container, largeSVGContent);
  
  const end = performance.now();
  const renderTime = end - start;
  
  expect(renderTime).toBeLessThan(100); // Should render in < 100ms
});
```

## Accessibility Testing

Consider adding accessibility tests:
```typescript
it('should have accessible color picker', () => {
  const colorInput = fixture.nativeElement.querySelector('input[type="color"]');
  expect(colorInput.getAttribute('aria-label')).toBeTruthy();
});
```
