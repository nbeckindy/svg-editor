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
import { GradientFillEditorComponent } from '../gradient-fill-editor/gradient-fill-editor.component';
import {
  EditorCommand,
  CompositeCommand,
  GradientFillSnapshotCommand,
  RemoveStrokeCommand,
  SetStrokeCommand,
  OpacityCommand,
  BakeFillCommand,
  BakeStrokeCommand,
  StrokeDashArrayCommand,
  StrokeDashOffsetCommand,
  AlignCommand,
  DistributeCommand,
  FontCommand,
  TextAlignCommand,
  TextPaintOrderCommand,
  TextVectorEffectCommand,
  UpdateDrawingDefaultsCommand,
  TranslateCommand,
  UnionScaleCommand,
  UnionRotateCommand
} from '../../models/editor-commands';
import { MIN_UNION_SIZE } from '../../utils/selection-resize';
import { unionRotationPivot } from '../../utils/selection-rotate';
import {
  defaultLinearGradientModel,
  parsePaintReferenceId,
  serializeGradientElementToOuterHtml
} from '../../models/svg-gradient';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { SelectionPaintApplyService } from '../../services/selection-paint-apply.service';

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
  private editorHistory = inject(EditorHistoryService);
  private editorTool = inject(EditorToolService);
  private selectionPaintApply = inject(SelectionPaintApplyService);
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

  private static isFinitePositiveDim(n: number): boolean {
    return Number.isFinite(n) && n > 0;
  }

  private static shortestSignedDeltaDeg(fromDeg: number, toDeg: number): number {
    const a = PropertiesPanelComponent.normDeg0To360(fromDeg);
    const b = PropertiesPanelComponent.normDeg0To360(toDeg);
    let d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

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

  /**
   * Numeric X/Y/W/H and rotation for bbox inputs (union bbox in root SVG user space).
   * When the union is missing or degenerate, inputs are shown disabled (`ok: false`).
   */
  readonly selectionBBoxFieldModel = computed(() => {
    this.editorHistory.revision();
    this.svgManipulationService.documentRevision();

    if (this.editorTool.currentTool() !== 'selector') {
      return null;
    }

    const shapes = this.shapeSelectionService.selectedShapes();
    if (shapes.length === 0) {
      return null;
    }

    const ids = shapes.map((s) => s.id);
    const union = this.svgManipulationService.getUnionBBox(ids);
    if (
      !union ||
      !PropertiesPanelComponent.isFinitePositiveDim(union.width) ||
      !PropertiesPanelComponent.isFinitePositiveDim(union.height)
    ) {
      return { ok: false as const, ids };
    }

    const svg = this.svgManipulationService.getSVGInstance();
    let rDeg: number | null = null;
    let rMixed = false;
    if (svg) {
      const angles: number[] = [];
      for (const s of shapes) {
        const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
        if (!el || typeof el.matrix !== 'function') continue;
        const m = el.matrix() as Matrix;
        const deg = PropertiesPanelComponent.rotationDeg0To360FromMatrix(m);
        if (!Number.isFinite(deg)) continue;
        angles.push(deg);
      }
      if (angles.length > 0) {
        const r0 = angles[0];
        const eps = PropertiesPanelComponent.ROTATION_MIXED_EPS_DEG;
        rMixed = shapes.length > 1 && angles.some((deg) => PropertiesPanelComponent.rotationDiffDeg(deg, r0) > eps);
        rDeg = rMixed ? null : r0;
      }
    }

    return {
      ok: true as const,
      ids,
      union,
      x: union.x,
      y: union.y,
      w: union.width,
      h: union.height,
      rDeg,
      rMixed
    };
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

  /**
   * Commit a numeric bbox / rotation edit. Uses union-bbox semantics: translate for X/Y,
   * edge-anchored scale for W/H (west fixed for width, north fixed for height), rigid rotation
   * for R when not mixed.
   * Rapid commits on the same field coalesce into one undo step when they fall within
   * `EditorHistoryService` push window (see `COALESCE_WINDOW_MS` on transform commands).
   */
  onSelectionBBoxFieldCommit(field: 'x' | 'y' | 'w' | 'h' | 'r', event: Event): void {
    if (this.editorTool.currentTool() !== 'selector') return;
    const target = event.target as HTMLInputElement;
    const raw = target.value.trim();
    if (raw === '') return;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return;

    const model = this.selectionBBoxFieldModel();
    if (!model || !model.ok) return;
    const { ids, union: unionBefore } = model;
    const epsPos = 1e-6;

    if (field === 'x') {
      const dx = parsed - unionBefore.x;
      if (Math.abs(dx) < epsPos) return;
      const snap = this.svgManipulationService.snapshotSelectionTransforms(ids);
      const cmds = ids.map(
        (id) => new TranslateCommand(this.svgManipulationService, id, dx, 0, snap)
      );
      this.pushCommand(cmds, `Set selection X to ${parsed}`);
      this.syncAllSelectedFromDom();
      return;
    }

    if (field === 'y') {
      const dy = parsed - unionBefore.y;
      if (Math.abs(dy) < epsPos) return;
      const snap = this.svgManipulationService.snapshotSelectionTransforms(ids);
      const cmds = ids.map(
        (id) => new TranslateCommand(this.svgManipulationService, id, 0, dy, snap)
      );
      this.pushCommand(cmds, `Set selection Y to ${parsed}`);
      this.syncAllSelectedFromDom();
      return;
    }

    if (field === 'w') {
      if (!PropertiesPanelComponent.isFinitePositiveDim(parsed) || parsed < MIN_UNION_SIZE) return;
      if (Math.abs(parsed - unionBefore.width) < epsPos) return;
      const unionAfter = { ...unionBefore, width: parsed };
      const snap = this.svgManipulationService.snapshotSelectionTransforms(ids);
      const ve = this.svgManipulationService.snapshotVectorEffectsForShapes(ids);
      this.pushCommand(
        [new UnionScaleCommand(this.svgManipulationService, ids, unionBefore, unionAfter, snap, 'e', ve)],
        `Set selection width to ${parsed}`
      );
      this.syncAllSelectedFromDom();
      return;
    }

    if (field === 'h') {
      if (!PropertiesPanelComponent.isFinitePositiveDim(parsed) || parsed < MIN_UNION_SIZE) return;
      if (Math.abs(parsed - unionBefore.height) < epsPos) return;
      const unionAfter = { ...unionBefore, height: parsed };
      const snap = this.svgManipulationService.snapshotSelectionTransforms(ids);
      const ve = this.svgManipulationService.snapshotVectorEffectsForShapes(ids);
      this.pushCommand(
        [new UnionScaleCommand(this.svgManipulationService, ids, unionBefore, unionAfter, snap, 's', ve)],
        `Set selection height to ${parsed}`
      );
      this.syncAllSelectedFromDom();
      return;
    }

    if (field === 'r') {
      if (model.rMixed || model.rDeg == null || !Number.isFinite(model.rDeg)) return;
      const rTarget = PropertiesPanelComponent.normDeg0To360(parsed);
      if (!Number.isFinite(rTarget)) return;
      const delta = PropertiesPanelComponent.shortestSignedDeltaDeg(model.rDeg, rTarget);
      if (Math.abs(delta) < PropertiesPanelComponent.ROTATION_MIXED_EPS_DEG) return;
      const pivot =
        this.svgManipulationService.getSelectionRotationPivot(ids) ?? unionRotationPivot(unionBefore);
      const snap = this.svgManipulationService.snapshotSelectionTransforms(ids);
      this.pushCommand(
        [new UnionRotateCommand(this.svgManipulationService, ids, pivot, delta, snap)],
        `Rotate selection toward ${rTarget}°`
      );
      this.syncAllSelectedFromDom();
    }
  }

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
      this.pushCommand(commands, `Set font family to ${fontFamily}`);
      this.syncAllSelectedFromDom();
      return;
    }
    if (this.textToolPlacementMode()) {
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
      this.pushCommand(commands, `Set font size to ${fontSize}`);
      this.syncAllSelectedFromDom();
      return;
    }
    if (this.textToolPlacementMode()) {
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
      this.pushCommand(commands, `${nextWeight === 'bold' ? 'Enable' : 'Disable'} bold`);
      this.syncAllSelectedFromDom();
      return;
    }
    if (this.textToolPlacementMode()) {
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
      this.pushCommand(commands, `${nextStyle === 'italic' ? 'Enable' : 'Disable'} italic`);
      this.syncAllSelectedFromDom();
      return;
    }
    if (this.textToolPlacementMode()) {
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
      this.pushCommand(commands, 'Set text alignment');
      this.syncAllSelectedFromDom();
      return;
    }
    if (this.textToolPlacementMode()) {
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
    this.pushCommand(commands, next ? 'Set text paint order' : 'Reset text paint order');
    this.syncAllSelectedFromDom();
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
    this.pushCommand(
      commands,
      checked ? 'Enable non-scaling text outline' : 'Disable non-scaling text outline'
    );
    this.syncAllSelectedFromDom();
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
    this.pushCommand(
      [new GradientFillSnapshotCommand(this.svgManipulationService, shape.id, 'fill', before, after)],
      'Add gradient fill'
    );
    this.syncAllSelectedFromDom();
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
