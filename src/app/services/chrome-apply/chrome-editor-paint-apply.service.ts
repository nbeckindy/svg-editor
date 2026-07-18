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
  FillOpacityCommand,
  StrokeOpacityCommand,
  StrokeDashArrayCommand,
  StrokeDashOffsetCommand,
  FontCommand,
  TextAlignCommand,
  TextPaintOrderCommand,
  TextVectorEffectCommand,
  TextDominantBaselineCommand,
  TextLetterSpacingCommand,
  TextWordSpacingCommand,
  GradientFillSnapshotCommand,
  BakeFillCommand,
  BakeStrokeCommand
} from '../../models/editor-commands';
import {
  defaultLinearGradientModel,
  defaultRadialGradientModel,
  firstStopColor,
  parsePaintReferenceId,
  serializeGradientElementToOuterHtml,
  switchGradientKindModel,
  type EditableGradientModel,
  type PaintGradientSnapshot
} from '../../models/svg-gradient';
import type { PaintSwatchMode, PaintSwatchTarget } from '../../components/paint-swatch-popover/paint-swatch-popover.component';
import type { DrawingStyleDefaults } from '../../models/drawing-style-defaults';
import type {
  EyedropperPaintChannel,
  EyedropperPaintSample
} from '../../models/eyedropper-paint-sample';
import {
  cloneGradientModelWithId
} from '../../utils/eyedropper-paint-sample';
import { ChromeEditorApplySupport } from './chrome-editor-apply-support.service';
import { LAYER_REORDER_GROUP_SVG_PORT, PROPERTIES_PANEL_SVG_PORT } from './chrome-apply.tokens';

const OVERRIDE_PAINT_SOURCE: PaintSourceInfo = { kind: 'presentation-attr' };

@Injectable({ providedIn: 'root' })
export class ChromeEditorPaintApplyService {
  private readonly support = inject(ChromeEditorApplySupport);
  private readonly propertiesSvg = inject(PROPERTIES_PANEL_SVG_PORT);
  private readonly layerSvg = inject(LAYER_REORDER_GROUP_SVG_PORT);

  private get shapeSelection() { return this.support.shapeSelection; }
  private get paintSvg() { return this.support.paintSvg; }
  private get drawingDefaults() { return this.support.drawingDefaults; }
  private selectedShapesList() { return this.support.selectedShapesList(); }
  private shouldBlockShapeOnlyMutations() { return this.support.shouldBlockShapeOnlyMutations(); }
  private shapeIdsTouchLocked(ids: string[]) { return this.support.shapeIdsTouchLocked(ids); }
  private pushCommand(cmds: EditorCommand[], desc?: string) { return this.support.pushCommand(cmds, desc); }
  private pushCommandsAndSyncSelection(cmds: EditorCommand[], desc?: string) { return this.support.pushCommandsAndSyncSelection(cmds, desc); }
  private syncSelectedShapesFromDom() { return this.support.syncSelectedShapesFromDom(); }

  private hasFillColor(shape: ShapeProperties): boolean {
    const f = shape.fill;
    return f != null && f.trim() !== '' && f.toLowerCase() !== 'none';
  }

  private hasStrokeColor(shape: ShapeProperties): boolean {
    const s = shape.stroke;
    return s != null && s.trim() !== '' && s.toLowerCase() !== 'none';
  }

  private defaultStrokeWidthValue(): number {
    return this.support.drawingDefaults.strokeWidth();
  }

  /**
   * Creation paint defaults only (tool strip with empty selection).
   * Selection paint goes through applyFillColor / applyPaintModeFromChrome.
   * @see docs/adr/0003-editor-chrome-ownership.md
   */
  applyCreationFillDefault(color: string): void {
    const cleared = !color || color.toLowerCase() === 'none';
    const nextFill = cleared ? 'none' : color;
    const before = this.drawingDefaults.defaults();
    if (before.fill === nextFill && before.fillGradient == null) return;
    this.pushCommand(
      [
        new UpdateDrawingDefaultsCommand(
          this.drawingDefaults,
          before,
          { ...before, fill: nextFill, fillGradient: null },
          'fill'
        )
      ],
      cleared ? 'Set default fill to none' : `Set default fill to ${nextFill}`
    );
  }

