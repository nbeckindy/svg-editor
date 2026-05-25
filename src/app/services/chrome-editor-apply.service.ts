import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ChromeEditorApplySvgPort } from '../history/chrome-editor-apply-svg.port';
import type { LayerReorderGroupSvgPort } from '../history/layers-panel-svg.port';
import type { PropertiesPanelSvgPort } from '../history/properties-panel-svg.port';
import type { SelectionTransformApplySvgPort } from '../history/transform-gesture-svg.port';
import { ShapeSelectionService } from './shape-selection.service';
import { SvgManipulationService } from './svg-manipulation.service';
import { DrawingStyleDefaultsService } from './drawing-style-defaults.service';
import { EditorHistoryService } from './editor-history.service';
import { EditorToolService } from './editor-tool.service';
import { SelectionTransformReadoutService } from './selection-transform-readout.service';
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
  StrokeDashOffsetCommand,
  TranslateCommand,
  UnionScaleCommand,
  UnionRotateCommand,
  ReorderCommand,
  buildReorderToExtremeCommand,
  ToggleVisibilityCommand,
  ToggleLayerLockCommand,
  ReorderBeforeSiblingCommand,
  GroupCommand,
  UngroupCommand,
  UngroupElementsCommand,
  FontCommand,
  TextAlignCommand,
  TextPaintOrderCommand,
  TextVectorEffectCommand,
  GradientFillSnapshotCommand,
  BakeFillCommand,
  BakeStrokeCommand,
  AlignCommand,
  DistributeCommand
} from '../models/editor-commands';
import { defaultLinearGradientModel, serializeGradientElementToOuterHtml } from '../models/svg-gradient';
import { MIN_UNION_SIZE } from '../utils/selection-resize';
import { unionRotationPivot } from '../utils/selection-rotate';
import {
  ROTATION_MIXED_EPS_DEG,
  isFinitePositiveDim,
  normDeg0To360,
  shortestSignedDeltaDeg
} from '../utils/selection-transform-matrix';

const OVERRIDE_PAINT_SOURCE: PaintSourceInfo = { kind: 'presentation-attr' };

/**
 * **Chrome** write path for the **Editor runtime**: **History** (`pushAndExecute`), **Live tree**
 * mutations via `EditorCommand`s, and **Selection** patches / DOM sync — paint, properties
 * inspector actions, bbox fields, eyedropper, and layers panel history.
 */
@Injectable({
  providedIn: 'root'
})
export class ChromeEditorApplyService {
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly paintSvg: ChromeEditorApplySvgPort = inject(SvgManipulationService);
  private readonly propertiesSvg: PropertiesPanelSvgPort = inject(SvgManipulationService);
  private readonly layerSvg: LayerReorderGroupSvgPort = inject(SvgManipulationService);
  private readonly transformSvg: SelectionTransformApplySvgPort = inject(SvgManipulationService);
  private readonly drawingDefaults = inject(DrawingStyleDefaultsService);
  private readonly editorHistory = inject(EditorHistoryService);
  private readonly editorTool = inject(EditorToolService);
  private readonly transformReadout = inject(SelectionTransformReadoutService);

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

  applyAlignFromChrome(
    direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
    shapeIds: string[]
  ): void {
    if (shapeIds.length < 2) return;
    if (this.shapeIdsTouchLocked(shapeIds)) return;
    this.pushCommandsAndSyncSelection(
      [new AlignCommand(this.propertiesSvg, shapeIds, direction)],
      undefined
    );
  }

  applyDistributeFromChrome(direction: 'horizontal' | 'vertical', shapeIds: string[]): void {
    if (shapeIds.length < 3) return;
    if (this.shapeIdsTouchLocked(shapeIds)) return;
    this.pushCommandsAndSyncSelection(
      [new DistributeCommand(this.propertiesSvg, shapeIds, direction)],
      undefined
    );
  }

  /** Properties panel: nearest `<g>` ancestor for inherited paint / "select parent". */
  getNearestGroupAncestorId(shapeId: string): string | null {
    return this.propertiesSvg.getNearestGroupAncestorId(shapeId);
  }

  /** Properties panel: select parent `<g>` when exactly one shape is selected. */
  selectParentGroupForSingleSelection(): void {
    const list = this.selectedShapesList();
    if (list.length !== 1) return;
    const shape = list[0]!;
    const parentId = this.propertiesSvg.getNearestGroupAncestorId(shape.id);
    if (!parentId) return;
    const svg = this.propertiesSvg.getSVGInstance();
    const el = svg?.findOne(`#${parentId}`) as SvgJsElement | undefined;
    if (!el) return;
    this.shapeSelection.selectShape(this.propertiesSvg.getShapeProperties(el));
  }

