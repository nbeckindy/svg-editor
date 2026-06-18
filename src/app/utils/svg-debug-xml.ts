export interface SvgDebugXmlSegment {
  text: string;
  selected: boolean;
}

const FALLBACK_MESSAGE = 'Unable to parse SVG for debug view.\n';

/**
 * Future: Inkscape (and similar) SVGs often declare `xmlns:*` only on the root `<svg>`.
 * `exportSVG()` re-wraps only the content group’s `innerHTML`, so strict re-parse here can fail
 * even though the editor loaded the file. We may want a pipeline that post-processes such files
 * (e.g. preserve or inject namespace declarations on export) and surfaces a **warning** to the user
 * when we detect or repair Inkscape-heavy markup.
 */

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function hasParserError(doc: Document): boolean {
  return doc.querySelector('parsererror') !== null;
}

function formatElement(
  el: Element,
  depth: number,
  ancestorHighlight: boolean,
  selected: Set<string>
): SvgDebugXmlSegment[] {
  const idAttr = el.getAttribute('id');
  const selfMatch = !!(idAttr && selected.has(idAttr));
  const highlightSubtree = ancestorHighlight || selfMatch;
  const indent = '  '.repeat(depth);
  const tag = el.tagName.toLowerCase();

  const attrParts: string[] = [];
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes.item(i)!;
    attrParts.push(` ${attr.name}="${escapeXmlAttr(attr.value)}"`);
  }
  const attrStr = attrParts.join('');

  const segments: SvgDebugXmlSegment[] = [];
  const childNodes = Array.from(el.childNodes);

  const elementChildren = childNodes.filter((n) => n.nodeType === Node.ELEMENT_NODE) as Element[];
  const rawTextParts = childNodes
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => (n as Text).textContent ?? '');
  const significantText = rawTextParts.join('').trim();

  if (elementChildren.length === 0) {
    if (significantText === '') {
      segments.push({ text: `${indent}<${tag}${attrStr} />\n`, selected: highlightSubtree });
      return segments;
    }
    segments.push({ text: `${indent}<${tag}${attrStr}>\n`, selected: highlightSubtree });
    segments.push({ text: `${indent}  ${significantText}\n`, selected: highlightSubtree });
    segments.push({ text: `${indent}</${tag}>\n`, selected: highlightSubtree });
    return segments;
  }

  segments.push({ text: `${indent}<${tag}${attrStr}>\n`, selected: highlightSubtree });

  for (const node of childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      segments.push(...formatElement(node as Element, depth + 1, highlightSubtree, selected));
    } else if (node.nodeType === Node.TEXT_NODE) {
      const t = ((node as Text).textContent ?? '').trim();
      if (t) {
        segments.push({ text: `${indent}  ${t}\n`, selected: highlightSubtree });
      }
    }
  }

  segments.push({ text: `${indent}</${tag}>\n`, selected: highlightSubtree });
  return segments;
}

/**
 * Pretty-print SVG XML with 2-space indent and per-line highlight flags for selected subtrees.
 * Selection matches `id` attributes against `selectedIds`; a selected node's entire subtree is marked.
 */
export function formatSvgXmlWithHighlightSegments(
  xml: string,
  selectedIds: readonly string[]
): SvgDebugXmlSegment[] {
  const selected = new Set(selectedIds);
  if (!xml.trim()) {
    return [{ text: FALLBACK_MESSAGE, selected: false }];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'image/svg+xml');

  if (hasParserError(doc)) {
    return [{ text: FALLBACK_MESSAGE, selected: false }];
  }

  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') {
    return [{ text: FALLBACK_MESSAGE, selected: false }];
  }

  return formatElement(root, 0, false, selected);
}

/** Pretty-print SVG XML without selection highlights (for editable debug text). */
export function formatSvgXmlPlain(xml: string): string {
  return formatSvgXmlWithHighlightSegments(xml, [])
    .map((segment) => segment.text)
    .join('');
}

export interface SvgXmlEditValidation {
  ok: boolean;
  message?: string;
}

/** Validate user-edited SVG before applying it to the canvas. */
export function validateSvgXmlForEdit(xml: string): SvgXmlEditValidation {
  const trimmed = xml.trim();
  if (!trimmed) {
    return { ok: false, message: 'SVG markup cannot be empty.' };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, 'image/svg+xml');
  if (hasParserError(doc)) {
    return { ok: false, message: 'Unable to parse SVG. Fix XML syntax and try again.' };
  }

  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') {
    return { ok: false, message: 'Document must have a root <svg> element.' };
  }

  return { ok: true };
}
