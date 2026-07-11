import { TestBed } from '@angular/core/testing';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { RasterImageInsertService } from './raster-image-insert.service';
import {
  RASTER_IMAGE_INSERT_HISTORY_PORT,
  RASTER_IMAGE_INSERT_SELECTION_PORT,
  RASTER_IMAGE_INSERT_SVG_PORT,
  RASTER_IMAGE_INSERT_TOOL_PORT
} from './raster-image-insert.tokens';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { EDITOR_SHAPE_LIFECYCLE_SVG_PORT } from './chrome-apply/chrome-apply.tokens';
import { AddImageCommand } from '../models/editor-commands';
import { stubRasterFileIo } from '../testing/raster-file-io-testing';

/** 1×1 PNG (same payload as other raster tests). */
function smallPngFile(): File {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], 't.png', { type: 'image/png' });
}

describe('RasterImageInsertService', () => {
  let service: RasterImageInsertService;
  const shapeEl = { node: document.createElementNS('http://www.w3.org/2000/svg', 'image') } as unknown as SvgJsElement;

  const shapeLifecycleMock = {
    getSVGInstance: vi.fn(),
    getShapeProperties: vi.fn(() => ({ id: 'img-1', type: 'image' as const })),
    removeShapes: vi.fn(),
    removeShape: vi.fn(),
    restoreRemovedShapesInContentGroup: vi.fn(),
    insertShapeMarkup: vi.fn(),
    createClipboardPayload: vi.fn(),
    pasteClipboardPayload: vi.fn(),
    updateTextContent: vi.fn()
  };

  const svgMock = {
    getSVGInstance: vi.fn(),
    getDocumentViewBox: vi.fn(() => '0 0 100 100'),
    insertRasterImageIntoContentGroup: vi.fn(() => 'img-1'),
    getShapeProperties: vi.fn(() => ({ id: 'img-1', type: 'image' as const }))
  };

  const documentMock = {
    getSVGInstance: vi.fn(),
    documentRevision: vi.fn(() => 1)
  };

  const selectionMock = { selectShape: vi.fn(), clearSelection: vi.fn(), selectShapes: vi.fn() };
  const historyMock = { pushAndExecute: vi.fn() };
  const toolMock = { setTool: vi.fn() };

  beforeEach(async () => {
    const svgInstance = {
      findOne: vi.fn((sel: string) => (sel === '#img-1' ? shapeEl : null))
    };
    svgMock.getSVGInstance.mockReturnValue(svgInstance as unknown);
    shapeLifecycleMock.getSVGInstance.mockReturnValue(svgInstance as unknown);
    documentMock.getSVGInstance.mockReturnValue(svgInstance as unknown);
    svgMock.insertRasterImageIntoContentGroup.mockReturnValue('img-1');
    svgMock.insertRasterImageIntoContentGroup.mockClear();

    await TestBed.configureTestingModule({
      providers: [
        RasterImageInsertService,
        { provide: RASTER_IMAGE_INSERT_SVG_PORT, useValue: svgMock },
        { provide: EDITOR_SHAPE_LIFECYCLE_SVG_PORT, useValue: shapeLifecycleMock },
        { provide: SvgEditorDocumentService, useValue: documentMock },
        { provide: RASTER_IMAGE_INSERT_SELECTION_PORT, useValue: selectionMock },
        { provide: RASTER_IMAGE_INSERT_HISTORY_PORT, useValue: historyMock },
        { provide: RASTER_IMAGE_INSERT_TOOL_PORT, useValue: toolMock }
      ]
    }).compileComponents();

    service = TestBed.inject(RasterImageInsertService);
  });

  it('returns failed when no SVG instance', async () => {
    documentMock.getSVGInstance.mockReturnValue(null);
    const r = await service.insertRasterFileAtAnchor(smallPngFile(), { x: 10, y: 20 });
    expect(r.kind).toBe('failed');
    expect(svgMock.insertRasterImageIntoContentGroup).not.toHaveBeenCalled();
  });

  it('inserts, selects, pushes AddImageCommand, and switches to selector', async () => {
    const restoreIo = stubRasterFileIo({ width: 4, height: 2 });
    try {
      const r = await service.insertRasterFileAtAnchor(smallPngFile(), { x: 50, y: 50 });
      expect(r.kind).toBe('inserted');
      expect(svgMock.insertRasterImageIntoContentGroup).toHaveBeenCalled();
      expect(selectionMock.selectShape).toHaveBeenCalled();
      expect(historyMock.pushAndExecute).toHaveBeenCalled();
      const cmd = historyMock.pushAndExecute.mock.calls[0][0];
      expect(cmd).toBeInstanceOf(AddImageCommand);
      expect(toolMock.setTool).toHaveBeenCalledWith('selector');
    } finally {
      restoreIo();
    }
  });

  it('silentDisallowedMime skips non-raster files without failing', async () => {
    const file = new File(['x'], 'x.tif', { type: 'image/tiff' });
    const r = await service.insertRasterFileAtAnchor(file, { x: 0, y: 0 }, { silentDisallowedMime: true });
    expect(r.kind).toBe('skipped');
    expect(svgMock.insertRasterImageIntoContentGroup).not.toHaveBeenCalled();
  });
});
