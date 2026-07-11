import { Injectable, inject } from '@angular/core';
import { Svg, Element as SvgJsElement, Matrix } from '@svgdotjs/svg.js';
import type { EditableGradientModel, PaintGradientSnapshot } from '../models/svg-gradient';
import { ArtboardModel, ArtboardResizeAnchor } from '../models/artboard.model';
import { ShapeProperties } from '../models/shape-properties.interface';
import type { ClipboardPayload } from '../models/clipboard-payload';
import type { CreatableShapeType, InsertRasterImageAttrs, ShapeCreationAttrs } from './svg-shape-content.port';
import type { LiveTreeMarkup } from '../utils/svg-sanitize';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgExportService } from './svg-export.service';
import { SvgGradientDefsService } from './svg-gradient-defs.service';
import { SvgLayerStructureService } from './svg-layer-structure.service';
import { SvgSelectionGeometryService } from './svg-selection-geometry.service';
import type { LayerStackItem, LayerTreeNode, LayerRowKind } from './svg-layer-structure.port';
import { SvgShapeContentService } from './svg-shape-content.service';
import { SvgClipPathService } from './svg-clip-path.service';
import type { ClipPathSvgPort } from '../history/clip-path-svg.port';
import type {
  MakeClipPathResult,
  MakeClipPathUndoSnapshot,
  ReleaseClipPathResult,
  ReleaseClipPathUndoSnapshot
} from './svg-clip-path.port';
import type {
  TransformGestureDocSvgPort,
  SelectionTransformApplySvgPort
} from '../history/transform-gesture-svg.port';
import type { ChromeEditorApplySvgPort } from '../history/chrome-editor-apply-svg.port';
import type { SelectionTransformReadoutSvgPort } from '../history/selection-transform-readout-svg.port';
import type { DocumentSettingsSvgPort } from '../history/document-settings-svg.port';
import type { DocumentReadinessPort } from '../history/document-readiness.port';
import type { AppRootSvgManipulationPort, SvgDebugPanelSvgPort } from '../history/editor-chrome-svg.port';
import type { SvgExportImagePolicyResult } from '../utils/svg-export-image-href-policy';
import type { GradientFillEditorSvgPort } from '../history/gradient-fill-editor-svg.port';
import type { LayersPanelSvgPort } from '../history/layers-panel-svg.port';
import type { PropertiesPanelSvgPort } from '../history/properties-panel-svg.port';
import type { EditorShapeLifecycleSvgPort, PathDataEditorSvgPort, PathNodeHandleLinkSvgPort } from '../history/editor-shape-lifecycle-svg.port';
import type { RasterImageInsertSvgPort } from '../history/raster-image-insert.port';
import type { ResizeHandle } from '../utils/selection-resize';
import type { AxisAlignedRect } from '../utils/marquee-selection';

export type { CreatableShapeType, InsertRasterImageAttrs, ShapeCreationAttrs } from './svg-shape-content.port';
export type { LayerStackItem, LayerTreeNode, LayerRowKind } from './svg-layer-structure.port';

