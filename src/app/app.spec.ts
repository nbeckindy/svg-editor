import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app';
import { SvgManipulationService } from './services/svg-manipulation.service';
import { ShapeSelectionService } from './services/shape-selection.service';
import { EditorHistoryService } from './services/editor-history.service';
import { EditorToolService } from './services/editor-tool.service';
import { EditorLayoutService } from './services/editor-layout.service';
import { DockPanelRegistryService } from './panels/dock-panel-registry.service';
import { registerDefaultDockPanels } from './panels/register-default-dock-panels';
import { routes } from './app.routes';
import { flushMdiSvgIfPending, mdiIconHttpTestProviders, registerMdiSvgIconSetForTests } from './testing/mdi-icon-testing';
import { editorPortTestProviders } from './testing/editor-port-test-providers';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes), ...mdiIconHttpTestProviders, ...editorPortTestProviders]
    }).compileComponents();

    registerDefaultDockPanels(TestBed.inject(DockPanelRegistryService));
    registerMdiSvgIconSetForTests();
  });

  afterEach(() => {
    flushMdiSvgIfPending();
    TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true });
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should start with default new document SVG (landing / refresh)', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.svgContent).toContain('viewBox="0 0 800 600"');
    expect(app.svgContent).toContain('width="800"');
    expect(app.svgContent).toContain('height="600"');
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('header h1')?.textContent).toContain('Angular SVG Editor');
  });

  it('should have left rail, canvas, dock with layers/properties, and svg debug panel', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-editor-left-rail')).toBeTruthy();
    expect(compiled.querySelector('app-svg-canvas')).toBeTruthy();
    expect(compiled.querySelector('app-editor-right-dock')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="editor-layers-area"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="editor-properties-area"]')).toBeTruthy();
    expect(compiled.querySelector('app-svg-debug-panel')).toBeTruthy();
  });

  it('auto-shows path ops when two paths are selected in selector mode', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const layout = TestBed.inject(EditorLayoutService);
    const shapeSelection = TestBed.inject(ShapeSelectionService);
    const editorTool = TestBed.inject(EditorToolService);
    fixture.detectChanges();

    editorTool.setTool('selector');
    shapeSelection.selectShapes([
      { id: 'p1', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
      { id: 'p2', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
    ]);
    fixture.detectChanges();

    expect(layout.activeDockPanel()).toBe('pathOps');
  });

  it('preserves manual dock tab choice until selection changes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const layout = TestBed.inject(EditorLayoutService);
    const shapeSelection = TestBed.inject(ShapeSelectionService);
    const editorTool = TestBed.inject(EditorToolService);
    fixture.detectChanges();

    editorTool.setTool('selector');
    shapeSelection.selectShapes([
      { id: 'p1', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
      { id: 'p2', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
    ]);
    fixture.detectChanges();
    expect(layout.activeDockPanel()).toBe('pathOps');

    const layersTab = fixture.nativeElement.querySelector('[data-testid="dock-tab-layers"]') as HTMLButtonElement;
    layersTab.click();
    fixture.detectChanges();
    expect(layout.activeDockPanel()).toBe('layers');

    fixture.detectChanges();
    expect(layout.activeDockPanel()).toBe('layers');
  });

  it('should update svgContent when onSVGLoaded is called', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const content = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    app.onSVGLoaded(content);
    expect(app.svgContent).toBe(content);
  });

  describe('downloadSvg', () => {
    it('should call exportSVG and trigger download with correct MIME type', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const svgManipulation = TestBed.inject(SvgManipulationService);

      const exportedSvg = '<svg><rect width="10" height="10"/></svg>';
      vi.spyOn(svgManipulation, 'exportSVG').mockReturnValue(exportedSvg);

      const fakeUrl = 'blob:http://localhost/fake-id';
      const createObjectURLSpy = vi.fn().mockReturnValue(fakeUrl);
      const revokeObjectURLSpy = vi.fn();
      vi.stubGlobal('URL', { ...URL, createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy });

      const clickSpy = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValue({ set href(_: string) {}, set download(_: string) {}, click: clickSpy } as unknown as HTMLAnchorElement);

      app.downloadSvg();

      expect(svgManipulation.exportSVG).toHaveBeenCalled();
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      const blob: Blob = createObjectURLSpy.mock.calls[0][0];
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/svg+xml');
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(fakeUrl);

      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('should use uploadedFileName when available, fallback to document.svg', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const svgManipulation = TestBed.inject(SvgManipulationService);

      vi.spyOn(svgManipulation, 'exportSVG').mockReturnValue('<svg></svg>');
      vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn().mockReturnValue('blob:fake'), revokeObjectURL: vi.fn() });

      let capturedDownload = '';
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_: string) {},
        set download(val: string) { capturedDownload = val; },
        click: vi.fn()
      } as unknown as HTMLAnchorElement);

      app.uploadedFileName = 'my-design.svg';
      app.downloadSvg();
      expect(capturedDownload).toBe('my-design.svg');

      app.uploadedFileName = '';
      app.downloadSvg();
      expect(capturedDownload).toBe('document.svg');

      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('should be a no-op when exportSVG returns empty', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const svgManipulation = TestBed.inject(SvgManipulationService);

      vi.spyOn(svgManipulation, 'exportSVG').mockReturnValue('');
      const createObjectURLSpy = vi.fn();
      vi.stubGlobal('URL', { ...URL, createObjectURL: createObjectURLSpy, revokeObjectURL: vi.fn() });

      app.downloadSvg();

      expect(createObjectURLSpy).not.toHaveBeenCalled();

      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('should alert and skip download when export image policy blocks (blob:)', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const svgManipulation = TestBed.inject(SvgManipulationService);

      vi.spyOn(svgManipulation, 'getSvgExportImagePolicyResult').mockReturnValue({
        blocked: true,
        blockedReason: 'blob blocked',
        hasOversizedDataUrl: false,
        oversizedDataHrefCount: 0,
        oversizedConfirmMessage: null
      });
      const exportSpy = vi.spyOn(svgManipulation, 'exportSVG');
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
      const createObjectURLSpy = vi.fn();
      vi.stubGlobal('URL', { ...URL, createObjectURL: createObjectURLSpy, revokeObjectURL: vi.fn() });
      vi.spyOn(document, 'createElement').mockReturnValue({ set href(_: string) {}, set download(_: string) {}, click: vi.fn() } as unknown as HTMLAnchorElement);

      app.downloadSvg();

      expect(alertSpy).toHaveBeenCalledWith('blob blocked');
      expect(exportSpy).not.toHaveBeenCalled();
      expect(createObjectURLSpy).not.toHaveBeenCalled();

      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('should skip download when oversized data URL confirm is declined', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const svgManipulation = TestBed.inject(SvgManipulationService);

      vi.spyOn(svgManipulation, 'getSvgExportImagePolicyResult').mockReturnValue({
        blocked: false,
        blockedReason: null,
        hasOversizedDataUrl: true,
        oversizedDataHrefCount: 1,
        oversizedConfirmMessage: 'Really download?'
      });
      const exportSpy = vi.spyOn(svgManipulation, 'exportSVG').mockReturnValue('<svg></svg>');
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const createObjectURLSpy = vi.fn();
      vi.stubGlobal('URL', { ...URL, createObjectURL: createObjectURLSpy, revokeObjectURL: vi.fn() });

      app.downloadSvg();

      expect(exportSpy).not.toHaveBeenCalled();
      expect(createObjectURLSpy).not.toHaveBeenCalled();

      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('should download when oversized data URL confirm is accepted', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const svgManipulation = TestBed.inject(SvgManipulationService);

      vi.spyOn(svgManipulation, 'getSvgExportImagePolicyResult').mockReturnValue({
        blocked: false,
        blockedReason: null,
        hasOversizedDataUrl: true,
        oversizedDataHrefCount: 2,
        oversizedConfirmMessage: 'Really download?'
      });
      vi.spyOn(svgManipulation, 'exportSVG').mockReturnValue('<svg></svg>');
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const createObjectURLSpy = vi.fn().mockReturnValue('blob:ok');
      vi.stubGlobal('URL', { ...URL, createObjectURL: createObjectURLSpy, revokeObjectURL: vi.fn() });
      vi.spyOn(document, 'createElement').mockReturnValue({ set href(_: string) {}, set download(_: string) {}, click: vi.fn() } as unknown as HTMLAnchorElement);

      app.downloadSvg();

      expect(svgManipulation.exportSVG).toHaveBeenCalled();
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('should render download button disabled when no SVG content', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      app.svgContent = '';
      fixture.detectChanges();

      const btn = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="download-svg-button"]') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(true);
    });
  });

  describe('onNewCanvas', () => {
    it('should set svgContent to empty then to DEFAULT_SVG via microtask', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;

      app.svgContent = '<svg><circle cx="10" cy="10" r="5"/></svg>';
      app.onNewCanvas();
      expect(app.svgContent).toBe('');

      await new Promise<void>((r) => queueMicrotask(r));
      expect(app.svgContent).toContain('viewBox="0 0 800 600"');
    });

    it('should clear selection and highlight', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const shapeSelection = TestBed.inject(ShapeSelectionService);
      const svgManipulation = TestBed.inject(SvgManipulationService);

      const clearSelectionSpy = vi.spyOn(shapeSelection, 'clearSelection');
      const clearHighlightSpy = vi.spyOn(svgManipulation, 'clearHighlight');

      app.onNewCanvas();

      expect(clearSelectionSpy).toHaveBeenCalled();
      expect(clearHighlightSpy).toHaveBeenCalled();
    });

    it('should clear uploadedFileName', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;

      app.uploadedFileName = 'test.svg';
      app.onNewCanvas();
      expect(app.uploadedFileName).toBe('');
    });

    it('should clear editor history', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const editorHistory = TestBed.inject(EditorHistoryService);

      const clearSpy = vi.spyOn(editorHistory, 'clear');
      app.onNewCanvas();
      expect(clearSpy).toHaveBeenCalled();
    });

    it('should show confirm dialog when canUndo is true and abort if user cancels', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const editorHistory = TestBed.inject(EditorHistoryService);

      const dummyCmd = { description: 'Dummy command', execute: vi.fn(), undo: vi.fn() };
      editorHistory.pushAndExecute(dummyCmd);
      expect(editorHistory.canUndo()).toBe(true);

      app.svgContent = '<svg><rect/></svg>';
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      app.onNewCanvas();

      expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Create a new document?');
      expect(app.svgContent).toBe('<svg><rect/></svg>');

      confirmSpy.mockRestore();
    });

    it('should not show confirm dialog when canUndo is false', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;

      const confirmSpy = vi.spyOn(window, 'confirm');

      app.onNewCanvas();

      expect(confirmSpy).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('should proceed with new canvas when user confirms', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const editorHistory = TestBed.inject(EditorHistoryService);

      const dummyCmd = { description: 'Dummy command', execute: vi.fn(), undo: vi.fn() };
      editorHistory.pushAndExecute(dummyCmd);

      app.svgContent = '<svg><rect/></svg>';
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      app.onNewCanvas();

      expect(confirmSpy).toHaveBeenCalled();
      expect(app.svgContent).toBe('');

      await new Promise<void>((r) => queueMicrotask(r));
      expect(app.svgContent).toContain('viewBox="0 0 800 600"');

      confirmSpy.mockRestore();
    });
  });
});