  /** Creation stroke default (empty selection on strip). */
  applyCreationStrokeDefault(color: string): void {
    const cleared = !color || color.toLowerCase() === 'none';
    const nextStroke = cleared ? 'none' : color;
    const before = this.drawingDefaults.defaults();
    if (before.stroke === nextStroke && before.strokeGradient == null) return;
    this.pushCommand(
      [
        new UpdateDrawingDefaultsCommand(
          this.drawingDefaults,
          before,
          { ...before, stroke: nextStroke, strokeGradient: null },
          'stroke'
        )
      ],
      cleared ? 'Set default stroke to none' : `Set default stroke to ${nextStroke}`
    );
  }

  /**
   * Creation paint mode (Solid / Linear / Radial / No paint) for empty-selection strip defaults.
   */
  applyCreationFillPaintMode(mode: PaintSwatchMode): void {
    const before = this.drawingDefaults.defaults();
    const after = this.buildCreationPaintDefaultsAfter(before, 'fill', mode);
    if (!after) return;
    this.pushCommand(
      [new UpdateDrawingDefaultsCommand(this.drawingDefaults, before, after, 'fill')],
      this.creationPaintModeDescription('fill', mode)
    );
  }

  /** Creation stroke paint mode (empty selection on strip). */
  applyCreationStrokePaintMode(mode: PaintSwatchMode): void {
    const before = this.drawingDefaults.defaults();
    const after = this.buildCreationPaintDefaultsAfter(before, 'stroke', mode);
    if (!after) return;
    this.pushCommand(
      [new UpdateDrawingDefaultsCommand(this.drawingDefaults, before, after, 'stroke')],
      this.creationPaintModeDescription('stroke', mode)
    );
  }

  private creationPaintModeDescription(target: 'fill' | 'stroke', mode: PaintSwatchMode): string {
    switch (mode) {
      case 'none':
        return `Set default ${target} to none`;
      case 'solid':
        return `Set default ${target} to solid`;
      case 'linear':
        return `Set default ${target} to linear gradient`;
      case 'radial':
        return `Set default ${target} to radial gradient`;
    }
  }

  private buildCreationPaintDefaultsAfter(
    before: DrawingStyleDefaults,
    target: 'fill' | 'stroke',
    mode: PaintSwatchMode
  ): DrawingStyleDefaults | null {
    const solidKey = target === 'fill' ? 'fill' : 'stroke';
    const gradKey = target === 'fill' ? 'fillGradient' : 'strokeGradient';
    const solid = before[solidKey];
    const existing = before[gradKey];
    const seed =
      solid && solid.toLowerCase() !== 'none' && !solid.includes('url(') ? solid : '#000000';

    switch (mode) {
      case 'none': {
        if (solid === 'none' && existing == null) return null;
        return { ...before, [solidKey]: 'none', [gradKey]: null };
      }
      case 'solid': {
        const nextSolid = existing ? firstStopColor(existing) : seed;
        if (solid === nextSolid && existing == null) return null;
        return { ...before, [solidKey]: nextSolid, [gradKey]: null };
      }
      case 'linear':
      case 'radial': {
        let model: EditableGradientModel;
        if (existing) {
          if (existing.kind === mode) return null;
          model = switchGradientKindModel(existing, mode);
        } else {
          const templateId = target === 'fill' ? 'creation-fill-grad' : 'creation-stroke-grad';
          model =
            mode === 'linear'
              ? defaultLinearGradientModel(templateId, seed, '#ffffff')
              : defaultRadialGradientModel(templateId, seed, '#ffffff');
        }
        return { ...before, [solidKey]: seed, [gradKey]: model };
      }
    }
  }

  /** Creation stroke-width default (empty selection on strip). */
  applyCreationStrokeWidthDefault(width: number): void {
    if (!Number.isFinite(width) || width < 0) return;
    const before = this.drawingDefaults.defaults();
    if (before.strokeWidth === width) return;
    this.pushCommand(
      [
        new UpdateDrawingDefaultsCommand(
          this.drawingDefaults,
          before,
          { ...before, strokeWidth: width },
          'strokeWidth'
        )
      ],
      `Set default stroke width to ${width}`
    );
  }

