import { TestBed } from '@angular/core/testing';
import { SnapService, computeSmartGuideSnap, computeSnappedDelta, snapPointToGrid } from './snap.service';

describe('SnapService', () => {
  let service: SnapService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SnapService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should default to enabled with grid size 10', () => {
    expect(service.enabled()).toBe(true);
    expect(service.gridSize()).toBe(10);
    expect(service.snapTolerance()).toBe(5);
  });

  it('snapToGrid should round to nearest grid intersection', () => {
    expect(service.snapToGrid({ x: 14, y: 25 })).toEqual({ x: 10, y: 30 });
    expect(service.snapToGrid({ x: -14, y: -25 })).toEqual({ x: -10, y: -20 });
  });

  it('snapToGrid should return original point when disabled', () => {
    service.setEnabled(false);
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
    service.setEnabled(false);
    expect(service.snapDelta({ x: 0, y: 0 }, { x: 3.5, y: -2.25 })).toEqual({ x: 3.5, y: -2.25 });
  });

  it('snapDeltaToSmartGuides should return no-op result on empty document', () => {
    const result = service.snapDeltaToSmartGuides(
      { x: 10, y: 20, width: 40, height: 30 },
      { x: 2, y: 3 },
      []
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
      { x: 10, y: 20, width: 40, height: 20 },
      { x: 7, y: 8 },
      [
        { id: 'edge-shape', bbox: { x: 30, y: 70, width: 30, height: 10 } },
        { id: 'center-shape', bbox: { x: 35, y: 35, width: 10, height: 6 } }
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
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 12, y: 0 },
      [
        { id: 'selected-shape', bbox: { x: 17, y: 0, width: 10, height: 10 } },
        { id: 'other-shape', bbox: { x: 28, y: 0, width: 10, height: 10 } }
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
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 12, y: 0 },
      [{ id: 'shape', bbox: { x: 17, y: 0, width: 10, height: 10 } }],
      true,
      { tolerance: 5 }
    );
    expect(result.delta.x).toBe(17);
    expect(result.guides.vertical).toEqual([17, 22, 27]);
    const xMatches = result.matches.filter((match) => match.axis === 'x');
    expect(xMatches).toHaveLength(3);
    expect(xMatches.every((match) => Math.abs(match.offset - 5) < 1e-9)).toBe(true);
  });

  it('computeSmartGuideSnap should no-op when disabled or candidates filtered out', () => {
    const baseArgs = [
      { x: 5, y: 5, width: 10, height: 10 },
      { x: 1, y: 2 },
      [{ id: 'shape', bbox: { x: 10, y: 10, width: 20, height: 20 } }]
    ] as const;

    expect(computeSmartGuideSnap(...baseArgs, false)).toEqual({
      delta: { x: 1, y: 2 },
      guides: { vertical: [], horizontal: [] },
      matches: []
    });

    expect(
      computeSmartGuideSnap(...baseArgs, true, {
        selectedShapeIds: ['shape']
      })
    ).toEqual({
      delta: { x: 1, y: 2 },
      guides: { vertical: [], horizontal: [] },
      matches: []
    });
  });

  it('computeSmartGuideSnap should include overlapping guide positions with shared snap offset', () => {
    const result = computeSmartGuideSnap(
      { x: 0, y: 0, width: 20, height: 20 },
      { x: 9, y: 0 },
      [
        { id: 'a', bbox: { x: 10, y: 30, width: 20, height: 20 } },
        { id: 'b', bbox: { x: 10, y: 60, width: 20, height: 20 } },
        { id: 'c', bbox: { x: 11, y: 90, width: 20, height: 20 } }
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
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 0 },
      [{ id: 'shape', bbox: { x: 4, y: 0, width: 10, height: 10 } }],
      true,
      { tolerance: Number.NaN }
    );
    expect(result.delta.x).toBe(4);
  });
});
