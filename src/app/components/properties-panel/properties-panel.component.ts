import { Component, computed, inject } from '@angular/core';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { SelectionTransformReadoutService } from '../../services/selection-transform-readout.service';
import { LAYER_LOCK_READ_PORT } from '../../services/manipulation-port-tokens';

@Component({
  selector: 'app-properties-panel',
  imports: [],
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
  private readonly layerLock = inject(LAYER_LOCK_READ_PORT);
  readonly selectionSkewReadout = this.transformReadoutSvc.selectionSkewReadout;
  readonly selectionTransformReadout = this.transformReadoutSvc.selectionTransformReadout;
  readonly selectionBBoxFieldModel = this.transformReadoutSvc.selectionBBoxFieldModel;

  readonly hasSelection = computed(() => this.selectionCount() > 0);
  /**
   * True when the current selection includes any shape under a locked layer row
   * (bbox and related chrome apply paths are blocked).
   */
  readonly anySelectedShapeLocked = computed(() => {
    const shapes = this.shapeSelectionService.getSelectedShapes();
    return shapes.some((s) => this.layerLock.isElementOrAncestorLocked(s.id));
  });
  /**
   * True when selected `<text>` nodes include any that are under a lock
   * (typography commands are blocked only for those paths).
   */
  readonly textSelectionTouchesLocked = computed(() => {
    const texts = this.shapeSelectionService.getSelectedShapes().filter((s) => s.type === 'text');
    return texts.length > 0 && texts.some((t) => this.layerLock.isElementOrAncestorLocked(t.id));
  });
  /** Text tool active: typography controls edit placement defaults when nothing is selected. */
  readonly textToolPlacementMode = computed(() => this.editorTool.currentTool() === 'text');

  onSelectionBBoxFieldCommit(field: 'x' | 'y' | 'w' | 'h' | 'r', event: Event): void {
    this.chromeApply.onSelectionBBoxFieldCommit(field, event);
  }

  private selectedShapesList(): ShapeProperties[] {
    return this.shapeSelectionService.getSelectedShapes();
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

  private rectSelection(): ShapeProperties[] {
    return this.selectedShapesList().filter((s) => s.type === 'rect');
  }

  hasRectSelection(): boolean {
    return this.rectSelection().length > 0;
  }

  /** Linked corner radius when rx and ry match; null when asymmetric. */
  private effectiveCornerRadius(shape: ShapeProperties): number | null {
    const rx = shape.rx ?? 0;
    const ry = shape.ry ?? shape.rx ?? 0;
    if (rx !== ry) return null;
    return rx;
  }

  rectCornerRadiiMixed(): boolean {
    const rects = this.rectSelection();
    if (rects.length === 0) return false;
    if (rects.some((s) => this.effectiveCornerRadius(s) === null)) return true;
    if (rects.length <= 1) return false;
    const keys = new Set(rects.map((s) => String(this.effectiveCornerRadius(s))));
    return keys.size > 1;
  }

  /** Slider max = smallest per-rect clamp limit so full travel reaches max on every selected rect. */
  rectCornerRadiusSliderMax(): number {
    const rects = this.rectSelection();
    if (rects.length === 0) return 0;
    const limits = rects
      .map((s) => s.rectMaxCornerRadius)
      .filter((m): m is number => m != null && Number.isFinite(m) && m > 0);
    if (limits.length === 0) return 0;
    return Math.min(...limits);
  }

  rectCornerRadiusValue(): number {
    const rects = this.rectSelection();
    if (rects.length === 0 || this.rectCornerRadiiMixed()) return 0;
    return this.effectiveCornerRadius(rects[0]!) ?? 0;
  }

  onRectCornerRadiusChange(event: Event): void {
    if (this.rectCornerRadiiMixed()) return;
    const raw = (event.target as HTMLInputElement).value.trim();
    if (raw === '') return;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    this.chromeApply.applyRectCornerRadiusFromChrome(parsed);
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

  onSelectParentGroupClick(): void {
    this.chromeApply.selectParentGroupForSingleSelection();
  }

  onClearSelection(): void {
    this.chromeApply.clearInspectorSelection();
  }
}
