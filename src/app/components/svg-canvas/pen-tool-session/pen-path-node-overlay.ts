import { penSvgDistanceSq } from '../../../models/pen-path';
import { buildPathSelectionOutlineOverlayD } from '../../../models/path-selection-outline';
import {
  collectPathControlHandles,
  collectPathNodeAnchors,
  PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ
} from '../path-node-edit-geometry';
import type { PenToolSessionPathNodeOverlayPort } from './pen-tool-session-path-node-overlay.port';

export type PenSessionPathNodeOverlays = {
  anchors: { cx: number; cy: number }[];
  handles: { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number }[];
};

export type PenInsertOnPathNodeAffordanceOverlay = {
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  knobs: { cx: number; cy: number }[];
  plantedAnchor: { cx: number; cy: number };
};

export function computePenSessionPathNodeOverlays(
  overlay: PenToolSessionPathNodeOverlayPort,
  active: boolean,
  sourceD: string | null | undefined
): PenSessionPathNodeOverlays | null {
  if (!active || !sourceD?.trim()) return null;
  const parsed = overlay.parsePathDataForNodeEditing(sourceD);
  if (!parsed) return null;
  const anchorsRaw = overlay.collectPathNodeAnchors(parsed);
  if (anchorsRaw.length === 0) return null;
  const anchors = anchorsRaw.map((a) => {
    const o = overlay.penRootUserPointToOverlay(a.x, a.y);
    return { cx: o.x, cy: o.y };
  });
  const handles = overlay
    .collectPathControlHandles(parsed)
    .filter(
      (h) =>
        penSvgDistanceSq({ x: h.anchorX, y: h.anchorY }, { x: h.controlX, y: h.controlY }) >=
        PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ
    )
    .map((h) => {
      const anchor = overlay.penRootUserPointToOverlay(h.anchorX, h.anchorY);
      const control = overlay.penRootUserPointToOverlay(h.controlX, h.controlY);
      return {
        x1: anchor.x,
        y1: anchor.y,
        x2: control.x,
        y2: control.y,
        cx: control.x,
        cy: control.y
      };
    });
  return { anchors, handles };
}

export function computePenInsertOnPathNodeAffordanceOverlay(
  overlay: PenToolSessionPathNodeOverlayPort,
  pathId: string | null,
  previewD: string | null,
  planted: { x: number; y: number } | null
): PenInsertOnPathNodeAffordanceOverlay | null {
  if (!pathId || !previewD || !planted) return null;
  const plantedPt = overlay.pathNodeLocalPointToOverlay(pathId, planted.x, planted.y);
  const plantedAnchor = { cx: plantedPt.x, cy: plantedPt.y };
  const parsed = overlay.parsePathDataForNodeEditing(previewD);
  if (!parsed) {
    return { lines: [], knobs: [], plantedAnchor };
  }
  const handles = overlay.collectPathControlHandles(parsed);
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const knobs: { cx: number; cy: number }[] = [];
  for (const h of handles) {
    if (penSvgDistanceSq({ x: h.anchorX, y: h.anchorY }, planted) > PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ) {
      continue;
    }
    if (
      penSvgDistanceSq({ x: h.anchorX, y: h.anchorY }, { x: h.controlX, y: h.controlY }) <
      PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ
    ) {
      continue;
    }
    const a = overlay.pathNodeLocalPointToOverlay(pathId, h.anchorX, h.anchorY);
    const c = overlay.pathNodeLocalPointToOverlay(pathId, h.controlX, h.controlY);
    lines.push({ x1: a.x, y1: a.y, x2: c.x, y2: c.y });
    knobs.push({ cx: c.x, cy: c.y });
  }
  return { lines, knobs, plantedAnchor };
}

export function computePenSessionPathOutlineOverlayD(
  overlay: PenToolSessionPathNodeOverlayPort,
  active: boolean,
  sourceD: string | null | undefined
): string | null {
  if (!active || !sourceD?.trim()) return null;
  const parsed = overlay.parsePathDataForNodeEditing(sourceD);
  if (!parsed?.some((segment) => segment.type !== 'M')) return null;
  const d = buildPathSelectionOutlineOverlayD('pen-session', parsed, (_id, rx, ry) =>
    overlay.penRootUserPointToOverlay(rx, ry)
  );
  return d || null;
}

export function computePenPostInsertAnchorOverlays(
  overlay: PenToolSessionPathNodeOverlayPort,
  getPathDForId: (pathId: string) => string | null
): { cx: number; cy: number }[] {
  const pathId = overlay.getPenPostInsertAnchorPathId();
  if (!pathId || overlay.isPathInNodeEditState(pathId)) return [];
  const pathData = getPathDForId(pathId);
  if (!pathData?.trim()) return [];
  const parsed = overlay.parsePathDataForNodeEditing(pathData);
  if (!parsed) return [];
  return overlay.collectPathNodeAnchors(parsed).map((anchor) => {
    const o = overlay.pathNodeLocalPointToOverlay(pathId, anchor.x, anchor.y);
    return { cx: o.x, cy: o.y };
  });
}
