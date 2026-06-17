import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { AddPathCommand, EditPathNodesCommand } from '../../../models/editor-commands';
import { penPathSegmentsToD, type PenPathSegment } from '../../../models/pen-path';
import type { EditorTool } from '../../../services/editor-tool.service';
import type { PenToolSessionPorts } from './pen-tool-session-ports';

export type PenOpenPathFinishJoinHit =
  | {
      pathId: string;
      originalD: string;
      existing: PenPathSegment[];
      stitch: 'appendToExistingTail' | 'prependBeforeExisting';
    }
  | null;

/** Re-apply selection after switching to node-edit tool so path node overlays always have a target. */
function ensurePathSelectedAfterPenFinish(ports: PenToolSessionPorts, pathId: string): void {
  const svg = ports.svgManipulation.getSVGInstance();
  const el = svg?.findOne(`#${pathId}`) as SvgJsElement | undefined;
  if (!el) return;
  ports.shapeSelection.selectShape(ports.svgManipulation.getShapeProperties(el));
}

/**
 * Same as {@link ensurePathSelectedAfterPenFinish}, then arm a brief guard against empty-canvas
 * `clearSelection` / path-node-edit exit and schedule deferred re-applies (macrotask + ~32ms) for trailing `click`/`dblclick`
 * after close — especially double-close, which commits on `mousedown` (`detail` ≥ 2).
 */
function ensurePathSelectedAfterPenClose(ports: PenToolSessionPorts, pathId: string): void {
  ports.armPenClosePostNodeEditEmptyClickSelectionGuard();
  ensurePathSelectedAfterPenFinish(ports, pathId);
  const reapply = (): void => {
    ensurePathSelectedAfterPenFinish(ports, pathId);
    ports.markForCheck();
  };
  setTimeout(reapply, 0);
  // Double-close finishes on mousedown(detail≥2); some UAs deliver click/dblclick slightly later
  // than a single macrotask — second pass catches straggler clears.
  setTimeout(reapply, 32);
}

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
    continuingPathRewrite: { pathId: string; originalD: string; stitch: 'appendToExistingTail' | 'prependBeforeExisting'; existingSegments?: readonly PenPathSegment[] } | null;
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

  const postFinishTool: EditorTool = closePath ? 'node-edit-selector' : 'selector';

  const cont = continuingPathRewrite;
  if (cont) {
    let mergedD = finalClosed;
    if (cont.stitch === 'prependBeforeExisting' && cont.existingSegments) {
      if (closePath) {
        mergedD = finalClosed;
      } else {
        const mergedSegments = combinePenContinuationSegments(finishingSegsSnapshot, cont.existingSegments);
        if (!mergedSegments) {
          clearDrawingState();
          return;
        }
        mergedD = penPathSegmentsToD(mergedSegments);
      }
    }
    ports.svgManipulation.updatePathData(cont.pathId, mergedD);
    const cmd = new EditPathNodesCommand(ports.svgManipulation, cont.pathId, cont.originalD, mergedD, true);
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
    ports.setTool(postFinishTool);
    if (closePath) {
      ensurePathSelectedAfterPenClose(ports, cont.pathId);
    }
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
      ports.setTool(postFinishTool);
      if (closePath) {
        ensurePathSelectedAfterPenClose(ports, joinHit.pathId);
      }
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
  ports.setTool(postFinishTool);
  if (closePath) {
    ensurePathSelectedAfterPenClose(ports, id);
  }
  ports.markForCheck();
}
