import type { SvgCanvasComponent } from './svg-canvas.component';

/**
 * Single object bound from `svg-canvas.component.html` for **Editor chrome** (overlays, rulers,
 * marquees, pen previews). Logic stays on {@link SvgCanvasComponent}; this façade is the named
 * **seam** agents follow when changing on-canvas presentation — see `CONTEXT.md` (**Editor chrome**).
 */
export class SvgCanvasEditorChromeFacade {
  constructor(private readonly root: SvgCanvasComponent) {}

  get RULER_SIZE(): number {
    return this.root.RULER_SIZE;
  }
  get zoomLevelPercent(): number {
    return this.root.zoomLevelPercent;
  }
  get penFinishFeedbackMessage(): string | null {
    return this.root.penFinishFeedbackMessage;
  }
  get pathNodeEditFeedbackMessage(): string | null {
    return this.root.pathNodeEditFeedbackMessage;
  }
  get wrapperWidth(): number {
    return this.root.wrapperWidth;
  }
  get horizontalRulerTicks() {
    return this.root.horizontalRulerTicks;
  }
  get verticalRulerTicks() {
    return this.root.verticalRulerTicks;
  }
  get overlayWidthPx(): number {
    return this.root.overlayWidthPx;
  }
  get overlayHeightPx(): number {
    return this.root.overlayHeightPx;
  }
  get showGridOverlay(): boolean {
    return this.root.showGridOverlay;
  }
  get verticalGridLines() {
    return this.root.verticalGridLines;
  }
  get horizontalGridLines() {
    return this.root.horizontalGridLines;
  }
  get verticalSmartGuideLines() {
    return this.root.verticalSmartGuideLines;
  }
  get horizontalSmartGuideLines() {
    return this.root.horizontalSmartGuideLines;
  }
  get viewBoxOverlayRect() {
    return this.root.viewBoxOverlayRect;
  }
  get isPathNodeEditModeActive(): boolean {
    return this.root.isPathNodeEditModeActive;
  }
  get hideSelectionHighlightOverlay(): boolean {
    return this.root.hideSelectionHighlightOverlay;
  }
  get highlightRect() {
    return this.root.highlightRect;
  }
  get isRotatingSelection(): boolean {
    return this.root.isRotatingSelection;
  }
  selectionRotateHighlightTransform(hr: { x: number; y: number; width: number; height: number }): string {
    return this.root.selectionRotateHighlightTransform(hr);
  }
  get multiSelectionOutlineRects() {
    return this.root.multiSelectionOutlineRects;
  }
  get creationGhostRect() {
    return this.root.creationGhostRect;
  }
  get creationShapeType(): string {
    return this.root.creationShapeType;
  }
  get creationGhostLineOverlay() {
    return this.root.creationGhostLineOverlay;
  }
  get penInsertOnPathPreviewPathD(): string | null {
    return this.root.penInsertOnPathPreviewPathD;
  }
  get penInsertOnPathNodeAffordanceOverlay() {
    return this.root.penInsertOnPathNodeAffordanceOverlay;
  }
  get penSessionPreviewPathD(): string | null {
    return this.root.penSessionPreviewPathD;
  }
  get penCurvePreviewPathD(): string | null {
    return this.root.penCurvePreviewPathD;
  }
  get penFirstAnchorMirroredHandleDragActive(): boolean {
    return this.root.penFirstAnchorMirroredHandleDragActive;
  }
  get penColocatedTipMirroredHandleDragActive(): boolean {
    return this.root.penColocatedTipMirroredHandleDragActive;
  }
  get penCurveHandleOverlays() {
    return this.root.penCurveHandleOverlays;
  }
  get penPendingCurveHandleGuideOverlays() {
    return this.root.penPendingCurveHandleGuideOverlays;
  }
  get penRubberBandOverlay() {
    return this.root.penRubberBandOverlay;
  }
  get penOutgoingHandleGuideOverlay() {
    return this.root.penOutgoingHandleGuideOverlay;
  }
  get penOutgoingHandleKnobOverlay() {
    return this.root.penOutgoingHandleKnobOverlay;
  }
  get penCloseTargetHoverOverlay() {
    return this.root.penCloseTargetHoverOverlay;
  }
  get penOpenPathContinueHoverOverlay() {
    return this.root.penOpenPathContinueHoverOverlay;
  }
  get penContinuationGhostPathD(): string | null {
    return this.root.penContinuationGhostPathD;
  }
  get penSessionPathNodeOverlays() {
    return this.root.penSessionPathNodeOverlays;
  }
  get showPathNodeEditOverlays(): boolean {
    return this.root.showPathNodeEditOverlays;
  }
  get pathSelectionOutlineOverlays() {
    return this.root.pathSelectionOutlineOverlays;
  }
  get penSessionPathOutlineOverlayD(): string | null {
    return this.root.penSessionPathOutlineOverlayD;
  }
  get pathNodeControlHandleOverlays() {
    return this.root.pathNodeControlHandleOverlays;
  }
  get pathNodeAnchorOverlays() {
    return this.root.pathNodeAnchorOverlays;
  }
  get showResizeHandles(): boolean {
    return this.root.showResizeHandles;
  }
  get showSelectionSkewHandles(): boolean {
    return this.root.showSelectionSkewHandles;
  }
  get selectionHandleRadiusOverlay(): number {
    return this.root.selectionHandleRadiusOverlay;
  }
  get selectionSkewEdgeOutset(): number {
    return this.root.selectionSkewEdgeOutset;
  }
  get rotateHandleOffset(): number {
    return this.root.rotateHandleOffset;
  }
  get isInlineTextEditModeActive(): boolean {
    return this.root.isInlineTextEditModeActive;
  }
  get inlineTextEditOverlayRect() {
    return this.root.inlineTextEditOverlayRect;
  }
  get inlineTextEditorHint(): string {
    return this.root.inlineTextEditorHint;
  }
  get inlineTextEditValue(): string {
    return this.root.inlineTextEditValue;
  }
  inlineTextEditorTypographyStyle(): string {
    return this.root.inlineTextEditorTypographyStyle();
  }
  inlineTextEditWidthPx(rect: { width: number }): number {
    return this.root.inlineTextEditWidthPx(rect);
  }
  inlineTextEditHeightPx(rect: { height: number }): number {
    return this.root.inlineTextEditHeightPx(rect);
  }
  get zoomMarqueeRect() {
    return this.root.zoomMarqueeRect;
  }
  get selectionMarqueeRect() {
    return this.root.selectionMarqueeRect;
  }
}
