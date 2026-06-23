import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ChromeEditorApplySvgPort } from '../../history/chrome-editor-apply-svg.port';
import type { EditorShapeLifecycleSvgPort } from '../../history/editor-shape-lifecycle-svg.port';
import type { LayerReorderGroupSvgPort } from '../../history/layers-panel-svg.port';
import type { PropertiesPanelSvgPort } from '../../history/properties-panel-svg.port';
import type { SelectionTransformApplySvgPort } from '../../history/transform-gesture-svg.port';
import { ShapeSelectionService } from '../shape-selection.service';
import { SvgManipulationService } from '../svg-manipulation.service';
import { DrawingStyleDefaultsService } from '../drawing-style-defaults.service';
import { EditorHistoryService } from '../editor-history.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { EditorCommand, CompositeCommand } from '../../models/editor-commands';
/** Shared selection/history helpers for chrome apply domain slices. */
@Injectable({ providedIn: 'root' })
export class ChromeEditorApplySupport {
  readonly shapeSelection = inject(ShapeSelectionService);
  readonly paintSvg: ChromeEditorApplySvgPort = inject(SvgManipulationService);
  readonly propertiesSvg: PropertiesPanelSvgPort = inject(SvgManipulationService);
  readonly layerSvg: LayerReorderGroupSvgPort = inject(SvgManipulationService);
  readonly drawingDefaults = inject(DrawingStyleDefaultsService);
  readonly editorHistory = inject(EditorHistoryService);

  selectedShapesList(): ShapeProperties[] {
    return this.shapeSelection.getSelectedShapes();
  }

  shouldBlockShapeOnlyMutations(): boolean {
    const shapes = this.selectedShapesList();
    return shapes.length > 0 && shapes.some((s) => this.layerSvg.isElementOrAncestorLocked(s.id));
  }

  shapeIdsTouchLocked(ids: string[]): boolean {
    return ids.some((id) => this.layerSvg.isElementOrAncestorLocked(id));
  }

  syncSelectedShapesFromDom(): void {
    const svg = this.paintSvg.getSVGInstance();
    if (!svg) return;
    const next = this.selectedShapesList().map((s) => {
      const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
      return el ? this.paintSvg.getShapeProperties(el) : s;
    });
    this.shapeSelection.selectShapes(next);
  }

  pushCommandsAndSyncSelection(commands: EditorCommand[], fallbackDescription?: string): void {
    this.pushCommand(commands, fallbackDescription);
    this.syncSelectedShapesFromDom();
  }

  pushCommand(commands: EditorCommand[], fallbackDescription?: string): void {
    if (commands.length === 0) return;
    this.editorHistory.pushAndExecute(
      commands.length === 1 ? commands[0] : new CompositeCommand(commands, fallbackDescription)
    );
  }
}
