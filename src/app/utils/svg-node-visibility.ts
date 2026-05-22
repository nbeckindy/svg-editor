/** Whether a DOM node is hidden via `display:none` or `visibility:hidden`. */
export function isSvgEditorNodeHidden(node: Element): boolean {
  const displayAttr = node.getAttribute('display');
  if (displayAttr === 'none') return true;
  const display = (node as HTMLElement | SVGElement).style?.getPropertyValue('display')?.trim();
  if (display === 'none') return true;
  const visibility = node.getAttribute('visibility');
  if (visibility === 'hidden') return true;
  const visStyle = (node as HTMLElement | SVGElement).style?.getPropertyValue('visibility')?.trim();
  if (visStyle === 'hidden') return true;
  return false;
}
