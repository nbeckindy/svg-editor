import { Injectable, computed, inject } from '@angular/core';
import { PaintSourceInfo, ShapeProperties } from '../models/shape-properties.interface';
import { EditableGradientModel, parsePaintReferenceId } from '../models/svg-gradient';
import type { PaintSwatchMode } from '../components/paint-swatch-popover/paint-swatch-popover.component';
import { ChromeEditorApplyService } from './chrome-editor-apply.service';
import { DrawingStyleDefaultsService } from './drawing-style-defaults.service';
import { GRADIENT_FILL_EDITOR_SVG_PORT, LAYER_LOCK_READ_PORT } from './manipulation-port-tokens';
import { ShapeSelectionService } from './shape-selection.service';

/**
 * Selection-scoped paint presentation helpers and chrome apply wrappers
 * shared by the Colors and Stroke dock panels.
 */
@Injectable({ providedIn: 'root' })
export class SelectionPaintUiService {
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly chromeApply = inject(ChromeEditorApplyService);
  private readonly drawingDefaults = inject(DrawingStyleDefaultsService);
  private readonly gradientSvgPort = inject(GRADIENT_FILL_EDITOR_SVG_PORT);
  private readonly layerLock = inject(LAYER_LOCK_READ_PORT);

  readonly selectedShape = this.shapeSelection.selectedShape;
  readonly selectionCount = this.shapeSelection.selectionCount;
  readonly hasSelection = computed(() => this.selectionCount() > 0);

  readonly anySelectedShapeLocked = computed(() => {
    const shapes = this.shapeSelection.getSelectedShapes();
    return shapes.some((s) => this.layerLock.isElementOrAncestorLocked(s.id));
  });

  /** Neutral value for native color pickers when the selection is mixed. */
  readonly mixedColorPickerFallback = '#888888';

  private static readonly PAINT_NONE = '__none__';
  private static readonly NO_FILL_TYPES = new Set(['line', 'polyline']);

  readonly dashPresets: { label: string; value: string }[] = [
    { label: 'Solid', value: '' },
    { label: 'Dashed', value: '8,4' },
    { label: 'Dotted', value: '2,4' },
    { label: 'Dash-dot', value: '8,4,2,4' },
    { label: 'Long dash', value: '16,6' },
    { label: 'Custom', value: '__custom__' }
  ];

  selectedShapesList(): ShapeProperties[] {
    return this.shapeSelection.getSelectedShapes();
  }

  private normalizeColorKey(c: string | undefined): string {
    if (!c || !c.trim()) return SelectionPaintUiService.PAINT_NONE;
    const t = c.trim().toLowerCase();
    if (t === 'none') return SelectionPaintUiService.PAINT_NONE;
    if (/^#[0-9a-f]{3}$/.test(t)) {
      const r = t[1];
      const g = t[2];
      const b = t[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return t;
  }

  private fillKey(shape: ShapeProperties): string {
    if (!this.hasFillColor(shape)) return SelectionPaintUiService.PAINT_NONE;
    return this.normalizeColorKey(shape.fill);
  }

  private strokeKey(shape: ShapeProperties): string {
    if (!this.hasStrokeColor(shape)) return SelectionPaintUiService.PAINT_NONE;
    return this.normalizeColorKey(shape.stroke);
  }

  fillMixed(): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const keys = new Set(shapes.map((s) => this.fillKey(s)));
    return keys.size > 1;
  }

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

  fillOpacitiesMixed(): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const keys = new Set(shapes.map((s) => String(s.fillOpacity ?? 1)));
    return keys.size > 1;
  }

  strokeOpacitiesMixed(): boolean {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const keys = new Set(shapes.map((s) => String(s.strokeOpacity ?? 1)));
    return keys.size > 1;
  }

  /** True when every selected shape is `<text>` — use outline-oriented stroke labels. */
  textOutlineLabels(): boolean {
    const shapes = this.selectedShapesList();
    return shapes.length > 0 && shapes.every((s) => s.type === 'text');
  }

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

