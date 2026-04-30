import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SVG } from '@svgdotjs/svg.js';
import type { Svg } from '@svgdotjs/svg.js';
import { GhostSession } from './ghost-session';

const EDITOR_GHOST_ATTR = 'data-editor-ghost';

describe('GhostSession', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
  });

  it('buildFragmentsForUnion inserts ghost when selected node is nested under a top-level group', () => {
    const draw = SVG().addTo(container) as Svg;
    const cg = draw.group().attr('data-editor-content-group', 'true');
    const svgNs = 'http://www.w3.org/2000/svg';
    const treeG = document.createElementNS(svgNs, 'g');
    treeG.setAttribute('id', 'tree');
    const leaf = document.createElementNS(svgNs, 'rect');
    leaf.setAttribute('id', 'leaf');
    leaf.setAttribute('width', '10');
    leaf.setAttribute('height', '10');
    (cg.node as SVGGElement).appendChild(treeG);
    treeG.appendChild(leaf);

    const ghost = new GhostSession();
    const frags = ghost.buildFragmentsForUnion(
      {
        getSVGInstance: () => draw,
        getShapeIdsInDomOrder: (ids: string[]) => ids,
      },
      { x: 0, y: 0, width: 10, height: 10 },
      ['leaf']
    );

    expect(frags.length).toBe(1);
    const contentEl = ghost.getContentGroupEl(draw);
    expect(contentEl).toBeTruthy();
    const ghostEl = contentEl!.querySelector(`[${EDITOR_GHOST_ATTR}="true"]`);
    expect(ghostEl).toBeTruthy();
    const treeEl = contentEl!.querySelector('#tree');
    expect(treeEl).toBeTruthy();
    const children = Array.from(contentEl!.children);
    const ghostIndex = children.indexOf(ghostEl as Element);
    const treeIndex = children.indexOf(treeEl as Element);
    expect(ghostIndex).toBeGreaterThanOrEqual(0);
    expect(treeIndex).toBeGreaterThanOrEqual(0);
    expect(ghostIndex).toBeLessThan(treeIndex);

    ghost.removeFragments(frags);
    expect(contentEl!.querySelector(`[${EDITOR_GHOST_ATTR}="true"]`)).toBeNull();
  });
});
