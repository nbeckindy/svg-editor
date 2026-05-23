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
  SetStrokeCommand,
  UpdateDrawingDefaultsCommand,
  OpacityCommand,
  StrokeDashArrayCommand,
  StrokeDashOffsetCommand
} from '../models/editor-commands';

const OVERRIDE_PAINT_SOURCE: PaintSourceInfo = { kind: 'presentation-attr' };

/**
 * Single write path for paint/style from **Chrome** (properties panel, eyedropper):
 * history (`pushAndExecute`), DOM via commands, and `ShapeSelectionService` patches / sync.
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
      this.syncSelectedShapesFromDom();
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

  /** Re-read selected nodes from the live tree into the selection model (after transform commands). */
  syncSelectedShapesFromDom(): void {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;
    const next = this.selectedShapesList().map((s) => {
      const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
      return el ? this.svgManipulation.getShapeProperties(el) : s;
    });
    this.shapeSelection.selectShapes(next);
  }

  /** For chrome that builds custom `EditorCommand` batches (align, bake, bbox edits, …). */
  executeEditorCommands(commands: EditorCommand[], fallbackDescription?: string): void {
    this.pushCommand(commands, fallbackDescription);
  }

  applyStrokeWidth(width: number): void {
    if (!Number.isFinite(width)) return;
    const shapes = this.selectedShapesList();
    const commands: EditorCommand[] = shapes.map((s) => {
      if (width === 0) {
        return new RemoveStrokeCommand(this.svgManipulation, s.id, s.stroke ?? '#000000', s.strokeWidth ?? 1);
      }
      const color = this.hasStrokeColor(s) ? s.stroke! : '#000000';
      return new SetStrokeCommand(
        this.svgManipulation,
        s.id,
        this.hasStrokeColor(s),
        s.stroke ?? '#000000',
        s.strokeWidth ?? 0,
        color,
        width
      );
    });
    const defaultsBefore = this.drawingDefaults.defaults();
    commands.push(
      new UpdateDrawingDefaultsCommand(
        this.drawingDefaults,
        defaultsBefore,
        { ...defaultsBefore, strokeWidth: width },
        'strokeWidth'
      )
    );
    this.pushCommand(commands, width === 0 ? 'Remove stroke' : `Set stroke width ${width}`);
    if (width === 0) {
      this.shapeSelection.patchAllSelected({
        strokeWidth: 0,
        stroke: undefined,
        strokeSource: { kind: 'default' }
      });
    } else {
      this.shapeSelection.patchAllSelected({
        strokeWidth: width,
        strokeSource: OVERRIDE_PAINT_SOURCE
      });
      this.syncSelectedShapesFromDom();
    }
  }

  applyOpacity(opacity: number): void {
    if (!Number.isFinite(opacity)) return;
    const commands = this.selectedShapesList().map(
      (s) => new OpacityCommand(this.svgManipulation, s.id, s.opacity ?? 1, opacity)
    );
    this.pushCommand(commands, `Change opacity to ${opacity}`);
    this.shapeSelection.patchAllSelected({ opacity });
  }

  applyStrokeDasharray(dasharray: string): void {
    const commands = this.selectedShapesList().map(
      (s) => new StrokeDashArrayCommand(this.svgManipulation, s.id, s.strokeDasharray ?? '', dasharray)
    );
    this.pushCommand(commands, dasharray ? `Set dash pattern ${dasharray}` : 'Remove dash pattern');
    this.shapeSelection.patchAllSelected({
      strokeDasharray: dasharray || undefined,
      strokeDashoffset: dasharray ? undefined : 0
    });
  }

  applyStrokeDashoffset(offset: number): void {
    if (!Number.isFinite(offset)) return;
    const commands = this.selectedShapesList().map(
      (s) => new StrokeDashOffsetCommand(this.svgManipulation, s.id, s.strokeDashoffset ?? 0, offset)
    );
    this.pushCommand(commands, `Set dash offset to ${offset}`);
    this.shapeSelection.patchAllSelected({ strokeDashoffset: offset });
  }

  private pushCommand(commands: EditorCommand[], fallbackDescription?: string): void {
    if (commands.length === 0) return;
    this.editorHistory.pushAndExecute(
      commands.length === 1 ? commands[0] : new CompositeCommand(commands, fallbackDescription)
    );
  }
}
