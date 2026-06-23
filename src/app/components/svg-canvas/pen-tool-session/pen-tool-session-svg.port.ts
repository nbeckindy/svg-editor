import type { Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { EditorCommand } from '../../../models/editor-command';
import type { ShapeProperties } from '../../../models/shape-properties.interface';
import type {
  EditorShapeLifecycleSvgPort,
  PathDataEditorSvgPort
} from '../../../history/editor-shape-lifecycle-svg.port';
import type { SelectionSyncPort } from '../../../history/history-selection.port';
import type { LayerStackItem } from '../../../services/svg-layer-structure.port';

/** History seam for {@link PenToolSession}. */
export interface PenToolSessionHistoryPort {
  pushAndExecute(command: EditorCommand): void;
  discardWhere(predicate: (command: EditorCommand) => boolean): void;
}

/** Selection seam for {@link PenToolSession}. */
export type PenToolSessionShapeSelectionPort = SelectionSyncPort & {
  selectShape(shape: ShapeProperties): void;
};

/** SVG seam for pen path authoring, continuation, and finish commands. */
export type PenToolSessionSvgPort = PathDataEditorSvgPort &
  Pick<
    EditorShapeLifecycleSvgPort,
    'getSVGInstance' | 'getShapeProperties' | 'removeShape' | 'insertShapeMarkup'
  > & {
    getLayerStackItems(): LayerStackItem[];
    getShapeBBox(shapeId: string): { x: number; y: number; width: number; height: number } | null;
    insertPathIntoContentGroup(
      d: string,
      attrs?: Record<string, string>,
      options?: { closedPath?: boolean }
    ): string | null;
    setShapeVisibility(shapeId: string, visible: boolean): void;
  };
