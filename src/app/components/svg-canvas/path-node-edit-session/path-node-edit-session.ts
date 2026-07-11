/**
 * Orchestrates path node edit mode (anchor/handle drag, delete, chrome bridge commands).
 * Logical inputs and document effects cross {@link PathNodeEditSessionPorts} so the **Canvas adapter**
 * stays a DOM/view adapter and this module stays unit-testable without full TestBed.
 */
import { penSvgDistanceSq } from '../../../models/pen-path';
import {
  parsePathD,
  parsePathDForNodeEditing,
  pathSegmentsToD,
  type PathSegment
} from '../../../models/path-d';
import { buildPathSelectionOutlineOverlayD } from '../../../models/path-selection-outline';
import {
  convertPathAnchorAtMoveSegmentIndexToCorner,
  convertPathAnchorAtMoveSegmentIndexToIndependentHandles,
  convertPathAnchorAtMoveSegmentIndexToMirrorCubic,
  getIndependentHandlesJointUiState,
  isIndependentHandlesJointActionable,
  getMirrorCubicJointUiState,
  isPathNodeCornerAnchorAlreadyApplied,
  PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK,
  resolvePathNodeConversionLegs
} from '../../../models/path-node-anchor-convert';
import { applySymmetricCubicControlDragInPlace } from '../../../models/path-node-cubic-handle-mirror';
import {
  parsePathNodeHandleLinkMap,
  remapPathNodeHandleLinkMapByStableAnchors,
  serializePathNodeHandleLinkMap,
  type PathNodeHandleLinkMap
} from '../../../models/path-node-handle-link';
import {
  EditPathNodesCommand,
  SetPathNodeHandleLinkCommand,
  CompositeCommand,
  type EditorCommand
} from '../../../models/editor-commands';
import type { PathNodeEditSessionPorts } from './path-node-edit-session-ports';
import {
  collectPathControlHandles,
  collectPathNodeAnchors,
  PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ
} from '../path-node-edit-geometry';
import {
  PATH_NODE_EDIT_FEEDBACK_DURATION_MS,
  type PathNodeDragSession,
  type PathNodeEditState,
  type PathNodeEditStateBuildResult,
  type PathNodeSelectionState
} from './path-node-edit-session-types';

export type { PathNodeEditSessionPorts } from './path-node-edit-session-ports';
export type {
  PathNodeControlHandle,
  PathNodeDragSession,
  PathNodeEditPathState,
  PathNodeEditState,
  PathNodePoint,
  PathNodeSelectionState,
  PATH_NODE_EDIT_FEEDBACK_DURATION_MS,
  PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ
} from './path-node-edit-session-types';

export class PathNodeEditSession {
  pathNodeEditFeedbackMessage: string | null = null;

  /**
   * After pen insert on a path without path-node edit, overlay anchors (not Live-tree DOM).
   */
  penPostInsertAnchorPathId: string | null = null;

  private pathNodeEditFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private pathNodeEditState: PathNodeEditState | null = null;
  private selectedPathNode: PathNodeSelectionState | null = null;
  private pathNodeDragSession: PathNodeDragSession | null = null;
  private pathNodeDragJustEnded = false;

  constructor(private readonly ports: PathNodeEditSessionPorts) {}

  get isPathNodeEditModeActive(): boolean {
    return this.pathNodeEditState !== null;
  }

  hasPathNodeEditState(): boolean {
    return this.pathNodeEditState !== null;
  }

  getPathNodeEditState(): PathNodeEditState | null {
    return this.pathNodeEditState;
  }

  getPathNodeDragSession(): PathNodeDragSession | null {
    return this.pathNodeDragSession;
  }

  consumePathNodeDragJustEnded(): boolean {
    if (!this.pathNodeDragJustEnded) return false;
    this.pathNodeDragJustEnded = false;
    return true;
  }

  enterPathNodeEditMode(pathIds: string[], preferredPathId?: string): void {
    const states: PathNodeEditState['paths'] = [];
    let lastReason: string | null = null;
    for (const pathId of pathIds) {
      const build = this.buildPathNodeEditState(pathId);
      if (build.state) {
        states.push(build.state);
      } else if (build.reason) {
        lastReason = build.reason;
      }
    }
    if (states.length === 0) {
      this.pathNodeEditState = null;
      this.selectedPathNode = null;
      this.pathNodeDragSession = null;
      this.pathNodeDragJustEnded = false;
      if (lastReason) {
        this.showPathNodeEditFeedback(lastReason);
      } else {
        this.clearPathNodeEditFeedback();
      }
      this.syncPathNodeEditBridgeChrome();
      this.ports.markForCheck();
      return;
    }
    const activePathId = states.some((state) => state.pathId === preferredPathId)
      ? (preferredPathId as string)
      : states[0].pathId;
    this.pathNodeEditState = { paths: states, activePathId };
    this.selectedPathNode = null;
    this.ports.setDrilledIntoGroupId(null);
    this.clearPathNodeEditFeedback();
    this.syncPathNodeEditBridgeChrome();
    this.ports.markForCheck();
  }

  exitPathNodeEditMode(): boolean {
    if (!this.pathNodeEditState) return false;
    this.pathNodeEditState = null;
    this.selectedPathNode = null;
    this.pathNodeDragSession = null;
    this.pathNodeDragJustEnded = false;
    this.clearPathNodeEditFeedback();
    this.syncPathNodeEditBridgeChrome();
    this.ports.markForCheck();
    return true;
  }

