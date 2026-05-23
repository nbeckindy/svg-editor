import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Matrix } from '@svgdotjs/svg.js';
import { vi } from 'vitest';
import { SelectionTransformReadoutService } from './selection-transform-readout.service';
import { ShapeSelectionService } from './shape-selection.service';
import { SvgManipulationService } from './svg-manipulation.service';
import { EditorHistoryService } from './editor-history.service';
import { EditorToolService } from './editor-tool.service';
import { ShapeProperties } from '../models/shape-properties.interface';

describe('SelectionTransformReadoutService', () => {
  let service: SelectionTransformReadoutService;
  const selectedShapesSignal = signal<ShapeProperties[]>([]);
  const editorToolSignal = signal<'selector' | 'zoom' | 'text'>('selector');
  const editorHistoryRevision = signal(0);

  beforeEach(async () => {
    const shapeSelectionMock = {
      selectedShapes: selectedShapesSignal,
      getSelectedShapes: () => selectedShapesSignal()
    };

    const svgManipulationMock = {
      documentRevision: signal(0),
      getUnionBBox: vi.fn().mockReturnValue({ x: 5, y: 10, width: 80, height: 40 }),
      getSVGInstance: vi.fn()
    };

    const editorToolMock = {
      currentTool: editorToolSignal
    };

    const editorHistoryMock = {
      revision: editorHistoryRevision
    };

    await TestBed.configureTestingModule({
      providers: [
        SelectionTransformReadoutService,
        { provide: ShapeSelectionService, useValue: shapeSelectionMock },
        { provide: SvgManipulationService, useValue: svgManipulationMock },
        { provide: EditorToolService, useValue: editorToolMock },
        { provide: EditorHistoryService, useValue: editorHistoryMock }
      ]
    }).compileComponents();

    service = TestBed.inject(SelectionTransformReadoutService);
    selectedShapesSignal.set([]);
    editorToolSignal.set('selector');
  });

  it('skew readout uses per-element matrix skew', () => {
    const m = new Matrix().skewX(12, 40, 25);
    const svgManipulation = TestBed.inject(SvgManipulationService) as unknown as {
      getSVGInstance: ReturnType<typeof vi.fn>;
    };
    svgManipulation.getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '#rect-1') {
          return { matrix: () => m.clone() };
        }
        return null;
      })
    } as never);

    selectedShapesSignal.set([
      { id: 'rect-1', type: 'rect', fill: '#000000', stroke: 'none', strokeWidth: 0, opacity: 1 }
    ]);

    const out = service.selectionSkewReadout();
    expect(String(out.skewX)).toContain('12');
    expect(String(out.skewY)).toMatch(/0\.0/);
  });
});
