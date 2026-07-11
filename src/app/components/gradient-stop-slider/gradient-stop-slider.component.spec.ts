import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { GradientStopSliderComponent } from './gradient-stop-slider.component';
import type { GradientStopModel } from '../../models/svg-gradient';

describe('GradientStopSliderComponent', () => {
  let fixture: ComponentFixture<GradientStopSliderComponent>;
  let component: GradientStopSliderComponent;

  const stops: GradientStopModel[] = [
    { offset: '0%', color: '#ff0000' },
    { offset: '100%', color: '#0000ff' }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GradientStopSliderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(GradientStopSliderComponent);
    component = fixture.componentRef.instance;
    fixture.componentRef.setInput('stops', stops);
    fixture.componentRef.setInput('previewCss', 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
    fixture.detectChanges();
  });

  it('renders track with gradient preview', () => {
    const track = fixture.nativeElement.querySelector('[data-testid="gradient-stop-slider-track"]');
    expect(track).toBeTruthy();
    expect(track.style.backgroundImage).toContain('linear-gradient');
  });

  it('emits addStopAt when clicking empty track region', () => {
    const track = fixture.nativeElement.querySelector('[data-testid="gradient-stop-slider-track"]');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 200,
      top: 0,
      height: 32,
      right: 200,
      bottom: 32,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);
    const addSpy = vi.fn();
    component.addStopAt.subscribe(addSpy);

    track.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, bubbles: true }));

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0][0]).toBeCloseTo(50, 0);
  });

  it('emits endpointSpanChange when dragging start endpoint', () => {
    fixture.componentRef.setInput('kind', 'linear');
    fixture.componentRef.setInput('endpointSpan', { start: 0, end: 100 });
    fixture.detectChanges();

    const start = fixture.nativeElement.querySelector('[data-testid="gradient-stop-slider-endpoint-start"]');
    const track = fixture.nativeElement.querySelector('[data-testid="gradient-stop-slider-track"]');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 200,
      top: 0,
      height: 32,
      right: 200,
      bottom: 32,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);
    const spanSpy = vi.fn();
    component.endpointSpanChange.subscribe(spanSpy);

    start.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 40 }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    expect(spanSpy).toHaveBeenCalled();
    const last = spanSpy.mock.calls[spanSpy.mock.calls.length - 1][0];
    expect(last.start).toBeLessThan(30);
    expect(last.end).toBe(100);
  });

  it('emits removeStop on Delete when a stop is selected', () => {
    fixture.componentRef.setInput('stops', [
      { offset: '0%', color: '#111111' },
      { offset: '50%', color: '#888888' },
      { offset: '100%', color: '#222222' }
    ]);
    fixture.componentRef.setInput('selectedIndex', 1);
    fixture.detectChanges();
    fixture.nativeElement.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    const removeSpy = vi.fn();
    component.removeStop.subscribe(removeSpy);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    expect(removeSpy).toHaveBeenCalledWith(1);
  });

  it('does not render endpoint handles for radial kind', () => {
    fixture.componentRef.setInput('kind', 'radial');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="gradient-stop-slider-endpoint-start"]')).toBeNull();
  });
});
