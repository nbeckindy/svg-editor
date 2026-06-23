import { Injectable, inject } from '@angular/core';
import { ShapeProperties, PaintSourceInfo } from '../../models/shape-properties.interface';
import {
  EditorCommand,
  FillColorCommand,
  StrokeColorCommand,
  AddStrokeCommand,
  RemoveStrokeCommand,
  SetStrokeCommand,
  UpdateDrawingDefaultsCommand,
  OpacityCommand,
  StrokeDashArrayCommand,
  StrokeDashOffsetCommand,
  FontCommand,
  TextAlignCommand,
  TextPaintOrderCommand,
  TextVectorEffectCommand,
  GradientFillSnapshotCommand,
  BakeFillCommand,
  BakeStrokeCommand
} from '../../models/editor-commands';
import { defaultLinearGradientModel, serializeGradientElementToOuterHtml } from '../../models/svg-gradient';
import type { PropertiesPanelSvgPort } from '../../history/properties-panel-svg.port';
import type { LayerReorderGroupSvgPort } from '../../history/layers-panel-svg.port';
import { SvgManipulationService } from '../svg-manipulation.service';
import { ChromeEditorApplySupport } from './chrome-editor-apply-support.service';

const OVERRIDE_PAINT_SOURCE: PaintSourceInfo = { kind: 'presentation-attr' };

@Injectable({ providedIn: 'root' })
export class ChromeEditorPaintApplyService {
  private readonly support = inject(ChromeEditorApplySupport);
  private readonly propertiesSvg: PropertiesPanelSvgPort = inject(SvgManipulationService);
  private readonly layerSvg: LayerReorderGroupSvgPort = inject(SvgManipulationService);

  private get shapeSelection() { return this.support.shapeSelection; }
  private get paintSvg() { return this.support.paintSvg; }
  private get drawingDefaults() { return this.support.drawingDefaults; }
  private selectedShapesList() { return this.support.selectedShapesList(); }
  private shouldBlockShapeOnlyMutations() { return this.support.shouldBlockShapeOnlyMutations(); }
  private shapeIdsTouchLocked(ids: string[]) { return this.support.shapeIdsTouchLocked(ids); }
  private pushCommand(cmds: EditorCommand[], desc?: string) { return this.support.pushCommand(cmds, desc); }
  private pushCommandsAndSyncSelection(cmds: EditorCommand[], desc?: string) { return this.support.pushCommandsAndSyncSelection(cmds, desc); }
  private syncSelectedShapesFromDom() { return this.support.syncSelectedShapesFromDom(); }

  private hasStrokeColor(shape: ShapeProperties): boolean {
    const s = shape.stroke;
    return s != null && s.trim() !== '' && s.toLowerCase() !== 'none';
  }

  private defaultStrokeWidthValue(): number {
    return this.support.drawingDefaults.strokeWidth();
  }

