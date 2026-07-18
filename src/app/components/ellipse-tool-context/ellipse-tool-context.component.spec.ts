import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { EllipseToolContextComponent } from './ellipse-tool-context.component';
import { EllipseCreationDefaultsService } from '../../services/ellipse-creation-defaults.service';

describe('EllipseToolContextComponent', () => {
  let fixture: ComponentFixture<EllipseToolContextComponent>;
  let defaults: EllipseCreationDefaultsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EllipseToolContextComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(EllipseToolContextComponent);
    defaults = TestBed.inject(EllipseCreationDefaultsService);
    fixture.detectChanges();
  });

  it('renders orientation grid and W/H controls', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="ellipse-tool-context"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="ellipse-place-anchor-top-left"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="ellipse-creation-width"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="ellipse-creation-height"]')).toBeTruthy();
  });

  it('commits width change to defaults service', () => {
    const input = fixture.nativeElement.querySelector(
      '[data-testid="ellipse-creation-width"]'
    ) as HTMLInputElement;
    input.value = '80';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(defaults.width()).toBe(80);
  });

  it('commits height change to defaults service', () => {
    const input = fixture.nativeElement.querySelector(
      '[data-testid="ellipse-creation-height"]'
    ) as HTMLInputElement;
    input.value = '40';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(defaults.height()).toBe(40);
  });
});
