import { SnapService, computeSmartGuideSnap, computeSnappedDelta, snapPointToGrid } from './snap.service';

const bbox = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const shape = (id: string, x: number, y: number, width: number, height: number) => ({
  id,
  bbox: bbox(x, y, width, height)
});
const noGuideResult = (x: number, y: number) => ({
  delta: { x, y },
  guides: { vertical: [], horizontal: [] },
  matches: []
});

describe('SnapService', () => {
  let service: SnapService;

  beforeEach(() => {
    service = new SnapService();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should default both grid and shape snapping to enabled with grid size 10', () => {
    expect(service.gridEnabled()).toBe(true);
    expect(service.shapeEnabled()).toBe(true);
    expect(service.gridSize()).toBe(10);
    expect(service.snapTolerance()).toBe(5);
  });

  it('snapToGrid should round to nearest grid intersection', () => {
    expect(service.snapToGrid({ x: 14, y: 25 })).toEqual({ x: 10, y: 30 });
    expect(service.snapToGrid({ x: -14, y: -25 })).toEqual({ x: -10, y: -20 });
  });

  it('snapToGrid should support different configured grid sizes', () => {
    service.setGridSize(4);
    expect(service.snapToGrid({ x: 5.9, y: -5.9 })).toEqual({ x: 4, y: -4 });

    service.setGridSize(25);
    expect(service.snapToGrid({ x: 62.4, y: 37.6 })).toEqual({ x: 50, y: 50 });

    service.setGridSize(2.5);
    expect(service.snapToGrid({ x: 6.3, y: -1.2 }).x).toBe(7.5);
    expect(Object.is(service.snapToGrid({ x: 6.3, y: -1.2 }).y, -0)).toBe(true);
  });

  it('snapToGrid should return original point when disabled', () => {
    service.setGridEnabled(false);
    expect(service.snapToGrid({ x: 14, y: 25 })).toEqual({ x: 14, y: 25 });
  });

  it('setGridSize should ignore invalid values', () => {
    service.setGridSize(20);
    service.setGridSize(0);
    service.setGridSize(-10);
    expect(service.gridSize()).toBe(20);
  });

  it('snapDelta should snap translation from moving point anchor', () => {
    const delta = service.snapDelta({ x: 13, y: 17 }, { x: 6, y: 6 });
    expect(delta).toEqual({ x: 7, y: 3 });
  });

  it('snapDelta should support union anchor for multi-select rigid translation', () => {
    const delta = service.snapDelta(
      { x: 100, y: 200 },
      { x: 8, y: 8 },
      { anchor: { x: 23, y: 27 } }
    );
    expect(delta).toEqual({ x: 7, y: 13 });
  });

  it('snapDelta should return raw delta when snapping disabled', () => {
    service.setGridEnabled(false);
    expect(service.snapDelta({ x: 0, y: 0 }, { x: 3.5, y: -2.25 })).toEqual({ x: 3.5, y: -2.25 });
  });

  it('snapDeltaToSmartGuides should return no-op result on empty document', () => {
    const result = service.snapDeltaToSmartGuides(
      bbox(10, 20, 40, 30),
      { x: 2, y: 3 },
      []
    );
    expect(result).toEqual(noGuideResult(2, 3));
  });

  it('snapDeltaToSmartGuides should return raw delta and no guides when shape snapping is disabled', () => {
    service.setShapeEnabled(false);
    const result = service.snapDeltaToSmartGuides(
      { x: 10, y: 20, width: 40, height: 30 },
      { x: 2, y: 3 },
      [{ id: 'candidate', bbox: { x: 13, y: 23, width: 20, height: 20 } }]
    );
    expect(result).toEqual({
      delta: { x: 2, y: 3 },
      guides: { vertical: [], horizontal: [] },
      matches: []
    });
  });
});

