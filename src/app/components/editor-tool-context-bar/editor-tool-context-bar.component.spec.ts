import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { EditorToolContextBarComponent } from './editor-tool-context-bar.component';
import { EditorToolService } from '../../services/editor-tool.service';
import {
  PathNodeEditCommandBridgeService,
  type PathNodeEditBridgeChrome
} from '../../services/path-node-edit-command-bridge.service';

describe('EditorToolContextBarComponent', () => {
  let fixture: ComponentFixture<EditorToolContextBarComponent>;
  let editorTool: EditorToolService;
  let pathNodeBridge: PathNodeEditCommandBridgeService;

  const selectedNodeChrome: PathNodeEditBridgeChrome = {
    toolIsNodeEdit: true,
    hasSelectedPathNode: true,
    pathLocked: false,
    cornerEnabled: true,
    mirrorCubicEnabled: true,
    independentHandlesEnabled: true,
    anchorMode: 'corner'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorToolContextBarComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(EditorToolContextBarComponent);
    editorTool = TestBed.inject(EditorToolService);
    pathNodeBridge = TestBed.inject(PathNodeEditCommandBridgeService);
    fixture.detectChanges();
  });

  it('hosts rect creation controls when rect tool is active', () => {
    editorTool.setTool('rect');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="rect-tool-context-slot"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="rect-tool-context"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="rect-creation-width"]')).toBeTruthy();
  });

  it('hides rect creation controls when another tool is active', () => {
    editorTool.setTool('rect');
    fixture.detectChanges();
    editorTool.setTool('ellipse');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="rect-tool-context"]')).toBeNull();
  });

  it('hosts ellipse creation controls when ellipse tool is active', () => {
    editorTool.setTool('ellipse');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="ellipse-tool-context-slot"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="ellipse-tool-context"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="ellipse-creation-width"]')).toBeTruthy();
  });

  it('hides ellipse creation controls when another tool is active', () => {
    editorTool.setTool('ellipse');
    fixture.detectChanges();
    editorTool.setTool('rect');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="ellipse-tool-context"]')).toBeNull();
  });

  it('hosts path-node anchor tools in the node-edit context slot when a node is selected', () => {
    editorTool.setTool('node-edit-selector');
    pathNodeBridge.setChrome(selectedNodeChrome);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="node-edit-tool-context"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="path-node-anchor-tools"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="Corner anchor"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="Mirror cubic"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="Independent handles"]')).toBeTruthy();
  });

  it('hides path-node anchor tools for non-node-edit tools', () => {
    pathNodeBridge.setChrome(selectedNodeChrome);
    editorTool.setTool('selector');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="node-edit-tool-context"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="path-node-anchor-tools"]')).toBeNull();

    editorTool.setTool('pen');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="path-node-anchor-tools"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="pen-tool-context"]')).toBeTruthy();
  });

  it('keeps the node-edit slot but hides controls until a path node is selected', () => {
    editorTool.setTool('node-edit-selector');
    pathNodeBridge.setChrome({
      ...selectedNodeChrome,
      hasSelectedPathNode: false,
      cornerEnabled: false,
      mirrorCubicEnabled: false,
      independentHandlesEnabled: false,
      anchorMode: 'none'
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="node-edit-tool-context"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="path-node-anchor-tools"]')).toBeNull();
  });

  it('invokes bridge convert commands from the anchor tool buttons', () => {
    const corner = vi.fn(() => ({ ok: true as const }));
    const mirror = vi.fn(() => ({ ok: true as const }));
    const independent = vi.fn(() => ({ ok: true as const }));
    pathNodeBridge.register({
      convertSelectedAnchorToCorner: corner,
      convertSelectedAnchorToMirrorCubic: mirror,
      convertSelectedAnchorToIndependentHandles: independent
    });

    editorTool.setTool('node-edit-selector');
    pathNodeBridge.setChrome(selectedNodeChrome);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('[data-testid="Corner anchor"]') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('[data-testid="Mirror cubic"]') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('[data-testid="Independent handles"]') as HTMLButtonElement).click();

    expect(corner).toHaveBeenCalledOnce();
    expect(mirror).toHaveBeenCalledOnce();
    expect(independent).toHaveBeenCalledOnce();
  });
});
