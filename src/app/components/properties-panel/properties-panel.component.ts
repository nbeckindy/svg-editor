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
  private svgManipulationService = inject(SvgManipulationService);

  /** SVG.js `fill()` / `stroke()` write presentation attributes on the element. */
  private static readonly OVERRIDE_PAINT_SOURCE: PaintSourceInfo = { kind: 'presentation-attr' };

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

  shouldOfferSelectParentGroup(shape: ShapeProperties): boolean {
    const inheritedFill = shape.fillSource?.kind === 'inherited';
    const inheritedStroke = shape.strokeSource?.kind === 'inherited';
    if (!inheritedFill && !inheritedStroke) return false;
    return !!this.svgManipulationService.getNearestGroupAncestorId(shape.id);
  }

  parentGroupId(shape: ShapeProperties): string | null {
    return this.svgManipulationService.getNearestGroupAncestorId(shape.id);
  }

  onBakeFillClick(): void {
    const shape = this.selectedShape();
    if (!shape) return;
    this.svgManipulationService.bakeEffectiveFillToLocal(shape.id);
    this.syncFirstSelectedShapeFromDom(shape.id);
  }

  onBakeStrokeClick(): void {
    const shape = this.selectedShape();
    if (!shape) return;
    this.svgManipulationService.bakeEffectiveStrokeToLocal(shape.id);
    this.syncFirstSelectedShapeFromDom(shape.id);
  }

  onSelectParentGroupClick(): void {
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

  private syncFirstSelectedShapeFromDom(shapeId: string): void {
    const all = this.shapeSelectionService.getSelectedShapes();
    const el = this.svgManipulationService.getSVGInstance()?.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!el || all.length === 0 || all[0].id !== shapeId) return;
    const next = this.svgManipulationService.getShapeProperties(el);
    this.shapeSelectionService.selectShapes([next, ...all.slice(1)]);
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
    const shape = this.selectedShape();
    if (!shape) return;
    const color = '#000000';
    this.svgManipulationService.addStroke(shape.id, color, 1);
    this.shapeSelectionService.updateSelectedShape({
      stroke: color,
      strokeWidth: 1,
      strokeSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
    });
  }

  onFillColorChange(color: string): void {
    const shape = this.selectedShape();
    if (shape) {
      this.svgManipulationService.updateFillColor(shape.id, color);
      this.shapeSelectionService.updateSelectedShape({
        fill: color,
        fillSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
      });
    }
  }

  onStrokeColorChange(color: string): void {
    const shape = this.selectedShape();
    if (shape) {
      if (color === 'none' || color === '') {
        this.svgManipulationService.removeStroke(shape.id);
        this.shapeSelectionService.updateSelectedShape({
          stroke: undefined,
          strokeWidth: 0,
          strokeSource: { kind: 'default' }
        });
      } else {
        this.svgManipulationService.updateStrokeColor(shape.id, color);
        this.shapeSelectionService.updateSelectedShape({
          stroke: color,
          strokeSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
        });
      }
    }
  }

  onStrokeWidthChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const width = parseFloat(target.value);
    const shape = this.selectedShape();
    if (shape) {
      if (width === 0) {
        this.svgManipulationService.removeStroke(shape.id);
        this.shapeSelectionService.updateSelectedShape({
          strokeWidth: 0,
          stroke: undefined,
          strokeSource: { kind: 'default' }
        });
      } else {
        const color = shape.stroke || '#000000';
        this.svgManipulationService.addStroke(shape.id, color, width);
        this.shapeSelectionService.updateSelectedShape({
          strokeWidth: width,
          strokeSource: PropertiesPanelComponent.OVERRIDE_PAINT_SOURCE
        });
      }
    }
  }

  onOpacityChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const opacity = parseFloat(target.value);
    const shape = this.selectedShape();
    if (shape) {
      this.svgManipulationService.updateOpacity(shape.id, opacity);
      this.shapeSelectionService.updateSelectedShape({ opacity });
    }
  }

  onClearSelection(): void {
    this.shapeSelectionService.clearSelection();
    this.svgManipulationService.clearHighlight();
  }
}