  strokePickerColor(shape: ShapeProperties): string {
    if (this.strokeMixed()) return this.mixedColorPickerFallback;
    return shape.stroke ?? this.mixedColorPickerFallback;
  }

  shapeTypeLabel(shape: ShapeProperties): string {
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return shape.type;
    const types = new Set(shapes.map((s) => s.type));
    return types.size > 1 ? 'Various' : shape.type;
  }

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

  gradientEditorSummaryLabel(paintProperty: 'fill' | 'stroke'): string {
    return paintProperty === 'fill' ? 'Edit gradient fill' : 'Edit gradient stroke';
  }

  canShowGradientEditor(shape: ShapeProperties, paintProperty: 'fill' | 'stroke'): boolean {
    if (this.selectionCount() !== 1) return false;
    const paintType = paintProperty === 'fill' ? shape.fillPaintType : shape.strokePaintType;
    return paintType === 'gradient';
  }

  paintDefIdFromUrl(url: string | undefined | null): string | null {
    return parsePaintReferenceId(url?.trim() ?? null);
  }

  supportsFill(shape: ShapeProperties): boolean {
    if (this.selectionCount() > 1) {
      return this.selectedShapesList().some(
        (s) => !SelectionPaintUiService.NO_FILL_TYPES.has(s.type)
      );
    }
    return !SelectionPaintUiService.NO_FILL_TYPES.has(shape.type);
  }

  hasFillColor(shape: ShapeProperties): boolean {
    const f = shape.fill;
    return f != null && f.trim() !== '' && f.toLowerCase() !== 'none';
  }

  hasStrokeColor(shape: ShapeProperties): boolean {
    const s = shape.stroke;
    return s != null && s.trim() !== '' && s.toLowerCase() !== 'none';
  }

  fillPaintMixed(): boolean {
    if (this.fillMixed()) return true;
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const types = new Set(
      shapes.map((s) => s.fillPaintType ?? (this.hasFillColor(s) ? 'solid' : 'none'))
    );
    if (types.size > 1) return true;
    if (types.has('gradient') || types.has('pattern')) {
      return new Set(shapes.map((s) => s.fillUrl ?? '')).size > 1;
    }
    return false;
  }

  strokePaintMixed(): boolean {
    if (this.strokeMixed()) return true;
    const shapes = this.selectedShapesList();
    if (shapes.length <= 1) return false;
    const types = new Set(
      shapes.map((s) => s.strokePaintType ?? (this.hasStrokeColor(s) ? 'solid' : 'none'))
    );
    if (types.size > 1) return true;
    if (types.has('gradient') || types.has('pattern')) {
      return new Set(shapes.map((s) => s.strokeUrl ?? '')).size > 1;
    }
    return false;
  }

  fillGradientModesDisabled(): boolean {
    return this.selectionCount() > 1;
  }

  strokeGradientModesDisabled(): boolean {
    return this.selectionCount() > 1;
  }

  gradientModelForShape(
    shape: ShapeProperties,
    paintProperty: 'fill' | 'stroke'
  ): EditableGradientModel | null {
    const url = paintProperty === 'fill' ? shape.fillUrl : shape.strokeUrl;
    const id = parsePaintReferenceId(url ?? undefined);
    if (!id) return null;
    return this.gradientSvgPort.readEditableGradientModelById(id);
  }

  fillSwatchMode(shape: ShapeProperties): PaintSwatchMode {
    if (shape.fillPaintType === 'none' || (!this.hasFillColor(shape) && shape.fillPaintType !== 'gradient')) {
      return 'none';
    }
    if (shape.fillPaintType === 'gradient') {
      const model = this.gradientModelForShape(shape, 'fill');
      return model?.kind === 'radial' ? 'radial' : 'linear';
    }
    return 'solid';
  }

