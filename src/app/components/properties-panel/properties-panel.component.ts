import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Element as SvgJsElement, Matrix } from '@svgdotjs/svg.js';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { PaintSourceInfo, PaintType, ShapeProperties } from '../../models/shape-properties.interface';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { DocumentSettingsComponent } from '../document-settings/document-settings.component';
import {
  EditorCommand,
  CompositeCommand,
  FillColorCommand,
  StrokeColorCommand,
  AddStrokeCommand,
  RemoveStrokeCommand,
  SetStrokeCommand,
  OpacityCommand,
  BakeFillCommand,
  BakeStrokeCommand,
  StrokeDashArrayCommand,
  StrokeDashOffsetCommand,
  AlignCommand,
  DistributeCommand
} from '../../models/editor-commands';

@Component({
  selector: 'app-properties-panel',
  imports: [CommonModule, FormsModule, ColorPickerComponent, DocumentSettingsComponent],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.css'
})
export class PropertiesPanelComponent {
  private shapeSelectionService = inject(ShapeSelectionService);
  readonly selectedShape = this.shapeSelectionService.selectedShape;
  readonly selectionCount = this.shapeSelectionService.selectionCount;
  private svgManipulationService = inject(SvgManipulationService);
  private editorHistory = inject(EditorHistoryService);
  private editorTool = inject(EditorToolService);
  readonly isSelectorMode = computed(() => this.editorTool.currentTool() === 'selector');

  /**
   * Matrix-derived skew angles (degrees). Approximate when rotation and skew are combined.
   * `skewX ≈ atan2(c, a)`, `skewY ≈ atan2(b, d)` in root transform space.
   */
  readonly selectionSkewReadout = computed(() => {
    this.editorHistory.revision();
    this.svgManipulationService.documentRevision();

    if (this.editorTool.currentTool() !== 'selector') {
      return { skewX: '—' as const, skewY: '—' as const };
    }

    const shapes = this.shapeSelectionService.selectedShapes();
    if (shapes.length === 0) {
      return { skewX: '—' as const, skewY: '—' as const };
    }

    const svg = this.svgManipulationService.getSVGInstance();
    if (!svg) {
      return { skewX: '—' as const, skewY: '—' as const };
    }

    const pairs: { sx: number; sy: number }[] = [];
    for (const s of shapes) {
      const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
      if (!el || typeof el.matrix !== 'function') continue;
      const m = el.matrix() as Matrix;
      const { skewX, skewY } = PropertiesPanelComponent.skewDegFromMatrix(m);
      if (!Number.isFinite(skewX) || !Number.isFinite(skewY)) continue;
      pairs.push({ sx: skewX, sy: skewY });
    }

    if (pairs.length === 0) {
      return { skewX: '—' as const, skewY: '—' as const };
    }

    const fmt = (n: number) => `${n.toFixed(1)}°`;
    const sx0 = pairs[0].sx;
    const sy0 = pairs[0].sy;
    const skewX =
      shapes.length > 1 && pairs.some((p) => Math.abs(p.sx - sx0) > 0.05) ? ('Mixed' as const) : fmt(sx0);
    const skewY =
      shapes.length > 1 && pairs.some((p) => Math.abs(p.sy - sy0) > 0.05) ? ('Mixed' as const) : fmt(sy0);
    return { skewX, skewY };
  });

  /** Degrees: treat rotations as equivalent modulo 360° (e.g. 0° vs 360°). */
  private static readonly ROTATION_MIXED_EPS_DEG = 0.05;

  private static rotationDiffDeg(a: number, b: number): number {
    let d = Math.abs(a - b) % 360;
    if (d > 180) d = 360 - d;
    return d;
  }

  /** Map any finite angle in degrees to `[0, 360)`. */
  private static normDeg0To360(deg: number): number {
    if (!Number.isFinite(deg)) return NaN;
    return ((deg % 360) + 360) % 360;
  }

  /**
   * Rotation (degrees, 0–360) from the element’s cumulative transform in **root SVG user space**.
   * Uses the linear 2×2 part of the SVG `matrix(a,b,c,d,e,f)` where `x' = a·x + c·y + e`,
   * `y' = b·x + d·y + f`. The image of the local +X axis is `(a, b)`, so
   * **θ = atan2(b, a)** (same atan2 idea as skew readout’s `atan2` on matrix entries).
   * With non-uniform scale or skew this is an effective “X-axis” angle, not a unique Euler triple.
   */
  private static rotationDeg0To360FromMatrix(m: Matrix): number {
    const v = m.valueOf() as { a: number; b: number; c: number; d: number };
    const rad = Math.atan2(v.b, v.a);
    return PropertiesPanelComponent.normDeg0To360((rad * 180) / Math.PI);
  }

