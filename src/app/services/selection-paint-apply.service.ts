import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { ShapeSelectionService } from './shape-selection.service';
import { SvgManipulationService } from './svg-manipulation.service';
import { DrawingStyleDefaultsService } from './drawing-style-defaults.service';
import { EditorHistoryService } from './editor-history.service';
import { ShapeProperties, PaintSourceInfo } from '../models/shape-properties.interface';
import {
  EditorCommand,
  CompositeCommand,
  FillColorCommand,
  StrokeColorCommand,
  AddStrokeCommand,
  RemoveStrokeCommand,
  UpdateDrawingDefaultsCommand
} from '../models/editor-commands';

const OVERRIDE_PAINT_SOURCE: PaintSourceInfo = { kind: 'presentation-attr' };

/**
 * Applies fill/stroke changes from UI (color picker, eyedropper) with the same
 * command stack and selection patches as the properties panel.
 */
@Injectable({
  providedIn: 'root'
})
export class SelectionPaintApplyService {
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly svgManipulation = inject(SvgManipulationService);
  private readonly drawingDefaults = inject(DrawingStyleDefaultsService);
  private readonly editorHistory = inject(EditorHistoryService);

  applyFillColor(color: string): void {
    const cleared = !color || color.toLowerCase() === 'none';
    const nextFill = cleared ? 'none' : color;
    const shapes = this.selectedShapesList();
    const commands: EditorCommand[] = shapes.map(
      (s) => new FillColorCommand(this.svgManipulation, s.id, s.fill ?? '', nextFill)
    );
    const defaultsBefore = this.drawingDefaults.defaults();
    commands.push(
      new UpdateDrawingDefaultsCommand(
        this.drawingDefaults,
        defaultsBefore,
        { ...defaultsBefore, fill: cleared ? 'none' : color },
        'fill'
      )
    );
    this.pushCommand(commands, cleared ? 'Clear fill' : `Change fill to ${color}`);
    if (shapes.length > 0) {
      if (cleared) {
        this.shapeSelection.patchAllSelected({
          fill: undefined,
          fillSource: { kind: 'default' }
        });
      } else {
        this.shapeSelection.patchAllSelected({
          fill: color,
          fillSource: OVERRIDE_PAINT_SOURCE
        });
      }
    }
  }

  applyStrokeColor(color: string): void {
    if (color === 'none' || color === '') {
      const shapes = this.selectedShapesList();
      const commands: EditorCommand[] = shapes.map(
        (s) => new RemoveStrokeCommand(this.svgManipulation, s.id, s.stroke ?? '#000000', s.strokeWidth ?? 1)
      );
      const defaultsBefore = this.drawingDefaults.defaults();
      commands.push(
        new UpdateDrawingDefaultsCommand(
          this.drawingDefaults,
          defaultsBefore,
          { ...defaultsBefore, stroke: 'none' },
          'stroke'
        )
      );
      this.pushCommand(commands, 'Remove stroke');
      if (shapes.length > 0) {
        this.shapeSelection.patchAllSelected({
          stroke: undefined,
          strokeWidth: 0,
          strokeSource: { kind: 'default' }
        });
      }
      return;
    }

    const shapes = this.selectedShapesList();
    const needsAdd = shapes.map((s) => !this.hasStrokeColor(s) || (s.strokeWidth ?? 0) === 0);
    const mixedStrokeApply = needsAdd.some(Boolean) && needsAdd.some((n) => !n);

    const commands: EditorCommand[] = shapes.map((s, i) => {
      if (needsAdd[i]) {
        const w = this.defaultStrokeWidthValue() > 0 ? this.defaultStrokeWidthValue() : 1;
        return new AddStrokeCommand(this.svgManipulation, s.id, color, w);
      }
      return new StrokeColorCommand(this.svgManipulation, s.id, s.stroke ?? '', color);
    });
    const defaultsBefore = this.drawingDefaults.defaults();
    commands.push(
      new UpdateDrawingDefaultsCommand(
        this.drawingDefaults,
        defaultsBefore,
        { ...defaultsBefore, stroke: color },
        'stroke'
      )
    );
    this.pushCommand(commands, `Change stroke to ${color}`);

    if (shapes.length === 0) {
      return;
    }
    if (mixedStrokeApply) {
      this.syncAllSelectedFromDom();
      return;
    }
    if (needsAdd.every(Boolean)) {
      const w = this.defaultStrokeWidthValue() > 0 ? this.defaultStrokeWidthValue() : 1;
      this.shapeSelection.patchAllSelected({
        stroke: color,
        strokeWidth: w,
        strokeSource: OVERRIDE_PAINT_SOURCE
      });
    } else {
      this.shapeSelection.patchAllSelected({
        stroke: color,
        strokeSource: OVERRIDE_PAINT_SOURCE
      });
    }
  }

  private selectedShapesList(): ShapeProperties[] {
    return this.shapeSelection.getSelectedShapes();
  }

  private hasStrokeColor(shape: ShapeProperties): boolean {
    const s = shape.stroke;
    return s != null && s.trim() !== '' && s.toLowerCase() !== 'none';
  }

  private defaultStrokeWidthValue(): number {
    return this.drawingDefaults.strokeWidth();
  }

  private syncAllSelectedFromDom(): void {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;
    const next = this.selectedShapesList().map((s) => {
      const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
      return el ? this.svgManipulation.getShapeProperties(el) : s;
    });
    this.shapeSelection.selectShapes(next);
  }

  private pushCommand(commands: EditorCommand[], fallbackDescription?: string): void {
    if (commands.length === 0) return;
    this.editorHistory.pushAndExecute(
      commands.length === 1 ? commands[0] : new CompositeCommand(commands, fallbackDescription)
    );
  }
}