  strokeSwatchMode(shape: ShapeProperties): PaintSwatchMode {
    const hasStroke =
      this.hasStrokeColor(shape) ||
      shape.strokePaintType === 'gradient' ||
      (shape.strokeWidth ?? 0) > 0;
    if (!hasStroke && shape.strokePaintType !== 'gradient') {
      return 'none';
    }
    if (shape.strokePaintType === 'gradient') {
      const model = this.gradientModelForShape(shape, 'stroke');
      return model?.kind === 'radial' ? 'radial' : 'linear';
    }
    return 'solid';
  }

  isPatternFill(shape: ShapeProperties): boolean {
    return shape.fillPaintType === 'pattern';
  }

  isPatternStroke(shape: ShapeProperties): boolean {
    return shape.strokePaintType === 'pattern';
  }

  onFillPaintModeChange(mode: PaintSwatchMode): void {
    const shape = this.selectedShape();
    if (shape && this.selectionCount() === 1 && this.supportsFill(shape)) {
      this.chromeApply.applyPaintModeFromChrome(shape, 'fill', mode);
      return;
    }
    if (mode === 'none') {
      this.chromeApply.applyFillColor('none');
      return;
    }
    if (mode === 'solid') {
      this.chromeApply.applyFillColor(this.resolveSolidFillColorForApply(shape));
    }
  }

  onStrokePaintModeChange(mode: PaintSwatchMode): void {
    const shape = this.selectedShape();
    if (shape && this.selectionCount() === 1) {
      this.chromeApply.applyPaintModeFromChrome(shape, 'stroke', mode);
      return;
    }
    if (mode === 'none') {
      this.chromeApply.applyStrokeColor('none');
      return;
    }
    if (mode === 'solid') {
      this.chromeApply.applyStrokeColor(this.resolveSolidStrokeColorForApply(shape));
    }
  }

  private resolveSolidFillColorForApply(shape: ShapeProperties | null): string {
    if (!shape) {
      const d = this.drawingDefaults.fill();
      return d && d.toLowerCase() !== 'none' ? d : '#000000';
    }
    const c = this.fillPickerColor(shape);
    return c && c.toLowerCase() !== 'none' ? c : '#000000';
  }

  private resolveSolidStrokeColorForApply(shape: ShapeProperties | null): string {
    if (!shape) {
      const d = this.drawingDefaults.stroke();
      return d && d.toLowerCase() !== 'none' ? d : '#000000';
    }
    const c = this.strokePickerColor(shape);
    return c && c.toLowerCase() !== 'none' ? c : '#000000';
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

  onFillOpacityChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const opacity = parseFloat(target.value);
    this.chromeApply.applyFillOpacity(opacity);
  }

  onStrokeOpacityChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const opacity = parseFloat(target.value);
    this.chromeApply.applyStrokeOpacity(opacity);
  }

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

  currentDashPreset(shape: ShapeProperties): string {
    if (this.dashArraysMixed()) return '';
    const current = shape.strokeDasharray ?? '';
    if (!current) return '';
    const normalized = current.replace(/\s+/g, '').replace(/,+/g, ',');
    const match = this.dashPresets.find((p) => p.value === normalized);
    return match ? match.value : '__custom__';
  }

  showCustomDashInput(shape: ShapeProperties): boolean {
    return this.currentDashPreset(shape) === '__custom__';
  }

  hasAnyStroke(): boolean {
    return this.selectedShapesList().some((s) => this.hasStrokeColor(s));
  }

  onDashPresetChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === '__custom__') return;
    this.chromeApply.applyStrokeDasharray(value);
  }

  onCustomDashArrayChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    if (!this.isValidDashArray(raw)) return;
    this.chromeApply.applyStrokeDasharray(raw);
  }

  onDashOffsetChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const offset = parseFloat(target.value);
    if (!Number.isFinite(offset)) return;
    this.chromeApply.applyStrokeDashoffset(offset);
  }

  isValidDashArray(value: string): boolean {
    if (!value.trim()) return true;
    return /^(\d+(\.\d+)?)([\s,]+\d+(\.\d+)?)*$/.test(value.trim());
  }
}