  /**
   * Read-only X/Y/W/H from union bbox in root SVG user space (`getUnionBBox`), and R from
   * per-element matrix rotation (see `rotationDeg0To360FromMatrix`). Multi-select: union bbox;
   * R is **Mixed** when per-shape angles differ beyond `ROTATION_MIXED_EPS_DEG`.
   */
  readonly selectionTransformReadout = computed(() => {
    this.editorHistory.revision();
    this.svgManipulationService.documentRevision();

    const dash = '—' as const;
    if (this.editorTool.currentTool() !== 'selector') {
      return { x: dash, y: dash, w: dash, h: dash, r: dash };
    }

    const shapes = this.shapeSelectionService.selectedShapes();
    if (shapes.length === 0) {
      return { x: dash, y: dash, w: dash, h: dash, r: dash };
    }

    const ids = shapes.map((s) => s.id);
    const union = this.svgManipulationService.getUnionBBox(ids);
    const fmtNum = (n: number) => n.toFixed(1);

    const xStr = union ? fmtNum(union.x) : dash;
    const yStr = union ? fmtNum(union.y) : dash;
    const wStr = union ? fmtNum(union.width) : dash;
    const hStr = union ? fmtNum(union.height) : dash;

    const svg = this.svgManipulationService.getSVGInstance();
    if (!svg) {
      return { x: xStr, y: yStr, w: wStr, h: hStr, r: dash };
    }

    const angles: number[] = [];
    for (const s of shapes) {
      const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
      if (!el || typeof el.matrix !== 'function') continue;
      const m = el.matrix() as Matrix;
      const deg = PropertiesPanelComponent.rotationDeg0To360FromMatrix(m);
      if (!Number.isFinite(deg)) continue;
      angles.push(deg);
    }

    let rStr: string = dash;
    if (angles.length > 0) {
      const r0 = angles[0];
      const eps = PropertiesPanelComponent.ROTATION_MIXED_EPS_DEG;
      const mixed =
        shapes.length > 1 &&
        angles.some((deg) => PropertiesPanelComponent.rotationDiffDeg(deg, r0) > eps);
      rStr = mixed ? 'Mixed' : `${fmtNum(r0)}°`;
    }

    return { x: xStr, y: yStr, w: wStr, h: hStr, r: rStr };
  });

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

  private pushCommand(commands: EditorCommand[], fallbackDescription?: string): void {
    if (commands.length === 0) return;
    this.editorHistory.pushAndExecute(
      commands.length === 1 ? commands[0] : new CompositeCommand(commands, fallbackDescription)
    );
  }

  /** SVG.js `fill()` / `stroke()` write presentation attributes on the element. */
  private static skewDegFromMatrix(m: Matrix): { skewX: number; skewY: number } {
    const v = m.valueOf() as { a: number; b: number; c: number; d: number };
    return {
      skewX: (Math.atan2(v.c, v.a) * 180) / Math.PI,
      skewY: (Math.atan2(v.b, v.d) * 180) / Math.PI
    };
  }

