import { describe, it, expect, vi } from 'vitest';
import type { ShapeProperties } from '../models/shape-properties.interface';
import type { EditableGradientModel } from '../models/svg-gradient';
import {
  buildEyedropperPaintSample,
  cloneGradientModelWithId,
  resolveContentShapeElement
} from './eyedropper-paint-sample';

const linearGrad: EditableGradientModel = {
  id: 'g1',
  kind: 'linear',
  gradientUnits: 'objectBoundingBox',
  x1: '0%',
  y1: '0%',
  x2: '100%',
  y2: '0%',
  stops: [
    { offset: '0%', color: '#ff0000' },
    { offset: '100%', color: '#0000ff' }
  ]
};

describe('resolveContentShapeElement', () => {
  it('returns the nearest content shape ancestor', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-editor-content-group', 'true');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('id', 't1');
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    text.appendChild(tspan);
    g.appendChild(text);
    svg.appendChild(g);
    expect(resolveContentShapeElement(tspan)).toBe(text);
  });

  it('returns null when outside content shapes', () => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-editor-content-group', 'true');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    g.appendChild(defs);
    expect(resolveContentShapeElement(defs)).toBeNull();
  });
});

describe('buildEyedropperPaintSample', () => {
  it('samples solid fill/stroke with opacity, width, and dash', () => {
    const props: ShapeProperties = {
      id: 'r1',
      type: 'rect',
      fill: '#aabbcc',
      fillPaintType: 'solid',
      fillOpacity: 0.4,
      stroke: '#112233',
      strokePaintType: 'solid',
      strokeWidth: 3,
      strokeOpacity: 0.8,
      strokeDasharray: '4 2',
      strokeDashoffset: 1
    };
    const sample = buildEyedropperPaintSample(props, () => null);
    expect(sample.fill).toEqual({ kind: 'solid', solid: '#aabbcc' });
    expect(sample.fillOpacity).toBe(0.4);
    expect(sample.stroke).toEqual({ kind: 'solid', solid: '#112233' });
    expect(sample.strokeWidth).toBe(3);
    expect(sample.strokeOpacity).toBe(0.8);
    expect(sample.strokeDasharray).toBe('4 2');
    expect(sample.strokeDashoffset).toBe(1);
  });

  it('samples fill and stroke gradients via readGradient', () => {
    const props: ShapeProperties = {
      id: 'r1',
      type: 'rect',
      fillPaintType: 'gradient',
      fillUrl: 'url(#g1)',
      strokePaintType: 'gradient',
      strokeUrl: 'url(#g1)',
      strokeWidth: 2,
      fillOpacity: 1,
      strokeOpacity: 1
    };
    const read = vi.fn().mockReturnValue(linearGrad);
    const sample = buildEyedropperPaintSample(props, read);
    expect(read).toHaveBeenCalledWith('g1');
    expect(sample.fill?.kind).toBe('gradient');
    expect(sample.fill?.solid).toBe('#ff0000');
    expect(sample.fill?.gradient?.stops[1].color).toBe('#0000ff');
    expect(sample.stroke?.kind).toBe('gradient');
  });

  it('treats missing stroke as none and skips patterns', () => {
    const props: ShapeProperties = {
      id: 'r1',
      type: 'rect',
      fillPaintType: 'pattern',
      fillUrl: 'url(#p1)',
      strokePaintType: 'none',
      strokeWidth: 0,
      fillOpacity: 1,
      strokeOpacity: 1
    };
    const sample = buildEyedropperPaintSample(props, () => null);
    expect(sample.fill).toBeNull();
    expect(sample.stroke).toEqual({ kind: 'none' });
  });
});

describe('cloneGradientModelWithId', () => {
  it('copies stops and replaces id', () => {
    const copy = cloneGradientModelWithId(linearGrad, 'new-id');
    expect(copy.id).toBe('new-id');
    expect(copy.stops).toEqual(linearGrad.stops);
    expect(copy.stops).not.toBe(linearGrad.stops);
  });
});
