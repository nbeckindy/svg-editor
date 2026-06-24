import { TestBed } from '@angular/core/testing';
import { RasterImageInsertService } from './raster-image-insert.service';
import { SvgManipulationService } from './svg-manipulation.service';
import { EditorHistoryService } from './editor-history.service';
import { EditorToolService } from './editor-tool.service';
import { AddImageCommand } from '../models/editor-commands';
import { RASTER_INSERT_MAX_FILE_BYTES } from '../utils/raster-insert-file';
import { stubRasterFileIo } from '../testing/raster-file-io-testing';

/** 1×1 PNG (same payload as other raster tests). */
function smallPngFile(): File {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], 't.png', { type: 'image/png' });
}

describe('RasterImageInsertService pipeline (e4s.8 integration)', () => {
  let insertService: RasterImageInsertService;
  let svgManipulation: SvgManipulationService;
  let history: EditorHistoryService;
  let editorTool: EditorToolService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    container = document.createElement('div');
    container.id = 'test-raster-pipeline';
    document.body.appendChild(container);
    insertService = TestBed.inject(RasterImageInsertService);
    svgManipulation = TestBed.inject(SvgManipulationService);
    history = TestBed.inject(EditorHistoryService);
    editorTool = TestBed.inject(EditorToolService);
  });

  afterEach(() => {
    container.remove();
  });

  it('inserts <image> into live DOM, pushes AddImageCommand, switches to selector', async () => {
    svgManipulation.initializeSVG(container, '<svg viewBox="0 0 100 100"></svg>');
    editorTool.setTool('rect');

    const restoreIo = stubRasterFileIo({ width: 20, height: 10 }, 'data:image/png;base64,ZZZZ');
    const pushSpy = vi.spyOn(history, 'pushAndExecute');
    try {
      const r = await insertService.insertRasterFileAtAnchor(smallPngFile(), { x: 50, y: 50 });
      expect(r.kind).toBe('inserted');

      const contentRoot = container.querySelector('[data-editor-content-group]');
      expect(contentRoot).toBeTruthy();
      const images = contentRoot!.querySelectorAll('image');
      expect(images.length).toBe(1);
      expect(images[0].getAttribute('href')?.startsWith('data:image/png')).toBe(true);
      expect(images[0].getAttribute('width')).toBeTruthy();
      expect(images[0].getAttribute('height')).toBeTruthy();

      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy.mock.calls[0][0]).toBeInstanceOf(AddImageCommand);
      expect(editorTool.getCurrentTool()).toBe('selector');
    } finally {
      restoreIo();
    }
  });

  it('does not insert <image> when file exceeds max bytes', async () => {
    svgManipulation.initializeSVG(container, '<svg viewBox="0 0 100 100"></svg>');
    const file = new File([new Uint8Array(1)], 'x.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: RASTER_INSERT_MAX_FILE_BYTES + 1 });

    const r = await insertService.insertRasterFileAtAnchor(file, { x: 0, y: 0 });
    expect(r.kind).toBe('failed');

    const contentRoot = container.querySelector('[data-editor-content-group]');
    expect(contentRoot!.querySelectorAll('image').length).toBe(0);
  });
});
