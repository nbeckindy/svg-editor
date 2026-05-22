import type { Svg } from '@svgdotjs/svg.js';
import { EDITOR_CONTENT_GROUP_ID } from '../services/svg-editor-stage.constants';

/**
 * Return the given shape ids in DOM order under the editor content group.
 * Ids not found under the content group are omitted.
 */
export function getShapeIdsInDomOrderFromSvg(svg: Svg | null, shapeIds: string[]): string[] {
  if (!svg || shapeIds.length === 0) return [];
  const contentGroup = svg.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
  if (!contentGroup?.node) return [...shapeIds];
  const idSet = new Set(shapeIds);
  const ordered: string[] = [];

  const walk = (parent: Element): void => {
    for (const child of Array.from(parent.children)) {
      const tagName = child.tagName.toLowerCase();
      if (tagName === 'g') {
        walk(child);
        continue;
      }
      const id = (child as Element).id;
      if (id && idSet.has(id)) ordered.push(id);
    }
  };
  walk(contentGroup.node as Element);
  return ordered.length > 0 ? ordered : [...shapeIds];
}
