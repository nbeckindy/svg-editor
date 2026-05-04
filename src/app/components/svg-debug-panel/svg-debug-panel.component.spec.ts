import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { SvgDebugPanelComponent } from './svg-debug-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { vi } from 'vitest';

describe('SvgDebugPanelComponent', () => {
  let fixture: ComponentFixture<SvgDebugPanelComponent>;
  let documentRevision: WritableSignal<number>;
  let selectedShapes: WritableSignal<ShapeProperties[]>;
  let exportSVG: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    documentRevision = signal(0);
    selectedShapes = signal<ShapeProperties[]>([]);
    exportSVG = vi.fn(() => '');

    await TestBed.configureTestingModule({
      imports: [SvgDebugPanelComponent],
      providers: [
        { provide: SvgManipulationService, useValue: { documentRevision, exportSVG } },
        { provide: ShapeSelectionService, useValue: { selectedShapes } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SvgDebugPanelComponent);
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show empty state when exportSVG is empty', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.debug-xml')).toBeNull();
    (el.querySelector('.debug-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.debug-panel-empty')).toBeTruthy();
    expect(el.querySelector('.debug-xml')).toBeNull();
  });

  it('should show formatted XML when exportSVG returns content', () => {
    exportSVG.mockReturnValue(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle id="c1" cx="5" cy="5" r="2" /></svg>'
    );
    documentRevision.set(1);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.debug-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.debug-panel-empty')).toBeNull();
    const pre = el.querySelector('.debug-xml');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toContain('<circle');
    expect(pre?.textContent).toContain('id="c1"');
  });

  it('should add selected class to spans when shape id is selected', () => {
    exportSVG.mockReturnValue(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle id="c1" cx="0" cy="0" r="1" /></svg>'
    );
    selectedShapes.set([{ id: 'c1', type: 'circle' }]);
    documentRevision.set(1);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.debug-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    const highlighted = el.querySelectorAll('.selected');
    expect(highlighted.length).toBeGreaterThan(0);
  });

  it('should collapse and expand debug content', () => {
    exportSVG.mockReturnValue(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle id="c1" cx="0" cy="0" r="1" /></svg>'
    );
    documentRevision.set(1);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector('.debug-toggle') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(el.querySelector('.debug-xml')).toBeNull();
    expect(button.textContent).toContain('Expand');

    button.click();
    fixture.detectChanges();
    expect(el.querySelector('.debug-xml')).toBeTruthy();
    expect(button.textContent).toContain('Collapse');

    button.click();
    fixture.detectChanges();
    expect(el.querySelector('.debug-xml')).toBeNull();
    expect(button.textContent).toContain('Expand');

    button.click();
    fixture.detectChanges();
    expect(el.querySelector('.debug-xml')).toBeTruthy();
    expect(button.textContent).toContain('Collapse');
  });
});
