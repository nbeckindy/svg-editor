import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { PaintSourceInfo, PaintType, ShapeProperties } from '../../models/shape-properties.interface';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { DocumentSettingsComponent } from '../document-settings/document-settings.component';
import { GradientFillEditorComponent } from '../gradient-fill-editor/gradient-fill-editor.component';
import { parsePaintReferenceId } from '../../models/svg-gradient';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { SelectionTransformReadoutService } from '../../services/selection-transform-readout.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { PathNodeEditCommandBridgeService } from '../../services/path-node-edit-command-bridge.service';

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
  private drawingDefaults = inject(DrawingStyleDefaultsService);
  private editorTool = inject(EditorToolService);
  private chromeApply = inject(ChromeEditorApplyService);
  private readonly transformReadoutSvc = inject(SelectionTransformReadoutService);
  private readonly svgManipulation = inject(SvgManipulationService);
  private readonly pathNodeEditBridge = inject(PathNodeEditCommandBridgeService);

  readonly pathNodeBridgeChrome = this.pathNodeEditBridge.chrome;
  readonly selectionSkewReadout = this.transformReadoutSvc.selectionSkewReadout;
  readonly selectionTransformReadout = this.transformReadoutSvc.selectionTransformReadout;
  readonly selectionBBoxFieldModel = this.transformReadoutSvc.selectionBBoxFieldModel;

  readonly isSelectorMode = computed(() => this.editorTool.currentTool() === 'selector');
  readonly hasSelection = computed(() => this.selectionCount() > 0);
  /**
   * True when the current selection includes any shape under a locked layer row
   * (paint, stroke, opacity, dash, bbox, align, etc. are blocked in chrome apply).
   */
  readonly anySelectedShapeLocked = computed(() => {
    const shapes = this.shapeSelectionService.getSelectedShapes();
    return shapes.some((s) => this.svgManipulation.isElementOrAncestorLocked(s.id));
  });
  /**
   * True when selected `<text>` nodes include any that are under a lock
   * (typography commands are blocked only for those paths).
   */
  readonly textSelectionTouchesLocked = computed(() => {
    const texts = this.shapeSelectionService.getSelectedShapes().filter((s) => s.type === 'text');
    return texts.length > 0 && texts.some((t) => this.svgManipulation.isElementOrAncestorLocked(t.id));
  });
  /** Text tool active: typography controls edit placement defaults when nothing is selected. */
  readonly textToolPlacementMode = computed(() => this.editorTool.currentTool() === 'text');
  /** Node-edit path anchor tools (driven by svg-canvas via {@link PathNodeEditCommandBridgeService}). */
  readonly showPathNodeAnchorTools = computed(
    () =>
      this.editorTool.currentTool() === 'node-edit-selector' &&
      this.pathNodeBridgeChrome().hasSelectedPathNode
  );
  readonly pathNodeCornerDisabled = computed(() => {
    const c = this.pathNodeBridgeChrome();
    return c.pathLocked || !c.cornerEnabled;
  });
  readonly pathNodeMirrorDisabled = computed(() => {
    const c = this.pathNodeBridgeChrome();
    return c.pathLocked || !c.mirrorCubicEnabled;
  });
  readonly paintTargetLabel = computed(() => {
    if (this.editorTool.currentTool() === 'eyedropper') {
      return 'Eyedropper: click = fill, Shift+click = stroke';
    }
    return this.hasSelection() ? 'Target: Selection + defaults' : 'Target: New shapes';
  });

  onSelectionBBoxFieldCommit(field: 'x' | 'y' | 'w' | 'h' | 'r', event: Event): void {
    this.chromeApply.onSelectionBBoxFieldCommit(field, event);
  }

  onPathNodeCornerAnchorClick(): void {
    this.pathNodeEditBridge.convertSelectedAnchorToCorner();
  }

  onPathNodeMirrorCubicClick(): void {
    this.pathNodeEditBridge.convertSelectedAnchorToMirrorCubic();
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
    this.chromeApply.applyTextFontFamilyFromChrome(
      fontFamily,
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  onFontSizeChange(event: Event): void {
    const fontSize = Number.parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isFinite(fontSize) || fontSize <= 0) return;
    this.chromeApply.applyTextFontSizeFromChrome(
      fontSize,
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  onToggleBold(): void {
    this.chromeApply.applyTextToggleBoldFromChrome(
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  onToggleItalic(): void {
    this.chromeApply.applyTextToggleItalicFromChrome(
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  onTextAlignChange(textAnchor: 'start' | 'middle' | 'end'): void {
    this.chromeApply.applyTextAnchorFromChrome(
      textAnchor,
      this.textSelection(),
      this.textToolPlacementMode()
    );
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
    this.chromeApply.applyTextPaintOrderFromChrome(this.textSelection(), next);
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
    this.chromeApply.applyTextVectorEffectFromChrome(this.textSelection(), next);
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
    return !!this.chromeApply.getNearestGroupAncestorId(shape.id);
  }

  parentGroupId(shape: ShapeProperties): string | null {
    return this.chromeApply.getNearestGroupAncestorId(shape.id);
  }

  onBakeFillClick(): void {
    this.chromeApply.applyBakeFillFromChrome(
      this.selectedShapesList().filter((s) => this.shouldOfferBakeFill(s))
    );
  }

  onBakeStrokeClick(): void {
    this.chromeApply.applyBakeStrokeFromChrome(
      this.selectedShapesList().filter((s) => this.shouldOfferBakeStroke(s))
    );
  }

  onSelectParentGroupClick(): void {
    this.chromeApply.selectParentGroupForSingleSelection();
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
    this.chromeApply.applyAddLinearGradientFillFromChrome(shape, from);
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
    this.chromeApply.applyFillColor(color);
  }

  onStrokeColorChange(color: string): void {
    this.chromeApply.applyStrokeColor(color);
  }

  onStrokeWidthChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const width = parseFloat(target.value);
    this.chromeApply.applyStrokeWidth(width);
  }

  onOpacityChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const opacity = parseFloat(target.value);
    this.chromeApply.applyOpacity(opacity);
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
    this.chromeApply.applyStrokeDashoffset(offset);
  }

  /** Validate a custom dasharray string: comma/space-separated positive numbers. */
  isValidDashArray(value: string): boolean {
    if (!value.trim()) return true;
    return /^(\d+(\.\d+)?)([\s,]+\d+(\.\d+)?)*$/.test(value.trim());
  }

  private applyDashArray(dasharray: string): void {
    this.chromeApply.applyStrokeDasharray(dasharray);
  }

  onClearSelection(): void {
    this.chromeApply.clearInspectorSelection();
  }

  canAlignSelection(): boolean {
    return this.selectionCount() >= 2;
  }

  canDistributeSelection(): boolean {
    return this.selectionCount() >= 3;
  }

  onAlign(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    const ids = this.selectedShapesList().map((shape) => shape.id);
    this.chromeApply.applyAlignFromChrome(direction, ids);
  }

  onDistribute(direction: 'horizontal' | 'vertical'): void {
    const ids = this.selectedShapesList().map((shape) => shape.id);
    this.chromeApply.applyDistributeFromChrome(direction, ids);
  }
}