  /**
   * Apply a full eyedropper paint sample to the Selection (and Creation paint defaults)
   * as a single undo step. Gradients are cloned into dedicated defs per target shape.
   */
  applyEyedropperPaintSample(sample: EyedropperPaintSample): void {
    if (this.shouldBlockShapeOnlyMutations()) return;
    const shapes = this.selectedShapesList();
    const commands: EditorCommand[] = [];

    for (const shape of shapes) {
      if (this.layerSvg.isElementOrAncestorLocked(shape.id)) continue;
      commands.push(...this.buildEyedropperCommandsForShape(shape, sample));
    }

    const defaultsCmd = this.buildEyedropperDefaultsCommand(sample);
    if (defaultsCmd) commands.push(defaultsCmd);

    if (commands.length === 0) return;
    this.pushCommandsAndSyncSelection(commands, 'Eyedropper paint');
  }

  private buildEyedropperCommandsForShape(
    shape: ShapeProperties,
    sample: EyedropperPaintSample
  ): EditorCommand[] {
    const cmds: EditorCommand[] = [];

    if (sample.fill) {
      cmds.push(...this.buildEyedropperFillCommands(shape, sample.fill));
    }
    if ((shape.fillOpacity ?? 1) !== sample.fillOpacity) {
      cmds.push(
        new FillOpacityCommand(this.paintSvg, shape.id, shape.fillOpacity ?? 1, sample.fillOpacity)
      );
    }

    if (sample.stroke) {
      cmds.push(...this.buildEyedropperStrokeCommands(shape, sample));
    }
    if ((shape.strokeOpacity ?? 1) !== sample.strokeOpacity) {
      cmds.push(
        new StrokeOpacityCommand(
          this.paintSvg,
          shape.id,
          shape.strokeOpacity ?? 1,
          sample.strokeOpacity
        )
      );
    }

    const nextDash = sample.stroke?.kind === 'none' ? '' : sample.strokeDasharray;
    const nextOffset = sample.stroke?.kind === 'none' ? 0 : sample.strokeDashoffset;
    if ((shape.strokeDasharray ?? '') !== nextDash) {
      cmds.push(
        new StrokeDashArrayCommand(this.paintSvg, shape.id, shape.strokeDasharray ?? '', nextDash)
      );
    }
    if ((shape.strokeDashoffset ?? 0) !== nextOffset) {
      cmds.push(
        new StrokeDashOffsetCommand(this.paintSvg, shape.id, shape.strokeDashoffset ?? 0, nextOffset)
      );
    }

    return cmds;
  }