  private static readonly OVERRIDE_PAINT_SOURCE: PaintSourceInfo = { kind: 'presentation-attr' };

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
    this.pushCommand(commands, 'Bake fill to local');
    this.syncAllSelectedFromDom();
  }

  onBakeStrokeClick(): void {
    const commands = this.selectedShapesList()
      .filter((s) => this.shouldOfferBakeStroke(s))
      .map((s) => new BakeStrokeCommand(this.svgManipulationService, s.id));
    this.pushCommand(commands, 'Bake stroke to local');
    this.syncAllSelectedFromDom();
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

  private syncAllSelectedFromDom(): void {
    const svg = this.svgManipulationService.getSVGInstance();
    if (!svg) return;
    const next = this.selectedShapesList().map((s) => {
      const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
      return el ? this.svgManipulationService.getShapeProperties(el) : s;
    });
    this.shapeSelectionService.selectShapes(next);
  }

  /** True when the fill is a url(#...) reference (gradient or pattern) that the hex picker can't edit. */
  isGradientOrPatternFill(shape: ShapeProperties): boolean {
    return shape.fillPaintType === 'gradient' || shape.fillPaintType === 'pattern';
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

  onAddStrokeClick(): void {
    const color = '#000000';
    const width = 1;
    const commands = this.selectedShapesList().map(
      (s) => new AddStrokeCommand(this.svgManipulationService, s.id, color, width)
    );
    this.pushCommand(commands, 'Add stroke');
    this.shapeSelectionService.patchAllSelected({
      stroke: color,
      strokeWidth: width,
      strokeSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
    });
  }

  onFillColorChange(color: string): void {
    const commands = this.selectedShapesList().map(
      (s) => new FillColorCommand(this.svgManipulationService, s.id, s.fill ?? '', color)
    );
    this.pushCommand(commands, `Change fill to ${color}`);
    this.shapeSelectionService.patchAllSelected({
      fill: color,
      fillSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
    });
  }

  onStrokeColorChange(color: string): void {
    if (color === 'none' || color === '') {
      const commands = this.selectedShapesList().map(
        (s) => new RemoveStrokeCommand(this.svgManipulationService, s.id, s.stroke ?? '#000000', s.strokeWidth ?? 1)
      );
      this.pushCommand(commands, 'Remove stroke');
      this.shapeSelectionService.patchAllSelected({
        stroke: undefined,
        strokeWidth: 0,
        strokeSource: { kind: 'default' }
      });
    } else {
      const commands = this.selectedShapesList().map(
        (s) => new StrokeColorCommand(this.svgManipulationService, s.id, s.stroke ?? '', color)
      );
      this.pushCommand(commands, `Change stroke to ${color}`);
      this.shapeSelectionService.patchAllSelected({
        stroke: color,
        strokeSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
      });
    }
  }

  onStrokeWidthChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const width = parseFloat(target.value);
    const commands: EditorCommand[] = this.selectedShapesList().map((s) => {
      if (width === 0) {
        return new RemoveStrokeCommand(this.svgManipulationService, s.id, s.stroke ?? '#000000', s.strokeWidth ?? 1);
      }
      const color = this.hasStrokeColor(s) ? s.stroke! : '#000000';
      return new SetStrokeCommand(
        this.svgManipulationService, s.id,
        this.hasStrokeColor(s), s.stroke ?? '#000000', s.strokeWidth ?? 0,
        color, width
      );
    });
    this.pushCommand(commands, width === 0 ? 'Remove stroke' : `Set stroke width ${width}`);
    if (width === 0) {
      this.shapeSelectionService.patchAllSelected({
        strokeWidth: 0,
        stroke: undefined,
        strokeSource: { kind: 'default' }
      });
    } else {
      this.shapeSelectionService.patchAllSelected({
        strokeWidth: width,
        strokeSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
      });
      this.syncAllSelectedFromDom();
    }
  }

  onOpacityChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const opacity = parseFloat(target.value);
    const commands = this.selectedShapesList().map(
      (s) => new OpacityCommand(this.svgManipulationService, s.id, s.opacity ?? 1, opacity)
    );
    this.pushCommand(commands, `Change opacity to ${opacity}`);
    this.shapeSelectionService.patchAllSelected({ opacity });
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
    const commands = this.selectedShapesList().map(
      (s) => new StrokeDashOffsetCommand(this.svgManipulationService, s.id, s.strokeDashoffset ?? 0, offset)
    );
    this.pushCommand(commands, `Set dash offset to ${offset}`);
    this.shapeSelectionService.patchAllSelected({ strokeDashoffset: offset });
  }

  /** Validate a custom dasharray string: comma/space-separated positive numbers. */
  isValidDashArray(value: string): boolean {
    if (!value.trim()) return true;
    return /^(\d+(\.\d+)?)([\s,]+\d+(\.\d+)?)*$/.test(value.trim());
  }

  private applyDashArray(dasharray: string): void {
    const commands = this.selectedShapesList().map(
      (s) => new StrokeDashArrayCommand(this.svgManipulationService, s.id, s.strokeDasharray ?? '', dasharray)
    );
    this.pushCommand(commands, dasharray ? `Set dash pattern ${dasharray}` : 'Remove dash pattern');
    this.shapeSelectionService.patchAllSelected({
      strokeDasharray: dasharray || undefined,
      strokeDashoffset: dasharray ? undefined : 0
    });
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
    this.pushCommand([new AlignCommand(this.svgManipulationService, ids, direction)]);
    this.syncAllSelectedFromDom();
  }

  onDistribute(direction: 'horizontal' | 'vertical'): void {
    const ids = this.selectedShapesList().map((shape) => shape.id);
    if (ids.length < 3) return;
    this.pushCommand([new DistributeCommand(this.svgManipulationService, ids, direction)]);
    this.syncAllSelectedFromDom();
  }
}
