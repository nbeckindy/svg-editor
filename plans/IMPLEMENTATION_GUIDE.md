# Implementation Guide - Angular SVG Editor

## Step-by-Step Implementation Instructions

### Phase 1: Project Setup

#### Step 1: Create Angular Project
```bash
# Navigate to Documents directory
cd ~/Documents/svg-editor

# Create new Angular application with routing and SCSS
ng new svg-editor-app --routing --style=scss --standalone

# Navigate into project
cd svg-editor-app
```

#### Step 2: Install Dependencies
```bash
# Install SVG.js
npm install @svgdotjs/svg.js

# Install Vitest and Angular Vitest support
npm install -D vitest @vitest/ui @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom

# Install types
npm install -D @types/node
```

#### Step 3: Configure Vitest

Create `vitest.config.ts`:
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

Create `src/test-setup.ts`:
```typescript
import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);
```

Update `package.json` scripts:
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

---

### Phase 2: Core Services Implementation

#### SVG Service

**File**: `src/app/services/svg.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SvgService {
  private currentSVGContent: string = '';

  /**
   * Load SVG file and return its content as string
   */
  loadSVG(file: File): Observable<string> {
    return from(this.readFileAsText(file)).pipe(
      map(content => {
        if (this.validateSVG(content)) {
          this.currentSVGContent = content;
          return content;
        }
        throw new Error('Invalid SVG file');
      })
    );
  }

  /**
   * Validate if content is valid SVG
   */
  validateSVG(content: string): boolean {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    
    if (parserError) {
      return false;
    }
    
    const svgElement = doc.querySelector('svg');
    return svgElement !== null;
  }

  /**
   * Get current SVG content
   */
  getCurrentSVG(): string {
    return this.currentSVGContent;
  }

  /**
   * Read file as text
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }
}
```

**Test File**: `src/app/services/svg.service.spec.ts`

```typescript
import { TestBed } from '@angular/core/testing';
import { SvgService } from './svg.service';

describe('SvgService', () => {
  let service: SvgService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SvgService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should validate correct SVG content', () => {
    const validSVG = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    expect(service.validateSVG(validSVG)).toBe(true);
  });

  it('should reject invalid SVG content', () => {
    const invalidSVG = '<div>Not an SVG</div>';
    expect(service.validateSVG(invalidSVG)).toBe(false);
  });

  it('should load SVG file', async () => {
    const svgContent = '<svg><rect width="100" height="100"/></svg>';
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const file = new File([blob], 'test.svg', { type: 'image/svg+xml' });

    service.loadSVG(file).subscribe(content => {
      expect(content).toContain('<svg>');
      expect(content).toContain('<rect');
    });
  });
});
```

#### Shape Selection Service

**File**: `src/app/services/shape-selection.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ShapeProperties } from '../models/shape-properties.interface';

@Injectable({
  providedIn: 'root'
})
export class ShapeSelectionService {
  private selectedShapeSubject = new BehaviorSubject<ShapeProperties | null>(null);
  public selectedShape$: Observable<ShapeProperties | null> = this.selectedShapeSubject.asObservable();

  /**
   * Select a shape and emit its properties
   */
  selectShape(shape: ShapeProperties): void {
    this.selectedShapeSubject.next(shape);
  }

  /**
   * Clear current selection
   */
  clearSelection(): void {
    this.selectedShapeSubject.next(null);
  }

  /**
   * Get currently selected shape
   */
  getSelectedShape(): ShapeProperties | null {
    return this.selectedShapeSubject.value;
  }

  /**
   * Update selected shape properties
   */
  updateSelectedShape(updates: Partial<ShapeProperties>): void {
    const current = this.selectedShapeSubject.value;
    if (current) {
      this.selectedShapeSubject.next({ ...current, ...updates });
    }
  }
}
```

#### SVG Manipulation Service

