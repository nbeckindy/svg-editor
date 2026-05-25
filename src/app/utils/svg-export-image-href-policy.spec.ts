import {
  MAX_DATA_IMAGE_HREF_CHARS_WITHOUT_CONFIRM,
  aggregateImageHrefExportClasses,
  classifyImageHrefForExport,
  readImageElementHref
} from './svg-export-image-href-policy';

describe('svg-export-image-href-policy', () => {
  describe('classifyImageHrefForExport', () => {
    it('classifies empty and whitespace as empty', () => {
      expect(classifyImageHrefForExport(null)).toBe('empty');
      expect(classifyImageHrefForExport(undefined)).toBe('empty');
      expect(classifyImageHrefForExport('')).toBe('empty');
      expect(classifyImageHrefForExport('  \t')).toBe('empty');
    });

    it('detects blob: case-insensitively', () => {
      expect(classifyImageHrefForExport('blob:http://x/y')).toBe('blob');
      expect(classifyImageHrefForExport('  BLOB:abc')).toBe('blob');
    });

    it('classifies data: under length threshold as data_ok', () => {
      expect(classifyImageHrefForExport('data:image/png;base64,AAAA')).toBe('data_ok');
    });

    it('classifies oversized data: as data_oversized', () => {
      const prefix = 'data:image/png;base64,';
      const padLen = MAX_DATA_IMAGE_HREF_CHARS_WITHOUT_CONFIRM - prefix.length + 1;
      const huge = prefix + 'x'.repeat(Math.max(0, padLen));
      expect(huge.length).toBeGreaterThan(MAX_DATA_IMAGE_HREF_CHARS_WITHOUT_CONFIRM);
      expect(classifyImageHrefForExport(huge)).toBe('data_oversized');
    });

    it('classifies http(s), relative, and file as other', () => {
      expect(classifyImageHrefForExport('https://example.com/a.png')).toBe('other');
      expect(classifyImageHrefForExport('http://local/x')).toBe('other');
      expect(classifyImageHrefForExport('img/a.png')).toBe('other');
      expect(classifyImageHrefForExport('file:///tmp/x.png')).toBe('other');
    });
  });

  describe('aggregateImageHrefExportClasses', () => {
    it('aggregates blob and oversized counts', () => {
      expect(
        aggregateImageHrefExportClasses(['data_ok', 'blob', 'data_oversized', 'empty', 'other'])
      ).toEqual({ blockedByBlob: true, oversizedDataHrefCount: 1 });
    });
  });

  describe('readImageElementHref', () => {
    it('reads href then xlink:href from a parsed SVG <image>', () => {
      const doc = new DOMParser().parseFromString(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image id="a" xlink:href="data:,x"/></svg>',
        'image/svg+xml'
      );
      const img = doc.querySelector('#a');
      expect(img).toBeTruthy();
      expect(readImageElementHref(img!)).toBe('data:,x');
    });

    it('prefers plain href when present', () => {
      const doc = new DOMParser().parseFromString(
        '<svg xmlns="http://www.w3.org/2000/svg"><image id="b" href="data:,y" /></svg>',
        'image/svg+xml'
      );
      const img = doc.querySelector('#b');
      expect(readImageElementHref(img!)).toBe('data:,y');
    });
  });
});