  /** Properties panel: clear **Selection** and editor chrome highlight (e.g. dash preview). */
  clearInspectorSelection(): void {
    this.shapeSelection.clearSelection();
    this.propertiesSvg.clearHighlight();
  }

  /**
   * Commit a numeric bbox / rotation edit from the properties panel (same semantics as **Canvas**
   * union transforms).
   */
  onSelectionBBoxFieldCommit(field: 'x' | 'y' | 'w' | 'h' | 'r', event: Event): void {
    if (this.editorTool.currentTool() !== 'selector') return;
    const target = event.target as HTMLInputElement;
    const raw = target.value.trim();
    if (raw === '') return;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return;

    const model = this.transformReadout.selectionBBoxFieldModel();
    if (!model || !model.ok) return;
    const { ids, union: unionBefore } = model;
    if (this.shapeIdsTouchLocked(ids)) return;
    const epsPos = 1e-6;

    if (field === 'x') {
      const dx = parsed - unionBefore.x;
      if (Math.abs(dx) < epsPos) return;
      const snap = this.transformSvg.snapshotSelectionTransforms(ids);
      const cmds = ids.map((id) => new TranslateCommand(this.transformSvg, id, dx, 0, snap));
      this.pushCommandsAndSyncSelection(cmds, `Set selection X to ${parsed}`);
      return;
    }

    if (field === 'y') {
      const dy = parsed - unionBefore.y;
      if (Math.abs(dy) < epsPos) return;
      const snap = this.transformSvg.snapshotSelectionTransforms(ids);
      const cmds = ids.map((id) => new TranslateCommand(this.transformSvg, id, 0, dy, snap));
      this.pushCommandsAndSyncSelection(cmds, `Set selection Y to ${parsed}`);
      return;
    }

    if (field === 'w') {
      if (!isFinitePositiveDim(parsed) || parsed < MIN_UNION_SIZE) return;
      if (Math.abs(parsed - unionBefore.width) < epsPos) return;
      const unionAfter = { ...unionBefore, width: parsed };
      const snap = this.transformSvg.snapshotSelectionTransforms(ids);
      const ve = this.transformSvg.snapshotVectorEffectsForShapes(ids);
      this.pushCommandsAndSyncSelection(
        [new UnionScaleCommand(this.transformSvg, ids, unionBefore, unionAfter, snap, 'e', ve)],
        `Set selection width to ${parsed}`
      );
      return;
    }

    if (field === 'h') {
      if (!isFinitePositiveDim(parsed) || parsed < MIN_UNION_SIZE) return;
      if (Math.abs(parsed - unionBefore.height) < epsPos) return;
      const unionAfter = { ...unionBefore, height: parsed };
      const snap = this.transformSvg.snapshotSelectionTransforms(ids);
      const ve = this.transformSvg.snapshotVectorEffectsForShapes(ids);
      this.pushCommandsAndSyncSelection(
        [new UnionScaleCommand(this.transformSvg, ids, unionBefore, unionAfter, snap, 's', ve)],
        `Set selection height to ${parsed}`
      );
      return;
    }

    if (field === 'r') {
      if (model.rMixed || model.rDeg == null || !Number.isFinite(model.rDeg)) return;
      const rTarget = normDeg0To360(parsed);
      if (!Number.isFinite(rTarget)) return;
      const delta = shortestSignedDeltaDeg(model.rDeg, rTarget);
      if (Math.abs(delta) < ROTATION_MIXED_EPS_DEG) return;
      const pivot =
        this.transformSvg.getSelectionRotationPivot(ids) ?? unionRotationPivot(unionBefore);
      const snap = this.transformSvg.snapshotSelectionTransforms(ids);
      this.pushCommandsAndSyncSelection(
        [new UnionRotateCommand(this.transformSvg, ids, pivot, delta, snap)],
        `Rotate selection toward ${rTarget}°`
      );
    }
  }

  toggleLayerVisibility(layerId: string): void {
    this.editorHistory.pushAndExecute(new ToggleVisibilityCommand(this.layerSvg, layerId));
  }

  toggleLayerLock(layerId: string): void {
    this.editorHistory.pushAndExecute(new ToggleLayerLockCommand(this.layerSvg, layerId));
  }

  moveLayerBeforeSibling(draggedLayerId: string, referenceNextSiblingId: string | null): void {
    this.editorHistory.pushAndExecute(
      new ReorderBeforeSiblingCommand(this.layerSvg, draggedLayerId, referenceNextSiblingId)
    );
  }

