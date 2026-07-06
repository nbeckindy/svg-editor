import { describe, expect, it } from 'vitest';
import { sanitizeSvgMarkup } from './svg-sanitize';

// ---------------------------------------------------------------------------
// Attack payload constants — keep in sync with plan attack catalog
// ---------------------------------------------------------------------------
const SCRIPT_INLINE =
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="5"/></svg>';

const SCRIPT_IN_DEFS =
  '<svg xmlns="http://www.w3.org/2000/svg"><defs><script>alert(1)</script></defs><circle r="5"/></svg>';

const EVENT_ONLOAD =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" onload="alert(1)"/></svg>';

const EVENT_ONCLICK =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" onclick="alert(1)"/></svg>';

const FOREIGN_OBJECT_XHTML =
  '<svg xmlns="http://www.w3.org/2000/svg">' +
  '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject>' +
  '<circle r="5"/></svg>';

const HREF_JAVASCRIPT_A =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
  '<a xlink:href="javascript:alert(1)">click</a></svg>';

const HREF_JAVASCRIPT_IMAGE =
  '<svg xmlns="http://www.w3.org/2000/svg"><image href="javascript:alert(1)"/></svg>';

const USE_EXTERNAL =
  '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/o.svg#x"/></svg>';

const USE_INTERNAL =
  '<svg xmlns="http://www.w3.org/2000/svg"><use href="#local"/></svg>';

const IMAGE_HTTPS =
  '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://cdn.example/a.png"/></svg>';

const IMAGE_HTTP =
  '<svg xmlns="http://www.w3.org/2000/svg"><image href="http://insecure.example/a.png"/></svg>';

const IMAGE_DATA_SVG_SCRIPT =
  '<svg xmlns="http://www.w3.org/2000/svg">' +
  '<image href="data:image/svg+xml,&lt;svg&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;/svg&gt;"/>' +
  '</svg>';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function parseOutput(markup: string): Document {
  return new DOMParser().parseFromString(markup, 'image/svg+xml');
}

function removedElementCount(result: ReturnType<typeof sanitizeSvgMarkup>, tag: string): number {
  return result.removedElements.filter((e) => e === tag).length;
}

function removedAttrCount(result: ReturnType<typeof sanitizeSvgMarkup>, pattern: RegExp): number {
  return result.removedAttributes.filter((a) => pattern.test(a)).length;
}

function hasBlockedHref(result: ReturnType<typeof sanitizeSvgMarkup>): boolean {
  return result.removedAttributes.some(
    (a) => a === 'href' || a === 'xlink:href' || a === 'svg:href'
  );
}

// ---------------------------------------------------------------------------
// Canary — verify jsdom can round-trip xlink:href via DOMParser
// If this test fails, install @vitest/browser or happy-dom and set the
// per-file environment directive at the top of this file.
// ---------------------------------------------------------------------------
describe('xlink:href round-trip canary', () => {
  it('DOMParser preserves xlink:href through parse + getAttributeNS', () => {
    const xml =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<image xlink:href="https://example.com/a.png"/></svg>';
    const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
    const img = doc.querySelector('image');
    expect(img).toBeTruthy();
    const href = img!.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    expect(href).toBe('https://example.com/a.png');
  });
});

