import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { RectToolContextComponent } from './rect-tool-context.component';
import { RectCreationDefaultsService } from '../../services/rect-creation-defaults.service';

describe('RectToolContextComponent', () => {
  let fixture: ComponentFixture<RectToolContextComponent>;
  let defaults: RectCreationDefaultsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RectToolContextComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(RectToolContextComponent);
    defaults = TestBed.inject(RectCreationDefaultsService);
    fixture.detectChanges();
  });

  it('renders orientation grid and W/H/R controls', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="rect-tool-context"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="rect-place-anchor-top-left"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="rect-creation-width"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="rect-creation-height"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="rect-creation-corner-slider"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="rect-creation-corner"]')).toBeTruthy();
  });

  it('commits width change to defaults service', () => {
    const input = fixture.nativeElement.querySelector(
      '[data-testid="rect-creation-width"]'
    ) as HTMLInputElement;
    input.value = '80';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(defaults.width()).toBe(80);
  });

  it('clamps corner slider max to half the shorter edge', () => {
    defaults.setWidth(100);
    defaults.setHeight(40);
    fixture.detectChanges();
    const slider = fixture.nativeElement.querySelector(
      '[data-testid="rect-creation-corner-slider"]'
    ) as HTMLInputElement;
    expect(slider.max).toBe('20');
  });

  it('commits corner radius from the slider', () => {
    const slider = fixture.nativeElement.querySelector(
      '[data-testid="rect-creation-corner-slider"]'
    ) as HTMLInputElement;
    slider.value = '12';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(defaults.effectiveCornerRadius()).toBe(12);
  });
});
