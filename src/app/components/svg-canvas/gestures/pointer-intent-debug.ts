import type { EditorTool } from '../../../services/editor-tool.service';
import type { EditorPointerIntentSnapshot } from '../../../services/editor-pointer-intent-debug.service';
import type { ToolDescriptor } from '../../../tools/tool-descriptor';

/** Inputs for the dev-strip pointer-intent HUD (no full routing mirror). */
export type PointerIntentDebugInput = {
  tool: EditorTool;
  clientX: number;
  clientY: number;
  hitTarget: Element | null;
  overCanvas: boolean;
  expectedCursorLine: string;
  sampledAtMs: number;
  isCreationInProgress: boolean;
  pathNodeDragPathId: string | null;
  isPenInsertOnPathDragActive: boolean;
  isPenSessionActive: boolean;
  isSelectionMarquee: boolean;
  isZoomMarquee: boolean;
  isResizingSelection: boolean;
  isSkewingSelection: boolean;
  isRotatingSelection: boolean;
  isPanning: boolean;
  isDraggingShape: boolean;
  isCanvasReady: boolean;
  getDescriptor: (tool: EditorTool) => ToolDescriptor | undefined;
  hasRegisteredTool: (tool: EditorTool) => boolean;
};

/**
 * Builds the debug HUD snapshot at the last pointer sample.
 *
 * Scope is intentionally high-level: active gesture sessions plus registry tool
 * labels. Per-target primary-mousedown routing lives in {@link CanvasTool.onPointerDown}
 * adapters — not duplicated here after registry-only {@link PointerGestureRouter}.
 */
export function buildPointerIntentSnapshot(input: PointerIntentDebugInput): EditorPointerIntentSnapshot {
  const lines: string[] = [`tool=${input.tool}`];
  const descriptor = input.getDescriptor(input.tool);
  if (descriptor) {
    lines.push(`label=${descriptor.label}`);
    lines.push(`interactionKind=${descriptor.interactionKind}`);
  }

  const publish = (primaryLine: string, detailLines: string[]): EditorPointerIntentSnapshot => ({
    clientX: input.clientX,
    clientY: input.clientY,
    sampledAtMs: input.sampledAtMs,
    expectedCursorLine: input.expectedCursorLine,
    primaryLine,
    detailLines
  });

  if (input.isCreationInProgress) {
    return publish(
      'Creation in progress (mousemove shapes object)',
      lines.concat('primary click semantics N/A until creation ends')
    );
  }
  if (input.pathNodeDragPathId) {
    return publish('Path node drag in progress', lines.concat(`pathId=${input.pathNodeDragPathId}`));
  }
  if (input.isPenInsertOnPathDragActive) {
    return publish('Pen insert-on-path drag (mouseup commits)', lines.concat('see pen session'));
  }
  if (input.isPenSessionActive) {
    return publish('Pen session active → registered pen tool handlers', lines);
  }
  if (input.isSelectionMarquee) {
    return publish('Selection marquee drag', lines);
  }
  if (input.isZoomMarquee) {
    return publish('Zoom marquee drag', lines);
  }
  if (input.isResizingSelection) {
    return publish('Resize drag', lines);
  }
  if (input.isSkewingSelection) {
    return publish('Skew drag', lines);
  }
  if (input.isRotatingSelection) {
    return publish('Rotate drag', lines);
  }
  if (input.isPanning) {
    return publish('Pan drag', lines);
  }
  if (input.isDraggingShape) {
    return publish('Shape drag', lines);
  }

  lines.push(`overCanvasViewport=${input.overCanvas}`);
  if (input.hitTarget) {
    const tid = input.hitTarget.id ? `#${input.hitTarget.id}` : '';
    lines.push(`elementFromPoint=${input.hitTarget.tagName.toLowerCase()}${tid}`);
  } else {
    lines.push('elementFromPoint=null');
  }

  if (!input.overCanvas) {
    return publish(`${toolLabel(input)}: pointer not on canvas`, lines);
  }

  if (!input.isCanvasReady) {
    return publish(`${toolLabel(input)}: canvas not ready`, lines);
  }

  const registered = input.hasRegisteredTool(input.tool);
  const routingNote =
    'Per-target mousedown routing: see CanvasTool.onPointerDown (registry adapters)';
  if (registered) {
    return publish(`${toolLabel(input)}: primary mousedown → registered tool handler`, lines.concat(routingNote));
  }
  return publish(`${toolLabel(input)}: no registered CanvasTool adapter`, lines);
}

function toolLabel(input: PointerIntentDebugInput): string {
  return input.getDescriptor(input.tool)?.label ?? input.tool;
}