// ---------------------------------------------------------------------------
// sanitizeSvgMarkup — vertical slices
// ---------------------------------------------------------------------------
describe('sanitizeSvgMarkup', () => {
  // Slice 1 — Script tags
  describe('Slice 1 — script tags', () => {
    it('removes inline script and records in removedElements', () => {
      const result = sanitizeSvgMarkup(SCRIPT_INLINE);
      expect(removedElementCount(result, 'script')).toBe(1);
      expect(parseOutput(result.sanitized).querySelectorAll('script')).toHaveLength(0);
    });

    it('removes script nested inside defs', () => {
      const result = sanitizeSvgMarkup(SCRIPT_IN_DEFS);
      expect(removedElementCount(result, 'script')).toBe(1);
      expect(parseOutput(result.sanitized).querySelectorAll('script')).toHaveLength(0);
    });

    it('preserves non-script content', () => {
      const result = sanitizeSvgMarkup(SCRIPT_IN_DEFS);
      expect(parseOutput(result.sanitized).querySelectorAll('circle')).toHaveLength(1);
    });
  });

  // Slice 2 — Event handlers
  describe('Slice 2 — on* event handlers', () => {
    it('removes onload attribute', () => {
      const result = sanitizeSvgMarkup(EVENT_ONLOAD);
      expect(removedAttrCount(result, /^on[a-zA-Z]/i)).toBeGreaterThanOrEqual(1);
      expect(parseOutput(result.sanitized).querySelector('rect')?.hasAttribute('onload')).toBe(false);
    });

    it('removes onclick attribute', () => {
      const result = sanitizeSvgMarkup(EVENT_ONCLICK);
      expect(removedAttrCount(result, /^on[a-zA-Z]/i)).toBeGreaterThanOrEqual(1);
      expect(parseOutput(result.sanitized).querySelector('rect')?.hasAttribute('onclick')).toBe(false);
    });

    it('records all on* attributes stripped', () => {
      const xml =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<rect onload="a()" onclick="b()"/></svg>';
      const result = sanitizeSvgMarkup(xml);
      expect(removedAttrCount(result, /^on[a-zA-Z]/i)).toBe(2);
    });

    it('strips on* on the root <svg> element', () => {
      const xml = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="5"/></svg>';
      const result = sanitizeSvgMarkup(xml);
      expect(removedAttrCount(result, /^on[a-zA-Z]/i)).toBe(1);
      expect(parseOutput(result.sanitized).documentElement.hasAttribute('onload')).toBe(false);
    });
  });

  // Slice 3 — foreignObject
  describe('Slice 3 — foreignObject', () => {
    it('removes foreignObject elements', () => {
      const result = sanitizeSvgMarkup(FOREIGN_OBJECT_XHTML);
      expect(removedElementCount(result, 'foreignObject')).toBe(1);
      expect(parseOutput(result.sanitized).querySelectorAll('foreignObject')).toHaveLength(0);
    });

    it('preserves siblings of removed foreignObject', () => {
      const result = sanitizeSvgMarkup(FOREIGN_OBJECT_XHTML);
      expect(parseOutput(result.sanitized).querySelectorAll('circle')).toHaveLength(1);
    });
  });

  // Slice 4 — javascript: URIs
  describe('Slice 4 — javascript: URIs', () => {
    it('blocks javascript: xlink:href on <a>', () => {
      const result = sanitizeSvgMarkup(HREF_JAVASCRIPT_A);
      expect(hasBlockedHref(result)).toBe(true);
      const a = parseOutput(result.sanitized).querySelector('a');
      expect(a?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? null).toBeFalsy();
      expect(a?.getAttribute('href') ?? null).toBeFalsy();
    });

    it('blocks javascript: href on <image>', () => {
      const result = sanitizeSvgMarkup(HREF_JAVASCRIPT_IMAGE);
      expect(hasBlockedHref(result)).toBe(true);
      expect(parseOutput(result.sanitized).querySelector('image')?.getAttribute('href') ?? null).toBeFalsy();
    });

    it('blocks JAVASCRIPT: (case-insensitive)', () => {
      const xml =
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="JAVASCRIPT:alert(1)"/></svg>';
      const result = sanitizeSvgMarkup(xml);
      expect(hasBlockedHref(result)).toBe(true);
    });
  });

  // Slice 5 — External <use>
  describe('Slice 5 — external <use>', () => {
    it('blocks external https: use href', () => {
      const result = sanitizeSvgMarkup(USE_EXTERNAL);
      expect(hasBlockedHref(result)).toBe(true);
      expect(parseOutput(result.sanitized).querySelector('use')?.getAttribute('href') ?? null).toBeFalsy();
    });

    it('preserves same-document fragment use href', () => {
      const result = sanitizeSvgMarkup(USE_INTERNAL);
      expect(hasBlockedHref(result)).toBe(false);
      expect(parseOutput(result.sanitized).querySelector('use')?.getAttribute('href')).toBe('#local');
    });

    it('preserves url(#id) use href', () => {
      const xml = '<svg xmlns="http://www.w3.org/2000/svg"><use href="url(#my-symbol)"/></svg>';
      const result = sanitizeSvgMarkup(xml);
      expect(hasBlockedHref(result)).toBe(false);
    });
  });

  // Slice 6 — Image href moderate policy
  describe('Slice 6 — image href moderate policy', () => {
    it('allows https: image href', () => {
      const result = sanitizeSvgMarkup(IMAGE_HTTPS);
      expect(hasBlockedHref(result)).toBe(false);
      expect(parseOutput(result.sanitized).querySelector('image')?.getAttribute('href')).toBe(
        'https://cdn.example/a.png'
      );
    });

    it('blocks http: image href', () => {
      const result = sanitizeSvgMarkup(IMAGE_HTTP);
      expect(hasBlockedHref(result)).toBe(true);
      expect(parseOutput(result.sanitized).querySelector('image')?.getAttribute('href') ?? null).toBeFalsy();
    });

    it('allows raster data:image/png on <image>', () => {
      const xml = '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,abc"/></svg>';
      expect(hasBlockedHref(sanitizeSvgMarkup(xml))).toBe(false);
    });

    it('allows raster data:image/jpeg on <image>', () => {
      const xml = '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/jpeg;base64,abc"/></svg>';
      expect(hasBlockedHref(sanitizeSvgMarkup(xml))).toBe(false);
    });

    it('allows relative hrefs on <image>', () => {
      const xml = '<svg xmlns="http://www.w3.org/2000/svg"><image href="photo.png"/></svg>';
      expect(hasBlockedHref(sanitizeSvgMarkup(xml))).toBe(false);
    });

    it('blocks blob: image href', () => {
      const xml = '<svg xmlns="http://www.w3.org/2000/svg"><image href="blob:http://localhost/x"/></svg>';
      const result = sanitizeSvgMarkup(xml);
      expect(hasBlockedHref(result)).toBe(true);
    });
  });

  // Slice 6b — SVG data URI on image
  describe('Slice 6b — SVG data URI on image', () => {
    it('blocks data:image/svg+xml on <image>', () => {
      const result = sanitizeSvgMarkup(IMAGE_DATA_SVG_SCRIPT);
      expect(hasBlockedHref(result)).toBe(true);
      expect(parseOutput(result.sanitized).querySelector('image')?.getAttribute('href') ?? null).toBeFalsy();
    });

    it('blocks data:text/html on <image>', () => {
      const xml =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<image href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"/></svg>';
      expect(hasBlockedHref(sanitizeSvgMarkup(xml))).toBe(true);
    });
  });

  // Fragment inputs
  describe('fragment inputs', () => {
    it('sanitizes bare shape markup without an <svg> wrapper', () => {
      const result = sanitizeSvgMarkup('<rect onmouseover="alert(1)" width="10" height="10"/>');
      expect(removedAttrCount(result, /^on[a-zA-Z]/i)).toBe(1);
      const out = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg">${result.sanitized}</svg>`,
        'image/svg+xml'
      );
      expect(out.querySelector('rect')?.hasAttribute('onmouseover')).toBe(false);
    });
  });
});
