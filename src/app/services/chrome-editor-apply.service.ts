import { Injectable, inject } from '@angular/core';
import type { ReparentElementsMode } from '../models/editor-commands';
import { ShapeProperties } from '../models/shape-properties.interface';
import type { EyedropperPaintSample } from '../models/eyedropper-paint-sample';
import type { BooleanOp } from '../models/path-boolean';
import { ChromeEditorApplySupport } from './chrome-apply/chrome-editor-apply-support.service';
import { ChromeEditorPaintApplyService } from './chrome-apply/chrome-editor-paint-apply.service';
import { ChromeEditorTransformApplyService } from './chrome-apply/chrome-editor-transform-apply.service';
import { ChromeEditorLayersApplyService } from './chrome-apply/chrome-editor-layers-apply.service';
import type { LayerRowKind } from './svg-layer-structure.port';
import { ChromeEditorPathOpsApplyService } from './chrome-apply/chrome-editor-path-ops-apply.service';
import type { PaintSwatchMode, PaintSwatchTarget } from '../components/paint-swatch-popover/paint-swatch-popover.component';

/**
 * **Chrome** write path for the **Editor runtime**: **History** (`pushAndExecute`), **Live tree**
 * mutations via `EditorCommand`s, and **Selection** patches / DOM sync — paint, properties
 * inspector actions, bbox fields, eyedropper, and layers panel history.
 */
@Injectable({
  providedIn: 'root'
})
export class ChromeEditorApplyService {
  private readonly support = inject(ChromeEditorApplySupport);
  private readonly paint = inject(ChromeEditorPaintApplyService);
  private readonly transform = inject(ChromeEditorTransformApplyService);
  private readonly layers = inject(ChromeEditorLayersApplyService);
  private readonly pathOps = inject(ChromeEditorPathOpsApplyService);

  applyCreationFillDefault(color: string) {
    return this.paint.applyCreationFillDefault(color);
  }
  applyCreationStrokeDefault(color: string) {
    return this.paint.applyCreationStrokeDefault(color);
  }
  applyCreationFillPaintMode(mode: PaintSwatchMode) {
    return this.paint.applyCreationFillPaintMode(mode);
  }
  applyCreationStrokePaintMode(mode: PaintSwatchMode) {
    return this.paint.applyCreationStrokePaintMode(mode);
  }
  applyCreationStrokeWidthDefault(width: number) {
    return this.paint.applyCreationStrokeWidthDefault(width);
  }
  applyFillColor(color: string) { return this.paint.applyFillColor(color); }
  applyStrokeColor(color: string) { return this.paint.applyStrokeColor(color); }
  applyStrokeWidth(width: number) { return this.paint.applyStrokeWidth(width); }
  applyOpacity(opacity: number) { return this.paint.applyOpacity(opacity); }
  applyFillOpacity(opacity: number) { return this.paint.applyFillOpacity(opacity); }
  applyStrokeOpacity(opacity: number) { return this.paint.applyStrokeOpacity(opacity); }
  applyStrokeDasharray(dasharray: string) { return this.paint.applyStrokeDasharray(dasharray); }
  applyStrokeDashoffset(offset: number) { return this.paint.applyStrokeDashoffset(offset); }
  applyTextFontFamilyFromChrome(fontFamily: string, textShapes: ShapeProperties[], placementDefaults: boolean) {
    return this.paint.applyTextFontFamilyFromChrome(fontFamily, textShapes, placementDefaults);
  }
  applyTextFontSizeFromChrome(fontSize: number, textShapes: ShapeProperties[], placementDefaults: boolean) {
    return this.paint.applyTextFontSizeFromChrome(fontSize, textShapes, placementDefaults);
  }
  applyTextToggleBoldFromChrome(textShapes: ShapeProperties[], placementDefaults: boolean) {
    return this.paint.applyTextToggleBoldFromChrome(textShapes, placementDefaults);
  }
  applyTextToggleItalicFromChrome(textShapes: ShapeProperties[], placementDefaults: boolean) {
    return this.paint.applyTextToggleItalicFromChrome(textShapes, placementDefaults);
  }
  applyTextAnchorFromChrome(textAnchor: 'start' | 'middle' | 'end', textShapes: ShapeProperties[], placementDefaults: boolean) {
    return this.paint.applyTextAnchorFromChrome(textAnchor, textShapes, placementDefaults);
  }
  applyTextPaintOrderFromChrome(textShapes: ShapeProperties[], paintOrder: 'stroke fill' | undefined) {
    return this.paint.applyTextPaintOrderFromChrome(textShapes, paintOrder);
  }
  applyTextVectorEffectFromChrome(textShapes: ShapeProperties[], vectorEffect: 'non-scaling-stroke' | undefined) {
    return this.paint.applyTextVectorEffectFromChrome(textShapes, vectorEffect);
  }
  applyBakeFillFromChrome(shapes: ShapeProperties[]) { return this.paint.applyBakeFillFromChrome(shapes); }
  applyBakeStrokeFromChrome(shapes: ShapeProperties[]) { return this.paint.applyBakeStrokeFromChrome(shapes); }
  applyAddLinearGradientFillFromChrome(shape: ShapeProperties, solidFrom: string) {
    return this.paint.applyAddLinearGradientFillFromChrome(shape, solidFrom);
  }
  applyAddGradientPaintFromChrome(
    shape: ShapeProperties,
    paintProperty: 'fill' | 'stroke',
    kind: 'linear' | 'radial',
    seedFrom?: string
  ) {
    return this.paint.applyAddGradientPaintFromChrome(shape, paintProperty, kind, seedFrom);
  }
  applyRevertGradientToSolidFromChrome(shape: ShapeProperties, paintProperty: 'fill' | 'stroke') {
    return this.paint.applyRevertGradientToSolidFromChrome(shape, paintProperty);
  }
  applySwitchGradientKindFromChrome(
    shape: ShapeProperties,
    paintProperty: 'fill' | 'stroke',
    kind: 'linear' | 'radial'
  ) {
    return this.paint.applySwitchGradientKindFromChrome(shape, paintProperty, kind);
  }
  applyPaintModeFromChrome(shape: ShapeProperties, target: PaintSwatchTarget, mode: PaintSwatchMode) {
    return this.paint.applyPaintModeFromChrome(shape, target, mode);
  }
  applyEyedropperPaintSample(sample: EyedropperPaintSample) {
    return this.paint.applyEyedropperPaintSample(sample);
  }

