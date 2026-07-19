import { describe, expect, it } from 'vitest';
import {
  CANONICAL_MULTILINE_TSPAN_DY,
  applyCanonicalSvgTextContent,
  multilineDraftLineCount,
  serializeSvgTextContent,
  tspanStartsNewLine
} from './text-multiline-tspans';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgText(html: string): Element {
  const wrap = document.createElementNS(SVG_NS, 'svg');
  wrap.innerHTML = html;
  const text = wrap.querySelector('text');
  if (!text) throw new Error('expected <text>');
  return text;
}

describe('tspanStartsNewLine', () => {
  it('is false without dy/y', () => {
    const el = document.createElementNS(SVG_NS, 'tspan');
    expect(tspanStartsNewLine(el)).toBe(false);
  });

  it('is false for zero dy', () => {
    const el = document.createElementNS(SVG_NS, 'tspan');
    el.setAttribute('dy', '0');
    expect(tspanStartsNewLine(el)).toBe(false);
    el.setAttribute('dy', '0em');
    expect(tspanStartsNewLine(el)).toBe(false);
  });

  it('is true for non-zero dy or y', () => {
    const el = document.createElementNS(SVG_NS, 'tspan');
    el.setAttribute('dy', '1.2em');
    expect(tspanStartsNewLine(el)).toBe(true);
    el.removeAttribute('dy');
    el.setAttribute('y', '40');
    expect(tspanStartsNewLine(el)).toBe(true);
  });
});

describe('serializeSvgTextContent', () => {
  it('returns plain textContent when there are no element children', () => {
    const text = svgText('<text id="t" x="10" y="20">Hello</text>');
    expect(serializeSvgTextContent(text)).toBe('Hello');
  });

  it('concatenates adjacent tspans without dy on one line', () => {
    const text = svgText(
      '<text x="10" y="20"><tspan>Hel</tspan><tspan fill="red">lo</tspan></text>'
    );
    expect(serializeSvgTextContent(text)).toBe('Hello');
  });

  it('joins tspans with non-zero dy using newlines', () => {
    const text = svgText(
      `<text x="10" y="20"><tspan x="10">a</tspan><tspan x="10" dy="1.2em">b</tspan></text>`
    );
    expect(serializeSvgTextContent(text)).toBe('a\nb');
  });

  it('preserves empty lines between dy tspans', () => {
    const text = svgText(
      `<text x="10" y="20"><tspan x="10">a</tspan><tspan x="10" dy="1.2em"></tspan><tspan x="10" dy="1.2em">c</tspan></text>`
    );
    expect(serializeSvgTextContent(text)).toBe('a\n\nc');
  });

  it('does not insert a leading newline when the first tspan has dy', () => {
    const text = svgText(
      `<text x="10" y="20"><tspan x="10" dy="1.2em">only</tspan></text>`
    );
    expect(serializeSvgTextContent(text)).toBe('only');
  });
});

describe('applyCanonicalSvgTextContent', () => {
  it('writes a single line as plain text without tspans', () => {
    const text = svgText('<text x="12" y="20"><tspan>old</tspan></text>');
    applyCanonicalSvgTextContent(text, 'Hello');
    expect(text.querySelectorAll('tspan').length).toBe(0);
    expect(text.textContent).toBe('Hello');
  });

  it('writes multiple lines as tspans with x and dy', () => {
    const text = svgText('<text x="12" y="20">old</text>');
    applyCanonicalSvgTextContent(text, 'a\nb\nc');
    const spans = Array.from(text.querySelectorAll('tspan'));
    expect(spans.map((s) => s.textContent)).toEqual(['a', 'b', 'c']);
    expect(spans[0]!.getAttribute('x')).toBe('12');
    expect(spans[0]!.hasAttribute('dy')).toBe(false);
    expect(spans[1]!.getAttribute('x')).toBe('12');
    expect(spans[1]!.getAttribute('dy')).toBe(CANONICAL_MULTILINE_TSPAN_DY);
    expect(spans[2]!.getAttribute('dy')).toBe(CANONICAL_MULTILINE_TSPAN_DY);
  });

  it('keeps empty lines as empty tspans', () => {
    const text = svgText('<text x="0" y="0"></text>');
    applyCanonicalSvgTextContent(text, 'a\n\nb');
    const spans = Array.from(text.querySelectorAll('tspan'));
    expect(spans.map((s) => s.textContent)).toEqual(['a', '', 'b']);
  });

  it('round-trips multiline through serialize', () => {
    const text = svgText('<text x="5" y="10">x</text>');
    applyCanonicalSvgTextContent(text, 'one\ntwo');
    expect(serializeSvgTextContent(text)).toBe('one\ntwo');
  });

  it('defaults parent x to 0 when missing', () => {
    const text = svgText('<text y="10"></text>');
    applyCanonicalSvgTextContent(text, 'a\nb');
    expect(text.querySelector('tspan')!.getAttribute('x')).toBe('0');
  });
});

describe('multilineDraftLineCount', () => {
  it('counts lines with a minimum of 1', () => {
    expect(multilineDraftLineCount('')).toBe(1);
    expect(multilineDraftLineCount('a')).toBe(1);
    expect(multilineDraftLineCount('a\nb')).toBe(2);
    expect(multilineDraftLineCount('a\n\nb')).toBe(3);
  });
});
