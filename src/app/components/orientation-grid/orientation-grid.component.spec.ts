import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrientationGridComponent, OrientationPoint } from './orientation-grid.component';

describe('OrientationGridComponent', () => {
  let fixture: ComponentFixture<OrientationGridComponent>;
  let component: OrientationGridComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrientationGridComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(OrientationGridComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', 'center');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render nine cells with default test ids', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[role="radio"]').length).toBe(9);
    expect(el.querySelector('[data-testid="orientation-center"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="orientation-top-left"]')).toBeTruthy();
  });

  it('should mark the selected cell as checked', () => {
    const center = fixture.nativeElement.querySelector(
      '[data-testid="orientation-center"]'
    ) as HTMLButtonElement;
    expect(center.getAttribute('aria-checked')).toBe('true');
  });

  it('should emit valueChange when a different cell is clicked', () => {
    const spy = vi.fn<(point: OrientationPoint) => void>();
    component.valueChange.subscribe(spy);

    const btn = fixture.nativeElement.querySelector(
      '[data-testid="orientation-bottom-right"]'
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('bottom-right');
  });

  it('should not emit when the already-selected cell is clicked', () => {
    const spy = vi.fn<(point: OrientationPoint) => void>();
    component.valueChange.subscribe(spy);

    const btn = fixture.nativeElement.querySelector(
      '[data-testid="orientation-center"]'
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    expect(spy).not.toHaveBeenCalled();
  });

  it('should use testIdPrefix for cell test ids', () => {
    fixture.componentRef.setInput('testIdPrefix', 'artboard-resize-anchor');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="artboard-resize-anchor-top-left"]')
    ).toBeTruthy();
  });

  it('should render a center circle and perimeter arrows', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.orientation-center')).toBeTruthy();
    expect(el.querySelectorAll('.orientation-arrow').length).toBe(8);
  });
});