  applyFillColor(color: string): void {
    if (this.shouldBlockShapeOnlyMutations()) return;
    const cleared = !color || color.toLowerCase() === 'none';
    const nextFill = cleared ? 'none' : color;
    const shapes = this.selectedShapesList();
    const commands: EditorCommand[] = shapes.map(
      (s) => new FillColorCommand(this.paintSvg, s.id, s.fill ?? '', nextFill)
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
    if (this.shouldBlockShapeOnlyMutations()) return;
    if (color === 'none' || color === '') {
      const shapes = this.selectedShapesList();
      const commands: EditorCommand[] = shapes.map(
        (s) => new RemoveStrokeCommand(this.paintSvg, s.id, s.stroke ?? '#000000', s.strokeWidth ?? 1)
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
        return new AddStrokeCommand(this.paintSvg, s.id, color, w);
      }
      return new StrokeColorCommand(this.paintSvg, s.id, s.stroke ?? '', color);
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

  applyStrokeWidth(width: number): void {
    if (this.shouldBlockShapeOnlyMutations()) return;
    if (!Number.isFinite(width)) return;
    const shapes = this.selectedShapesList();
    const commands: EditorCommand[] = shapes.map((s) => {
      if (width === 0) {
        return new RemoveStrokeCommand(this.paintSvg, s.id, s.stroke ?? '#000000', s.strokeWidth ?? 1);
      }
      const color = this.hasStrokeColor(s) ? s.stroke! : '#000000';
      return new SetStrokeCommand(
        this.paintSvg,
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
    if (this.shouldBlockShapeOnlyMutations()) return;
    if (!Number.isFinite(opacity)) return;
    const commands = this.selectedShapesList().map(
      (s) => new OpacityCommand(this.paintSvg, s.id, s.opacity ?? 1, opacity)
    );
    this.pushCommand(commands, `Change opacity to ${opacity}`);
    this.shapeSelection.patchAllSelected({ opacity });
  }

  applyStrokeDasharray(dasharray: string): void {
    if (this.shouldBlockShapeOnlyMutations()) return;
    const commands = this.selectedShapesList().map(
      (s) => new StrokeDashArrayCommand(this.paintSvg, s.id, s.strokeDasharray ?? '', dasharray)
    );
    this.pushCommand(commands, dasharray ? `Set dash pattern ${dasharray}` : 'Remove dash pattern');
    this.shapeSelection.patchAllSelected({
      strokeDasharray: dasharray || undefined,
      strokeDashoffset: dasharray ? undefined : 0
    });
  }

  applyStrokeDashoffset(offset: number): void {
    if (this.shouldBlockShapeOnlyMutations()) return;
    if (!Number.isFinite(offset)) return;
    const commands = this.selectedShapesList().map(
      (s) => new StrokeDashOffsetCommand(this.paintSvg, s.id, s.strokeDashoffset ?? 0, offset)
    );
    this.pushCommand(commands, `Set dash offset to ${offset}`);
    this.shapeSelection.patchAllSelected({ strokeDashoffset: offset });
  }

  applyTextFontFamilyFromChrome(
    fontFamily: string,
    textShapes: ShapeProperties[],
    placementDefaults: boolean
  ): void {
    if (textShapes.length > 0 && this.shapeIdsTouchLocked(textShapes.map((s) => s.id))) return;
    if (textShapes.length > 0) {
      const commands = textShapes.map(
        (s) =>
          new FontCommand(
            this.propertiesSvg,
            s.id,
            'fontFamily',
            s.fontFamily ?? 'Arial, sans-serif',
            fontFamily
          )
      );
      this.pushCommandsAndSyncSelection(commands, `Set font family to ${fontFamily}`);
      return;
    }
    if (placementDefaults) {
      const before = this.drawingDefaults.defaults();
      this.pushCommand(
        [
          new UpdateDrawingDefaultsCommand(
            this.drawingDefaults,
            before,
            { ...before, fontFamily },
            'typography'
          )
        ],
        `Set default font family to ${fontFamily}`
      );
    }
  }

  applyTextFontSizeFromChrome(
    fontSize: number,
    textShapes: ShapeProperties[],
    placementDefaults: boolean
  ): void {
    if (textShapes.length > 0 && this.shapeIdsTouchLocked(textShapes.map((s) => s.id))) return;
    if (textShapes.length > 0) {
      const commands = textShapes.map(
        (s) =>
          new FontCommand(this.propertiesSvg, s.id, 'fontSize', s.fontSize ?? 16, fontSize)
      );
      this.pushCommandsAndSyncSelection(commands, `Set font size to ${fontSize}`);
      return;
    }
    if (placementDefaults) {
      const before = this.drawingDefaults.defaults();
      this.pushCommand(
        [
          new UpdateDrawingDefaultsCommand(
            this.drawingDefaults,
            before,
            { ...before, fontSize },
            'typography'
          )
        ],
        `Set default font size to ${fontSize}`
      );
    }
  }

  applyTextToggleBoldFromChrome(textShapes: ShapeProperties[], placementDefaults: boolean): void {
    if (textShapes.length > 0 && this.shapeIdsTouchLocked(textShapes.map((s) => s.id))) return;
    if (textShapes.length > 0) {
      const allBold = textShapes.every((s) => (s.fontWeight ?? 'normal') === 'bold');
      const nextWeight = allBold ? 'normal' : 'bold';
      const commands = textShapes.map(
        (s) =>
          new FontCommand(
            this.propertiesSvg,
            s.id,
            'fontWeight',
            s.fontWeight ?? 'normal',
            nextWeight
          )
      );
      this.pushCommandsAndSyncSelection(
        commands,
        `${nextWeight === 'bold' ? 'Enable' : 'Disable'} bold`
      );
      return;
    }
    if (placementDefaults) {
      const before = this.drawingDefaults.defaults();
      const nextWeight = before.fontWeight === 'bold' ? 'normal' : 'bold';
      this.pushCommand(
        [
          new UpdateDrawingDefaultsCommand(
            this.drawingDefaults,
            before,
            { ...before, fontWeight: nextWeight },
            'typography'
          )
        ],
        `${nextWeight === 'bold' ? 'Enable' : 'Disable'} default bold`
      );
    }
  }

  applyTextToggleItalicFromChrome(textShapes: ShapeProperties[], placementDefaults: boolean): void {
    if (textShapes.length > 0 && this.shapeIdsTouchLocked(textShapes.map((s) => s.id))) return;
    if (textShapes.length > 0) {
      const allItalic = textShapes.every((s) => (s.fontStyle ?? 'normal') === 'italic');
      const nextStyle = allItalic ? 'normal' : 'italic';
      const commands = textShapes.map(
        (s) =>
          new FontCommand(
            this.propertiesSvg,
            s.id,
            'fontStyle',
            s.fontStyle ?? 'normal',
            nextStyle
          )
      );
      this.pushCommandsAndSyncSelection(
        commands,
        `${nextStyle === 'italic' ? 'Enable' : 'Disable'} italic`
      );
      return;
    }
    if (placementDefaults) {
      const before = this.drawingDefaults.defaults();
      const nextStyle: 'normal' | 'italic' = before.fontStyle === 'italic' ? 'normal' : 'italic';
      this.pushCommand(
        [
          new UpdateDrawingDefaultsCommand(
            this.drawingDefaults,
            before,
            { ...before, fontStyle: nextStyle },
            'typography'
          )
        ],
        `${nextStyle === 'italic' ? 'Enable' : 'Disable'} default italic`
      );
    }
  }

  applyTextAnchorFromChrome(
    textAnchor: 'start' | 'middle' | 'end',
    textShapes: ShapeProperties[],
    placementDefaults: boolean
  ): void {
    if (textShapes.length > 0 && this.shapeIdsTouchLocked(textShapes.map((s) => s.id))) return;
    if (textShapes.length > 0) {
      const commands = textShapes.map(
        (s) =>
          new TextAlignCommand(
            this.propertiesSvg,
            s.id,
            s.textAnchor ?? 'start',
            textAnchor
          )
      );
      this.pushCommandsAndSyncSelection(commands, 'Set text alignment');
      return;
    }
    if (placementDefaults) {
      const before = this.drawingDefaults.defaults();
      this.pushCommand(
        [
          new UpdateDrawingDefaultsCommand(
            this.drawingDefaults,
            before,
            { ...before, textAnchor },
            'typography'
          )
        ],
        'Set default text alignment'
      );
    }
  }

  applyTextPaintOrderFromChrome(
    textShapes: ShapeProperties[],
    paintOrder: 'stroke fill' | undefined
  ): void {
    if (textShapes.length > 0 && this.shapeIdsTouchLocked(textShapes.map((s) => s.id))) return;
    if (textShapes.length === 0) return;
    const commands = textShapes.map(
      (s) => new TextPaintOrderCommand(this.propertiesSvg, s.id, s.paintOrder, paintOrder)
    );
    this.pushCommandsAndSyncSelection(
      commands,
      paintOrder ? 'Set text paint order' : 'Reset text paint order'
    );
  }

  applyTextVectorEffectFromChrome(
    textShapes: ShapeProperties[],
    vectorEffect: 'non-scaling-stroke' | undefined
  ): void {
    if (textShapes.length > 0 && this.shapeIdsTouchLocked(textShapes.map((s) => s.id))) return;
    if (textShapes.length === 0) return;
    const commands = textShapes.map(
      (s) =>
        new TextVectorEffectCommand(this.propertiesSvg, s.id, s.vectorEffect, vectorEffect)
    );
    this.pushCommandsAndSyncSelection(
      commands,
      vectorEffect ? 'Enable non-scaling text outline' : 'Disable non-scaling text outline'
    );
  }

  applyBakeFillFromChrome(shapes: ShapeProperties[]): void {
    if (shapes.length === 0) return;
    if (this.shapeIdsTouchLocked(shapes.map((s) => s.id))) return;
    const commands = shapes.map((s) => new BakeFillCommand(this.propertiesSvg, s.id));
    this.pushCommandsAndSyncSelection(commands, 'Bake fill to local');
  }

  applyBakeStrokeFromChrome(shapes: ShapeProperties[]): void {
    if (shapes.length === 0) return;
    if (this.shapeIdsTouchLocked(shapes.map((s) => s.id))) return;
    const commands = shapes.map((s) => new BakeStrokeCommand(this.propertiesSvg, s.id));
    this.pushCommandsAndSyncSelection(commands, 'Bake stroke to local');
  }

  applyAddLinearGradientFillFromChrome(shape: ShapeProperties, solidFrom: string): void {
    if (this.layerSvg.isElementOrAncestorLocked(shape.id)) return;
    const id = this.propertiesSvg.allocateUniqueDefId('grad');
    const model = defaultLinearGradientModel(id, solidFrom, '#ffffff');
    const before = this.propertiesSvg.capturePaintGradientSnapshot(shape.id, 'fill');
    const after = {
      gradientId: id,
      shapePaintAttr: `url(#${id})`,
      gradientOuterHtml: serializeGradientElementToOuterHtml(model)
    };
    this.pushCommandsAndSyncSelection(
      [new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, 'fill', before, after)],
      'Add gradient fill'
    );
  }
}