  isPathNodeEditTarget(target: Element): boolean {
    if (!this.pathNodeEditState) return false;
    const activePathIds = new Set(this.pathNodeEditState.paths.map((state) => state.pathId));
    if (target.id && activePathIds.has(target.id)) return true;
    if (typeof target.closest !== 'function') return false;
    return !!target.closest('[data-path-node-edit-target]');
  }

  /**
   * Exit path-node edit when the user clicks outside edit targets (canvas-wide guard).
   * Skips exit while pen tool is active or during the trailing empty-click window after pen close.
   */
  maybeExitOnOutsideClick(options: {
    clickTarget: Element;
    penClosePostNodeEditEmptyClickClearUntilMs: number;
    hasResolvedContentShape: boolean;
  }): boolean {
    if (!this.pathNodeEditState) return false;
    if (this.isPathNodeEditTarget(options.clickTarget)) return false;
    if (this.ports.getCurrentTool() === 'pen') return false;

    const emptyHitNoResolvedShape = !options.hasResolvedContentShape;
    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const skipExitForTrailingPenCloseClick =
      now < options.penClosePostNodeEditEmptyClickClearUntilMs && emptyHitNoResolvedShape;
    if (skipExitForTrailingPenCloseClick) return false;
    return this.exitPathNodeEditMode();
  }

