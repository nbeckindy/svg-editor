import { describe, expect, it } from 'vitest';
import {
  applyEditableGradientModelToElement,
  cssGradientPreviewFromModel,
  defaultLinearGradientModel,
  defaultRadialGradientModel,
  firstStopColor,
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
});
