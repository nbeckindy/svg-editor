import type { Svg } from '@svgdotjs/svg.js';

/**
 * Minimal set of element ids to hide during transform gestures (drag / rotate / scale / skew).
 * Prefer hiding `#primaryElementId` when it wraps every selected node; else the lowest common
 * `<g>` ancestor under the editor content group; else selection roots (no selected strict
 * ancestor of another selected).
 */
export function computeGestureVisibilityToggleIds(
  svg: Svg,
  selectedIds: string[],
  primaryElementId: string
): string[] {
  const unique = [...new Set(selectedIds)];
  if (unique.length === 0) return [];
  if (typeof (svg as Svg).findOne !== 'function') {
    return unique;
  }

  const effNode = svg.findOne(`#${primaryElementId}`)?.node as Element | undefined;
  if (effNode) {
    const allUnderPrimary = unique.every((id) => {
      if (id === primaryElementId) return true;
      const n = svg.findOne(`#${id}`)?.node as Element | undefined;
      if (!n) return false;
      return effNode.contains(n);
    });
    if (allUnderPrimary) {
      return [primaryElementId];
    }
  }

  const lcaId = lowestCommonAncestorGroupId(svg, unique);
  if (lcaId) {
    return [lcaId];
  }

  return unique.filter((id) => {
    const node = svg.findOne(`#${id}`)?.node as Element | undefined;
    if (!node) return false;
    return !unique.some((other) => {
      if (other === id) return false;
      const anc = svg.findOne(`#${other}`)?.node as Element | undefined;
      if (!anc) return false;
      return anc !== node && anc.contains(node);
    });
  });
}

function lowestCommonAncestorGroupId(svg: Svg, selectedIds: string[]): string | null {
  const content = svg.findOne('[data-editor-content-group]')?.node as Element | undefined;
  if (!content) return null;
  const nodes = selectedIds
    .map((id) => svg.findOne(`#${id}`)?.node as Element | undefined)
    .filter((n): n is Element => Boolean(n && content.contains(n)));
  if (nodes.length < 2) return null;

  const lcaPair = (a: Element, b: Element): Element => {
    const seen = new Set<Element>();
    let x: Element | null = a;
    while (x && content.contains(x)) {
      seen.add(x);
      x = x.parentElement;
    }
    x = b;
    while (x && content.contains(x)) {
      if (seen.has(x)) return x;
      x = x.parentElement;
    }
    return content;
  };

  let acc = nodes[0];
  for (let i = 1; i < nodes.length; i++) {
    acc = lcaPair(acc, nodes[i]);
  }
  if (acc === content || !acc.id) return null;
  if (acc.tagName?.toLowerCase() !== 'g') return null;
  return nodes.every((n) => acc.contains(n) || n === acc) ? acc.id : null;
}
