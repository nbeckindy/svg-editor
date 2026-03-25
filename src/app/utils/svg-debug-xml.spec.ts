import { describe, it, expect } from 'vitest';
import { formatSvgXmlWithHighlightSegments } from './svg-debug-xml';

describe('formatSvgXmlWithHighlightSegments', () => {
  it('pretty-prints a minimal svg with indentation', () => {
    const xml = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="a" cx="50" cy="50" r="10" /></svg>';
    const segs = formatSvgXmlWithHighlightSegments(xml, []);
    const joined = segs.map((s) => s.text).join('');
    expect(joined).toContain('<svg');
    expect(joined).toContain('  <circle');
    expect(segs.every((s) => !s.selected)).toBe(true);
  });

  it('self-closes elements with no children', () => {
    const xml =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect id="r" x="0" y="0" width="10" height="10" /></svg>';
    const joined = formatSvgXmlWithHighlightSegments(xml, []).map((s) => s.text).join('');
    expect(joined).toMatch(/<rect[^>]+\s\/>\n/);
  });

  it('uses paired tags when element has text content only', () => {
    const xml = '<svg xmlns="http://www.w3.org/2000/svg"><title>Hi</title></svg>';
    const joined = formatSvgXmlWithHighlightSegments(xml, []).map((s) => s.text).join('');
    expect(joined).toContain('<title>');
    expect(joined).toContain('Hi');
    expect(joined).toContain('</title>');
  });

  it('marks subtree selected when id matches', () => {
    const xml =
      '<svg xmlns="http://www.w3.org/2000/svg"><g id="g1"><circle id="c1" cx="0" cy="0" r="1" /></g></svg>';
    const segs = formatSvgXmlWithHighlightSegments(xml, ['g1']);
    expect(segs.some((s) => s.selected)).toBe(true);
    const selectedText = segs.filter((s) => s.selected).map((s) => s.text).join('');
    expect(selectedText).toContain('id="g1"');
    expect(selectedText).toContain('id="c1"');
    expect(selectedText).toContain('</g>');
    const svgOpen = segs.find((s) => s.text.trimStart().startsWith('<svg'));
    expect(svgOpen?.selected).toBe(false);
  });

  it('highlights only selected sibling, not the other', () => {
    const xml =
      '<svg xmlns="http://www.w3.org/2000/svg"><circle id="a" cx="1" cy="1" r="1" /><circle id="b" cx="2" cy="2" r="2" /></svg>';
    const segs = formatSvgXmlWithHighlightSegments(xml, ['a']);
    const lineForA = segs.find((s) => s.text.includes('id="a"'));
    const lineForB = segs.find((s) => s.text.includes('id="b"'));
    expect(lineForA?.selected).toBe(true);
    expect(lineForB?.selected).toBe(false);
  });

  it('supports multi-select', () => {
    const xml =
      '<svg xmlns="http://www.w3.org/2000/svg"><circle id="a" cx="1" cy="1" r="1" /><circle id="b" cx="2" cy="2" r="2" /></svg>';
    const segs = formatSvgXmlWithHighlightSegments(xml, ['a', 'b']);
    expect(segs.find((s) => s.text.includes('id="a"'))?.selected).toBe(true);
    expect(segs.find((s) => s.text.includes('id="b"'))?.selected).toBe(true);
  });

  it('returns fallback for empty input', () => {
    const segs = formatSvgXmlWithHighlightSegments('', []);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toContain('Unable to parse');
    expect(segs[0].selected).toBe(false);
  });

  it('returns fallback when there is no svg root', () => {
    const segs = formatSvgXmlWithHighlightSegments('<div></div>', []);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toContain('Unable to parse');
  });

  it('escapes attribute values for XML', () => {
    const xml =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect id="r" data-x="a&amp;b&quot;c" width="1" height="1" /></svg>';
    const joined = formatSvgXmlWithHighlightSegments(xml, []).map((s) => s.text).join('');
    expect(joined).toContain('data-x="a&amp;b&quot;c"');
  });
});