  applyAlignFromChrome(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom', shapeIds: string[]) {
    return this.transform.applyAlignFromChrome(direction, shapeIds);
  }
  applyDistributeFromChrome(direction: 'horizontal' | 'vertical', shapeIds: string[]) {
    return this.transform.applyDistributeFromChrome(direction, shapeIds);
  }
  getNearestGroupAncestorId(shapeId: string) { return this.transform.getNearestGroupAncestorId(shapeId); }
  selectParentGroupForSingleSelection() { return this.transform.selectParentGroupForSingleSelection(); }
  clearInspectorSelection() { return this.transform.clearInspectorSelection(); }
  onSelectionBBoxFieldCommit(field: 'x' | 'y' | 'w' | 'h' | 'r', event: Event) {
    return this.transform.onSelectionBBoxFieldCommit(field, event);
  }
  applyRectCornerRadiusFromChrome(radius: number) {
    return this.transform.applyRectCornerRadiusFromChrome(radius);
  }
  applyShapeIdFromChrome(rawId: string) {
    return this.transform.applyShapeIdFromChrome(rawId);
  }

  applyPathBooleanUnion(pathIds: string[]) { return this.pathOps.applyPathBooleanUnion(pathIds); }
  applyPathBooleanSubtract(pathIds: string[]) { return this.pathOps.applyPathBooleanSubtract(pathIds); }
  applyPathBooleanIntersect(pathIds: string[]) { return this.pathOps.applyPathBooleanIntersect(pathIds); }
  applyPathBoolean(op: BooleanOp, pathIds: string[]) {
    return this.pathOps.applyPathBoolean(op, pathIds);
  }
  applyPathCompound(pathIds: string[]) { return this.pathOps.applyPathCompound(pathIds); }
  applyOutlineToPath(shapeId: string) { return this.pathOps.applyOutlineToPath(shapeId); }

  toggleLayerVisibility(layerId: string) { return this.layers.toggleLayerVisibility(layerId); }
  toggleLayerLock(layerId: string) { return this.layers.toggleLayerLock(layerId); }
  renameLayer(layerId: string, kind: LayerRowKind, newName: string) {
    return this.layers.renameLayer(layerId, kind, newName);
  }
  moveLayerBeforeSibling(draggedLayerId: string, referenceNextSiblingId: string | null) {
    return this.layers.moveLayerBeforeSibling(draggedLayerId, referenceNextSiblingId);
  }
  moveLayerForward(layerId: string) { return this.layers.moveLayerForward(layerId); }
  moveLayerBackward(layerId: string) { return this.layers.moveLayerBackward(layerId); }
  moveLayerToFront(layerId: string) { return this.layers.moveLayerToFront(layerId); }
  moveLayerToBack(layerId: string) { return this.layers.moveLayerToBack(layerId); }
  groupSelectedFromLayersPanel(selectedShapeIds: string[]) { return this.layers.groupSelectedFromLayersPanel(selectedShapeIds); }
  ungroupSelectedFromLayersPanel(groupIds: string[]) { return this.layers.ungroupSelectedFromLayersPanel(groupIds); }
  addSelectionToGroupFromLayersPanel(elementIds: string[], targetGroupId: string, referenceNextSiblingId?: string | null) {
    return this.layers.addSelectionToGroupFromLayersPanel(elementIds, targetGroupId, referenceNextSiblingId);
  }
  removeSelectionFromGroupFromLayersPanel(elementIds: string[]) {
    return this.layers.removeSelectionFromGroupFromLayersPanel(elementIds);
  }
  reparentLayersFromPanel(elementIds: string[], mode: ReparentElementsMode) {
    return this.layers.reparentLayersFromPanel(elementIds, mode);
  }
  reparentLayerDrag(elementIds: string[], mode: ReparentElementsMode) {
    return this.layers.reparentLayerDrag(elementIds, mode);
  }
  makeClipPathFromSelection(contentIds: string[], clipShapeId: string) {
    return this.layers.makeClipPathFromSelection(contentIds, clipShapeId);
  }
  releaseClipPathFromSelection(shapeIds: string[]) {
    return this.layers.releaseClipPathFromSelection(shapeIds);
  }
  releaseClipPathFromLayersPanel(carrierGroupId: string) {
    return this.layers.releaseClipPathFromLayersPanel(carrierGroupId);
  }

  syncSelectedShapesFromDom() { return this.support.syncSelectedShapesFromDom(); }
}
