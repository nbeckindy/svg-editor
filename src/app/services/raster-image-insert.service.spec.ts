import { TestBed } from '@angular/core/testing';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { RasterImageInsertService } from './raster-image-insert.service';
import { SvgManipulationService } from './svg-manipulation.service';
import { ShapeSelectionService } from './shape-selection.service';
import { EditorHistoryService } from './editor-history.service';
import { EditorToolService } from './editor-tool.service';
import { AddImageCommand } from '../models/editor-commands';
import * as RasterFile from '../utils/raster-insert-file';

describe('RasterImageInsertService', () => {
  let service: RasterImageInsertService;
  const shapeEl = { node: document.createElementNS('http://www.w3.org/2000/svg', 'image') } as SvgJsElement;

  const svgManipulationMock = {
    getSVGInstance: vi.fn(),
    getDocumentViewBox: vi.fn(() => '0 0 100 100'),
    insertRasterImageIntoContentGroup: vi.fn(() => 'img-1'),
    getShapeProperties: vi.fn(() => ({ id: 'img-1', type: 'image' as const }))
  };

  afterEach(() => {
    for (const key of ['readRasterIntrinsicDimensionsFromFile', 'readFileAsDataUrl'] as const) {
      const fn = RasterFile[key] as unknown as { mockRestore?: () => void };
      fn.mockRestore?.();
    }
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    svgManipulationMock.getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => (sel === '#img-1' ? shapeEl : null))
    } as unknown);
    svgManipulationMock.insertRasterImageIntoContentGroup.mockReturnValue('img-1');
    svgManipulationMock.insertRasterImageIntoContentGroup.mockClear();

    await TestBed.configureTestingModule({
      providers: [
        RasterImageInsertService,
        { provide: SvgManipulationService, useValue: svgManipulationMock },
        { provide: ShapeSelectionService, useValue: { selectShape: vi.fn() } },
        { provide: EditorHistoryService, useValue: { pushAndExecute: vi.fn() } },
        EditorToolService
      ]
    }).compileComponents();

    service = TestBed.inject(RasterImageInsertService);
  });

  it('returns failed when no SVG instance', async () => {
    svgManipulationMock.getSVGInstance.mockReturnValue(null);
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const r = await service.insertRasterFileAtAnchor(file, { x: 10, y: 20 });
    expect(r.kind).toBe('failed');
    expect(svgManipulationMock.insertRasterImageIntoContentGroup).not.toHaveBeenCalled();
  });

  it('inserts, selects, pushes AddImageCommand, and switches to selector', async () => {
    const dimSpy = vi.spyOn(RasterFile, 'readRasterIntrinsicDimensionsFromFile').mockResolvedValue({ width: 4, height: 2 });
    const dataSpy = vi.spyOn(RasterFile, 'readFileAsDataUrl').mockResolvedValue('data:image/png;base64,abcd');
    try {
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 't.png', { type: 'image/png' });

      const selection = TestBed.inject(ShapeSelectionService) as unknown as { selectShape: ReturnType<typeof vi.fn> };
      const history = TestBed.inject(EditorHistoryService) as unknown as { pushAndExecute: ReturnType<typeof vi.fn> };
      const editorTool = TestBed.inject(EditorToolService);

      const r = await service.insertRasterFileAtAnchor(file, { x: 50, y: 50 });
      expect(r.kind).toBe('inserted');
      expect(svgManipulationMock.insertRasterImageIntoContentGroup).toHaveBeenCalled();
      expect(selection.selectShape).toHaveBeenCalled();
      expect(history.pushAndExecute).toHaveBeenCalled();
      const cmd = history.pushAndExecute.mock.calls[0][0];
      expect(cmd).toBeInstanceOf(AddImageCommand);
      expect(editorTool.getCurrentTool()).toBe('selector');
    } finally {
      dimSpy.mockRestore();
      dataSpy.mockRestore();
    }
  });

  it('silentDisallowedMime skips non-raster files without failing', async () => {
    const file = new File(['x'], 'x.tif', { type: 'image/tiff' });
    const r = await service.insertRasterFileAtAnchor(file, { x: 0, y: 0 }, { silentDisallowedMime: true });
    expect(r.kind).toBe('skipped');
    expect(svgManipulationMock.insertRasterImageIntoContentGroup).not.toHaveBeenCalled();
  });
});