**File**: `src/app/services/svg-manipulation.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { SVG, Svg, Element as SVGElement } from '@svgdotjs/svg.js';
import { ShapeProperties } from '../models/shape-properties.interface';

@Injectable({
  providedIn: 'root'
})
export class SvgManipulationService {
  private svgInstance: Svg | null = null;
  private selectedElement: SVGElement | null = null;

  /**
   * Initialize SVG.js with container and content
   */
  initializeSVG(container: HTMLElement, svgContent: string): void {
    // Clear existing content
    container.innerHTML = '';
    
    // Create SVG instance
    this.svgInstance = SVG().addTo(container).size('100%', '100%');
    
    // Parse and add SVG content
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');
    
    if (svgElement) {
      container.innerHTML = svgElement.outerHTML;
      this.svgInstance = SVG(container.firstElementChild as SVGSVGElement);
      this.makeShapesClickable();
    }
  }

  /**
   * Make all shapes in SVG clickable
   */
  private makeShapesClickable(): void {
    if (!this.svgInstance) return;

    const shapes = this.svgInstance.find('circle, rect, path, polygon, ellipse, line, polyline');
    shapes.forEach((shape: SVGElement) => {
      shape.css({ cursor: 'pointer' });
      
      // Add unique ID if not present
      if (!shape.id()) {
        shape.id(`shape-${Math.random().toString(36).substr(2, 9)}`);
      }
    });
  }

  /**
   * Get shape properties by element
   */
  getShapeProperties(element: SVGElement): ShapeProperties {
    return {
      id: element.id() || '',
      type: element.type,
      fill: element.attr('fill') || '#000000',
      stroke: element.attr('stroke'),
      strokeWidth: parseFloat(element.attr('stroke-width')) || 0,
      opacity: parseFloat(element.attr('opacity')) || 1
    };
  }

  /**
   * Update fill color of a shape
   */
  updateFillColor(shapeId: string, color: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.fill(color);
    }
  }

  /**
   * Add stroke to a shape
   */
  addStroke(shapeId: string, color: string, width: number): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.stroke({ color, width });
    }
  }

  /**
   * Remove stroke from a shape
   */
  removeStroke(shapeId: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.stroke('none');
    }
  }

  /**
   * Update stroke color
   */
  updateStrokeColor(shapeId: string, color: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.stroke({ color });
    }
  }

  /**
   * Highlight selected shape
   */
  highlightShape(shapeId: string): void {
    // Remove previous highlight
    this.clearHighlight();
    
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      this.selectedElement = shape;
      // Add highlight effect (e.g., dashed outline)
      shape.addClass('selected-shape');
    }
  }

  /**
   * Clear shape highlight
   */
  clearHighlight(): void {
    if (this.selectedElement) {
      this.selectedElement.removeClass('selected-shape');
      this.selectedElement = null;
    }
  }

  /**
   * Export current SVG as string
   */
  exportSVG(): string {
    if (!this.svgInstance) return '';
    return this.svgInstance.svg();
  }

  /**
   * Get SVG instance for direct manipulation
   */
  getSVGInstance(): Svg | null {
    return this.svgInstance;
  }
}
```

---

### Phase 3: Component Implementation

#### File Upload Component

**File**: `src/app/components/file-upload/file-upload.component.ts`

```typescript
import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgService } from '../../services/svg.service';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="upload-container">
      <div class="upload-zone" 
           (drop)="onDrop($event)" 
           (dragover)="onDragOver($event)"
           (dragleave)="onDragLeave($event)"
           [class.drag-over]="isDragOver">
        <input 
          type="file" 
          #fileInput 
          accept=".svg,image/svg+xml" 
          (change)="onFileSelected($event)"
          style="display: none">
        <button (click)="fileInput.click()" class="upload-button">
          Choose SVG File
        </button>
        <p>or drag and drop here</p>
        @if (errorMessage) {
          <div class="error">{{ errorMessage }}</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .upload-container {
      padding: 20px;
    }
    .upload-zone {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 40px;
      text-align: center;
      transition: all 0.3s ease;
    }
    .upload-zone.drag-over {
      border-color: #2196F3;
      background-color: #e3f2fd;
    }
    .upload-button {
      padding: 10px 20px;
      background-color: #2196F3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }
    .upload-button:hover {
      background-color: #1976D2;
    }
    .error {
      color: #f44336;
      margin-top: 10px;
    }
  `]
})
export class FileUploadComponent {
  @Output() svgLoaded = new EventEmitter<string>();
  
  isDragOver = false;
  errorMessage = '';

