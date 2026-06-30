import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PaintSwatchPopoverComponent,
  PaintSwatchMode
} from './paint-swatch-popover.component';
import {
  defaultLinearGradientModel,
  defaultRadialGradientModel
} from '../../models/svg-gradient';

describe('PaintSwatchPopoverComponent', () => {
  let component: PaintSwatchPopoverComponent;
  let fixture: ComponentFixture<PaintSwatchPopoverComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaintSwatchPopoverComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PaintSwatchPopoverComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders read-only swatch when disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const root = fixture.nativeElement.querySelector('[data-testid="paint-swatch-popover"]') as HTMLElement;
    expect(root.classList.contains('paint-swatch-popover--disabled')).toBe(true);
    expect(root.querySelector('details')).toBeNull();
  });

  it('shows empty swatch when empty', () => {
    fixture.componentRef.setInput('empty', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.psp-swatch-empty')).toBeTruthy();
  });

  it('shows mixed swatch when indeterminate', () => {
    fixture.componentRef.setInput('indeterminate', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.psp-swatch-mixed')).toBeTruthy();
  });

  it('shows gradient preview swatch for linear mode', () => {
    const model = defaultLinearGradientModel('g1', '#ff0000', '#0000ff');
    fixture.componentRef.setInput('mode', 'linear');
    fixture.componentRef.setInput('gradientModel', model);
    fixture.detectChanges();
    const swatch = fixture.nativeElement.querySelector('.psp-swatch-gradient') as HTMLElement;
    expect(swatch).toBeTruthy();
    expect(swatch.style.backgroundImage).toContain('linear-gradient');
  });

  it('emits paintModeChange when a mode tab is clicked', () => {
    const emitted: PaintSwatchMode[] = [];
    component.paintModeChange.subscribe((m) => emitted.push(m));

    const linearTab = fixture.nativeElement.querySelector(
      '[data-testid="paint-swatch-mode-linear"]'
    ) as HTMLButtonElement;
    linearTab.click();

    expect(emitted).toEqual(['linear']);
  });

  it('does not emit paintModeChange for gradient tabs when gradientModesDisabled', () => {
    fixture.componentRef.setInput('gradientModesDisabled', true);
    fixture.detectChanges();

    const emitted: PaintSwatchMode[] = [];
    component.paintModeChange.subscribe((m) => emitted.push(m));

    const linearTab = fixture.nativeElement.querySelector(
      '[data-testid="paint-swatch-mode-linear"]'
    ) as HTMLButtonElement;
    linearTab.click();

    expect(emitted).toEqual([]);
  });

  it('shows solid color controls only in solid mode', () => {
    fixture.componentRef.setInput('mode', 'solid');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="paint-swatch-solid-controls"]')).toBeTruthy();

    fixture.componentRef.setInput('mode', 'linear');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="paint-swatch-solid-controls"]')).toBeNull();
  });

  it('emits colorChange from embedded color picker', () => {
    fixture.componentRef.setInput('mode', 'solid');
    fixture.detectChanges();

    const emitted: string[] = [];
    component.colorChange.subscribe((c) => emitted.push(c));
    component.onSolidColorChange('#aabbcc');

    expect(emitted).toEqual(['#aabbcc']);
  });

  it('uses stroke-specific no-paint label', () => {
    fixture.componentRef.setInput('target', 'stroke');
    fixture.detectChanges();
    const noneTab = fixture.nativeElement.querySelector(
      '[data-testid="paint-swatch-mode-none"]'
    ) as HTMLButtonElement;
    expect(noneTab.textContent?.trim()).toBe('No stroke');
  });

  it('renders all mode tab test ids', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="paint-swatch-mode-solid"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="paint-swatch-mode-linear"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="paint-swatch-mode-radial"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="paint-swatch-mode-none"]')).toBeTruthy();
  });

  it('emits paintModeChange for radial and none tabs', () => {
    const emitted: PaintSwatchMode[] = [];
    component.paintModeChange.subscribe((m) => emitted.push(m));

    const radialTab = fixture.nativeElement.querySelector(
      '[data-testid="paint-swatch-mode-radial"]'
    ) as HTMLButtonElement;
    radialTab.click();
    expect(emitted).toEqual(['radial']);

    const noneTab = fixture.nativeElement.querySelector(
      '[data-testid="paint-swatch-mode-none"]'
    ) as HTMLButtonElement;
    noneTab.click();
    expect(emitted).toEqual(['radial', 'none']);
  });

  it('marks the active mode tab', () => {
    fixture.componentRef.setInput('mode', 'linear');
    fixture.detectChanges();
    const linearTab = fixture.nativeElement.querySelector(
      '[data-testid="paint-swatch-mode-linear"]'
    ) as HTMLButtonElement;
    expect(linearTab.classList.contains('active')).toBe(true);
    expect(linearTab.getAttribute('aria-selected')).toBe('true');
  });

  it('uses fill-specific no-paint label', () => {
    fixture.componentRef.setInput('target', 'fill');
    fixture.detectChanges();
    const noneTab = fixture.nativeElement.querySelector(
      '[data-testid="paint-swatch-mode-none"]'
    ) as HTMLButtonElement;
    expect(noneTab.textContent?.trim()).toBe('No fill');
  });

  it('shows radial gradient preview for radial mode', () => {
    const model = defaultRadialGradientModel('g2', '#ffffff', '#000000');
    fixture.componentRef.setInput('mode', 'radial');
    fixture.componentRef.setInput('gradientModel', model);
    fixture.detectChanges();
    const swatch = fixture.nativeElement.querySelector('.psp-swatch-gradient') as HTMLElement;
    expect(swatch.style.backgroundImage).toContain('radial-gradient');
  });
});