  private buildEyedropperFillCommands(
    shape: ShapeProperties,
    fill: EyedropperPaintChannel
  ): EditorCommand[] {
    const before = this.propertiesSvg.capturePaintGradientSnapshot(shape.id, 'fill');
    if (fill.kind === 'none') {
      if ((before.shapePaintAttr ?? '').toLowerCase() === 'none' || before.shapePaintAttr == null) {
        if (shape.fillPaintType === 'none' || !this.hasFillColor(shape)) return [];
      }
      const after: PaintGradientSnapshot = {
        gradientId: null,
        shapePaintAttr: 'none',
        gradientOuterHtml: null
      };
      return [new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, 'fill', before, after)];
    }
    if (fill.kind === 'solid') {
      const color = fill.solid ?? '#000000';
      if (!before.gradientId && (shape.fill ?? '') === color) return [];
      const after: PaintGradientSnapshot = {
        gradientId: null,
        shapePaintAttr: color,
        gradientOuterHtml: null
      };
      return [new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, 'fill', before, after)];
    }
    if (!fill.gradient) return [];
    const id = this.propertiesSvg.allocateUniqueDefId('grad');
    const model = cloneGradientModelWithId(fill.gradient, id);
    const after = this.buildGradientSnapshot(model);
    return [new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, 'fill', before, after)];
  }

  private shapeHasVisibleStroke(shape: ShapeProperties): boolean {
    if ((shape.strokeWidth ?? 0) <= 0) return false;
    return (
      shape.strokePaintType === 'gradient' ||
      shape.strokePaintType === 'pattern' ||
      this.hasStrokeColor(shape)
    );
  }

  private buildEyedropperStrokeCommands(
    shape: ShapeProperties,
    sample: EyedropperPaintSample
  ): EditorCommand[] {
    const stroke = sample.stroke!;
    const cmds: EditorCommand[] = [];
    const hadStroke = this.shapeHasVisibleStroke(shape);
    const before = this.propertiesSvg.capturePaintGradientSnapshot(shape.id, 'stroke');
    const oldColor = shape.stroke ?? before.shapePaintAttr ?? '#000000';
    const oldWidth = shape.strokeWidth ?? 0;

    if (stroke.kind === 'none' || sample.strokeWidth <= 0) {
      if (!hadStroke && !before.gradientId) return [];
      if (before.gradientId) {
        const after: PaintGradientSnapshot = {
          gradientId: null,
          shapePaintAttr: 'none',
          gradientOuterHtml: null
        };
        cmds.push(
          new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, 'stroke', before, after)
        );
      }
      cmds.push(new RemoveStrokeCommand(this.paintSvg, shape.id, oldColor, oldWidth > 0 ? oldWidth : 1));
      return cmds;
    }

    const seed = stroke.solid ?? '#000000';
    const width = sample.strokeWidth;

    if (stroke.kind === 'solid') {
      if (before.gradientId) {
        const solidAfter: PaintGradientSnapshot = {
          gradientId: null,
          shapePaintAttr: seed,
          gradientOuterHtml: null
        };
        cmds.push(
          new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, 'stroke', before, solidAfter)
        );
      }
      if (!hadStroke) {
        cmds.push(new AddStrokeCommand(this.paintSvg, shape.id, seed, width));
      } else if (before.gradientId || (shape.stroke ?? '') !== seed || oldWidth !== width) {
        cmds.push(
          new SetStrokeCommand(this.paintSvg, shape.id, hadStroke, oldColor, oldWidth, seed, width)
        );
      }
      return cmds;
    }

    if (!stroke.gradient) return [];
    const id = this.propertiesSvg.allocateUniqueDefId('grad');
    const model = cloneGradientModelWithId(stroke.gradient, id);
    const after = this.buildGradientSnapshot(model);
    const url = after.shapePaintAttr ?? `url(#${id})`;

    // Snapshot installs the dedicated gradient def + paint attr; SetStroke keeps width in sync
    // without dropping the url (addStroke accepts url(#…) as color).
    cmds.push(new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, 'stroke', before, after));
    if (!hadStroke || oldWidth !== width) {
      cmds.push(
        new SetStrokeCommand(this.paintSvg, shape.id, hadStroke, oldColor, oldWidth, url, width)
      );
    }
    return cmds;
  }

  private buildEyedropperDefaultsCommand(sample: EyedropperPaintSample): EditorCommand | null {
    const before = this.drawingDefaults.defaults();
    const after: DrawingStyleDefaults = { ...before };

    if (sample.fill) {
      if (sample.fill.kind === 'none') {
        after.fill = 'none';
        after.fillGradient = null;
      } else if (sample.fill.kind === 'solid') {
        after.fill = sample.fill.solid ?? '#000000';
        after.fillGradient = null;
      } else if (sample.fill.gradient) {
        after.fill = sample.fill.solid ?? firstStopColor(sample.fill.gradient);
        after.fillGradient = cloneGradientModelWithId(sample.fill.gradient, 'creation-fill-grad');
      }
    }

    if (sample.stroke) {
      if (sample.stroke.kind === 'none' || sample.strokeWidth <= 0) {
        after.stroke = 'none';
        after.strokeGradient = null;
      } else if (sample.stroke.kind === 'solid') {
        after.stroke = sample.stroke.solid ?? '#000000';
        after.strokeGradient = null;
        after.strokeWidth = sample.strokeWidth;
      } else if (sample.stroke.gradient) {
        after.stroke = sample.stroke.solid ?? firstStopColor(sample.stroke.gradient);
        after.strokeGradient = cloneGradientModelWithId(
          sample.stroke.gradient,
          'creation-stroke-grad'
        );
        after.strokeWidth = sample.strokeWidth;
      }
    } else if (sample.strokeWidth > 0) {
      after.strokeWidth = sample.strokeWidth;
    }

    const fillGradSame =
      (after.fillGradient == null && before.fillGradient == null) ||
      (after.fillGradient != null &&
        before.fillGradient != null &&
        serializeGradientElementToOuterHtml(after.fillGradient) ===
          serializeGradientElementToOuterHtml(before.fillGradient));
    const strokeGradSame =
      (after.strokeGradient == null && before.strokeGradient == null) ||
      (after.strokeGradient != null &&
        before.strokeGradient != null &&
        serializeGradientElementToOuterHtml(after.strokeGradient) ===
          serializeGradientElementToOuterHtml(before.strokeGradient));
    if (
      after.fill === before.fill &&
      after.stroke === before.stroke &&
      after.strokeWidth === before.strokeWidth &&
      fillGradSame &&
      strokeGradSame
    ) {
      return null;
    }

    return new UpdateDrawingDefaultsCommand(this.drawingDefaults, before, after, 'all');
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
        { ...defaultsBefore, fill: cleared ? 'none' : color, fillGradient: null },
        'fill'
      )
    );
    this.pushCommand(commands, cleared ? 'Clear fill' : `Change fill to ${color}`);
    if (shapes.length > 0) {
      if (cleared) {
        this.shapeSelection.patchAllSelected({
          fill: undefined,
          fillPaintType: 'none',
          fillUrl: undefined,
          fillSource: { kind: 'default' }
        });
      } else {
        this.shapeSelection.patchAllSelected({
          fill: color,
          fillPaintType: 'solid',
          fillUrl: undefined,
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
          { ...defaultsBefore, stroke: 'none', strokeGradient: null },
          'stroke'
        )
      );
      this.pushCommand(commands, 'Remove stroke');
      if (shapes.length > 0) {
        this.shapeSelection.patchAllSelected({
          stroke: undefined,
          strokeWidth: 0,
          strokePaintType: 'none',
          strokeUrl: undefined,
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
        { ...defaultsBefore, stroke: color, strokeGradient: null },
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
        strokePaintType: 'solid',
        strokeUrl: undefined,
        strokeSource: OVERRIDE_PAINT_SOURCE
      });
    } else {
      this.shapeSelection.patchAllSelected({
        stroke: color,
        strokePaintType: 'solid',
        strokeUrl: undefined,
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

  applyFillOpacity(opacity: number): void {
    if (this.shouldBlockShapeOnlyMutations()) return;
    if (!Number.isFinite(opacity)) return;
    const commands = this.selectedShapesList().map(
      (s) => new FillOpacityCommand(this.paintSvg, s.id, s.fillOpacity ?? 1, opacity)
    );
    this.pushCommand(commands, `Change fill opacity to ${opacity}`);
    this.shapeSelection.patchAllSelected({ fillOpacity: opacity });
  }

  applyStrokeOpacity(opacity: number): void {
    if (this.shouldBlockShapeOnlyMutations()) return;
    if (!Number.isFinite(opacity)) return;
    const commands = this.selectedShapesList().map(
      (s) => new StrokeOpacityCommand(this.paintSvg, s.id, s.strokeOpacity ?? 1, opacity)
    );
    this.pushCommand(commands, `Change stroke opacity to ${opacity}`);
    this.shapeSelection.patchAllSelected({ strokeOpacity: opacity });
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

  applyTextDominantBaselineFromChrome(
    dominantBaseline: 'auto' | 'middle' | 'hanging' | 'text-before-edge',
    textShapes: ShapeProperties[],
    placementDefaults: boolean
  ): void {
    if (textShapes.length > 0 && this.shapeIdsTouchLocked(textShapes.map((s) => s.id))) return;
    const stored = dominantBaseline === 'auto' ? undefined : dominantBaseline;
    if (textShapes.length > 0) {
      const commands = textShapes.map(
        (s) =>
          new TextDominantBaselineCommand(
            this.propertiesSvg,
            s.id,
            s.dominantBaseline,
            stored
          )
      );
      this.pushCommandsAndSyncSelection(commands, 'Set text dominant-baseline');
      return;
    }
    if (placementDefaults) {
      const before = this.drawingDefaults.defaults();
      this.pushCommand(
        [
          new UpdateDrawingDefaultsCommand(
            this.drawingDefaults,
            before,
            { ...before, dominantBaseline },
            'typography'
          )
        ],
        'Set default text dominant-baseline'
      );
    }
  }

  applyTextLetterSpacingFromChrome(
    letterSpacing: number,
    textShapes: ShapeProperties[],
    placementDefaults: boolean
  ): void {
    if (!Number.isFinite(letterSpacing)) return;
    if (textShapes.length > 0 && this.shapeIdsTouchLocked(textShapes.map((s) => s.id))) return;
    if (textShapes.length > 0) {
      const commands = textShapes.map(
        (s) =>
          new TextLetterSpacingCommand(
            this.propertiesSvg,
            s.id,
            s.letterSpacing ?? 0,
            letterSpacing
          )
      );
      this.pushCommandsAndSyncSelection(commands, `Set letter spacing to ${letterSpacing}`);
      return;
    }
    if (placementDefaults) {
      const before = this.drawingDefaults.defaults();
      this.pushCommand(
        [
          new UpdateDrawingDefaultsCommand(
            this.drawingDefaults,
            before,
            { ...before, letterSpacing },
            'typography'
          )
        ],
        `Set default letter spacing to ${letterSpacing}`
      );
    }
  }

  applyTextWordSpacingFromChrome(
    wordSpacing: number,
    textShapes: ShapeProperties[],
    placementDefaults: boolean
  ): void {
    if (!Number.isFinite(wordSpacing)) return;
    if (textShapes.length > 0 && this.shapeIdsTouchLocked(textShapes.map((s) => s.id))) return;
    if (textShapes.length > 0) {
      const commands = textShapes.map(
        (s) =>
          new TextWordSpacingCommand(this.propertiesSvg, s.id, s.wordSpacing ?? 0, wordSpacing)
      );
      this.pushCommandsAndSyncSelection(commands, `Set word spacing to ${wordSpacing}`);
      return;
    }
    if (placementDefaults) {
      const before = this.drawingDefaults.defaults();
      this.pushCommand(
        [
          new UpdateDrawingDefaultsCommand(
            this.drawingDefaults,
            before,
            { ...before, wordSpacing },
            'typography'
          )
        ],
        `Set default word spacing to ${wordSpacing}`
      );
    }
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
    this.applyAddGradientPaintFromChrome(shape, 'fill', 'linear', solidFrom);
  }

  applyAddGradientPaintFromChrome(
    shape: ShapeProperties,
    paintProperty: 'fill' | 'stroke',
    kind: 'linear' | 'radial',
    seedFrom?: string
  ): void {
    if (this.layerSvg.isElementOrAncestorLocked(shape.id)) return;
    const fromColor = seedFrom ?? this.seedSolidColorForGradient(shape, paintProperty);
    const id = this.propertiesSvg.allocateUniqueDefId('grad');
    const model =
      kind === 'linear'
        ? defaultLinearGradientModel(id, fromColor, '#ffffff')
        : defaultRadialGradientModel(id, fromColor, '#ffffff');
    const before = this.propertiesSvg.capturePaintGradientSnapshot(shape.id, paintProperty);
    const after = this.buildGradientSnapshot(model);
    const cmds: EditorCommand[] = [
      new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, paintProperty, before, after)
    ];
    if (paintProperty === 'stroke') {
      cmds.unshift(...this.strokeBootstrapCommands(shape));
    }
    this.pushCommandsAndSyncSelection(
      cmds,
      kind === 'linear' ? `Add linear gradient ${paintProperty}` : `Add radial gradient ${paintProperty}`
    );
  }

  applyRevertGradientToSolidFromChrome(
    shape: ShapeProperties,
    paintProperty: 'fill' | 'stroke'
  ): void {
    if (this.layerSvg.isElementOrAncestorLocked(shape.id)) return;
    const before = this.propertiesSvg.capturePaintGradientSnapshot(shape.id, paintProperty);
    if (!before.gradientId) return;
    const model = this.propertiesSvg.readEditableGradientModelById(before.gradientId);
    const solid = model ? firstStopColor(model) : '#000000';
    const after: PaintGradientSnapshot = {
      gradientId: null,
      shapePaintAttr: solid,
      gradientOuterHtml: null
    };
    this.pushCommandsAndSyncSelection(
      [new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, paintProperty, before, after)],
      paintProperty === 'fill' ? 'Revert fill to solid' : 'Revert stroke to solid'
    );
  }

  applySwitchGradientKindFromChrome(
    shape: ShapeProperties,
    paintProperty: 'fill' | 'stroke',
    kind: 'linear' | 'radial'
  ): void {
    if (this.layerSvg.isElementOrAncestorLocked(shape.id)) return;
    const before = this.propertiesSvg.capturePaintGradientSnapshot(shape.id, paintProperty);
    if (!before.gradientId) return;
    const current = this.propertiesSvg.readEditableGradientModelById(before.gradientId);
    if (!current || current.kind === kind) return;
    const switched = switchGradientKindModel(current, kind);
    const after = this.buildGradientSnapshot(switched);
    const cmds: EditorCommand[] = [
      new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, paintProperty, before, after)
    ];
    if (paintProperty === 'stroke') {
      cmds.unshift(...this.strokeBootstrapCommands(shape));
    }
    this.pushCommandsAndSyncSelection(cmds, `Switch ${paintProperty} gradient to ${kind}`);
  }

  applyPaintModeFromChrome(
    shape: ShapeProperties,
    target: PaintSwatchTarget,
    mode: PaintSwatchMode
  ): void {
    if (this.layerSvg.isElementOrAncestorLocked(shape.id)) return;

    const paintType = target === 'fill' ? shape.fillPaintType : shape.strokePaintType;
    const paintUrl = target === 'fill' ? shape.fillUrl : shape.strokeUrl;

    switch (mode) {
      case 'none':
        if (target === 'fill' && paintType === 'gradient') {
          this.applyClearGradientFillToNoneFromChrome(shape);
          return;
        }
        if (target === 'fill') {
          this.applyFillColor('none');
        } else {
          this.applyStrokeColor('none');
        }
        return;
      case 'solid': {
        if (paintType === 'gradient') {
          this.applyRevertGradientToSolidFromChrome(shape, target);
          return;
        }
        if (paintType === 'pattern') {
          return;
        }
        const hasPaint =
          target === 'fill'
            ? this.hasFillColor(shape)
            : this.hasStrokeColor(shape) || (shape.strokeWidth ?? 0) > 0;
        if (!hasPaint) {
          const color = this.seedSolidColorForGradient(shape, target);
          if (target === 'fill') {
            this.applyFillColor(color);
          } else {
            this.applyStrokeColor(color);
          }
        } else if (target === 'fill' && paintType === 'none' && this.hasFillColor(shape)) {
          this.shapeSelection.patchAllSelected({
            fillPaintType: 'solid',
            fillUrl: undefined
          });
        } else if (
          target === 'stroke' &&
          paintType === 'none' &&
          (this.hasStrokeColor(shape) || (shape.strokeWidth ?? 0) > 0)
        ) {
          this.shapeSelection.patchAllSelected({
            strokePaintType: 'solid',
            strokeUrl: undefined
          });
        }
        return;
      }
      case 'linear':
      case 'radial': {
        if (paintType === 'gradient') {
          const gradId = parsePaintReferenceId(paintUrl ?? undefined);
          const model = gradId ? this.propertiesSvg.readEditableGradientModelById(gradId) : null;
          if (model?.kind === mode) return;
          if (model) {
            this.applySwitchGradientKindFromChrome(shape, target, mode);
            return;
          }
        }
        if (paintType !== 'gradient' && paintType !== 'pattern') {
          this.applyAddGradientPaintFromChrome(shape, target, mode);
        }
        return;
      }
    }
  }

  private buildGradientSnapshot(model: EditableGradientModel): PaintGradientSnapshot {
    return {
      gradientId: model.id,
      shapePaintAttr: `url(#${model.id})`,
      gradientOuterHtml: serializeGradientElementToOuterHtml(model)
    };
  }

  private applyClearGradientFillToNoneFromChrome(shape: ShapeProperties): void {
    const before = this.propertiesSvg.capturePaintGradientSnapshot(shape.id, 'fill');
    const after: PaintGradientSnapshot = {
      gradientId: null,
      shapePaintAttr: 'none',
      gradientOuterHtml: null
    };
    const defaultsBefore = this.drawingDefaults.defaults();
    const cmds: EditorCommand[] = [
      new GradientFillSnapshotCommand(this.propertiesSvg, shape.id, 'fill', before, after),
      new UpdateDrawingDefaultsCommand(
        this.drawingDefaults,
        defaultsBefore,
        { ...defaultsBefore, fill: 'none', fillGradient: null },
        'fill'
      )
    ];
    this.pushCommandsAndSyncSelection(cmds, 'Clear fill');
  }

  private seedSolidColorForGradient(shape: ShapeProperties, paintProperty: 'fill' | 'stroke'): string {
    const raw = paintProperty === 'fill' ? shape.fill : shape.stroke;
    if (raw && raw.trim() !== '' && raw.toLowerCase() !== 'none' && !raw.includes('url(')) {
      return raw;
    }
    return paintProperty === 'fill' ? '#000000' : '#000000';
  }

  private strokeBootstrapCommands(shape: ShapeProperties): EditorCommand[] {
    if (this.hasStrokeColor(shape) && (shape.strokeWidth ?? 0) > 0) {
      return [];
    }
    const w = Math.max(1, this.defaultStrokeWidthValue() > 0 ? this.defaultStrokeWidthValue() : 1);
    return [new AddStrokeCommand(this.paintSvg, shape.id, '#000000', w)];
  }
}
