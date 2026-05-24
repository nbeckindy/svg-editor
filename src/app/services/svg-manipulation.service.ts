import { Injectable, inject } from '@angular/core';
import { Svg, Element as SvgJsElement, Matrix } from '@svgdotjs/svg.js';
import type { EditableGradientModel, PaintGradientSnapshot } from '../models/svg-gradient';
import { ArtboardModel, ArtboardResizeAnchor } from '../models/artboard.model';
import { ShapeProperties } from '../models/shape-properties.interface';
import type { ClipboardPayload } from '../models/clipboard-payload';
import type { CreatableShapeType, ShapeCreationAttrs } from './svg-shape-content.port';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgGradientDefsService } from './svg-gradient-defs.service';
import { SvgLayerStructureService } from './svg-layer-structure.service';
import { SvgSelectionGeometryService } from './svg-selection-geometry.service';
import type { LayerStackItem, LayerTreeNode } from './svg-layer-structure.port';
import { SvgShapeContentService } from './svg-shape-content.service';
import type {
  TransformGestureDocSvgPort,
  SelectionTransformApplySvgPort
} from '../history/transform-gesture-svg.port';
import type { SelectionPaintApplySvgPort } from '../history/selection-paint-apply-svg.port';
import type { SelectionTransformReadoutSvgPort } from '../history/selection-transform-readout-svg.port';
import type { DocumentSettingsSvgPort } from '../history/document-settings-svg.port';
import type { AppRootSvgManipulationPort, SvgDebugPanelSvgPort } from '../history/editor-chrome-svg.port';
import type { GradientFillEditorSvgPort } from '../history/gradient-fill-editor-svg.port';
import type { ResizeHandle } from '../utils/selection-resize';
import type { AxisAlignedRect } from '../utils/marquee-selection';

export type { CreatableShapeType, ShapeCreationAttrs } from './svg-shape-content.port';
export type { LayerStackItem, LayerTreeNode } from './svg-layer-structure.port';

