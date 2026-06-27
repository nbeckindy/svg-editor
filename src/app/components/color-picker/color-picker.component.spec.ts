import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { ColorPickerComponent, parseHexColorInput } from './color-picker.component';

describe('parseHexColorInput', () => {
  it('normalizes 3-digit and 6-digit hex', () => {
    expect(parseHexColorInput('#abc')).toBe('#aabbcc');
    expect(parseHexColorInput('abc')).toBe('#aabbcc');
    expect(parseHexColorInput('#aAbBcC')).toBe('#aabbcc');
  });

  it('returns null for invalid input', () => {
    expect(parseHexColorInput('')).toBeNull();
    expect(parseHexColorInput('hello')).toBeNull();
    expect(parseHexColorInput('#12')).toBeNull();
    expect(parseHexColorInput('#gg0000')).toBeNull();
  });
});

describe('ColorPickerComponent', () => {
  let component: ColorPickerComponent;
  let fixture: ComponentFixture<ColorPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColorPickerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ColorPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders read-only swatch when disabled input is true', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const root = fixture.nativeElement.querySelector('[data-testid="color-picker"]') as HTMLElement;
    expect(root.classList.contains('color-picker--disabled')).toBe(true);
    expect(root.querySelector('details')).toBeNull();
  });

  it('should default color to #000000', () => {
    expect(component.color()).toBe('#000000');
  });

  it('should emit colorChange when native color input changes', () => {
    const emitted: string[] = [];
    component.colorChange.subscribe((c: string) => emitted.push(c));

    const event = { target: { value: '#ff0000' } } as unknown as Event;
    component.onNativeColorInput(event);

    expect(emitted).toEqual(['#ff0000']);
    expect(component.hexDraft()).toBe('#FF0000');
  });

  it('should emit colorChange when valid hex is entered via HEX field', () => {
    const emitted: string[] = [];
    component.colorChange.subscribe((c: string) => emitted.push(c));

    component.onHexModelChange('00ff00');

    expect(emitted).toEqual(['#00ff00']);
  });

  it('should not emit when invalid hex is entered in HEX field', () => {
    const emitted: string[] = [];
    component.colorChange.subscribe((c: string) => emitted.push(c));

    component.onHexModelChange('not-a-hex');

    expect(emitted).toEqual([]);
  });

  it('onClear emits none', () => {
    const emitted: string[] = [];
    component.colorChange.subscribe((c: string) => emitted.push(c));
    const details = document.createElement('details');
    details.setAttribute('open', '');
    const btn = document.createElement('button');
    details.appendChild(btn);
    const ev = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(ev, 'currentTarget', { value: btn, enumerable: true });
    component.onClear(ev as unknown as Event);
    expect(emitted).toEqual(['none']);
    expect(details.hasAttribute('open')).toBe(false);
  });

  it('should accept color as input', () => {
    fixture.componentRef.setInput('color', '#abcdef');
    fixture.detectChanges();
    expect(component.color()).toBe('#abcdef');
  });

  it('empty state shows empty paint icon in template', () => {
    fixture.componentRef.setInput('empty', true);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.cp-swatch-empty')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="color-picker-empty-icon"]')).toBeTruthy();
  });
});
