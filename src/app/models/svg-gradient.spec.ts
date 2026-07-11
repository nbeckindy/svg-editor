import { describe, expect, it } from 'vitest';
import {
  applyEditableGradientModelToElement,
  applyLinearGradientAngleDegrees,
  applyLinearGradientEndpointSpan,
  applyRadialCenter,
  applyRadialRadius,
  cssGradientPreviewForSlider,
  cssGradientPreviewFromModel,
  defaultLinearGradientModel,
  defaultRadialGradientModel,
  firstStopColor,
  linearGradientAngleDegrees,
  linearGradientEndpointSpan,
  mathAngleToCssDegrees,
  normalizeGradientModelToObjectBoundingBox,
  parsePaintReferenceId,
  readEditableGradientModel,
  serializeGradientElementToOuterHtml,
  switchGradientKindModel
} from './svg-gradient';

describe('svg-gradient', () => {
  it('parsePaintReferenceId extracts id', () => {
    expect(parsePaintReferenceId('url(#myGrad)')).toBe('myGrad');
    expect(parsePaintReferenceId(`url('#x')`)).toBe('x');
    expect(parsePaintReferenceId('#fff')).toBeNull();
  });

  it('serialize then parse round-trips linear model', () => {
    const doc = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null);
    const m = defaultLinearGradientModel('g1', '#ff0000', '#0000ff');
    const html = serializeGradientElementToOuterHtml(m);
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${html}</svg>`;
    const parsed = new DOMParser().parseFromString(wrapped, 'image/svg+xml');
    const el = parsed.documentElement.firstElementChild as SVGLinearGradientElement;
    const round = readEditableGradientModel(el);
    expect(round?.id).toBe('g1');
    expect(round?.kind).toBe('linear');
    expect(round?.stops.length).toBe(2);
    expect(round?.stops[0].color).toContain('ff');
  });

  it('applyEditableGradientModelToElement updates stops', () => {
    const doc = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null);
    const lg = doc.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    lg.setAttribute('id', 'g');
    doc.documentElement.appendChild(lg);
    const m = defaultLinearGradientModel('g', '#111111', '#222222');
    m.stops.push({ offset: '50%', color: '#333333' });
    applyEditableGradientModelToElement(lg, m);
    expect(lg.querySelectorAll('stop').length).toBe(3);
  });

  it('firstStopColor returns lowest-offset stop color', () => {
    const m = defaultLinearGradientModel('g', '#ff0000', '#0000ff');
    m.stops = [
      { offset: '100%', color: '#0000ff' },
      { offset: '0%', color: '#ff0000' }
    ];
    expect(firstStopColor(m)).toBe('#ff0000');
  });

  it('cssGradientPreviewFromModel builds linear and radial CSS', () => {
    const linear = defaultLinearGradientModel('g', '#ff0000', '#0000ff');
    expect(cssGradientPreviewFromModel(linear)).toMatch(/^linear-gradient\(/);

    const radial = defaultRadialGradientModel('g', '#ffffff', '#000000');
    expect(cssGradientPreviewFromModel(radial)).toMatch(/^radial-gradient\(/);
  });

  it('switchGradientKindModel preserves id and stops', () => {
    const linear = defaultLinearGradientModel('g1', '#111111', '#222222');
    const radial = switchGradientKindModel(linear, 'radial');
    expect(radial.id).toBe('g1');
    expect(radial.kind).toBe('radial');
    expect(radial.stops).toEqual(linear.stops);
    expect(switchGradientKindModel(radial, 'linear').kind).toBe('linear');
  });

  describe('linear geometry helpers', () => {
    it('linearGradientAngleDegrees reads track-aligned 0° as left-to-right', () => {
      const m = defaultLinearGradientModel('g', '#000', '#fff');
      expect(linearGradientAngleDegrees(m)).toBeCloseTo(0, 5);
    });

    it('mathAngleToCssDegrees converts 0° math to 90° CSS', () => {
      expect(mathAngleToCssDegrees(0)).toBeCloseTo(90, 5);
    });

    it('applyLinearGradientAngleDegrees preserves normalized endpoint span', () => {
      const m = defaultLinearGradientModel('g', '#000', '#fff');
      const shortened = applyLinearGradientEndpointSpan(m, { start: 20, end: 80 });
      const rotated = applyLinearGradientAngleDegrees(shortened, 90);
      const span = linearGradientEndpointSpan(rotated);
      expect(span.start).toBeCloseTo(20, 1);
      expect(span.end).toBeCloseTo(80, 1);
      expect(linearGradientAngleDegrees(rotated)).toBeCloseTo(90, 1);
    });

    it('linearGradientEndpointSpan round-trips through applyLinearGradientEndpointSpan', () => {
      const m = defaultLinearGradientModel('g', '#000', '#fff');
      const span = { start: 25, end: 75 };
      const updated = applyLinearGradientEndpointSpan(m, span);
      const read = linearGradientEndpointSpan(updated);
      expect(read.start).toBeCloseTo(span.start, 1);
      expect(read.end).toBeCloseTo(span.end, 1);
    });

    it('default linear model has full 0–100 endpoint span', () => {
      const span = linearGradientEndpointSpan(defaultLinearGradientModel('g', '#000', '#fff'));
      expect(span.start).toBeCloseTo(0, 1);
      expect(span.end).toBeCloseTo(100, 1);
    });
  });

  describe('cssGradientPreviewForSlider', () => {
    it('remaps stop offsets when endpoint span is shortened', () => {
      const m = defaultLinearGradientModel('g', '#ff0000', '#0000ff');
      const full = cssGradientPreviewForSlider(m);
      const shortened = cssGradientPreviewForSlider(m, { start: 20, end: 80 });
      expect(full).toMatch(/^linear-gradient\(90deg,/);
      expect(shortened).not.toBe(full);
      expect(shortened).toMatch(/20%/);
      expect(shortened).toMatch(/80%/);
    });

    it('keeps horizontal track preview when linear angle changes on the shape', () => {
      const m = defaultLinearGradientModel('g', '#ff0000', '#0000ff');
      const rotated = applyLinearGradientAngleDegrees(m, 90);
      expect(cssGradientPreviewForSlider(rotated)).toMatch(/^linear-gradient\(90deg,/);
    });

    it('uses horizontal track preview for radial (center-to-edge along the bar)', () => {
      const m = defaultRadialGradientModel('g', '#ff0000', '#0000ff');
      expect(cssGradientPreviewForSlider(m)).toMatch(/^linear-gradient\(90deg, #ff0000 0%, #0000ff 100%\)/);
    });
  });

  describe('radial geometry helpers', () => {
    it('applyRadialCenter and applyRadialRadius update model percents', () => {
      const m = defaultRadialGradientModel('g', '#fff', '#000');
      const centered = applyRadialCenter(m, 30, 70);
      expect(centered.cx).toBe('30%');
      expect(centered.cy).toBe('70%');
      const sized = applyRadialRadius(centered, 40);
      expect(sized.r).toBe('40%');
      expect(sized.gradientUnits).toBe('objectBoundingBox');
    });
  });

  describe('normalizeGradientModelToObjectBoundingBox', () => {
    it('converts userSpaceOnUse linear coords to objectBoundingBox percentages', () => {
      const m = defaultLinearGradientModel('g', '#000', '#fff');
      m.gradientUnits = 'userSpaceOnUse';
      m.x1 = '10';
      m.y1 = '20';
      m.x2 = '110';
      m.y2 = '20';
      const normalized = normalizeGradientModelToObjectBoundingBox(m, {
        x: 10,
        y: 20,
        width: 100,
        height: 50
      });
      expect(normalized.gradientUnits).toBe('objectBoundingBox');
      expect(normalized.x1).toBe('0%');
      expect(normalized.y1).toBe('0%');
      expect(normalized.x2).toBe('100%');
      expect(normalized.y2).toBe('0%');
    });

    it('uses epsilon for degenerate bbox dimensions', () => {
      const m = defaultRadialGradientModel('g', '#fff', '#000');
      m.gradientUnits = 'userSpaceOnUse';
      m.cx = '5';
      m.cy = '5';
      m.r = '10';
      const normalized = normalizeGradientModelToObjectBoundingBox(m, {
        x: 5,
        y: 5,
        width: 0,
        height: 0
      });
      expect(normalized.gradientUnits).toBe('objectBoundingBox');
      expect(normalized.cx).toBe('0%');
      expect(normalized.cy).toBe('0%');
    });
  });
});
