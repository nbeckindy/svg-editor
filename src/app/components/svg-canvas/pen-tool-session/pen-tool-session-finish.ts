import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { AddPathCommand, EditPathNodesCommand } from '../../../models/editor-commands';
import { penPathSegmentsToD, type PenPathSegment } from '../../../models/pen-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';

export type PenOpenPathFinishJoinHit =
  | {
      pathId: string;
      originalD: string;
      existing: PenPathSegment[];
      stitch: 'appendToExistingTail' | 'prependBeforeExisting';
    }
  | null;

/**
 * After {@link PenSession} has produced `finalClosed` `d`, apply continue / join / new-path branches
 * to the **Live tree**, **History**, and **Selection** (then caller clears **Pen authoring session** state).
 */
export function applyPenFinishedPathDocumentEffects(
  ports: PenToolSessionPorts,
  options: {
    finalClosed: string;
    closePath: boolean;
    finishingSegsSnapshot: readonly PenPathSegment[];
    continuingPathRewrite: { pathId: string; originalD: string } | null;
    findPenOpenPathFinishJoin: (finishingSegs: readonly PenPathSegment[]) => PenOpenPathFinishJoinHit;
    combinePenContinuationSegments: (
      primary: readonly PenPathSegment[],
      continuation: readonly PenPathSegment[]
    ) => PenPathSegment[] | null;
    clearDrawingState: () => void;
  }
): void {
  const {
    finalClosed,
    closePath,
    finishingSegsSnapshot,
    continuingPathRewrite,
    findPenOpenPathFinishJoin,
    combinePenContinuationSegments,
    clearDrawingState
  } = options;

  const cont = continuingPathRewrite;
  if (cont) {
    ports.svgManipulation.updatePathData(cont.pathId, finalClosed);
    const cmd = new EditPathNodesCommand(ports.svgManipulation, cont.pathId, cont.originalD, finalClosed, true);
    ports.editorHistory.pushAndExecute(cmd);
    const svgSel = ports.svgManipulation.getSVGInstance();
    const mergedEl = svgSel?.findOne(`#${cont.pathId}`) as SvgJsElement | undefined;
    if (mergedEl) {
      ports.shapeSelection.selectShape(ports.svgManipulation.getShapeProperties(mergedEl));
    }
    const shapeBboxContinue = ports.svgManipulation.getShapeBBox(cont.pathId);
    if (shapeBboxContinue) {
      ports.setLastBbox(shapeBboxContinue);
      ports.clearHighlightRectCache();
    }
    clearDrawingState();
    ports.setTool('selector');
    ports.markForCheck();
    return;
  }

  const joinHit = findPenOpenPathFinishJoin(finishingSegsSnapshot);
  if (joinHit) {
    const mergedSegments =
      joinHit.stitch === 'appendToExistingTail'
        ? combinePenContinuationSegments(joinHit.existing, finishingSegsSnapshot)
        : combinePenContinuationSegments(finishingSegsSnapshot, joinHit.existing);
    if (mergedSegments) {
      const mergedD = closePath ? `${penPathSegmentsToD(mergedSegments)} Z` : penPathSegmentsToD(mergedSegments);
      ports.svgManipulation.updatePathData(joinHit.pathId, mergedD);
      const joinCmd = new EditPathNodesCommand(
        ports.svgManipulation,
        joinHit.pathId,
        joinHit.originalD,
        mergedD,
        true
      );
      ports.editorHistory.pushAndExecute(joinCmd);
      const svgJoin = ports.svgManipulation.getSVGInstance();
      const joinedEl = svgJoin?.findOne(`#${joinHit.pathId}`) as SvgJsElement | undefined;
      if (joinedEl) {
        ports.shapeSelection.selectShape(ports.svgManipulation.getShapeProperties(joinedEl));
      }
      const jb = ports.svgManipulation.getShapeBBox(joinHit.pathId);
      if (jb) {
        ports.setLastBbox(jb);
        ports.clearHighlightRectCache();
      }
      clearDrawingState();
      ports.setTool('selector');
      ports.markForCheck();
      return;
    }
  }

  const id = ports.svgManipulation.insertPathIntoContentGroup(finalClosed, undefined, { closedPath: closePath });
  if (!id) {
    clearDrawingState();
    return;
  }
  const svg = ports.svgManipulation.getSVGInstance();
  const el = svg?.findOne(`#${id}`) as SvgJsElement | undefined;
  if (el) {
    ports.shapeSelection.selectShape(ports.svgManipulation.getShapeProperties(el));
  }
  const cmd = new AddPathCommand(ports.svgManipulation, id, ports.shapeSelection);
  ports.editorHistory.pushAndExecute(cmd);
  const shapeBbox = ports.svgManipulation.getShapeBBox(id);
  if (shapeBbox) {
    ports.setLastBbox(shapeBbox);
    ports.clearHighlightRectCache();
  }
  clearDrawingState();
  ports.setTool('selector');
  ports.markForCheck();
}
