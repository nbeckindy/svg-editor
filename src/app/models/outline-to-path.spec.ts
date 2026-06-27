import { describe, expect, it } from 'vitest';
import {
  buildOutlineToPathMarkup,
  evaluateOutlineToPathSelection
} from './outline-to-path';
import { parsePathDForNodeEditing, pathSegmentsToD } from './path-d';
import { primitiveElementToPathSegments } from './primitive-to-path';

function mockElement(tag: string, attrs: Record<string, string>): Element {
  return {
    tagName: tag.toUpperCase(),
    getAttribute: (name: string) => attrs[name] ?? null,
    hasAttribute: (name: string) => name in attrs,
    id: attrs['id']
  } as unknown as Element;
}

describe('evaluateOutlineToPathSelection', () => {
  it('requires selector mode and a single eligible primitive', () => {
    expect(
      evaluateOutlineToPathSelection(
        false,
        [{ id: 'rect-a', type: 'rect' }],
        () => false,
        () => mockElement('rect', { id: 'rect-a', x: '0', y: '0', width: '10', height: '10' })
      ).reason
    ).toContain('selector');

    expect(
      evaluateOutlineToPathSelection(
        true,
        [
          { id: 'rect-a', type: 'rect' },
          { id: 'rect-b', type: 'rect' }
        ],
        () => false,
        () => mockElement('rect', { id: 'rect-a', x: '0', y: '0', width: '10', height: '10' })
      ).reason
    ).toContain('single');

    expect(
      evaluateOutlineToPathSelection(
        true,
        [{ id: 'path-a', type: 'path' }],
        () => false,
        () => null
      ).reason
    ).toContain('already a path');
  });

  it('accepts a single rectangle with valid geometry', () => {
    const state = evaluateOutlineToPathSelection(
      true,
      [{ id: 'rect-a', type: 'rect' }],
      () => false,
      () => mockElement('rect', { id: 'rect-a', x: '0', y: '0', width: '10', height: '10' })
    );
    expect(state.eligible).toBe(true);
    expect(state.shapeId).toBe('rect-a');
    expect(state.hasRoundedCorners).toBe(false);
  });

  it('flags rounded rectangles', () => {
    const state = evaluateOutlineToPathSelection(
      true,
      [{ id: 'rect-a', type: 'rect' }],
      () => false,
      () =>
        mockElement('rect', {
          id: 'rect-a',
          x: '0',
          y: '0',
          width: '10',
          height: '10',
          rx: '2',
          ry: '2'
        })
    );
    expect(state.eligible).toBe(true);
    expect(state.hasRoundedCorners).toBe(true);
  });
});

describe('buildOutlineToPathMarkup', () => {
  it('preserves id, transform, paint, and data-name', () => {
    const markup = buildOutlineToPathMarkup(
      mockElement('rect', {
        id: 'rect-a',
        x: '0',
        y: '0',
        width: '10',
        height: '10',
        fill: '#ff0000',
        transform: 'translate(5 5)',
        'data-name': 'Box'
      })
    );
    expect(markup).toContain('id="rect-a"');
    expect(markup).toContain('transform="translate(5 5)"');
    expect(markup).toContain('fill="#ff0000"');
    expect(markup).toContain('data-name="Box"');
  });

  it('produces node-editable d for each supported primitive tag', () => {
    const cases: Array<[string, Record<string, string>]> = [
      ['rect', { id: 'a', x: '0', y: '0', width: '10', height: '10' }],
      ['circle', { id: 'b', cx: '5', cy: '5', r: '5' }],
      ['ellipse', { id: 'c', cx: '5', cy: '5', rx: '8', ry: '4' }],
      ['line', { id: 'd', x1: '0', y1: '0', x2: '10', y2: '10' }],
      ['polyline', { id: 'e', points: '0,0 10,0 10,10' }],
      ['polygon', { id: 'f', points: '0,0 10,0 10,10' }]
    ];

    for (const [tag, attrs] of cases) {
      const element = mockElement(tag, attrs);
      const segments = primitiveElementToPathSegments(element);
      expect(segments, tag).toBeTruthy();
      const d = pathSegmentsToD(segments!);
      expect(parsePathDForNodeEditing(d), tag).not.toBeNull();

      const markup = buildOutlineToPathMarkup(element);
      expect(markup, tag).toContain(`id="${attrs['id']}"`);
      expect(markup, tag).toContain(' d="');
    }
  });
});
