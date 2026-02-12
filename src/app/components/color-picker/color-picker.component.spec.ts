import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { ColorPickerComponent } from './color-picker.component';

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

  it('should default color to #000000', () => {
    expect(component.color).toBe('#000000');
  });

  it('should emit colorChange when color input changes', () => {
    const emitted: string[] = [];
    component.colorChange.subscribe((c: string) => emitted.push(c));

    const event = { target: { value: '#ff0000' } } as unknown as Event;
    component.onColorChange(event);

    expect(component.color).toBe('#ff0000');
    expect(emitted).toEqual(['#ff0000']);
  });

  it('should emit colorChange when valid hex is entered in text input', () => {
    const emitted: string[] = [];
    component.colorChange.subscribe((c: string) => emitted.push(c));

    const event = { target: { value: '#00ff00' } } as unknown as Event;
    component.onTextChange(event);

    expect(component.color).toBe('#00ff00');
    expect(emitted).toEqual(['#00ff00']);
  });

  it('should not emit when invalid hex is entered in text input', () => {
    const emitted: string[] = [];
    component.colorChange.subscribe((c: string) => emitted.push(c));

    const event = { target: { value: 'not-a-hex' } } as unknown as Event;
    component.onTextChange(event);

    expect(component.color).toBe('#000000');
    expect(emitted).toEqual([]);
  });

  it('should accept color as input', () => {
    fixture.componentRef.setInput('color', '#abcdef');
    fixture.detectChanges();
    expect(component.color).toBe('#abcdef');
  });
});
