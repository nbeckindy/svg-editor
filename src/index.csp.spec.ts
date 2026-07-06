/**
 * CSP meta tag assertions (ADR 0002, Slice 10).
 *
 * Reads the source index.html and verifies the Content-Security-Policy meta tag
 * contains the required directives. Run this after any change to src/index.html
 * or public/_headers.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const INDEX_HTML = readFileSync(join(__dirname, 'index.html'), 'utf-8');

function extractCsp(html: string): string {
  // content attr uses double-quotes; CSP value itself contains single-quotes ('self' etc.)
  // so we match only up to the closing double-quote.
  const match = html.match(
    /<meta\s[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*content\s*=\s*"([^"]+)"/i
  ) ?? html.match(
    /<meta\s[^>]*content\s*=\s*"([^"]+)"[^>]*http-equiv\s*=\s*["']Content-Security-Policy["']/i
  );
  return match ? match[1] : '';
}

describe('index.html Content-Security-Policy meta tag', () => {
  const csp = extractCsp(INDEX_HTML);

  it('has a CSP meta tag', () => {
    expect(csp).toBeTruthy();
  });

  it("contains default-src 'self'", () => {
    expect(csp).toMatch(/default-src\s+'self'/);
  });

  it("contains object-src 'none'", () => {
    expect(csp).toMatch(/object-src\s+'none'/);
  });

  it("contains base-uri 'self'", () => {
    expect(csp).toMatch(/base-uri\s+'self'/);
  });

  it('allows https: in img-src (for external raster images)', () => {
    expect(csp).toMatch(/img-src\b[^;]*https:/);
  });

  it('does NOT allow blob: in img-src (blob hrefs are stripped at ingest)', () => {
    const imgSrcMatch = csp.match(/img-src\s+([^;]+)/);
    const imgSrc = imgSrcMatch ? imgSrcMatch[1] : '';
    expect(imgSrc).not.toMatch(/blob:/);
  });

  it("allows 'self' in script-src (Angular production build uses external bundles)", () => {
    expect(csp).toMatch(/script-src\b[^;]*'self'/);
  });

  it('does NOT allow unsafe-eval in script-src', () => {
    const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/);
    const scriptSrc = scriptSrcMatch ? scriptSrcMatch[1] : '';
    expect(scriptSrc).not.toMatch(/'unsafe-eval'/);
  });
});
