import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { PaintSourceInfo, PaintType, ShapeProperties } from '../../models/shape-properties.interface';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { DocumentSettingsComponent } from '../document-settings/document-settings.component';
import { GradientFillEditorComponent } from '../gradient-fill-editor/gradient-fill-editor.component';
import {
  GradientFillSnapshotCommand,
  BakeFillCommand,
  BakeStrokeCommand,
  AlignCommand,
  DistributeCommand,
  FontCommand,
  TextAlignCommand,
  TextPaintOrderCommand,
  TextVectorEffectCommand,
  UpdateDrawingDefaultsCommand
} from '../../models/editor-commands';
import {
  defaultLinearGradientModel,
  parsePaintReferenceId,
  serializeGradientElementToOuterHtml
} from '../../models/svg-gradient';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { SelectionPaintApplyService } from '../../services/selection-paint-apply.service';
import { SelectionTransformReadoutService } from '../../services/selection-transform-readout.service';
import { SelectionTransformApplyService } from '../../services/selection-transform-apply.service';

@Component({
  selector: 'app-properties-panel',
  imports: [CommonModule, FormsModule, ColorPickerComponent, DocumentSettingsComponent, GradientFillEditorComponent],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.css'
})
export class PropertiesPanelComponent {
  readonly fontFamilies = [
    'Arial, sans-serif',
    'Helvetica, Arial, sans-serif',
    '"Times New Roman", serif',
    'Georgia, serif',
    '"Courier New", monospace',
    'Verdana, sans-serif'
  ] as const;

  private shapeSelectionService = inject(ShapeSelectionService);
  readonly selectedShape = this.shapeSelectionService.selectedShape;
  readonly selectionCount = this.shapeSelectionService.selectionCount;
  private svgManipulationService = inject(SvgManipulationService);
  private drawingDefaults = inject(DrawingStyleDefaultsService);
  private editorTool = inject(EditorToolService);
  private selectionPaintApply = inject(SelectionPaintApplyService);
  private readonly transformReadoutSvc = inject(SelectionTransformReadoutService);
  private readonly selectionTransformApply = inject(SelectionTransformApplyService);

  readonly selectionSkewReadout = this.transformReadoutSvc.selectionSkewReadout;
  readonly selectionTransformReadout = this.transformReadoutSvc.selectionTransformReadout;
  readonly selectionBBoxFieldModel = this.transformReadoutSvc.selectionBBoxFieldModel;

  readonly isSelectorMode = computed(() => this.editorTool.currentTool() === 'selector');
  readonly hasSelection = computed(() => this.selectionCount() > 0);
  /** Text tool active: typography controls edit placement defaults when nothing is selected. */
  readonly textToolPlacementMode = computed(() => this.editorTool.currentTool() === 'text');
  readonly paintTargetLabel = computed(() => {
    if (this.editorTool.currentTool() === 'eyedropper') {
      return 'Eyedropper: click = fill, Shift+click = stroke';
    }
    return this.hasSelection() ? 'Target: Selection + defaults' : 'Target: New shapes';
  });

  onSelectionBBoxFieldCommit(field: 'x' | 'y' | 'w' | 'h' | 'r', event: Event): void {
    this.selectionTransformApply.onBBoxFieldCommit(field, event);
  }

  readonly alignShortcutLabels = {
    left: 'Ctrl/Cmd+Shift+Left',
    center: 'Ctrl/Cmd+Shift+Down',
    right: 'Ctrl/Cmd+Shift+Right',
    top: 'Ctrl/Cmd+Shift+Up',
    middle: 'Ctrl/Cmd+Shift+M',
    bottom: 'Ctrl/Cmd+Shift+B',
    distributeHorizontal: 'Ctrl/Cmd+Shift+H',
    distributeVertical: 'Ctrl/Cmd+Shift+V'
  } as const;

  /** Neutral value for native `<input type="color">` when the selection is mixed (not shown as the real fill). */
  readonly mixedColorPickerFallback = '#888888';

  private static readonly PAINT_NONE = '__none__';

  private selectedShapesList(): ShapeProperties[] {
    return this.shapeSelectionService.getSelectedShapes();
  }

