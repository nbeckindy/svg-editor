import { describe, it, expect } from 'vitest';
import { parseCssPaintToHex } from './svg-computed-color-sample';

describe('parseCssPaintToHex', () => {
  it('parses rgb and rgba', () => {
    expect(parseCssPaintToHex('rgb(10, 20, 30)')).toBe('#0a141e');
    expect(parseCssPaintToHex('rgba(255, 0, 128, 1)')).toBe('#ff0080');
  });

  it('treats transparent rgba as null', () => {
    expect(parseCssPaintToHex('rgba(0,0,0,0)')).toBeNull();
  });

  it('parses 3- and 6-digit hex', () => {
    expect(parseCssPaintToHex('#abc')).toBe('#aabbcc');
    expect(parseCssPaintToHex('#0a141e')).toBe('#0a141e');
  });

  it('returns null for none, url(), empty', () => {
    expect(parseCssPaintToHex('none')).toBeNull();
    expect(parseCssPaintToHex('url(#g)')).toBeNull();
    expect(parseCssPaintToHex('')).toBeNull();
  });
});
