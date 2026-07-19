/** Canonical line advance for editor-authored multiline `<tspan>`s (scales with font-size). */
export const CANONICAL_MULTILINE_TSPAN_DY = '1.2em';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Whether a `<tspan>` starts a new visual line relative to previous siblings
 * (absolute `y`, or non-zero `dy`).
 */
export function tspanStartsNewLine(tspan: Element): boolean {
  if (tspan.tagName.toLowerCase() !== 'tspan') return false;
  if (tspan.hasAttribute('y')) return true;
  const dy = tspan.getAttribute('dy')?.trim();
  if (!dy) return false;
  const first = Number.parseFloat(dy);
  return Number.isFinite(first) && first !== 0;
}

/**
 * Serialize a `<text>` element's content to a newline-separated string without mutating the DOM.
 * Adjacent text / `<tspan>` nodes without a line-breaking `dy`/`y` stay on one line.
 */
export function serializeSvgTextContent(textNode: Element): string {
  if (textNode.tagName.toLowerCase() !== 'text') {
    return textNode.textContent ?? '';
  }

  const children = textNode.childNodes;
  if (children.length === 0) {
    return '';
  }

  const hasElementChild = Array.from(children).some((n) => n.nodeType === Node.ELEMENT_NODE);
  if (!hasElementChild) {
    return textNode.textContent ?? '';
  }

  const lines: string[] = [];
  let current = '';

  const pushLine = (): void => {
    lines.push(current);
    current = '';
  };

  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child.nodeType === Node.TEXT_NODE) {
      current += child.textContent ?? '';
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    if (el.tagName.toLowerCase() !== 'tspan') {
      current += el.textContent ?? '';
      continue;
    }
    const piece = el.textContent ?? '';
    if (tspanStartsNewLine(el) && (lines.length > 0 || current.length > 0)) {
      pushLine();
    }
    current += piece;
  }
  pushLine();
  return lines.join('\n');
}

/**
 * Replace `<text>` children with canonical plain text (one line) or one `<tspan>` per line.
 * Does not touch presentation attributes on the parent `<text>`.
 */
export function applyCanonicalSvgTextContent(textNode: Element, text: string): void {
  if (textNode.tagName.toLowerCase() !== 'text') return;

  const lines = text.split('\n');
  while (textNode.firstChild) {
    textNode.removeChild(textNode.firstChild);
  }

  if (lines.length <= 1) {
    textNode.textContent = lines[0] ?? '';
    return;
  }

  const parentX = textNode.getAttribute('x')?.trim() || '0';
  for (let i = 0; i < lines.length; i++) {
    const tspan = document.createElementNS(SVG_NS, 'tspan');
    tspan.setAttribute('x', parentX);
    if (i > 0) {
      tspan.setAttribute('dy', CANONICAL_MULTILINE_TSPAN_DY);
    }
    tspan.textContent = lines[i]!;
    textNode.appendChild(tspan);
  }
}

/** Line count for overlay sizing (`\\n`-split, at least 1). */
export function multilineDraftLineCount(draft: string): number {
  return Math.max(1, draft.split('\n').length);
}