  private normalizeColorKey(c: string | undefined): string {
    if (!c || !c.trim()) return PropertiesPanelComponent.PAINT_NONE;
    const t = c.trim().toLowerCase();
    if (t === 'none') return PropertiesPanelComponent.PAINT_NONE;
    if (/^#[0-9a-f]{3}$/.test(t)) {
      const r = t[1];
      const g = t[2];
      const b = t[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return t;
  }

  private fillKey(shape: ShapeProperties): string {
    if (!this.hasFillColor(shape)) return PropertiesPanelComponent.PAINT_NONE;
    return this.normalizeColorKey(shape.fill);
  }

  private strokeKey(shape: ShapeProperties): string {
    if (!this.hasStrokeColor(shape)) return PropertiesPanelComponent.PAINT_NONE;
    return this.normalizeColorKey(shape.stroke);
  }

  /** True when two or more selected shapes disagree on resolved fill (including some with vs without fill). */
  fillMixed(): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const keys = new Set(shapes.map((s) => this.fillKey(s)));
    return keys.size > 1;
  }

  /** True when two or more selected shapes disagree on resolved stroke color. */
  strokeMixed(): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const keys = new Set(shapes.map((s) => this.strokeKey(s)));
    return keys.size > 1;
  }

  strokeWidthsMixed(): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const keys = new Set(shapes.map((s) => String(s.strokeWidth ?? 0)));
    return keys.size > 1;
  }

  opacitiesMixed(): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const keys = new Set(shapes.map((s) => String(s.opacity ?? 1)));
    return keys.size > 1;
  }

  private textSelection(): ShapeProperties[] {
    return this.selectedShapesList().filter((s) => s.type === 'text');
  }

  hasTextSelection(): boolean {
    return this.textSelection().length > 0;
  }

  /** Text typography controls: selected `<text>` or defaults while the text tool is active. */
  hasTextTypographyPanel(): boolean {
    return this.hasTextSelection() || this.textToolPlacementMode();
  }

  fontFamilyControlValue(): string {
    if (this.hasTextSelection()) return this.selectedFontFamilyValue();
    if (this.textToolPlacementMode()) return this.drawingDefaults.fontFamily();
    return 'Arial, sans-serif';
  }

  fontSizeControlValue(): string {
    if (this.hasTextSelection()) return this.selectedFontSizeValue();
    if (this.textToolPlacementMode()) return String(this.drawingDefaults.fontSize());
    return '16';
  }

  fontWeightControlValue(): string {
    if (this.hasTextSelection()) return this.selectedFontWeightValue();
    if (this.textToolPlacementMode()) return this.drawingDefaults.fontWeight();
    return 'normal';
  }

  fontStyleControlValue(): string {
    if (this.hasTextSelection()) return this.selectedFontStyleValue();
    if (this.textToolPlacementMode()) return this.drawingDefaults.fontStyle();
    return 'normal';
  }

  textAnchorControlValue(): 'start' | 'middle' | 'end' {
    if (this.hasTextSelection()) return this.selectedTextAnchorValue();
    if (this.textToolPlacementMode()) return this.drawingDefaults.textAnchor();
    return 'start';
  }

  textSelectionMixed(
    getter: (shape: ShapeProperties) => string | number | undefined
  ): boolean {
    const textShapes = this.textSelection();
    if (textShapes.length <= 1) return false;
    const keys = new Set(textShapes.map((s) => String(getter(s) ?? '')));
    return keys.size > 1;
  }

  textSelectionValue(
    getter: (shape: ShapeProperties) => string | number | undefined,
    fallback: string
  ): string {
    const textShapes = this.textSelection();
    if (textShapes.length === 0) return fallback;
    if (this.textSelectionMixed(getter)) return '';
    const value = getter(textShapes[0]);
    return value == null ? fallback : String(value);
  }

  fontFamiliesMixed(): boolean {
    return this.textSelectionMixed((s) => s.fontFamily);
  }

  fontSizesMixed(): boolean {
    return this.textSelectionMixed((s) => s.fontSize);
  }

  fontWeightsMixed(): boolean {
    return this.textSelectionMixed((s) => s.fontWeight);
  }

  fontStylesMixed(): boolean {
    return this.textSelectionMixed((s) => s.fontStyle);
  }

  textAnchorsMixed(): boolean {
    return this.textSelectionMixed((s) => s.textAnchor);
  }

  selectedFontFamilyValue(): string {
    return this.textSelectionValue((s) => s.fontFamily, 'Arial, sans-serif');
  }

  selectedFontSizeValue(): string {
    return this.textSelectionValue((s) => s.fontSize, '16');
  }

  selectedFontWeightValue(): string {
    return this.textSelectionValue((s) => s.fontWeight, 'normal');
  }

  selectedFontStyleValue(): string {
    return this.textSelectionValue((s) => s.fontStyle, 'normal');
  }

  selectedTextAnchorValue(): 'start' | 'middle' | 'end' {
    const value = this.textSelectionValue((s) => s.textAnchor, 'start');
    return value === 'middle' || value === 'end' ? value : 'start';
  }

  onFontFamilyChange(event: Event): void {
    const fontFamily = (event.target as HTMLSelectElement).value;
    const textShapes = this.textSelection();
    if (textShapes.length > 0) {
      const commands = textShapes.map((s) =>
        new FontCommand(
          this.svgManipulationService,
          s.id,
          'fontFamily',
          s.fontFamily ?? 'Arial, sans-serif',
          fontFamily
        )
      );
      this.selectionPaintApply.executeEditorCommands(commands, `Set font family to ${fontFamily}`);
      this.selectionPaintApply.syncSelectedShapesFromDom();
      return;
    }
    if (this.textToolPlacementMode()) {
      const before = this.drawingDefaults.defaults();
      this.selectionPaintApply.executeEditorCommands(
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

  onFontSizeChange(event: Event): void {
    const fontSize = Number.parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isFinite(fontSize) || fontSize <= 0) return;
    const textShapes = this.textSelection();
    if (textShapes.length > 0) {
      const commands = textShapes.map((s) =>
        new FontCommand(
          this.svgManipulationService,
          s.id,
          'fontSize',
          s.fontSize ?? 16,
          fontSize
        )
      );
      this.selectionPaintApply.executeEditorCommands(commands, `Set font size to ${fontSize}`);
      this.selectionPaintApply.syncSelectedShapesFromDom();
      return;
    }
    if (this.textToolPlacementMode()) {
      const before = this.drawingDefaults.defaults();
      this.selectionPaintApply.executeEditorCommands(
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

  onToggleBold(): void {
    const textShapes = this.textSelection();
    if (textShapes.length > 0) {
      const allBold = textShapes.every((s) => (s.fontWeight ?? 'normal') === 'bold');
      const nextWeight = allBold ? 'normal' : 'bold';
      const commands = textShapes.map((s) =>
        new FontCommand(
          this.svgManipulationService,
          s.id,
          'fontWeight',
          s.fontWeight ?? 'normal',
          nextWeight
        )
      );
      this.selectionPaintApply.executeEditorCommands(commands, `${nextWeight === 'bold' ? 'Enable' : 'Disable'} bold`);
      this.selectionPaintApply.syncSelectedShapesFromDom();
      return;
    }
    if (this.textToolPlacementMode()) {
      const before = this.drawingDefaults.defaults();
      const nextWeight = before.fontWeight === 'bold' ? 'normal' : 'bold';
      this.selectionPaintApply.executeEditorCommands(
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

  onToggleItalic(): void {
    const textShapes = this.textSelection();
    if (textShapes.length > 0) {
      const allItalic = textShapes.every((s) => (s.fontStyle ?? 'normal') === 'italic');
      const nextStyle = allItalic ? 'normal' : 'italic';
      const commands = textShapes.map((s) =>
        new FontCommand(
          this.svgManipulationService,
          s.id,
          'fontStyle',
          s.fontStyle ?? 'normal',
          nextStyle
        )
      );
      this.selectionPaintApply.executeEditorCommands(commands, `${nextStyle === 'italic' ? 'Enable' : 'Disable'} italic`);
      this.selectionPaintApply.syncSelectedShapesFromDom();
      return;
    }
    if (this.textToolPlacementMode()) {
      const before = this.drawingDefaults.defaults();
      const nextStyle: 'normal' | 'italic' = before.fontStyle === 'italic' ? 'normal' : 'italic';
      this.selectionPaintApply.executeEditorCommands(
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

  onTextAlignChange(textAnchor: 'start' | 'middle' | 'end'): void {
    const textShapes = this.textSelection();
    if (textShapes.length > 0) {
      const commands = textShapes.map((s) =>
        new TextAlignCommand(
          this.svgManipulationService,
          s.id,
          s.textAnchor ?? 'start',
          textAnchor
        )
      );
      this.selectionPaintApply.executeEditorCommands(commands, 'Set text alignment');
      this.selectionPaintApply.syncSelectedShapesFromDom();
      return;
    }
    if (this.textToolPlacementMode()) {
      const before = this.drawingDefaults.defaults();
      this.selectionPaintApply.executeEditorCommands(
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

  /** True when every selected shape is `<text>` — use outline-oriented labels and text-only extras. */
  textOutlineLabels(): boolean {
    const shapes = this.selectedShapesList();
    return shapes.length > 0 && shapes.every((s) => s.type === 'text');
  }

  private normalizeTextPaintOrderKey(raw: string | undefined): string {
    const t = (raw ?? '').trim().toLowerCase();
    if (!t || t === 'normal') return 'normal';
    if (t === 'stroke fill' || t.startsWith('stroke fill')) return 'stroke fill';
    return t;
  }

  textPaintOrdersMixed(): boolean {
    return this.textSelectionMixed((s) => this.normalizeTextPaintOrderKey(s.paintOrder));
  }

  /** `normal` | `stroke fill` | `''` when mixed / non-canonical paint-order values disagree. */
  selectedTextPaintOrderForSelect(): string {
    const texts = this.textSelection();
    if (texts.length === 0) return 'normal';
    if (this.textPaintOrdersMixed()) return '';
    return this.normalizeTextPaintOrderKey(texts[0].paintOrder);
  }

  onTextPaintOrderChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    if (raw === '') return;
    const next = raw === 'stroke fill' ? 'stroke fill' : undefined;
    const commands = this.textSelection().map(
      (s) => new TextPaintOrderCommand(this.svgManipulationService, s.id, s.paintOrder, next)
    );
    this.selectionPaintApply.executeEditorCommands(commands, next ? 'Set text paint order' : 'Reset text paint order');
    this.selectionPaintApply.syncSelectedShapesFromDom();
  }

  textVectorEffectsMixed(): boolean {
    return this.textSelectionMixed((s) => (s.vectorEffect ?? '').toLowerCase());
  }

  /** All selected text shapes use `vector-effect="non-scaling-stroke"`. */
  textNonScalingStrokeOutline(): boolean {
    const texts = this.textSelection();
    if (texts.length === 0) return false;
    return texts.every((s) => (s.vectorEffect ?? '').toLowerCase() === 'non-scaling-stroke');
  }

  onTextNonScalingStrokeChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = checked ? 'non-scaling-stroke' : undefined;
    const commands = this.textSelection().map(
      (s) =>
        new TextVectorEffectCommand(this.svgManipulationService, s.id, s.vectorEffect, next)
    );
    this.selectionPaintApply.executeEditorCommands(
      commands,
      checked ? 'Enable non-scaling text outline' : 'Disable non-scaling text outline'
    );
    this.selectionPaintApply.syncSelectedShapesFromDom();
  }

  /** All selected shapes have no visible fill — show “No fill” only in this case (not when mixed). */
  allSelectedLackFill(shape: ShapeProperties): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return !this.hasFillColor(shape);
    return shapes.every((s) => !this.hasFillColor(s));
  }

  allSelectedLackStroke(shape: ShapeProperties): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return !this.hasStrokeColor(shape);
    return shapes.every((s) => !this.hasStrokeColor(s));
  }

  fillPickerColor(shape: ShapeProperties): string {
    if (this.fillMixed()) return this.mixedColorPickerFallback;
    return shape.fill ?? this.mixedColorPickerFallback;
  }

  defaultFillPickerColor(): string {
    return this.drawingDefaults.fill();
  }

  strokePickerColor(shape: ShapeProperties): string {
    if (this.strokeMixed()) return this.mixedColorPickerFallback;
    return shape.stroke ?? this.mixedColorPickerFallback;
  }

  defaultStrokePickerColor(): string {
    return this.drawingDefaults.stroke();
  }

  defaultStrokeWidthValue(): number {
    return this.drawingDefaults.strokeWidth();
  }

  /** Default fill for new shapes is a solid color (not cleared / `none`). */
  hasDefaultSolidFill(): boolean {
    const f = this.drawingDefaults.fill();
    return f != null && f.trim() !== '' && f.toLowerCase() !== 'none';
  }

  /** Default stroke for new shapes is a visible stroke paint. */
  hasDefaultSolidStroke(): boolean {
    const s = this.drawingDefaults.stroke();
    return s != null && s.trim() !== '' && s.toLowerCase() !== 'none';
  }

  shapeTypeLabel(shape: ShapeProperties): string {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return shape.type;
    const types = new Set(shapes.map((s) => s.type));
    return types.size > 1 ? 'Various' : shape.type;
  }

  idLabel(shape: ShapeProperties): string {
    const n = this.selectionCount();
    if (n <= 1) return shape.id;
    return `${n} shapes selected`;
  }

  /**
   * Short label for where the effective (computed) paint comes from — tuned for a direct-editing UX.
   */
  paintSourceText(info: PaintSourceInfo | undefined): string {
    switch (info?.kind) {
      case 'inline-style':
        return 'Inline style';
      case 'presentation-attr':
        return 'On this shape';
      case 'class-or-stylesheet':
        return 'From CSS class or stylesheet';
      case 'inherited':
        return 'From parent';
      case 'default':
        return 'Default';
      case 'unknown':
      default:
        return 'Unknown';
    }
  }

  isClassControlled(info: PaintSourceInfo | undefined): boolean {
    return info?.kind === 'class-or-stylesheet';
  }

  shouldOfferBakeFill(shape: ShapeProperties): boolean {
    return (
      this.hasFillColor(shape) &&
      !!shape.fillSource &&
      shape.fillSource.kind !== 'presentation-attr'
    );
  }

  shouldOfferBakeStroke(shape: ShapeProperties): boolean {
    return (
      this.hasStrokeColor(shape) &&
      !!shape.strokeSource &&
      shape.strokeSource.kind !== 'presentation-attr'
    );
  }

  shouldOfferBakeFillOnAny(): boolean {
    return this.selectedShapesList().some((s) => this.shouldOfferBakeFill(s));
  }

  shouldOfferBakeStrokeOnAny(): boolean {
    return this.selectedShapesList().some((s) => this.shouldOfferBakeStroke(s));
  }

  shouldOfferSelectParentGroup(shape: ShapeProperties): boolean {
    if (this.selectionCount() > 1) return false;
    const inheritedFill = shape.fillSource?.kind === 'inherited';
    const inheritedStroke = shape.strokeSource?.kind === 'inherited';
    if (!inheritedFill && !inheritedStroke) return false;
    return !!this.svgManipulationService.getNearestGroupAncestorId(shape.id);
  }

  parentGroupId(shape: ShapeProperties): string | null {
    return this.svgManipulationService.getNearestGroupAncestorId(shape.id);
  }

  onBakeFillClick(): void {
    const commands = this.selectedShapesList()
      .filter((s) => this.shouldOfferBakeFill(s))
      .map((s) => new BakeFillCommand(this.svgManipulationService, s.id));
    this.selectionPaintApply.executeEditorCommands(commands, 'Bake fill to local');
    this.selectionPaintApply.syncSelectedShapesFromDom();
  }

  onBakeStrokeClick(): void {
    const commands = this.selectedShapesList()
      .filter((s) => this.shouldOfferBakeStroke(s))
      .map((s) => new BakeStrokeCommand(this.svgManipulationService, s.id));
    this.selectionPaintApply.executeEditorCommands(commands, 'Bake stroke to local');
    this.selectionPaintApply.syncSelectedShapesFromDom();
  }

  onSelectParentGroupClick(): void {
    if (this.selectionCount() !== 1) return;
    const shape = this.selectedShape();
    if (!shape) return;
    const parentId = this.svgManipulationService.getNearestGroupAncestorId(shape.id);
    if (!parentId) return;
    const svg = this.svgManipulationService.getSVGInstance();
    const el = svg?.findOne(`#${parentId}`) as SvgJsElement | undefined;
    if (!el) return;
    const props = this.svgManipulationService.getShapeProperties(el);
    this.shapeSelectionService.selectShape(props);
  }

  /** True when the fill is a url(#...) reference (gradient or pattern) that the hex picker can't edit. */
  isGradientOrPatternFill(shape: ShapeProperties): boolean {
    return shape.fillPaintType === 'gradient' || shape.fillPaintType === 'pattern';
  }

  /** Single solid (or none) fill selection — offer creating a new gradient fill. */
  canCreateGradientFill(shape: ShapeProperties): boolean {
    if (this.selectionCount() !== 1 || !this.supportsFill(shape)) return false;
    if (shape.fillPaintType === 'gradient' || shape.fillPaintType === 'pattern') return false;
    return true;
  }

  onCreateGradientFill(shape: ShapeProperties): void {
    if (this.selectionCount() !== 1) return;
    const from =
      shape.fill && shape.fill.trim() !== '' && shape.fill.toLowerCase() !== 'none'
        ? shape.fill
        : '#000000';
    const id = this.svgManipulationService.allocateUniqueDefId('grad');
    const model = defaultLinearGradientModel(id, from, '#ffffff');
    const before = this.svgManipulationService.capturePaintGradientSnapshot(shape.id, 'fill');
    const after = {
      gradientId: id,
      shapePaintAttr: `url(#${id})`,
      gradientOuterHtml: serializeGradientElementToOuterHtml(model)
    };
    this.selectionPaintApply.executeEditorCommands(
      [new GradientFillSnapshotCommand(this.svgManipulationService, shape.id, 'fill', before, after)],
      'Add gradient fill'
    );
    this.selectionPaintApply.syncSelectedShapesFromDom();
  }

  isGradientOrPatternStroke(shape: ShapeProperties): boolean {
    return shape.strokePaintType === 'gradient' || shape.strokePaintType === 'pattern';
  }

  paintTypeLabel(paintType: PaintType | undefined): string {
    switch (paintType) {
      case 'gradient': return 'Gradient';
      case 'pattern': return 'Pattern';
      default: return 'Reference';
    }
  }

  /** Def id extracted from a raw `url(#id)` paint reference (for inspector labels). */
  paintDefIdFromUrl(url: string | undefined | null): string | null {
    return parsePaintReferenceId(url?.trim() ?? null);
  }

  fillPaintRefAriaLabel(shape: ShapeProperties): string {
    const id = this.paintDefIdFromUrl(shape.fillUrl);
    const kind = shape.fillPaintType === 'pattern' ? 'Pattern' : 'Gradient';
    return id ? `${kind} fill, definition id ${id}` : `${kind} fill`;
  }

  strokePaintRefAriaLabel(shape: ShapeProperties): string {
    const id = this.paintDefIdFromUrl(shape.strokeUrl);
    const kind = shape.strokePaintType === 'pattern' ? 'Pattern' : 'Gradient';
    return id ? `${kind} stroke, definition id ${id}` : `${kind} stroke`;
  }

  private static readonly NO_FILL_TYPES = new Set(['line', 'polyline']);

  /** True when the shape type supports fill editing (line and polyline do not). */
  supportsFill(shape: ShapeProperties): boolean {
    if (this.selectionCount() > 1) {
      return this.selectedShapesList().some(
        (s) => !PropertiesPanelComponent.NO_FILL_TYPES.has(s.type)
      );
    }
    return !PropertiesPanelComponent.NO_FILL_TYPES.has(shape.type);
  }

  /** True when the shape has a visible fill we can edit as a hex color (not `none` / missing). */
  hasFillColor(shape: ShapeProperties): boolean {
    const f = shape.fill;
    return f != null && f.trim() !== '' && f.toLowerCase() !== 'none';
  }

  /** True when the shape has a visible stroke color (stroke width may still be set separately). */
  hasStrokeColor(shape: ShapeProperties): boolean {
    const s = shape.stroke;
    return s != null && s.trim() !== '' && s.toLowerCase() !== 'none';
  }

  onFillColorChange(color: string): void {
    this.selectionPaintApply.applyFillColor(color);
  }

  onStrokeColorChange(color: string): void {
    this.selectionPaintApply.applyStrokeColor(color);
  }

  onStrokeWidthChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const width = parseFloat(target.value);
    this.selectionPaintApply.applyStrokeWidth(width);
  }

  onOpacityChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const opacity = parseFloat(target.value);
    this.selectionPaintApply.applyOpacity(opacity);
  }

  readonly dashPresets: { label: string; value: string }[] = [
    { label: 'Solid', value: '' },
    { label: 'Dashed', value: '8,4' },
    { label: 'Dotted', value: '2,4' },
    { label: 'Dash-dot', value: '8,4,2,4' },
    { label: 'Long dash', value: '16,6' },
    { label: 'Custom', value: '__custom__' }
  ];

  /** True when selected shapes have different dash patterns. */
  dashArraysMixed(): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const keys = new Set(shapes.map((s) => s.strokeDasharray ?? ''));
    return keys.size > 1;
  }

  dashOffsetsMixed(): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const keys = new Set(shapes.map((s) => String(s.strokeDashoffset ?? 0)));
    return keys.size > 1;
  }

  /** Returns the preset value matching the current dasharray, or `'__custom__'` if none match. */
  currentDashPreset(shape: ShapeProperties): string {
    if (this.dashArraysMixed()) return '';
    const current = shape.strokeDasharray ?? '';
    if (!current) return '';
    const normalized = current.replace(/\s+/g, '').replace(/,+/g, ',');
    const match = this.dashPresets.find((p) => p.value === normalized);
    return match ? match.value : '__custom__';
  }

  /** Whether the custom dasharray text input should be shown. */
  showCustomDashInput(shape: ShapeProperties): boolean {
    return this.currentDashPreset(shape) === '__custom__';
  }

  /** True when any selected shape has a visible stroke (dash controls are only relevant with stroke). */
  hasAnyStroke(): boolean {
    return this.selectedShapesList().some((s) => this.hasStrokeColor(s));
  }

  onDashPresetChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === '__custom__') return;
    this.applyDashArray(value);
  }

  onCustomDashArrayChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    if (!this.isValidDashArray(raw)) return;
    this.applyDashArray(raw);
  }

  onDashOffsetChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const offset = parseFloat(target.value);
    if (!Number.isFinite(offset)) return;
    this.selectionPaintApply.applyStrokeDashoffset(offset);
  }

  /** Validate a custom dasharray string: comma/space-separated positive numbers. */
  isValidDashArray(value: string): boolean {
    if (!value.trim()) return true;
    return /^(\d+(\.\d+)?)([\s,]+\d+(\.\d+)?)*$/.test(value.trim());
  }

  private applyDashArray(dasharray: string): void {
    this.selectionPaintApply.applyStrokeDasharray(dasharray);
  }

  onClearSelection(): void {
    this.shapeSelectionService.clearSelection();
    this.svgManipulationService.clearHighlight();
  }

  canAlignSelection(): boolean {
    return this.selectionCount() >= 2;
  }

  canDistributeSelection(): boolean {
    return this.selectionCount() >= 3;
  }

  onAlign(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    const ids = this.selectedShapesList().map((shape) => shape.id);
    if (ids.length < 2) return;
    this.selectionPaintApply.executeEditorCommands([new AlignCommand(this.svgManipulationService, ids, direction)]);
    this.selectionPaintApply.syncSelectedShapesFromDom();
  }

  onDistribute(direction: 'horizontal' | 'vertical'): void {
    const ids = this.selectedShapesList().map((shape) => shape.id);
    if (ids.length < 3) return;
    this.selectionPaintApply.executeEditorCommands([new DistributeCommand(this.svgManipulationService, ids, direction)]);
    this.selectionPaintApply.syncSelectedShapesFromDom();
  }
}