  tryStartPathNodeDrag(target: Element, event: MouseEvent): boolean {
    if (!this.pathNodeEditState) return false;
    if (typeof target.closest !== 'function') return false;
    const anchorEl = target.closest('[data-path-node-anchor-index]') as Element | null;
    const handleEl = target.closest('[data-path-node-handle-index]') as Element | null;
    if (!anchorEl && !handleEl) return false;
    const rawPathId = (anchorEl ?? handleEl)?.getAttribute('data-path-node-path-id');
    if (!rawPathId) return false;
    const targetPathState = this.pathNodeEditState.paths.find((state) => state.pathId === rawPathId);
    if (!targetPathState) return false;

    const svg = this.ports.svgManipulation.getSVGInstance();
    if (!svg) return false;
    const pathEl = svg.findOne(`#${targetPathState.pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;

    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) return false;

    if (anchorEl) {
      const index = Number(anchorEl.getAttribute('data-path-node-anchor-index'));
      if (!Number.isFinite(index) || index < 0 || index >= targetPathState.anchors.length) return false;
      this.selectedPathNode = {
        pathId: targetPathState.pathId,
        moveSegmentIndex: targetPathState.anchors[index].moveSegmentIndex
      };
      this.pathNodeEditState.activePathId = targetPathState.pathId;
      this.pathNodeDragSession = {
        pathId: targetPathState.pathId,
        oldD,
        segments: parsed.map((segment) => ({ ...segment })),
        target: { kind: 'anchor', index }
      };
      this.pathNodeDragJustEnded = false;
      this.updatePathNodeDrag(event.clientX, event.clientY);
      this.syncPathNodeEditBridgeChrome();
      return true;
    }

    const index = Number(handleEl?.getAttribute('data-path-node-handle-index'));
    if (!Number.isFinite(index) || index < 0 || index >= targetPathState.controlHandles.length) return false;
    this.pathNodeEditState.activePathId = targetPathState.pathId;
    this.pathNodeDragSession = {
      pathId: targetPathState.pathId,
      oldD,
      segments: parsed.map((segment) => ({ ...segment })),
      target: { kind: 'control', index }
    };
    this.pathNodeDragJustEnded = false;
    this.updatePathNodeDrag(event.clientX, event.clientY);
    this.syncPathNodeEditBridgeChrome();
    return true;
  }

  tryDeleteSelectedPathNode(): boolean {
    if (!this.pathNodeEditState) return false;
    if (this.selectedPathNode === null) {
      this.showPathNodeEditFeedback('Select a node before deleting.');
      return true;
    }
    const targetPathState = this.pathNodeEditState.paths.find(
      (state) => state.pathId === this.selectedPathNode?.pathId
    );
    if (!targetPathState) return false;

    const selectedAnchorIndex = targetPathState.anchors.findIndex(
      (anchor) => anchor.moveSegmentIndex === this.selectedPathNode?.moveSegmentIndex
    );
    if (selectedAnchorIndex < 0) return false;

    const uniqueMoveSegments = new Set(targetPathState.anchors.map((anchor) => anchor.moveSegmentIndex));
    const svg = this.ports.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${targetPathState.pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;
    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) return false;

    const isClosedPath = parsed.some((segment) => segment.type === 'Z');
    const minimumNodeCount = isClosedPath ? 3 : 2;
    if (uniqueMoveSegments.size <= minimumNodeCount) {
      this.showPathNodeEditFeedback(
        isClosedPath ? 'Closed paths need at least 3 nodes.' : 'Paths need at least 2 nodes.'
      );
      return true;
    }

    const nextSegments = this.removePathAnchorByMoveSegmentIndex(
      parsed,
      this.selectedPathNode.moveSegmentIndex
    );
    if (!nextSegments) {
      this.showPathNodeEditFeedback('Unable to delete that node.');
      return true;
    }

    const newD = pathSegmentsToD(nextSegments);
    if (newD === oldD) return true;

    pathEl.setAttribute('d', newD);
    const cmd = new EditPathNodesCommand(this.ports.svgManipulation, targetPathState.pathId, oldD, newD, true);
    this.ports.editorHistory.pushAndExecute(cmd);

    const remappedLinks = remapPathNodeHandleLinkMapByStableAnchors(
      parsed,
      nextSegments,
      parsePathNodeHandleLinkMap(this.ports.svgManipulation.getPathNodeHandleLinkRaw(targetPathState.pathId))
    );
    this.pushPathNodeHandleLinkMapIfChanged(targetPathState.pathId, remappedLinks);

    const refreshed = this.buildPathNodeEditState(targetPathState.pathId);
    if (!refreshed.state) {
      this.exitPathNodeEditMode();
      return true;
    }
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
      state.pathId === targetPathState.pathId ? refreshed.state! : state
    );
    this.pathNodeEditState.activePathId = targetPathState.pathId;
    const fallbackAnchor = refreshed.state.anchors[Math.max(0, selectedAnchorIndex - 1)];
    this.selectedPathNode = fallbackAnchor
      ? { pathId: targetPathState.pathId, moveSegmentIndex: fallbackAnchor.moveSegmentIndex }
      : null;
    this.clearPathNodeEditFeedback();
    this.syncPathNodeEditBridgeChrome();
    this.ports.markForCheck();
    return true;
  }

  tryApplyPathNodeIndependentHandlesFromBridge(): boolean {
    if (!this.pathNodeEditState || !this.selectedPathNode) {
      this.showPathNodeEditFeedback('Select a path node first.');
      return false;
    }
    const pathId = this.selectedPathNode.pathId;
    if (this.ports.svgManipulation.isElementOrAncestorLocked(pathId)) {
      this.showPathNodeEditFeedback('That path is locked.');
      return false;
    }
    if (!this.pathNodeEditState.paths.some((s) => s.pathId === pathId)) return false;
    const mi = this.selectedPathNode.moveSegmentIndex;
    const svg = this.ports.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;
    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) {
      this.showPathNodeEditFeedback('Unable to read that path.');
      return false;
    }
    const linkMap = parsePathNodeHandleLinkMap(this.ports.svgManipulation.getPathNodeHandleLinkRaw(pathId));
    if (linkMap.get(mi) === 'independent') {
      this.clearPathNodeEditFeedback();
      this.syncPathNodeEditBridgeChrome();
      return true;
    }
    const state = getIndependentHandlesJointUiState(parsed, mi);
    if (!isIndependentHandlesJointActionable(state)) {
      const msg =
        state.kind === 'rejects-quadratic'
          ? PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK
          : state.kind === 'needs-cubic-joint'
            ? 'Independent handles need two segments meeting at this node.'
            : 'Independent handles are not available at this node.';
      this.showPathNodeEditFeedback(msg);
      return false;
    }

    const outcome = convertPathAnchorAtMoveSegmentIndexToIndependentHandles(parsed, mi);
    if (!outcome.ok) {
      if (outcome.feedback) {
        this.showPathNodeEditFeedback(outcome.feedback);
      }
      return false;
    }

    const newD = pathSegmentsToD(outcome.segments);
    if (newD !== oldD && !this.isValidNodeEditSerializedPath(newD)) {
      this.showPathNodeEditFeedback('Unable to apply independent handles for this path.');
      return false;
    }

    const oldLinkRaw = this.ports.svgManipulation.getPathNodeHandleLinkRaw(pathId);
    const nextLinkMap = parsePathNodeHandleLinkMap(oldLinkRaw);
    nextLinkMap.set(mi, 'independent');
    const newLinkSer = serializePathNodeHandleLinkMap(nextLinkMap);
    const normOldLink = oldLinkRaw?.trim() || null;
    const normNewLink = newLinkSer?.trim() || null;

    const historyCmds: EditorCommand[] = [];
    if (newD !== oldD) {
      pathEl.setAttribute('d', newD);
      historyCmds.push(
        new EditPathNodesCommand(this.ports.svgManipulation, pathId, oldD, newD, true)
      );
    }
    if (normOldLink !== normNewLink) {
      this.ports.svgManipulation.setPathNodeHandleLinkRaw(pathId, normNewLink);
      historyCmds.push(
        new SetPathNodeHandleLinkCommand(this.ports.svgManipulation, pathId, normOldLink, normNewLink, true)
      );
    }

    if (historyCmds.length === 1) {
      this.ports.editorHistory.pushAndExecute(historyCmds[0]);
    } else if (historyCmds.length > 1) {
      this.ports.editorHistory.pushAndExecute(
        new CompositeCommand(historyCmds, 'Independent handles')
      );
    }

    const refreshed = this.buildPathNodeEditState(pathId);
    if (!refreshed.state) {
      this.exitPathNodeEditMode();
      return true;
    }
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((s) =>
      s.pathId === pathId ? refreshed.state! : s
    );
    this.pathNodeEditState.activePathId = pathId;
    if (refreshed.state.anchors.some((a) => a.moveSegmentIndex === mi)) {
      this.selectedPathNode = { pathId, moveSegmentIndex: mi };
    } else {
      this.selectedPathNode = null;
    }
    this.clearPathNodeEditFeedback();
    this.syncPathNodeEditBridgeChrome();
    this.ports.markForCheck();
    return true;
  }

  tryApplyPathNodeAnchorCornerFromBridge(): boolean {
    if (!this.pathNodeEditState || !this.selectedPathNode) {
      this.showPathNodeEditFeedback('Select a path node first.');
      return false;
    }
    const pathId = this.selectedPathNode.pathId;
    if (this.ports.svgManipulation.isElementOrAncestorLocked(pathId)) {
      this.showPathNodeEditFeedback('That path is locked.');
      return false;
    }
    if (!this.pathNodeEditState.paths.some((s) => s.pathId === pathId)) return false;
    const svg = this.ports.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;
    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) {
      this.showPathNodeEditFeedback('Unable to read that path.');
      return false;
    }

    const moveIdx = this.selectedPathNode.moveSegmentIndex;
    const outcome = convertPathAnchorAtMoveSegmentIndexToCorner(parsed, moveIdx);
    if (!outcome.ok) {
      if (outcome.feedback) {
        this.showPathNodeEditFeedback(outcome.feedback);
      }
      return false;
    }

    this.clearIndependentHandleLinkForMove(pathId, moveIdx);

    const newD = pathSegmentsToD(outcome.segments);
    if (newD === oldD) {
      this.clearPathNodeEditFeedback();
      this.syncPathNodeEditBridgeChrome();
      return true;
    }
    if (!this.isValidNodeEditSerializedPath(newD)) {
      this.showPathNodeEditFeedback('Unable to apply corner anchor for this path.');
      return false;
    }

    pathEl.setAttribute('d', newD);
    const cmd = new EditPathNodesCommand(this.ports.svgManipulation, pathId, oldD, newD, true);
    this.ports.editorHistory.pushAndExecute(cmd);

    const refreshed = this.buildPathNodeEditState(pathId);
    if (!refreshed.state) {
      this.exitPathNodeEditMode();
      return true;
    }
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
      state.pathId === pathId ? refreshed.state! : state
    );
    this.pathNodeEditState.activePathId = pathId;
    const preserve = moveIdx;
    if (refreshed.state.anchors.some((a) => a.moveSegmentIndex === preserve)) {
      this.selectedPathNode = { pathId, moveSegmentIndex: preserve };
    } else {
      this.selectedPathNode = null;
    }
    this.clearPathNodeEditFeedback();
    this.syncPathNodeEditBridgeChrome();
    this.ports.markForCheck();
    return true;
  }

  tryApplyPathNodeMirrorCubicFromBridge(): boolean {
    if (!this.pathNodeEditState || !this.selectedPathNode) {
      this.showPathNodeEditFeedback('Select a path node first.');
      return false;
    }
    const pathId = this.selectedPathNode.pathId;
    if (this.ports.svgManipulation.isElementOrAncestorLocked(pathId)) {
      this.showPathNodeEditFeedback('That path is locked.');
      return false;
    }
    if (!this.pathNodeEditState.paths.some((s) => s.pathId === pathId)) return false;
    const svg = this.ports.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;
    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) {
      this.showPathNodeEditFeedback('Unable to read that path.');
      return false;
    }

    const moveIdx = this.selectedPathNode.moveSegmentIndex;
    const linkMap = parsePathNodeHandleLinkMap(this.ports.svgManipulation.getPathNodeHandleLinkRaw(pathId));
    const fromIndependent = linkMap.get(moveIdx) === 'independent';

    const joint = getMirrorCubicJointUiState(parsed, moveIdx);
    if (!fromIndependent && joint.kind === 'already-cubic-noop') {
      this.clearPathNodeEditFeedback();
      this.syncPathNodeEditBridgeChrome();
      return true;
    }
    if (!fromIndependent && joint.kind !== 'applicable') {
      const msg =
        joint.kind === 'rejects-quadratic'
          ? PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK
          : joint.kind === 'needs-two-lines'
            ? 'Mirror cubic needs two straight edges meeting at this node.'
            : 'Unable to apply mirror cubic at this node.';
      this.showPathNodeEditFeedback(msg);
      return false;
    }

    const outcome = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(parsed, moveIdx, {
      fromIndependent
    });
    if (!outcome.ok) {
      if (outcome.feedback) {
        this.showPathNodeEditFeedback(outcome.feedback);
      }
      return false;
    }

    const newD = pathSegmentsToD(outcome.segments);
    if (newD !== oldD && !this.isValidNodeEditSerializedPath(newD)) {
      this.showPathNodeEditFeedback('Unable to apply mirror cubic for this path.');
      return false;
    }

    const oldLinkRaw = this.ports.svgManipulation.getPathNodeHandleLinkRaw(pathId);
    const nextLinkMap = parsePathNodeHandleLinkMap(oldLinkRaw);
    if (fromIndependent) {
      nextLinkMap.delete(moveIdx);
    }
    const newLinkSer = serializePathNodeHandleLinkMap(nextLinkMap);
    const normOldLink = oldLinkRaw?.trim() || null;
    const normNewLink = newLinkSer?.trim() || null;

    const historyCmds: EditorCommand[] = [];
    if (newD !== oldD) {
      pathEl.setAttribute('d', newD);
      historyCmds.push(
        new EditPathNodesCommand(this.ports.svgManipulation, pathId, oldD, newD, true)
      );
    }
    if (fromIndependent && normOldLink !== normNewLink) {
      this.ports.svgManipulation.setPathNodeHandleLinkRaw(pathId, normNewLink);
      historyCmds.push(
        new SetPathNodeHandleLinkCommand(this.ports.svgManipulation, pathId, normOldLink, normNewLink, true)
      );
    }

    if (historyCmds.length === 1) {
      this.ports.editorHistory.pushAndExecute(historyCmds[0]);
    } else if (historyCmds.length > 1) {
      this.ports.editorHistory.pushAndExecute(new CompositeCommand(historyCmds, 'Mirror cubic'));
    }

    if (newD === oldD && !fromIndependent) {
      this.clearPathNodeEditFeedback();
      this.syncPathNodeEditBridgeChrome();
      return true;
    }

    const refreshed = this.buildPathNodeEditState(pathId);
    if (!refreshed.state) {
      this.exitPathNodeEditMode();
      return true;
    }
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
      state.pathId === pathId ? refreshed.state! : state
    );
    this.pathNodeEditState.activePathId = pathId;
    const preserve = moveIdx;
    if (refreshed.state.anchors.some((a) => a.moveSegmentIndex === preserve)) {
      this.selectedPathNode = { pathId, moveSegmentIndex: preserve };
    } else {
      this.selectedPathNode = null;
    }
    this.clearPathNodeEditFeedback();
    this.syncPathNodeEditBridgeChrome();
    this.ports.markForCheck();
    return true;
  }

  updatePathNodeDrag(clientX: number, clientY: number): void {
    if (!this.pathNodeDragSession || !this.pathNodeEditState) return;
    const rootPt = this.ports.clientToEditorSvgPoint(clientX, clientY);
    if (!rootPt) return;
    const pathId = this.pathNodeDragSession.pathId;
    const localPt = this.pathNodeRootUserPointToLocal(pathId, rootPt.x, rootPt.y);
    const point = localPt ?? rootPt;

    const nextSegments = this.pathNodeDragSession.segments.map((segment) => ({ ...segment }));
    if (this.pathNodeDragSession.target.kind === 'anchor') {
      this.applyAnchorDrag(nextSegments, this.pathNodeDragSession.target.index, point.x, point.y);
    } else {
      this.applyControlDrag(nextSegments, this.pathNodeDragSession.target.index, point.x, point.y);
    }

    const nextD = pathSegmentsToD(nextSegments);
    if (!this.isValidNodeEditSerializedPath(nextD)) {
      this.showPathNodeEditFeedback('Unable to apply node move for this path.');
      return;
    }
    const svg = this.ports.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${this.pathNodeDragSession.pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return;
    pathEl.setAttribute('d', nextD);

    this.pathNodeDragSession.segments = nextSegments;
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
      state.pathId === this.pathNodeDragSession?.pathId
        ? {
            pathId: state.pathId,
            anchors: collectPathNodeAnchors(nextSegments),
            controlHandles: collectPathControlHandles(nextSegments)
          }
        : state
    );
    this.pathNodeEditState.activePathId = this.pathNodeDragSession.pathId;
    this.ports.markForCheck();
  }

  finishPathNodeDrag(): void {
    const drag = this.pathNodeDragSession;
    this.pathNodeDragSession = null;
    this.pathNodeDragJustEnded = true;
    if (!drag) return;

    const newD = pathSegmentsToD(drag.segments);
    if (newD !== drag.oldD) {
      const cmd = new EditPathNodesCommand(
        this.ports.svgManipulation,
        drag.pathId,
        drag.oldD,
        newD,
        true
      );
      this.ports.editorHistory.pushAndExecute(cmd);
    }
    this.syncPathNodeEditBridgeChrome();
    this.ports.markForCheck();
  }

  /**
   * Commit pen insert-on-path from {@link PenToolSession} (mousedown→mouseup / micro-drag).
   * @param insertedMoveSegIndex move-segment index of the inserted vertex (for `selectedPathNode` parity with node-edit).
   */
  commitPenInsertOnExistingPath(
    pathId: string,
    oldD: string,
    newD: string,
    insertedMoveSegIndex?: number
  ): void {
    if (newD === oldD || !this.isValidNodeEditSerializedPath(newD)) return;
    const svg = this.ports.svgManipulation.getSVGInstance();
    const pathNode = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathNode) return;

    this.ports.svgManipulation.updatePathData(pathId, newD);
    const cmd = new EditPathNodesCommand(this.ports.svgManipulation, pathId, oldD, newD, true);
    this.ports.editorHistory.pushAndExecute(cmd);

    const oldParsed = this.parsePathDataForNodeEditing(oldD);
    const newParsed = this.parsePathDataForNodeEditing(newD);
    if (oldParsed && newParsed) {
      const remappedLinks = remapPathNodeHandleLinkMapByStableAnchors(
        oldParsed,
        newParsed,
        parsePathNodeHandleLinkMap(this.ports.svgManipulation.getPathNodeHandleLinkRaw(pathId))
      );
      this.pushPathNodeHandleLinkMapIfChanged(pathId, remappedLinks);
    }

    const el = svg?.findOne(`#${pathId}`) as SVGElement | undefined;
    if (el) {
      this.ports.shapeSelection.selectShape(this.ports.svgManipulation.getShapeProperties(el));
    }
    const shapeBbox = this.ports.svgManipulation.getShapeBBox(pathId);
    if (shapeBbox) {
      this.ports.setLastBbox(shapeBbox);
      this.ports.clearHighlightRectCache();
    }

    if (this.pathNodeEditState?.paths.some((state) => state.pathId === pathId)) {
      const refreshed = this.buildPathNodeEditState(pathId);
      if (refreshed.state) {
        this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
          state.pathId === pathId ? refreshed.state! : state
        );
        this.pathNodeEditState.activePathId = pathId;
        if (
          insertedMoveSegIndex !== undefined &&
          refreshed.state.anchors.some((a) => a.moveSegmentIndex === insertedMoveSegIndex)
        ) {
          this.selectedPathNode = { pathId, moveSegmentIndex: insertedMoveSegIndex };
        } else {
          this.selectedPathNode = null;
        }
      } else {
        this.exitPathNodeEditMode();
      }
    }

    if (this.pathNodeEditState?.paths.some((state) => state.pathId === pathId)) {
      this.penPostInsertAnchorPathId = null;
    } else {
      this.penPostInsertAnchorPathId = pathId;
    }
    this.syncPathNodeEditBridgeChrome();
    this.ports.markForCheck();
  }