describe('snap math helpers', () => {
  it('snapPointToGrid should no-op when disabled or invalid grid size', () => {
    expect(snapPointToGrid({ x: 11, y: 19 }, 10, false)).toEqual({ x: 11, y: 19 });
    expect(snapPointToGrid({ x: 11, y: 19 }, 0, true)).toEqual({ x: 11, y: 19 });
  });

  it('computeSnappedDelta should snap with explicit anchor', () => {
    const snapped = computeSnappedDelta(
      { x: 0, y: 0 },
      { x: 12, y: -6 },
      10,
      true,
      { anchor: { x: 53, y: 57 } }
    );
    expect(snapped).toEqual({ x: 17, y: -7 });
  });

  it('computeSmartGuideSnap should detect edge and center alignments on both axes', () => {
    const result = computeSmartGuideSnap(
      bbox(10, 20, 40, 20),
      { x: 7, y: 8 },
      [
        shape('edge-shape', 30, 70, 30, 10),
        shape('center-shape', 35, 35, 10, 6)
      ],
      true,
      { tolerance: 5 }
    );

    expect(result.delta).toEqual({ x: 10, y: 8 });
    expect(result.guides.vertical).toEqual([40, 60]);
    expect(result.guides.horizontal).toEqual([38]);
    expect(result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          axis: 'x',
          movingAnchor: 'max',
          candidateAnchor: 'max',
          candidateId: 'edge-shape',
          guidePosition: 60,
          offset: 3
        }),
        expect.objectContaining({
          axis: 'x',
          movingAnchor: 'center',
          candidateAnchor: 'center',
          candidateId: 'center-shape',
          guidePosition: 40,
          offset: 3
        }),
        expect.objectContaining({
          axis: 'y',
          movingAnchor: 'center',
          candidateAnchor: 'center',
          candidateId: 'center-shape',
          guidePosition: 38,
          offset: 0
        })
      ])
    );
  });

  it('computeSmartGuideSnap should honor selection exclusion', () => {
    const result = computeSmartGuideSnap(
      bbox(0, 0, 10, 10),
      { x: 12, y: 0 },
      [
        shape('selected-shape', 17, 0, 10, 10),
        shape('other-shape', 28, 0, 10, 10)
      ],
      true,
      { tolerance: 5, selectedShapeIds: ['selected-shape'] }
    );

    expect(result.delta).toEqual({ x: 12, y: 0 });
    expect(result.guides.vertical).toEqual([]);
    expect(result.guides.horizontal).toEqual([0, 5, 10]);
    expect(result.matches).toHaveLength(3);
    expect(result.matches.every((match) => match.axis === 'y')).toBe(true);
  });

  it('computeSmartGuideSnap should include exact tolerance boundary matches', () => {
    const result = computeSmartGuideSnap(
      bbox(0, 0, 10, 10),
      { x: 12, y: 0 },
      [shape('shape', 17, 0, 10, 10)],
      true,
      { tolerance: 5 }
    );
    expect(result.delta.x).toBe(17);
    expect(result.guides.vertical).toEqual([17, 22, 27]);
    const xMatches = result.matches.filter((match) => match.axis === 'x');
    expect(xMatches).toHaveLength(3);
    expect(xMatches.every((match) => Math.abs(match.offset - 5) < 1e-9)).toBe(true);
  });

  it('computeSmartGuideSnap should not match when distance is just outside tolerance', () => {
    const result = computeSmartGuideSnap(
      bbox(0, 0, 10, 10),
      { x: 12, y: 0 },
      [shape('shape', 17.01, 0, 10, 10)],
      true,
      { tolerance: 5 }
    );
    expect(result.delta.x).toBe(12);
    expect(result.guides.vertical).toEqual([]);
    expect(result.matches.filter((match) => match.axis === 'x')).toEqual([]);
  });

  it('computeSmartGuideSnap should detect guides from known bboxes on both axes', () => {
    const result = computeSmartGuideSnap(
      bbox(100, 100, 40, 30),
      { x: 4, y: 7 },
      [
        shape('x-match', 105, 40, 20, 20),
        shape('y-match', 30, 105, 20, 30)
      ],
      true,
      { tolerance: 2 }
    );
    expect(result.delta).toEqual({ x: 5, y: 5 });
    expect(result.guides.vertical).toEqual([105]);
    expect(result.guides.horizontal).toEqual([105, 120, 135]);
    expect(result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ axis: 'x', candidateId: 'x-match', guidePosition: 105, offset: 1 }),
        expect.objectContaining({ axis: 'y', candidateId: 'y-match', guidePosition: 135, offset: -2 })
      ])
    );
  });

  it('computeSmartGuideSnap should no-op when disabled or candidates filtered out', () => {
    const baseArgs = [
      bbox(5, 5, 10, 10),
      { x: 1, y: 2 },
      [shape('shape', 10, 10, 20, 20)]
    ] as const;

    expect(computeSmartGuideSnap(...baseArgs, false)).toEqual(noGuideResult(1, 2));

    expect(
      computeSmartGuideSnap(...baseArgs, true, {
        selectedShapeIds: ['shape']
      })
    ).toEqual(noGuideResult(1, 2));
  });

  it('computeSmartGuideSnap should include overlapping guide positions with shared snap offset', () => {
    const result = computeSmartGuideSnap(
      bbox(0, 0, 20, 20),
      { x: 9, y: 0 },
      [
        shape('a', 10, 30, 20, 20),
        shape('b', 10, 60, 20, 20),
        shape('c', 11, 90, 20, 20)
      ],
      true,
      { tolerance: 2 }
    );

    expect(result.delta.x).toBe(10);
    expect(result.guides.vertical).toEqual([10, 20, 30]);
    expect(result.matches.every((match) => Math.abs(match.offset - 1) < 1e-9)).toBe(true);
  });

  it('computeSmartGuideSnap should handle invalid tolerance by using default', () => {
    const result = computeSmartGuideSnap(
      bbox(0, 0, 10, 10),
      { x: 0, y: 0 },
      [shape('shape', 4, 0, 10, 10)],
      true,
      { tolerance: Number.NaN }
    );
    expect(result.delta.x).toBe(4);
  });

  it('computeSmartGuideSnap should no-op for empty candidate lists', () => {
    const result = computeSmartGuideSnap(bbox(20, 30, 10, 10), { x: 3, y: -4 }, [], true, { tolerance: 1 });
    expect(result).toEqual(noGuideResult(3, -4));
  });
});
