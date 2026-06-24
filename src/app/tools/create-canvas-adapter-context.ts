import type { CanvasAdapterContext } from './canvas-adapter-context';
import type { EditorTool } from '../services/editor-tool.service';

/** Inputs for building the shared canvas adapter context slice. */
export interface CreateCanvasAdapterContextArgs {
  markForCheck: () => void;
  getCurrentTool: () => EditorTool;
  setTool: (tool: EditorTool) => void;
  clientToEditorSvgPoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  getMainSvgElement: () => SVGSVGElement | null;
  isEditorContentShapeTarget: (target: Element | null) => boolean;
  isCanvasReady: () => boolean;
}

/** Single factory for coordinate, tool-state, document-surface, and readiness slices. */
export function createCanvasAdapterContext(args: CreateCanvasAdapterContextArgs): CanvasAdapterContext {
  return {
    markForCheck: args.markForCheck,
    getCurrentTool: args.getCurrentTool,
    setTool: args.setTool,
    clientToEditorSvgPoint: args.clientToEditorSvgPoint,
    getMainSvgElement: args.getMainSvgElement,
    isEditorContentShapeTarget: args.isEditorContentShapeTarget,
    isCanvasReady: args.isCanvasReady
  };
}
