/**
 * SVG ingest-time sanitization (ADR 0002).
 *
 * Removes: <script>, <foreignObject>, on* event handlers, blocked hrefs.
 * Pure module — no Angular deps, no global state. Safe to call in tests.
 */

/**
 * Branded string: SVG markup that has passed sanitization and is safe to insert
 * into the Live tree or store in History commands.
 * Only SvgIngestService produces this type; History replay paths propagate it.
 */
export type LiveTreeMarkup = string & { readonly __liveTreeMarkup: unique symbol };

export interface SvgSanitizeResult {
  /** Sanitized markup, branded as safe for the Live tree. */
  sanitized: LiveTreeMarkup;
  /** Tag names of elements that were removed (e.g. "script", "foreignObject"). */
  removedElements: string[];
  /**
   * Attribute names that were removed (e.g. "onclick", "onload", "href").
   * Includes href-type attributes when a blocked href was stripped.
   */
  removedAttributes: string[];
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const RASTER_DATA_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]);

/**
 * Sanitize SVG markup at ingest time.
 *
 * Accepts both full SVG documents (starting with `<svg` or `<?xml`) and bare
 * shape fragments (e.g. `<rect .../>`). Returns clean markup in the same form.
 *
 * Callers must consume `removedElements` / `removedAttributes` counts:
 * - `console.warn` in dev mode when any removal occurred.
 * - `window.alert()` when a href-type attribute was blocked (user-visible, matches export policy).
 */
export function sanitizeSvgMarkup(xml: string): SvgSanitizeResult {
  const removedElements: string[] = [];
  const removedAttributes: string[] = [];

  const trimmed = xml.trim();
  if (!trimmed) {
    return { sanitized: '' as LiveTreeMarkup, removedElements, removedAttributes };
  }

  // Fast path: skip expensive DOM parse/serialize for clean markup.
  // False positives (unnecessary full processing) are fine; false negatives are not.
  if (!mightContainAttackPayload(trimmed)) {
    return { sanitized: trimmed as LiveTreeMarkup, removedElements, removedAttributes };
  }

  // Auto-detect full document vs bare fragment
  const isDocument = /^<\?xml|^<svg[\s>]/i.test(trimmed);
  const input = isDocument ? trimmed : `<svg xmlns="${SVG_NS}">${trimmed}</svg>`;

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'image/svg+xml');

  // Fail closed — return empty markup on parse error
  if (doc.querySelector('parsererror')) {
    return {
      sanitized: (isDocument ? `<svg xmlns="${SVG_NS}"/>` : '') as LiveTreeMarkup,
      removedElements,
      removedAttributes
    };
  }

  const root = doc.documentElement;

  // 1. Remove all <script> elements
  for (const el of Array.from(root.querySelectorAll('script'))) {
    el.remove();
    removedElements.push('script');
  }

  // 2. Remove all <foreignObject> elements (may contain arbitrary HTML/scripts)
  for (const el of Array.from(root.querySelectorAll('foreignObject'))) {
    el.remove();
    removedElements.push('foreignObject');
  }

  // 3. Strip on* event handler attributes from every element, including the root <svg>
  const allElements = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of allElements) {
    const toRemove: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      if (/^on[a-zA-Z]/i.test(attr.name)) {
        toRemove.push(attr.name);
      }
    }
    for (const name of toRemove) {
      el.removeAttribute(name);
      removedAttributes.push(name);
    }
  }

  // 4. Apply href ingest policy (runs after removals so dead elements are gone)
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const tag = el.localName.toLowerCase();
    for (const ref of collectHrefs(el)) {
      if (!isHrefAllowed(tag, ref.value)) {
        removedAttributes.push(ref.attrName);
        ref.remove();
      }
    }
  }

  const serializer = new XMLSerializer();

  if (isDocument) {
    return { sanitized: serializer.serializeToString(root) as LiveTreeMarkup, removedElements, removedAttributes };
  }

  // Fragment: serialize children of the temp wrapper, not the wrapper itself
  const parts: string[] = [];
  for (const child of Array.from(root.childNodes)) {
    parts.push(serializer.serializeToString(child));
  }
  return { sanitized: parts.join('') as LiveTreeMarkup, removedElements, removedAttributes };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface HrefRef {
  value: string;
  attrName: string;
  remove: () => void;
}

function collectHrefs(el: Element): HrefRef[] {
  const refs: HrefRef[] = [];

  const plain = el.getAttribute('href');
  if (plain !== null) {
    refs.push({ value: plain, attrName: 'href', remove: () => el.removeAttribute('href') });
  }

  const svgHref = el.getAttributeNS(SVG_NS, 'href');
  if (svgHref !== null) {
    refs.push({ value: svgHref, attrName: 'svg:href', remove: () => el.removeAttributeNS(SVG_NS, 'href') });
  }

  const xlinkHref = el.getAttributeNS(XLINK_NS, 'href');
  if (xlinkHref !== null) {
    refs.push({ value: xlinkHref, attrName: 'xlink:href', remove: () => el.removeAttributeNS(XLINK_NS, 'href') });
  }

  return refs;
}

function isHrefAllowed(tag: string, href: string): boolean {
  const h = href.trim();
  if (!h) return true;

  // javascript: is always blocked regardless of element
  if (/^javascript:/i.test(h)) return false;

  // Same-document fragment refs (#id) are always allowed
  if (h.startsWith('#')) return true;

  switch (tag) {
    case 'image':
      return isImageHrefAllowed(h);
    case 'use':
      return isUseHrefAllowed(h);
    default:
      // <a> and all other href carriers: only same-document # refs (handled above)
      return false;
  }
}

function isImageHrefAllowed(h: string): boolean {
  if (/^https:/i.test(h)) return true;
  if (/^http:/i.test(h)) return false;
  if (/^blob:/i.test(h)) return false;
  if (/^data:/i.test(h)) return isRasterDataUri(h);
  // Relative URLs (no scheme) — allowed
  return true;
}

function isUseHrefAllowed(h: string): boolean {
  // url(#id) — same-document functional notation used by some SVG tools
  if (/^url\(#/i.test(h)) return true;
  // All external refs blocked (http, https, cross-origin)
  return false;
}

function isRasterDataUri(href: string): boolean {
  const match = href.match(/^data:([^;,]+)/i);
  if (!match) return false;
  return RASTER_DATA_MIME_TYPES.has(match[1].toLowerCase().trim());
}

// Single combined regex for the fast-path scan — one pass instead of seven.
// Catches: <script, <foreignObject, on* attrs, javascript:, blob:,
//          external hrefs (http/https/protocol-relative), non-raster data: URIs.
// False positives are fine; false negatives are security holes, so we err conservative.
const ATTACK_RE =
  /<script|<foreignObject|\bon[a-zA-Z]|javascript:|blob:|href\s*=\s*["'](?:https?:|\/\/|data:(?!image\/(?:png|jpeg|gif|webp|avif)[;,]))/i;

/**
 * Quick text scan: returns true if the markup might contain any attack pattern.
 * Used as a fast path to skip DOM parsing for large clean documents.
 */
function mightContainAttackPayload(xml: string): boolean {
  return ATTACK_RE.test(xml);
}