@Injectable({
  providedIn: 'root'
})
export class SvgManipulationService
  implements
    TransformGestureDocSvgPort,
    SelectionTransformApplySvgPort,
    SelectionPaintApplySvgPort,
    SelectionTransformReadoutSvgPort,
    DocumentSettingsSvgPort,
    SvgDebugPanelSvgPort,
    AppRootSvgManipulationPort,
    GradientFillEditorSvgPort
{
  private readonly doc = inject(SvgEditorDocumentService);
  private readonly gradients = inject(SvgGradientDefsService);
  private readonly layers = inject(SvgLayerStructureService);
  private readonly geometry = inject(SvgSelectionGeometryService);
  private readonly shapes = inject(SvgShapeContentService);

  readonly documentRevision = this.doc.documentRevision;
  readonly artboard = this.doc.artboard;
  readonly artboardResizeAnchor = this.doc.artboardResizeAnchor;

  getDocumentViewBox(): string {
    return this.doc.getDocumentViewBox();
  }

  setArtboardSize(
    width: number,
    height: number,
    explicitOrigin?: { minX: number; minY: number }
  ): void {
    this.doc.setArtboardSize(width, height, explicitOrigin);
  }

  setArtboardResizeAnchor(anchor: ArtboardResizeAnchor): void {
    this.doc.setArtboardResizeAnchor(anchor);
  }

  setBackgroundColor(color: string): void {
    this.doc.setBackgroundColor(color);
  }

  getArtboard(): ArtboardModel {
    return this.doc.getArtboard();
  }

  initializeSVG(container: HTMLElement, svgContent: string): void {
    this.doc.initializeSVG(container, svgContent);
  }

  exportSVG(): string {
    return this.doc.exportSVG();
  }

  getSVGInstance(): Svg | null {
    return this.doc.getSVGInstance();
  }

  getShapeProperties(element: SvgJsElement): ShapeProperties {
    return this.shapes.getShapeProperties(element);
  }

  getShapePropertiesInSameClipGroup(shape: SvgJsElement): ShapeProperties[] {
    return this.shapes.getShapePropertiesInSameClipGroupReadingWith(shape, (el) =>
      this.getShapeProperties(el)
    );
  }

  expandSelectionByClipGroups(shapes: ShapeProperties[]): ShapeProperties[] {
    return this.shapes.expandSelectionByClipGroupsReadingWith(shapes, (el) =>
      this.getShapeProperties(el)
    );
  }

  updateFillColor(shapeId: string, color: string): void {
    this.shapes.updateFillColor(shapeId, color);
  }

  addStroke(shapeId: string, color: string, width: number): void {
    this.shapes.addStroke(shapeId, color, width);
  }

  removeStroke(shapeId: string): void {
    this.shapes.removeStroke(shapeId);
  }

  updateStrokeColor(shapeId: string, color: string): void {
    this.shapes.updateStrokeColor(shapeId, color);
  }

  updateStrokeDasharray(shapeId: string, dasharray: string): void {
    this.shapes.updateStrokeDasharray(shapeId, dasharray);
  }

  updateStrokeDashoffset(shapeId: string, dashoffset: number): void {
    this.shapes.updateStrokeDashoffset(shapeId, dashoffset);
  }

  updateOpacity(shapeId: string, opacity: number): void {
    this.shapes.updateOpacity(shapeId, opacity);
  }

  updatePathData(pathId: string, d: string): void {
    this.shapes.updatePathData(pathId, d);
  }

  getTextContent(textId: string): string | null {
    return this.shapes.getTextContent(textId);
  }

  updateTextContent(textId: string, text: string): void {
    this.shapes.updateTextContent(textId, text);
  }

  updateTextFontFamily(textId: string, fontFamily: string): void {
    this.shapes.updateTextFontFamily(textId, fontFamily);
  }

  updateTextFontSize(textId: string, fontSize: number): void {
    this.shapes.updateTextFontSize(textId, fontSize);
  }

  updateTextFontWeight(textId: string, fontWeight: string): void {
    this.shapes.updateTextFontWeight(textId, fontWeight);
  }

  updateTextFontStyle(textId: string, fontStyle: string): void {
    this.shapes.updateTextFontStyle(textId, fontStyle);
  }

  updateTextAnchor(textId: string, textAnchor: 'start' | 'middle' | 'end'): void {
    this.shapes.updateTextAnchor(textId, textAnchor);
  }

  updateTextPaintOrder(textId: string, paintOrder: string | undefined): void {
    this.shapes.updateTextPaintOrder(textId, paintOrder);
  }

  updateTextVectorEffect(textId: string, effect: string | undefined): void {
    this.shapes.updateTextVectorEffect(textId, effect);
  }

  getNearestGroupAncestorId(shapeId: string): string | null {
    return this.shapes.getNearestGroupAncestorId(shapeId);
  }

  bakeEffectiveFillToLocal(shapeId: string): void {
    this.shapes.bakeEffectiveFillToLocal(shapeId);
  }

  bakeEffectiveStrokeToLocal(shapeId: string): void {
    this.shapes.bakeEffectiveStrokeToLocal(shapeId);
  }

  restoreBakedFillPresentation(
    shapeId: string,
    before: { fillAttr: string | null; fillStyleValue: string }
  ): void {
    this.shapes.restoreBakedFillPresentation(shapeId, before);
  }

  restoreBakedStrokePresentation(
    shapeId: string,
    before: {
      strokeAttr: string | null;
      strokeStyleValue: string;
      strokeWidthAttr: string | null;
      strokeWidthStyleValue: string;
    }
  ): void {
    this.shapes.restoreBakedStrokePresentation(shapeId, before);
  }

  restoreRemovedShapesInContentGroup(
    shapeIds: string[],
    serializedMarkup: ReadonlyMap<string, string>,
    insertionIndices: ReadonlyMap<string, number>
  ): void {
    this.shapes.restoreRemovedShapesInContentGroup(shapeIds, serializedMarkup, insertionIndices);
  }

  translateShape(shapeId: string, dx: number, dy: number): void {
    this.shapes.translateShape(shapeId, dx, dy);
  }

  setShapeVisibility(shapeId: string, visible: boolean): void {
    this.shapes.setShapeVisibility(shapeId, visible);
  }

  getShapeBBox(
    shapeId: string,
    options?: { preferScreenBounds?: boolean }
  ): { x: number; y: number; width: number; height: number } | null {
    return this.geometry.getShapeBBox(shapeId, options);
  }

  getUnionBBox(
    shapeIds: string[],
    options?: { preferScreenBounds?: boolean }
  ): { x: number; y: number; width: number; height: number } | null {
    const bboxes = shapeIds
      .map((id) => this.getShapeBBox(id, options))
      .filter((b): b is { x: number; y: number; width: number; height: number } => b != null);
    if (bboxes.length === 0) return null;
    if (bboxes.length === 1) return bboxes[0];
    const minX = Math.min(...bboxes.map((b) => b.x));
    const minY = Math.min(...bboxes.map((b) => b.y));
    const maxX = Math.max(...bboxes.map((b) => b.x + b.width));
    const maxY = Math.max(...bboxes.map((b) => b.y + b.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  getSelectionRotationPivot(shapeIds: string[]): { x: number; y: number } | null {
    return this.geometry.getSelectionRotationPivot(shapeIds);
  }

  snapshotSelectionTransforms(shapeIds: string[]): Map<string, Matrix> {
    return this.geometry.snapshotSelectionTransforms(shapeIds);
  }

  mapPathLocalToRootUser(shapeId: string, lx: number, ly: number): { x: number; y: number } {
    return this.geometry.mapPathLocalToRootUser(shapeId, lx, ly);
  }

  mapRootUserToPathLocal(shapeId: string, rx: number, ry: number): { x: number; y: number } | null {
    return this.geometry.mapRootUserToPathLocal(shapeId, rx, ry);
  }

  snapshotVectorEffectsForShapes(shapeIds: string[]): Map<string, (string | null)[]> {
    return this.geometry.snapshotVectorEffectsForShapes(shapeIds);
  }

  restoreVectorEffectsForShapeSubtrees(
    shapeIds: string[],
    snapshots: Map<string, (string | null)[]>
  ): void {
    this.geometry.restoreVectorEffectsForShapeSubtrees(shapeIds, snapshots);
  }

  applyUnionScaleFromSnapshot(
    shapeIds: string[],
    unionBefore: { x: number; y: number; width: number; height: number },
    unionAfter: { x: number; y: number; width: number; height: number },
    snapshot: Map<string, Matrix>,
    handle: ResizeHandle
  ): void {
    this.geometry.applyUnionScaleFromSnapshot(shapeIds, unionBefore, unionAfter, snapshot, handle);
  }

  applyUnionScaleFromCenter(
    shapeIds: string[],
    unionBefore: { x: number; y: number; width: number; height: number },
    unionAfter: { x: number; y: number; width: number; height: number },
    snapshot: Map<string, Matrix>
  ): void {
    this.geometry.applyUnionScaleFromCenter(shapeIds, unionBefore, unionAfter, snapshot);
  }

  applyUnionRotationFromSnapshot(
    shapeIds: string[],
    pivot: { x: number; y: number },
    angleDeg: number,
    snapshot: Map<string, Matrix>
  ): void {
    this.geometry.applyUnionRotationFromSnapshot(shapeIds, pivot, angleDeg, snapshot);
  }

  applyUnionSkewFromSnapshot(
    shapeIds: string[],
    axis: 'x' | 'y',
    angleDeg: number,
    pivot: { x: number; y: number },
    snapshot: Map<string, Matrix>
  ): void {
    this.geometry.applyUnionSkewFromSnapshot(shapeIds, axis, angleDeg, pivot, snapshot);
  }

  getShapePropertiesIntersectingRect(rect: AxisAlignedRect): ShapeProperties[] {
    return this.shapes.getShapePropertiesIntersectingRect(rect);
  }

  clearHighlight(): void {
    this.shapes.clearHighlight();
  }

  removeShapes(shapeIds: string[]): void {
    this.shapes.removeShapes(shapeIds);
  }

  addShape(type: CreatableShapeType, attrs: ShapeCreationAttrs): string | null {
    return this.shapes.addShape(type, attrs);
  }

  insertPathIntoContentGroup(
    d: string,
    attrs?: { fill?: string; stroke?: string; strokeWidth?: number },
    options?: { closedPath?: boolean }
  ): string | null {
    return this.shapes.insertPathIntoContentGroup(d, attrs, options);
  }

  removeShape(shapeId: string): void {
    this.shapes.removeShape(shapeId);
  }

  insertShapeMarkup(markup: string, insertionIndex?: number): void {
    this.shapes.insertShapeMarkup(markup, insertionIndex);
  }

  createClipboardPayload(shapeIds: string[]): ClipboardPayload {
    return this.shapes.createClipboardPayload(shapeIds);
  }

  pasteClipboardPayload(
    payload: ClipboardPayload,
    offset: { dx: number; dy: number }
  ): { insertedIds: string[]; insertedMarkup: string[] } {
    return this.shapes.pasteClipboardPayload(payload, offset);
  }

  getLayerStackItems(): LayerStackItem[] {
    return this.layers.getLayerStackItems();
  }

  getShapeIdsInDomOrder(shapeIds: string[]): string[] {
    return this.layers.getShapeIdsInDomOrder(shapeIds);
  }

  getLayerTree(): LayerTreeNode[] {
    return this.layers.getLayerTree();
  }

  moveElementForward(elementId: string): boolean {
    return this.layers.moveElementForward(elementId);
  }

  moveElementBackward(elementId: string): boolean {
    return this.layers.moveElementBackward(elementId);
  }

  moveElementToFront(elementId: string): boolean {
    return this.layers.moveElementToFront(elementId);
  }

  moveElementToBack(elementId: string): boolean {
    return this.layers.moveElementToBack(elementId);
  }

  toggleLayerVisibility(elementId: string): boolean {
    return this.layers.toggleLayerVisibility(elementId);
  }

  isElementVisible(elementId: string): boolean {
    return this.layers.isElementVisible(elementId);
  }

  groupSelectedElements(elementIds: string[]): string | null {
    return this.layers.groupSelectedElements(elementIds);
  }

  ungroupElement(groupId: string): string[] {
    return this.layers.ungroupElement(groupId);
  }

  ungroupElements(
    groupIds: string[]
  ): { allChildElementIds: string[]; undoSnapshots: string[][] } {
    return this.layers.ungroupElements(groupIds);
  }

  renameElement(elementId: string, newName: string): void {
    this.layers.renameElement(elementId, newName);
  }

  getElementName(elementId: string): string {
    return this.layers.getElementName(elementId);
  }

  allocateUniqueDefId(prefix: string): string {
    return this.gradients.allocateUniqueDefId(prefix);
  }

  countPaintUrlReferencesToDefId(defId: string): number {
    return this.gradients.countPaintUrlReferencesToDefId(defId);
  }

  removeGradientDefById(gradientId: string): void {
    this.gradients.removeGradientDefById(gradientId);
  }

  countContentShapesReferencingPaintDef(defId: string): number {
    return this.gradients.countContentShapesReferencingPaintDef(defId);
  }

  findGradientDomElement(
    gradientId: string
  ): SVGLinearGradientElement | SVGRadialGradientElement | null {
    return this.gradients.findGradientDomElement(gradientId);
  }

  readEditableGradientModelById(gradientId: string): EditableGradientModel | null {
    return this.gradients.readEditableGradientModelById(gradientId);
  }

  ensureDedicatedPaintGradient(shapeId: string, paintProperty: 'fill' | 'stroke'): string | null {
    return this.gradients.ensureDedicatedPaintGradient(shapeId, paintProperty);
  }

  capturePaintGradientSnapshot(shapeId: string, paintProperty: 'fill' | 'stroke'): PaintGradientSnapshot {
    return this.gradients.capturePaintGradientSnapshot(shapeId, paintProperty);
  }

  applyPaintGradientSnapshot(
    shapeId: string,
    paintProperty: 'fill' | 'stroke',
    snapshot: PaintGradientSnapshot
  ): void {
    this.gradients.applyPaintGradientSnapshot(shapeId, paintProperty, snapshot);
  }

  writeEditableGradientModel(model: EditableGradientModel): void {
    this.gradients.writeEditableGradientModel(model);
  }

  createLinearGradientFillForShape(shapeId: string, fromColor: string, toColor = '#ffffff'): string {
    return this.gradients.createLinearGradientFillForShape(shapeId, fromColor, toColor);
  }

  applyGradientModelToShapePaint(
    shapeId: string,
    paintProperty: 'fill' | 'stroke',
    model: EditableGradientModel
  ): void {
    this.gradients.applyGradientModelToShapePaint(shapeId, paintProperty, model);
  }

  setGradientKindForShape(
    shapeId: string,
    paintProperty: 'fill' | 'stroke',
    kind: 'linear' | 'radial',
    preserveStopsFrom: EditableGradientModel
  ): EditableGradientModel {
    return this.gradients.setGradientKindForShape(shapeId, paintProperty, kind, preserveStopsFrom);
  }
}
