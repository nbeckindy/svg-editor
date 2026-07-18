import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CreationPreviewOverlayComponent } from './creation-preview-overlay.component';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('CreationPreviewOverlayComponent', () => {
  let fixture: ComponentFixture<CreationPreviewOverlayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreationPreviewOverlayComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(CreationPreviewOverlayComponent);
    fixture.componentRef.setInput('fill', '#ff0000');
    fixture.componentRef.setInput('stroke', '#00ff00');
    fixture.componentRef.setInput('strokeWidth', 3);
  });

  it('renders paint under guide for rect in the SVG namespace', () => {
    fixture.componentRef.setInput('shapeType', 'rect');
    fixture.componentRef.setInput('ghostRect', { x: 1, y: 2, width: 30, height: 40 });
    fixture.detectChanges();

    const paint = fixture.nativeElement.querySelector(
      '[data-testid="canvas-creation-ghost-paint"]'
    ) as Element | null;
    const guide = fixture.nativeElement.querySelector(
      '[data-testid="canvas-creation-ghost"]'
    ) as Element | null;

    expect(paint?.namespaceURI).toBe(SVG_NS);
    expect(guide?.namespaceURI).toBe(SVG_NS);
    expect(paint?.tagName.toLowerCase()).toBe('rect');
    expect(guide?.tagName.toLowerCase()).toBe('rect');
    expect(paint?.getAttribute('fill')).toBe('#ff0000');
    expect(paint?.getAttribute('stroke')).toBe('#00ff00');
    expect(paint?.getAttribute('stroke-width')).toBe('3');
    expect(guide?.classList.contains('creation-ghost-guide')).toBe(true);

    const order = [...fixture.nativeElement.querySelectorAll('[data-testid^="canvas-creation-ghost"]')].map(
      (el: Element) => el.getAttribute('data-testid')
    );
    expect(order).toEqual(['canvas-creation-ghost-paint', 'canvas-creation-ghost']);
  });

  it('forces fill none on line paint preview', () => {
    fixture.componentRef.setInput('shapeType', 'line');
    fixture.componentRef.setInput('ghostRect', { x: 0, y: 0, width: 10, height: 10 });
    fixture.componentRef.setInput('lineOverlay', { x1: 0, y1: 0, x2: 10, y2: 10 });
    fixture.detectChanges();

    const paint = fixture.nativeElement.querySelector(
      '[data-testid="canvas-creation-ghost-paint"]'
    ) as Element | null;
    expect(paint?.tagName.toLowerCase()).toBe('line');
    expect(paint?.getAttribute('fill')).toBe('none');
    expect(paint?.getAttribute('stroke')).toBe('#00ff00');
  });

  it('renders ellipse paint + guide', () => {
    fixture.componentRef.setInput('shapeType', 'ellipse');
    fixture.componentRef.setInput('ghostRect', { x: 5, y: 5, width: 20, height: 10 });
    fixture.detectChanges();

    const paint = fixture.nativeElement.querySelector(
      '[data-testid="canvas-creation-ghost-paint"]'
    ) as Element | null;
    expect(paint?.tagName.toLowerCase()).toBe('ellipse');
    expect(paint?.getAttribute('cx')).toBe('15');
    expect(paint?.getAttribute('rx')).toBe('10');
  });
});
