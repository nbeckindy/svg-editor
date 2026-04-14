import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { PaintSourceInfo, ShapeProperties } from '../../models/shape-properties.interface';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorPickerComponent],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.css'
})
export class PropertiesPanelComponent {
  private shapeSelectionService = inject(ShapeSelectionService);
  readonly selectedShape = this.shapeSelectionService.selectedShape;
  readonly selectionCount = this.shapeSelectionService.selectionCount;
  private svgManipulationService = inject(SvgManipulationService);

  /** SVG.js `fill()` / `stroke()` write presentation attributes on the element. */
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
    for (const s of this.selectedShapesList()) {
      if (this.shouldOfferBakeFill(s)) {
        this.svgManipulationService.bakeEffectiveFillToLocal(s.id);
      }
    }
    this.syncAllSelectedFromDom();
  }

  onBakeStrokeClick(): void {
    for (const s of this.selectedShapesList()) {
      if (this.shouldOfferBakeStroke(s)) {
        this.svgManipulationService.bakeEffectiveStrokeToLocal(s.id);
      }
    }
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
    this.svgManipulationService.highlightShape(parentId);
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
    for (const s of this.selectedShapesList()) {
      this.svgManipulationService.addStroke(s.id, color, width);
    }
    this.shapeSelectionService.patchAllSelected({
      stroke: color,
      strokeWidth: width,
      strokeSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
    });
  }

  onFillColorChange(color: string): void {
    for (const s of this.selectedShapesList()) {
      this.svgManipulationService.updateFillColor(s.id, color);
    }
    this.shapeSelectionService.patchAllSelected({
      fill: color,
      fillSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
    });
  }

  onStrokeColorChange(color: string): void {
    if (color === 'none' || color === '') {
      for (const s of this.selectedShapesList()) {
        this.svgManipulationService.removeStroke(s.id);
      }
      this.shapeSelectionService.patchAllSelected({
        stroke: undefined,
        strokeWidth: 0,
        strokeSource: { kind: 'default' }
      });
    } else {
      for (const s of this.selectedShapesList()) {
        this.svgManipulationService.updateStrokeColor(s.id, color);
      }
      this.shapeSelectionService.patchAllSelected({
        stroke: color,
        strokeSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
      });
    }
  }

  onStrokeWidthChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const width = parseFloat(target.value);
    for (const s of this.selectedShapesList()) {
      if (width === 0) {
        this.svgManipulationService.removeStroke(s.id);
      } else {
        const color = this.hasStrokeColor(s) ? s.stroke! : '#000000';
        this.svgManipulationService.addStroke(s.id, color, width);
      }
    }
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
    for (const s of this.selectedShapesList()) {
      this.svgManipulationService.updateOpacity(s.id, opacity);
    }
    this.shapeSelectionService.patchAllSelected({ opacity });
  }

  onClearSelection(): void {
    this.shapeSelectionService.clearSelection();
    this.svgManipulationService.clearHighlight();
  }
}