  clearPenPostInsertAnchorOverlay(): void {
    this.penPostInsertAnchorPathId = null;
  }

  getPathNodeAnchorOverlays(): {
    cx: number;
    cy: number;
    selected: boolean;
    pathId: string;
    anchorIndex: number;
  }[] {
    if (!this.pathNodeEditState) return [];
    return this.pathNodeEditState.paths.flatMap((pathState) =>
      pathState.anchors.map((anchor, anchorIndex) => {
        const overlay = this.pathNodeLocalPointToOverlay(pathState.pathId, anchor.x, anchor.y);
        return {
          cx: overlay.x,
          cy: overlay.y,
          selected:
            this.selectedPathNode?.pathId === pathState.pathId &&
            this.selectedPathNode.moveSegmentIndex === anchor.moveSegmentIndex,
          pathId: pathState.pathId,
          anchorIndex
        };
      })
    );
  }

  getPathNodeControlHandleOverlays(): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    cx: number;
    cy: number;
    pathId: string;
    handleIndex: number;
  }[] {
    if (!this.pathNodeEditState) return [];
    return this.pathNodeEditState.paths.flatMap((pathState) =>
      pathState.controlHandles
        .map((handle, handleIndex) => ({ handle, handleIndex }))
        .filter(
          ({ handle }) =>
            penSvgDistanceSq(
              { x: handle.anchorX, y: handle.anchorY },
              { x: handle.controlX, y: handle.controlY }
            ) >= PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ
        )
        .map(({ handle, handleIndex }) => {
          const anchor = this.pathNodeLocalPointToOverlay(pathState.pathId, handle.anchorX, handle.anchorY);
          const control = this.pathNodeLocalPointToOverlay(pathState.pathId, handle.controlX, handle.controlY);
          return {
            x1: anchor.x,
            y1: anchor.y,
            x2: control.x,
            y2: control.y,
            cx: control.x,
            cy: control.y,
            pathId: pathState.pathId,
            handleIndex
          };
        })
    );
  }

  getPathSelectionOutlineOverlays(): { pathId: string; d: string }[] {
    if (!this.pathNodeEditState) return [];
    const svg = this.ports.svgManipulation.getSVGInstance();
    if (!svg) return [];
    const overlays: { pathId: string; d: string }[] = [];
    for (const pathState of this.pathNodeEditState.paths) {
      const pathEl = svg.findOne(`#${pathState.pathId}`)?.node as SVGPathElement | null;
      if (!pathEl) continue;
      const overlayD = this.pathLocalPathDToOutlineOverlayD(pathState.pathId, pathEl.getAttribute('d') ?? '');
      if (overlayD) overlays.push({ pathId: pathState.pathId, d: overlayD });
    }
    return overlays;
  }

  parsePathDataForNodeEditing(pathData: string): PathSegment[] | null {
    return parsePathDForNodeEditing(pathData);
  }

  pathNodeLocalPointToOverlay(pathId: string, lx: number, ly: number): { x: number; y: number } {
    const mapped = this.ports.svgManipulation.mapPathLocalToRootUser(pathId, lx, ly);
    const o = this.ports.svgBboxToOverlayPixels({ x: mapped.x, y: mapped.y, width: 0, height: 0 });
    return { x: o.x, y: o.y };
  }

  pathLocalPathDToOutlineOverlayD(pathId: string, pathD: string): string | null {
    const parsed = this.parsePathDataForNodeEditing(pathD);
    if (!parsed) return null;
    const d = buildPathSelectionOutlineOverlayD(pathId, parsed, (id, lx, ly) =>
      this.pathNodeLocalPointToOverlay(id, lx, ly)
    );
    return d || null;
  }


  clearPathNodeEditFeedback(): void {
    if (this.pathNodeEditFeedbackTimer) {
      clearTimeout(this.pathNodeEditFeedbackTimer);
      this.pathNodeEditFeedbackTimer = null;
    }
    if (this.pathNodeEditFeedbackMessage === null) return;
    this.pathNodeEditFeedbackMessage = null;
    this.ports.markForCheck();
  }

  syncPathNodeEditBridgeChrome(): void {
    const toolIsNodeEdit = this.ports.getCurrentTool() === 'node-edit-selector';
    if (!toolIsNodeEdit || !this.pathNodeEditState || !this.selectedPathNode) {
      this.ports.pathNodeEditBridge.setChrome({
        toolIsNodeEdit,
        hasSelectedPathNode: false,
        pathLocked: false,
        cornerEnabled: false,
        mirrorCubicEnabled: false,
        independentHandlesEnabled: false,
        anchorMode: 'none'
      });
      return;
    }
    const pathId = this.selectedPathNode.pathId;
    const locked = this.ports.svgManipulation.isElementOrAncestorLocked(pathId);
    const svg = this.ports.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    const d = pathEl?.getAttribute('d') ?? '';
    const parsed = parsePathDForNodeEditing(d);
    if (!parsed) {
      this.ports.pathNodeEditBridge.setChrome({
        toolIsNodeEdit: true,
        hasSelectedPathNode: true,
        pathLocked: locked,
        cornerEnabled: false,
        mirrorCubicEnabled: false,
        independentHandlesEnabled: false,
        anchorMode: 'none'
      });
      return;
    }
    const mi = this.selectedPathNode.moveSegmentIndex;
    const legs = resolvePathNodeConversionLegs(parsed, mi);
    let cornerEnabled =
      !locked && !!legs && (legs.incoming !== null || legs.outgoing !== null);
    if (cornerEnabled && legs) {
      const idxs = [legs.incoming, legs.outgoing].filter((i): i is number => i !== null);
      for (const i of idxs) {
        const ty = parsed[i]?.type;
        if (ty === 'Q' || ty === 'T' || ty === 'S') {
          cornerEnabled = false;
          break;
        }
      }
    }
    if (cornerEnabled && isPathNodeCornerAnchorAlreadyApplied(parsed, mi)) {
      cornerEnabled = false;
    }
    const mirrorState = getMirrorCubicJointUiState(parsed, mi);
    const independentState = getIndependentHandlesJointUiState(parsed, mi);
    const linkMap = parsePathNodeHandleLinkMap(this.ports.svgManipulation.getPathNodeHandleLinkRaw(pathId));
    const independentAtVertex = linkMap.get(mi) === 'independent';
    const cornerAtVertex = isPathNodeCornerAnchorAlreadyApplied(parsed, mi);

    let anchorMode: 'corner' | 'mirror' | 'independent' | 'none' = 'none';
    if (cornerAtVertex) {
      anchorMode = 'corner';
    } else if (independentAtVertex) {
      anchorMode = 'independent';
    } else if (mirrorState.kind === 'already-cubic-noop') {
      anchorMode = 'mirror';
    }

    const mirrorCubicEnabled =
      !locked &&
      (mirrorState.kind === 'applicable' ||
        (independentAtVertex && isIndependentHandlesJointActionable(independentState)));
    const independentHandlesEnabled =
      !locked && isIndependentHandlesJointActionable(independentState) && !independentAtVertex;

    this.ports.pathNodeEditBridge.setChrome({
      toolIsNodeEdit: true,
      hasSelectedPathNode: true,
      pathLocked: locked,
      cornerEnabled: !!cornerEnabled,
      mirrorCubicEnabled,
      independentHandlesEnabled,
      anchorMode
    });
  }

  private showPathNodeEditFeedback(message: string): void {
    this.pathNodeEditFeedbackMessage = message;
    if (this.pathNodeEditFeedbackTimer) {
      clearTimeout(this.pathNodeEditFeedbackTimer);
    }
    this.pathNodeEditFeedbackTimer = setTimeout(() => {
      this.pathNodeEditFeedbackMessage = null;
      this.pathNodeEditFeedbackTimer = null;
      this.ports.markForCheck();
    }, PATH_NODE_EDIT_FEEDBACK_DURATION_MS);
    this.ports.markForCheck();
  }

  private buildPathNodeEditState(pathId: string): PathNodeEditStateBuildResult {
    const svg = this.ports.svgManipulation.getSVGInstance();
    if (!svg) return { state: null, reason: null };
    const pathEl = svg.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return { state: null, reason: null };
    const pathData = pathEl.getAttribute('d') ?? '';
    if (!pathData.trim()) return { state: null, reason: null };

    const parsed = this.parsePathDataForNodeEditing(pathData);
    if (!parsed) {
      return {
        state: null,
        reason: 'Node editing supports only clean M/L/C/S/Q/T/Z path commands (smooth S/T are stored as C/Q).'
      };
    }
    return {
      state: {
        pathId,
        anchors: collectPathNodeAnchors(parsed),
        controlHandles: collectPathControlHandles(parsed)
      },
      reason: null
    };
  }

  private pathNodeRootUserPointToLocal(pathId: string, rx: number, ry: number): { x: number; y: number } | null {
    return this.ports.svgManipulation.mapRootUserToPathLocal(pathId, rx, ry);
  }

  private isValidNodeEditSerializedPath(pathData: string): boolean {
    if (!pathData.trim()) return false;
    const reparsed = parsePathD(pathData);
    return reparsed.errors.length === 0 && reparsed.segments.length > 0 && reparsed.segments[0].type === 'M';
  }

  private removePathAnchorByMoveSegmentIndex(
    segments: readonly PathSegment[],
    moveSegmentIndex: number
  ): PathSegment[] | null {
    const nextSegments = segments.map((segment) => ({ ...segment }));
    if (moveSegmentIndex < 0 || moveSegmentIndex >= nextSegments.length) return null;
    const target = nextSegments[moveSegmentIndex];
    if (!target || target.type === 'Z') return null;

    if (target.type === 'M') {
      let replacementIndex = moveSegmentIndex + 1;
      while (replacementIndex < nextSegments.length && nextSegments[replacementIndex].type === 'Z') {
        replacementIndex++;
      }
      if (replacementIndex >= nextSegments.length) return null;
      const replacement = nextSegments[replacementIndex];
      if (replacement.type === 'Z') return null;
      nextSegments[replacementIndex] = {
        type: 'M',
        x: replacement.x,
        y: replacement.y
      };
      nextSegments.splice(moveSegmentIndex, 1);
      return nextSegments;
    }

    nextSegments.splice(moveSegmentIndex, 1);
    return nextSegments;
  }

  private pushPathNodeHandleLinkMapIfChanged(pathId: string, nextMap: PathNodeHandleLinkMap): void {
    const oldRaw = this.ports.svgManipulation.getPathNodeHandleLinkRaw(pathId);
    const newSer = serializePathNodeHandleLinkMap(nextMap);
    const normOld = oldRaw?.trim() || null;
    const normNew = newSer?.trim() || null;
    if (normOld === normNew) return;
    this.ports.svgManipulation.setPathNodeHandleLinkRaw(pathId, normNew);
    this.ports.editorHistory.pushAndExecute(
      new SetPathNodeHandleLinkCommand(this.ports.svgManipulation, pathId, normOld, normNew, true)
    );
  }

  private clearIndependentHandleLinkForMove(pathId: string, moveSegmentIndex: number): void {
    const map = parsePathNodeHandleLinkMap(this.ports.svgManipulation.getPathNodeHandleLinkRaw(pathId));
    if (!map.delete(moveSegmentIndex)) return;
    this.pushPathNodeHandleLinkMapIfChanged(pathId, map);
  }

  private applyAnchorDrag(segments: PathSegment[], anchorIndex: number, x: number, y: number): void {
    const pathId = this.pathNodeDragSession?.pathId;
    const pathState = this.pathNodeEditState?.paths.find((state) => state.pathId === pathId);
    const anchor = pathState?.anchors[anchorIndex];
    if (!anchor) return;
    const moveSegment = segments[anchor.moveSegmentIndex];
    if (!moveSegment || moveSegment.type === 'Z') return;

    const oldX = moveSegment.x;
    const oldY = moveSegment.y;
    const dx = x - oldX;
    const dy = y - oldY;

    moveSegment.x = x;
    moveSegment.y = y;

    if (moveSegment.type === 'C') {
      moveSegment.x2 += dx;
      moveSegment.y2 += dy;
    }
    if (moveSegment.type === 'Q') {
      moveSegment.x1 += dx;
      moveSegment.y1 += dy;
    }

    const nextSeg = segments[anchor.moveSegmentIndex + 1];
    if (nextSeg?.type === 'C' || nextSeg?.type === 'Q') {
      nextSeg.x1 += dx;
      nextSeg.y1 += dy;
    }

    for (const segment of segments) {
      if (segment.type === 'C' && segment.x === oldX && segment.y === oldY) {
        segment.x2 += dx;
        segment.y2 += dy;
      }
      if (segment.type === 'Q' && segment.x === oldX && segment.y === oldY) {
        segment.x1 += dx;
        segment.y1 += dy;
      }
    }

    for (let i = 1; i < segments.length; i++) {
      const previous = segments[i - 1];
      const segment = segments[i];
      if (previous.type === 'Z') continue;
      if (previous.x !== oldX || previous.y !== oldY) continue;
      if (segment.type === 'C') {
        segment.x1 += dx;
        segment.y1 += dy;
      } else if (segment.type === 'Q') {
        segment.x1 += dx;
        segment.y1 += dy;
      }
    }

    for (const segment of segments) {
      if (segment.type === 'Z' || segment.type === 'M') continue;
      if (segment.x === oldX && segment.y === oldY) {
        segment.x = x;
        segment.y = y;
      }
    }
  }

  private applyControlDrag(segments: PathSegment[], handleIndex: number, x: number, y: number): void {
    const pathId = this.pathNodeDragSession?.pathId;
    const pathState = this.pathNodeEditState?.paths.find((state) => state.pathId === pathId);
    const handle = pathState?.controlHandles[handleIndex];
    if (!handle) return;
    const segment = segments[handle.segmentIndex];
    if (!segment) return;
    if (segment.type === 'Q') {
      if (handle.controlPoint === 'x1y1') {
        segment.x1 = x;
        segment.y1 = y;
      }
      return;
    }
    if (segment.type !== 'C') return;
    const linkMap = parsePathNodeHandleLinkMap(
      pathId ? this.ports.svgManipulation.getPathNodeHandleLinkRaw(pathId) : null
    );
    if (linkMap.get(handle.vertexMoveSegmentIndex) === 'independent') {
      if (handle.controlPoint === 'x1y1') {
        segment.x1 = x;
        segment.y1 = y;
      } else {
        segment.x2 = x;
        segment.y2 = y;
      }
      return;
    }
    applySymmetricCubicControlDragInPlace(segments, handle.segmentIndex, handle.controlPoint, x, y);
  }
}