  moveLayerForward(layerId: string): void {
    this.editorHistory.pushAndExecute(new ReorderCommand(this.layerSvg, layerId, 'forward'));
  }

  moveLayerBackward(layerId: string): void {
    this.editorHistory.pushAndExecute(new ReorderCommand(this.layerSvg, layerId, 'backward'));
  }

  moveLayerToFront(layerId: string): void {
    const cmd = buildReorderToExtremeCommand(this.layerSvg, [layerId], 'front');
    if (cmd) this.editorHistory.pushAndExecute(cmd);
  }

  moveLayerToBack(layerId: string): void {
    const cmd = buildReorderToExtremeCommand(this.layerSvg, [layerId], 'back');
    if (cmd) this.editorHistory.pushAndExecute(cmd);
  }

  groupSelectedFromLayersPanel(selectedShapeIds: string[]): void {
    if (selectedShapeIds.length < 2) return;
    if (this.shapeIdsTouchLocked(selectedShapeIds)) return;
    const cmd = new GroupCommand(this.layerSvg, selectedShapeIds);
    this.editorHistory.pushAndExecute(cmd);
    const newGroupId = cmd.createdGroupId;
    if (newGroupId) {
      const svg = this.paintSvg.getSVGInstance();
      const groupEl = svg?.findOne(`#${newGroupId}`) as SvgJsElement | undefined;
      if (groupEl) {
        this.shapeSelection.selectShapes([this.propertiesSvg.getShapeProperties(groupEl)]);
      }
    }
  }

  ungroupSelectedFromLayersPanel(groupIds: string[]): void {
    if (groupIds.length === 0) return;
    if (groupIds.some((id) => this.layerSvg.isElementOrAncestorLocked(id))) return;
    const svg = this.paintSvg.getSVGInstance();
    if (!svg) return;

    const selectFreedChildren = (childIds: string[]): void => {
      const shapes = childIds
        .map((id) => svg.findOne(`#${id}`) as SvgJsElement | null)
        .filter((el): el is SvgJsElement => el != null)
        .map((el) => this.propertiesSvg.getShapeProperties(el));
      if (shapes.length > 0) {
        this.shapeSelection.selectShapes(shapes);
      } else {
        this.shapeSelection.clearSelection();
      }
    };

    if (groupIds.length === 1) {
      const groupId = groupIds[0];
      const childIds: string[] = [];
      const groupNode = svg.findOne(`#${groupId}`)?.node;
      if (groupNode) {
        for (const child of Array.from(groupNode.children)) {
          if (child.id) childIds.push(child.id);
        }
      }
      this.editorHistory.pushAndExecute(new UngroupCommand(this.layerSvg, groupId));
      selectFreedChildren(childIds);
    } else {
      const multi = new UngroupElementsCommand(this.layerSvg, groupIds);
      this.editorHistory.pushAndExecute(multi);
      selectFreedChildren(multi.ungroupedChildIds);
    }
  }

  /** Re-read selected nodes from the **Live tree** into **Selection** (after transform commands). */
  syncSelectedShapesFromDom(): void {
    const svg = this.paintSvg.getSVGInstance();
    if (!svg) return;
    const next = this.selectedShapesList().map((s) => {
      const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
      return el ? this.paintSvg.getShapeProperties(el) : s;
    });
    this.shapeSelection.selectShapes(next);
  }

  private selectedShapesList(): ShapeProperties[] {
    return this.shapeSelection.getSelectedShapes();
  }

  /** True when current **Selection** includes any shape under a **Layer lock** row. */
  private shouldBlockShapeOnlyMutations(): boolean {
    const shapes = this.selectedShapesList();
    return shapes.length > 0 && shapes.some((s) => this.layerSvg.isElementOrAncestorLocked(s.id));
  }

  private shapeIdsTouchLocked(ids: string[]): boolean {
    return ids.some((id) => this.layerSvg.isElementOrAncestorLocked(id));
  }

  private hasStrokeColor(shape: ShapeProperties): boolean {
    const s = shape.stroke;
    return s != null && s.trim() !== '' && s.toLowerCase() !== 'none';
  }

  private defaultStrokeWidthValue(): number {
    return this.drawingDefaults.strokeWidth();
  }

  private pushCommandsAndSyncSelection(
    commands: EditorCommand[],
    fallbackDescription?: string
  ): void {
    this.pushCommand(commands, fallbackDescription);
    this.syncSelectedShapesFromDom();
  }

  private pushCommand(commands: EditorCommand[], fallbackDescription?: string): void {
    if (commands.length === 0) return;
    this.editorHistory.pushAndExecute(
      commands.length === 1 ? commands[0] : new CompositeCommand(commands, fallbackDescription)
    );
  }
}
