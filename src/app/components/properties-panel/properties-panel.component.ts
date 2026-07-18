import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { SelectionTransformReadoutService } from '../../services/selection-transform-readout.service';
import { LAYER_LOCK_READ_PORT } from '../../services/manipulation-port-tokens';

@Component({
  selector: 'app-properties-panel',
  imports: [MatIconModule],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.css'
})
export class PropertiesPanelComponent {
  private shapeSelectionService = inject(ShapeSelectionService);
  readonly selectedShape = this.shapeSelectionService.selectedShape;
  readonly selectionCount = this.shapeSelectionService.selectionCount;
  private chromeApply = inject(ChromeEditorApplyService);
  private readonly transformReadoutSvc = inject(SelectionTransformReadoutService);
  private readonly layerLock = inject(LAYER_LOCK_READ_PORT);
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

  onSelectionBBoxFieldCommit(field: 'x' | 'y' | 'w' | 'h' | 'r', event: Event): void {
    this.chromeApply.onSelectionBBoxFieldCommit(field, event);
  }

  onShapeIdChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextId = input.value;
    this.chromeApply.applyShapeIdFromChrome(nextId);
    const current = this.selectedShape();
    if (current && input.value.trim() !== current.id) {
      input.value = current.id;
    }
  }

  private selectedShapesList(): ShapeProperties[] {
    return this.shapeSelectionService.getSelectedShapes();
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
}