@Injectable({
  providedIn: 'root'
})
export class SvgManipulationService
  implements
    TransformGestureDocSvgPort,
    SelectionTransformApplySvgPort,
    ChromeEditorApplySvgPort,
    SelectionTransformReadoutSvgPort,
    DocumentSettingsSvgPort,
    SvgDebugPanelSvgPort,
    AppRootSvgManipulationPort,
    DocumentReadinessPort,
    GradientFillEditorSvgPort,
    LayersPanelSvgPort,
    PropertiesPanelSvgPort,
    EditorShapeLifecycleSvgPort,
    RasterImageInsertSvgPort,
    PathDataEditorSvgPort,
    PathNodeHandleLinkSvgPort,
    ClipPathSvgPort
{
  private readonly doc = inject(SvgEditorDocumentService);
  private readonly exportSvc = inject(SvgExportService);
  private readonly gradients = inject(SvgGradientDefsService);
  private readonly layers = inject(SvgLayerStructureService);
  private readonly geometry = inject(SvgSelectionGeometryService);
  private readonly shapes = inject(SvgShapeContentService);
  private readonly clipPaths = inject(SvgClipPathService);

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
    return this.exportSvc.exportSVG();
  }

  getSvgExportImagePolicyResult(): SvgExportImagePolicyResult {
    return this.exportSvc.getSvgExportImagePolicyResult();
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

  /**
   * Selector-tool selection: when the hit is clipped content, select the clip-path geometry in defs.
   */
  getSelectorSelectionForShape(shape: SvgJsElement): ShapeProperties[] {
    const clipGeomId = this.clipPaths.resolveClipGeometryIdForContentShape(shape);
    if (clipGeomId) {
      const geom = this.doc.getSVGInstance()?.findOne(`#${clipGeomId}`) as SvgJsElement | undefined;
      if (geom) return [this.getShapeProperties(geom)];
    }
    return [this.getShapeProperties(shape)];
  }

  resolveSelectorMarqueeSelection(hits: ShapeProperties[]): ShapeProperties[] {
    if (hits.length === 0) return [];
    const seen = new Set<string>();
    const result: ShapeProperties[] = [];
    for (const hit of hits) {
      const shape = this.doc.getSVGInstance()?.findOne(`#${hit.id}`) as SvgJsElement | undefined;
      if (!shape) continue;
      for (const props of this.getSelectorSelectionForShape(shape)) {
        if (!seen.has(props.id)) {
          seen.add(props.id);
          result.push(props);
        }
      }
    }
    return result;
  }

  expandSelectionByClipGroups(shapes: ShapeProperties[]): ShapeProperties[] {
    return this.shapes.expandSelectionByClipGroupsReadingWith(shapes, (el) =>
      this.getShapeProperties(el)
    );
  }

  updateFillColor(shapeId: string, color: string): void {
    const previous = this.readShapePaintAttr(shapeId, 'fill');
    this.shapes.updateFillColor(shapeId, color);
    this.gradients.purgeGradientDefForReleasedPaintAttr(previous);
  }

  addStroke(shapeId: string, color: string, width: number): void {
    const previous = this.readShapePaintAttr(shapeId, 'stroke');
    this.shapes.addStroke(shapeId, color, width);
    this.gradients.purgeGradientDefForReleasedPaintAttr(previous);
  }

  removeStroke(shapeId: string): void {
    const previous = this.readShapePaintAttr(shapeId, 'stroke');
    this.shapes.removeStroke(shapeId);
    this.gradients.purgeGradientDefForReleasedPaintAttr(previous);
  }

  updateStrokeColor(shapeId: string, color: string): void {
    const previous = this.readShapePaintAttr(shapeId, 'stroke');
    this.shapes.updateStrokeColor(shapeId, color);
    this.gradients.purgeGradientDefForReleasedPaintAttr(previous);
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

  getPathNodeHandleLinkRaw(pathId: string): string | null {
    return this.shapes.getPathNodeHandleLinkRaw(pathId);
  }

  setPathNodeHandleLinkRaw(pathId: string, value: string | null): void {
    this.shapes.setPathNodeHandleLinkRaw(pathId, value);
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

  updateRectCornerRadius(shapeId: string, radius: number): void {
    this.shapes.updateRectCornerRadius(shapeId, radius);
  }

  restoreRectCornerRadii(shapeId: string, rx: number, ry: number): void {
    this.shapes.restoreRectCornerRadii(shapeId, rx, ry);
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
    serializedMarkup: ReadonlyMap<string, LiveTreeMarkup>,
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
    return this.geometry.getUnionBBox(shapeIds, options);
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

  restoreSelectionTransformsFromSnapshot(shapeIds: string[], snapshot: Map<string, Matrix>): void {
    this.geometry.restoreSelectionTransformsFromSnapshot(shapeIds, snapshot);
  }

  getShapePropertiesIntersectingRect(rect: AxisAlignedRect): ShapeProperties[] {
    return this.shapes.getShapePropertiesIntersectingRect(rect);
  }

  clearHighlight(): void {
    this.shapes.clearHighlight();
  }

  removeShapes(shapeIds: string[]): void {
    this.shapes.removeShapes(shapeIds);
    this.gradients.purgeUnreferencedGradientDefs();
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

  insertRasterImageIntoContentGroup(attrs: InsertRasterImageAttrs): string | null {
    return this.shapes.insertRasterImageIntoContentGroup(attrs);
  }

  removeShape(shapeId: string): void {
    this.shapes.removeShape(shapeId);
    this.gradients.purgeUnreferencedGradientDefs();
  }

  insertShapeMarkup(markup: LiveTreeMarkup, insertionIndex?: number): void {
    this.shapes.insertShapeMarkup(markup, insertionIndex);
  }

  createClipboardPayload(shapeIds: string[]): ClipboardPayload {
    return this.shapes.createClipboardPayload(shapeIds);
  }

  pasteClipboardPayload(
    payload: ClipboardPayload,
    offset: { dx: number; dy: number }
  ): { insertedIds: string[]; insertedMarkup: LiveTreeMarkup[] } {
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

  restoreElementSiblingOrder(elementId: string, oldIndex: number): void {
    this.layers.restoreElementSiblingOrder(elementId, oldIndex);
  }

  toggleLayerVisibility(elementId: string): boolean {
    return this.layers.toggleLayerVisibility(elementId);
  }

  isElementDirectLocked(elementId: string): boolean {
    return this.layers.isElementDirectLocked(elementId);
  }

  isElementOrAncestorLocked(elementId: string): boolean {
    return this.layers.isElementOrAncestorLocked(elementId);
  }

  setLayerLocked(elementId: string, locked: boolean): void {
    this.layers.setLayerLocked(elementId, locked);
  }

  moveElementBeforeNextSibling(elementId: string, referenceNextSiblingId: string | null): boolean {
    return this.layers.moveElementBeforeNextSibling(elementId, referenceNextSiblingId);
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

  addElementsToGroup(
    elementIds: string[],
    targetGroupId: string,
    referenceNextSiblingId?: string | null
  ): string[] | null {
    return this.layers.addElementsToGroup(elementIds, targetGroupId, referenceNextSiblingId);
  }

  removeElementsFromGroup(elementIds: string[]): string[] | null {
    return this.layers.removeElementsFromGroup(elementIds);
  }

  reparentElementsToParent(
    elementIds: string[],
    targetParentId: string | null,
    referenceNextSiblingId: string | null
  ): string[] | null {
    return this.layers.reparentElementsToParent(elementIds, targetParentId, referenceNextSiblingId);
  }

  snapshotElementParentOrder(elementIds: string[]) {
    return this.layers.snapshotElementParentOrder(elementIds);
  }

  restoreElementParentOrder(
    elementId: string,
    formerParentId: string | null,
    oldIndex: number
  ): void {
    this.layers.restoreElementParentOrder(elementId, formerParentId, oldIndex);
  }

  isUserGroupId(groupId: string): boolean {
    return this.layers.isUserGroupId(groupId);
  }

  isGroupClipMaskCarrier(groupId: string): boolean {
    return this.layers.isGroupClipMaskCarrier(groupId);
  }

  renameElement(elementId: string, newName: string): void {
    this.layers.renameElement(elementId, newName);
  }

  getElementDataName(elementId: string): string | null {
    return this.layers.getElementDataName(elementId);
  }

  setElementDataName(elementId: string, value: string | null): void {
    this.layers.setElementDataName(elementId, value);
  }

  resolveLayerDisplayName(elementId: string, kind: LayerRowKind): string {
    return this.layers.resolveLayerDisplayName(elementId, kind);
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

  purgeGradientDefIfUnreferenced(defId: string | null | undefined): void {
    this.gradients.purgeGradientDefIfUnreferenced(defId);
  }

  purgeGradientDefForReleasedPaintAttr(paintAttr: string | null | undefined): void {
    this.gradients.purgeGradientDefForReleasedPaintAttr(paintAttr);
  }

  purgeUnreferencedGradientDefs(): void {
    this.gradients.purgeUnreferencedGradientDefs();
  }

  private readShapePaintAttr(shapeId: string, paintProperty: 'fill' | 'stroke'): string | null {
    const shape = this.doc.getSVGInstance()?.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    return (shape?.attr(paintProperty) as string | null) ?? null;
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

  getShapeBBoxForGradient(shapeId: string): { x: number; y: number; width: number; height: number } | null {
    return this.getShapeBBox(shapeId, { preferScreenBounds: false });
  }

  makeClipPathFromSelection(contentIds: string[], clipShapeId: string): MakeClipPathResult | null {
    return this.clipPaths.makeClipPathFromSelection(contentIds, clipShapeId);
  }

  undoMakeClipPath(
    snapshot: MakeClipPathUndoSnapshot,
    carrierGroupId: string,
    clipPathDefId: string
  ): void {
    this.clipPaths.undoMakeClipPath(snapshot, carrierGroupId, clipPathDefId);
  }

  releaseClipPathForSelection(shapeIds: string[]): ReleaseClipPathResult | null {
    return this.clipPaths.releaseClipPathForSelection(shapeIds);
  }

  undoReleaseClipPath(snapshot: ReleaseClipPathUndoSnapshot): string | null {
    return this.clipPaths.undoReleaseClipPath(snapshot);
  }

  findClipCarrierForShape(shapeId: string): string | null {
    return this.clipPaths.findClipCarrierForShape(shapeId);
  }

  resolveClipGeometryIdForContentShape(shape: SvgJsElement): string | null {
    return this.clipPaths.resolveClipGeometryIdForContentShape(shape);
  }

  resolveClipCarrierForShapeId(shapeId: string): Element | null {
    return this.clipPaths.resolveClipCarrierForShapeId(shapeId);
  }

  canMakeClipPath(shapeIds: string[]): boolean {
    return this.clipPaths.canMakeClipPath(shapeIds);
  }

  canReleaseClipPath(shapeIds: string[]): boolean {
    return this.clipPaths.canReleaseClipPath(shapeIds);
  }

  getClipPathTransformMemberIds(seedShapeId: string): string[] | null {
    return this.clipPaths.getClipPathTransformMemberIds(seedShapeId);
  }

  /**
   * Expand selection for drag/transform so clip-path content and clip geometry move together.
   */
  expandSelectionForClipPathTransform(selectedIds: string[]): string[] {
    if (selectedIds.length === 0) return [];
    const expanded = new Set<string>();
    for (const id of selectedIds) {
      const members = this.clipPaths.getClipPathTransformMemberIds(id);
      if (members) {
        for (const memberId of members) expanded.add(memberId);
      } else {
        expanded.add(id);
      }
    }
    const shapes = [...expanded]
      .map((id) => this.doc.getSVGInstance()?.findOne(`#${id}`) as SvgJsElement | undefined)
      .filter((el): el is SvgJsElement => el != null)
      .map((el) => this.getShapeProperties(el));
    for (const props of this.shapes.expandSelectionByClipGroups(shapes)) {
      expanded.add(props.id);
      const members = this.clipPaths.getClipPathTransformMemberIds(props.id);
      if (members) {
        for (const memberId of members) expanded.add(memberId);
      }
    }
    const all = [...expanded];
    const inContentOrder = this.getShapeIdsInDomOrder(all);
    const contentSet = new Set(inContentOrder);
    const defsMembers = all.filter((id) => !contentSet.has(id));
    return [...inContentOrder, ...defsMembers];
  }
}
