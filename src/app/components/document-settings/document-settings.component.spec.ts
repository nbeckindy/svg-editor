import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal, computed, WritableSignal } from '@angular/core';
import { DocumentSettingsComponent } from './document-settings.component';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { DEFAULT_ARTBOARD, ArtboardModel, ArtboardResizeAnchor } from '../../models/artboard.model';

describe('DocumentSettingsComponent', () => {
  let fixture: ComponentFixture<DocumentSettingsComponent>;
  let component: DocumentSettingsComponent;
  let mockSvgManip: any;
  let mockHistory: any;
  let artboardSig: WritableSignal<ArtboardModel>;
  let resizeAnchorSig: WritableSignal<ArtboardResizeAnchor>;

  beforeEach(async () => {
    artboardSig = signal({ ...DEFAULT_ARTBOARD });
    resizeAnchorSig = signal('top-left');
    mockSvgManip = {
      artboard: computed(() => artboardSig()),
      artboardResizeAnchor: computed(() => resizeAnchorSig()),
      getArtboard: () => artboardSig(),
      getSVGInstance: vi.fn(() => ({})),
      setArtboardSize: vi.fn(),
      setArtboardResizeAnchor: vi.fn((a: ArtboardResizeAnchor) => resizeAnchorSig.set(a)),
      setBackgroundColor: vi.fn(),
      documentRevision: signal(0)
    };
    mockHistory = {
      pushAndExecute: vi.fn((cmd: any) => cmd.execute()),
      canUndo: computed(() => false),
      canRedo: computed(() => false)
    };

    await TestBed.configureTestingModule({
      imports: [DocumentSettingsComponent],
      providers: [
        { provide: SvgManipulationService, useValue: mockSvgManip },
        { provide: EditorHistoryService, useValue: mockHistory }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should always show document settings for artboard data', () => {
    const el = fixture.nativeElement;
    expect(el.querySelector('.settings-content')).toBeTruthy();
    expect(el.querySelector('.empty-state')).toBeNull();
    expect(el.textContent).not.toContain('No document loaded');
  });

  it('should display default artboard dimensions', () => {
    const widthInput = fixture.nativeElement.querySelector('[data-testid="artboard-width"]') as HTMLInputElement;
    const heightInput = fixture.nativeElement.querySelector('[data-testid="artboard-height"]') as HTMLInputElement;
    expect(widthInput).toBeTruthy();
    expect(heightInput).toBeTruthy();
    expect(Number(widthInput.value)).toBe(800);
    expect(Number(heightInput.value)).toBe(600);
  });

  it('should push ArtboardSizeCommand on width change', () => {
    const widthInput = fixture.nativeElement.querySelector('[data-testid="artboard-width"]') as HTMLInputElement;
    widthInput.value = '1024';
    widthInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(mockHistory.pushAndExecute).toHaveBeenCalledTimes(1);
    expect(mockSvgManip.setArtboardSize).toHaveBeenCalledWith(1024, 600);
  });

  it('should push ArtboardSizeCommand on height change', () => {
    const heightInput = fixture.nativeElement.querySelector('[data-testid="artboard-height"]') as HTMLInputElement;
    heightInput.value = '768';
    heightInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(mockHistory.pushAndExecute).toHaveBeenCalledTimes(1);
    expect(mockSvgManip.setArtboardSize).toHaveBeenCalledWith(800, 768);
  });

  it('should reject zero dimension', () => {
    const widthInput = fixture.nativeElement.querySelector('[data-testid="artboard-width"]') as HTMLInputElement;
    widthInput.value = '0';
    widthInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(mockHistory.pushAndExecute).not.toHaveBeenCalled();
  });

  it('should reject negative dimension', () => {
    const widthInput = fixture.nativeElement.querySelector('[data-testid="artboard-width"]') as HTMLInputElement;
    widthInput.value = '-100';
    widthInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(mockHistory.pushAndExecute).not.toHaveBeenCalled();
  });

  it('should reject dimension exceeding max', () => {
    const widthInput = fixture.nativeElement.querySelector('[data-testid="artboard-width"]') as HTMLInputElement;
    widthInput.value = '99999';
    widthInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(mockHistory.pushAndExecute).not.toHaveBeenCalled();
  });

  it('should call setArtboardResizeAnchor when an anchor cell is clicked', () => {
    const btn = fixture.nativeElement.querySelector(
      '[data-testid="artboard-resize-anchor-bottom-right"]'
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    fixture.detectChanges();
    expect(mockSvgManip.setArtboardResizeAnchor).toHaveBeenCalledWith('bottom-right');
  });
});