  constructor(private svgService: SvgService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.loadFile(input.files[0]);
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.loadFile(event.dataTransfer.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  private loadFile(file: File): void {
    this.errorMessage = '';
    
    if (!file.type.includes('svg')) {
      this.errorMessage = 'Please select an SVG file';
      return;
    }

    this.svgService.loadSVG(file).subscribe({
      next: (content) => {
        this.svgLoaded.emit(content);
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to load SVG file';
      }
    });
  }
}
```

#### SVG Canvas Component

**File**: `src/app/components/svg-canvas/svg-canvas.component.ts`

```typescript
import { Component, Input, AfterViewInit, ViewChild, ElementRef, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';

@Component({
  selector: 'app-svg-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="canvas-container">
      <div #svgContainer class="svg-canvas" (click)="onCanvasClick($event)"></div>
      @if (!svgContent) {
        <div class="placeholder">
          <p>Load an SVG file to begin editing</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .canvas-container {
      position: relative;
      width: 100%;
      height: 600px;
      border: 1px solid #ddd;
      background: white;
    }
    .svg-canvas {
      width: 100%;
      height: 100%;
    }
    .placeholder {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: #999;
    }
    :host ::ng-deep .selected-shape {
      outline: 2px dashed #2196F3;
      outline-offset: 2px;
    }
  `]
})
export class SvgCanvasComponent implements AfterViewInit, OnChanges {
  @Input() svgContent: string = '';
  @ViewChild('svgContainer') svgContainer!: ElementRef<HTMLElement>;

  constructor(
    private svgManipulation: SvgManipulationService,
    private shapeSelection: ShapeSelectionService
  ) {}

  ngAfterViewInit(): void {
    if (this.svgContent) {
      this.initializeSVG();
    }
  }

  ngOnChanges(): void {
    if (this.svgContainer && this.svgContent) {
      this.initializeSVG();
    }
  }

  private initializeSVG(): void {
    this.svgManipulation.initializeSVG(this.svgContainer.nativeElement, this.svgContent);
  }

  onCanvasClick(event: MouseEvent): void {
    const target = event.target as SVGElement;
    
    // Check if clicked element is a shape
    if (target.tagName !== 'svg') {
      const svgElement = this.svgManipulation.getSVGInstance()?.findOne(`#${target.id}`);
      if (svgElement) {
        const properties = this.svgManipulation.getShapeProperties(svgElement);
        this.shapeSelection.selectShape(properties);
        this.svgManipulation.highlightShape(properties.id);
      }
    } else {
      // Clicked on canvas background
      this.shapeSelection.clearSelection();
      this.svgManipulation.clearHighlight();
    }
  }
}
```

#### Properties Panel Component

**File**: `src/app/components/properties-panel/properties-panel.component.ts`

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorPickerComponent],
  template: `
    <div class="properties-panel">
      <h3>Properties</h3>
      
      @if (selectedShape) {
        <div class="property-group">
          <label>Selected Shape</label>
          <p class="shape-info">{{ selectedShape.type }} ({{ selectedShape.id }})</p>
        </div>

        <div class="property-group">
          <label>Fill Color</label>
          <app-color-picker 
            [color]="selectedShape.fill || '#000000'"
            (colorChange)="onFillColorChange($event)">
          </app-color-picker>
        </div>

        <div class="property-group">
          <label>
            <input type="checkbox" [(ngModel)]="strokeEnabled" (change)="onStrokeToggle()">
            Enable Stroke
          </label>
        </div>

        @if (strokeEnabled) {
          <div class="property-group">
            <label>Stroke Color</label>
            <app-color-picker 
              [color]="selectedShape.stroke || '#000000'"
              (colorChange)="onStrokeColorChange($event)">
            </app-color-picker>
          </div>

          <div class="property-group">
            <label>Stroke Width</label>
            <input 
              type="number" 
              [(ngModel)]="strokeWidth" 
              min="1" 
              max="20"
              (change)="onStrokeWidthChange()">
          </div>
        }

        <button class="export-button" (click)="exportSVG()">Export SVG</button>
      } @else {
        <p class="no-selection">Select a shape to edit properties</p>
      }
    </div>
  `,
  styles: [`
    .properties-panel {
      padding: 20px;
      background: #f5f5f5;
      height: 100%;
      overflow-y: auto;
    }
    h3 {
      margin-top: 0;
    }
    .property-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .shape-info {
      padding: 8px;
      background: white;
      border-radius: 4px;
      font-family: monospace;
    }
    input[type="number"] {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .export-button {
      width: 100%;
      padding: 10px;
      background-color: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 20px;
    }
    .export-button:hover {
      background-color: #45a049;
    }
    .no-selection {
      color: #999;
      text-align: center;
      padding: 20px;
    }
  `]
})
export class PropertiesPanelComponent implements OnInit {
  selectedShape: ShapeProperties | null = null;
  strokeEnabled = false;
  strokeWidth = 2;

  constructor(
    private shapeSelection: ShapeSelectionService,
    private svgManipulation: SvgManipulationService
  ) {}

  ngOnInit(): void {
    this.shapeSelection.selectedShape$.subscribe(shape => {
      this.selectedShape = shape;
      if (shape) {
        this.strokeEnabled = !!shape.stroke && shape.stroke !== 'none';
        this.strokeWidth = shape.strokeWidth || 2;
      }
    });
  }

  onFillColorChange(color: string): void {
    if (this.selectedShape) {
      this.svgManipulation.updateFillColor(this.selectedShape.id, color);
      this.shapeSelection.updateSelectedShape({ fill: color });
    }
  }

  onStrokeToggle(): void {
    if (this.selectedShape) {
      if (this.strokeEnabled) {
        this.svgManipulation.addStroke(
          this.selectedShape.id, 
          this.selectedShape.stroke || '#000000', 
          this.strokeWidth
        );
      } else {
        this.svgManipulation.removeStroke(this.selectedShape.id);
      }
    }
  }

  onStrokeColorChange(color: string): void {
    if (this.selectedShape && this.strokeEnabled) {
      this.svgManipulation.updateStrokeColor(this.selectedShape.id, color);
      this.shapeSelection.updateSelectedShape({ stroke: color });
    }
  }

  onStrokeWidthChange(): void {
    if (this.selectedShape && this.strokeEnabled) {
      this.svgManipulation.addStroke(
        this.selectedShape.id,
        this.selectedShape.stroke || '#000000',
        this.strokeWidth
      );
      this.shapeSelection.updateSelectedShape({ strokeWidth: this.strokeWidth });
    }
  }

  exportSVG(): void {
    const svgContent = this.svgManipulation.exportSVG();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'edited-svg.svg';
    link.click();
    URL.revokeObjectURL(url);
  }
}
```

#### Color Picker Component

**File**: `src/app/components/color-picker/color-picker.component.ts`

```typescript
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="color-picker">
      <input 
        type="color" 
        [value]="color" 
        (input)="onColorChange($event)"
        class="color-input">
      <input 
        type="text" 
        [value]="color" 
        (input)="onTextChange($event)"
        class="color-text"
        placeholder="#000000">
    </div>
  `,
  styles: [`
    .color-picker {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .color-input {
      width: 50px;
      height: 40px;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }
    .color-text {
      flex: 1;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: monospace;
    }
  `]
})
export class ColorPickerComponent {
  @Input() color: string = '#000000';
  @Output() colorChange = new EventEmitter<string>();

  onColorChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.color = input.value;
    this.colorChange.emit(this.color);
  }

  onTextChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    // Validate hex color
    if (/^#[0-9A-F]{6}$/i.test(value)) {
      this.color = value;
      this.colorChange.emit(this.color);
    }
  }
}
```

---

### Phase 4: Main App Component

**File**: `src/app/app.component.ts`

```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { SvgCanvasComponent } from './components/svg-canvas/svg-canvas.component';
import { PropertiesPanelComponent } from './components/properties-panel/properties-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, 
    FileUploadComponent, 
    SvgCanvasComponent, 
    PropertiesPanelComponent
  ],
  template: `
    <div class="app-container">
      <header>
        <h1>Angular SVG Editor</h1>
      </header>
      
      <app-file-upload (svgLoaded)="onSVGLoaded($event)"></app-file-upload>
      
      <div class="main-content">
        <div class="canvas-area">
          <app-svg-canvas [svgContent]="svgContent"></app-svg-canvas>
        </div>
        <div class="properties-area">
          <app-properties-panel></app-properties-panel>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .app-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: #1976D2;
      color: white;
      padding: 20px;
      text-align: center;
    }
    header h1 {
      margin: 0;
    }
    .main-content {
      display: grid;
      grid-template-columns: 1fr 300px;
      flex: 1;
      overflow: hidden;
    }
    .canvas-area {
      padding: 20px;
      overflow: auto;
    }
    .properties-area {
      border-left: 1px solid #ddd;
    }
  `]
})
export class AppComponent {
  svgContent: string = '';

  onSVGLoaded(content: string): void {
    this.svgContent = content;
  }
}
```

---

### Phase 5: Data Models

**File**: `src/app/models/shape-properties.interface.ts`

```typescript
export interface ShapeProperties {
  id: string;
  type: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}
```

**File**: `src/app/models/svg-file.interface.ts`

```typescript
export interface SVGFile {
  name: string;
  content: string;
  lastModified: Date;
}
```

---

## Development Commands

```bash
# Start development server
ng serve

# Run tests
npm run test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Build for production
ng build --configuration production

# Lint code
ng lint
```

## Next Steps

After implementing the basic features:
1. Add error boundaries and better error handling
2. Implement undo/redo functionality
3. Add keyboard shortcuts
4. Support for more shape properties (rotation, scale, etc.)
5. Add shape creation tools
6. Implement layer management
