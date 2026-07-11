import type { SvgCanvasComponent } from './svg-canvas.component';
import type { PenToolChromeReadout } from './pen-tool-chrome-readout';
import type { PathBooleanChromeReadout } from './path-boolean-chrome-readout';
import type { PathNodeEditSession } from './path-node-edit-session/path-node-edit-session';
import type { InlineTextEditSession } from './inline-text-edit-session/inline-text-edit-session';

export interface SvgCanvasEditorChromeFacadeDeps {
  root: SvgCanvasComponent;
  penChrome: PenToolChromeReadout;
  pathBooleanChrome: PathBooleanChromeReadout;
  pathNodeEditSession: PathNodeEditSession;
  inlineTextEditSession: InlineTextEditSession;
}

/**
 * Single object bound from `svg-canvas.component.html` for **Editor chrome** (overlays, rulers,
 * marquees, pen previews). Logic stays on {@link SvgCanvasComponent}; this façade is the named
 * **seam** agents follow when changing on-canvas presentation — see `CONTEXT.md` (**Editor chrome**).
 */
export class SvgCanvasEditorChromeFacade {
  constructor(private readonly deps: SvgCanvasEditorChromeFacadeDeps) {}

  private get root(): SvgCanvasComponent {
    return this.deps.root;
  }

  get RULER_SIZE(): number {
    return this.root.RULER_SIZE;
  }
  get zoomLevelPercent(): number {
    return this.root.zoomLevelPercent;
  }
  get penFinishFeedbackMessage(): string | null {
    return this.deps.penChrome.penFinishFeedbackMessage;
  }
  get pathNodeEditFeedbackMessage(): string | null {
    return this.deps.pathNodeEditSession.pathNodeEditFeedbackMessage;
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
    return this.deps.pathNodeEditSession.isPathNodeEditModeActive;
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
    return this.deps.penChrome.penInsertOnPathPreviewPathD;
  }
  get penInsertOnPathNodeAffordanceOverlay() {
    return this.deps.penChrome.penInsertOnPathNodeAffordanceOverlay;
  }
  get penSessionPreviewPathD(): string | null {
    return this.deps.penChrome.penSessionPreviewPathD;
  }
  get penCurvePreviewPathD(): string | null {
    return this.deps.penChrome.penCurvePreviewPathD;
  }
  get penFirstAnchorMirroredHandleDragActive(): boolean {
    return this.deps.penChrome.penFirstAnchorMirroredHandleDragActive;
  }
  get penColocatedTipMirroredHandleDragActive(): boolean {
    return this.deps.penChrome.penColocatedTipMirroredHandleDragActive;
  }
  get penCurveHandleOverlays() {
    return this.deps.penChrome.penCurveHandleOverlays;
  }
  get penPendingCurveHandleGuideOverlays() {
    return this.deps.penChrome.penPendingCurveHandleGuideOverlays;
  }
  get penRubberBandOverlay() {
    return this.deps.penChrome.penRubberBandOverlay;
  }
  get penOutgoingHandleGuideOverlay() {
    return this.deps.penChrome.penOutgoingHandleGuideOverlay;
  }
  get penOutgoingHandleKnobOverlay() {
    return this.deps.penChrome.penOutgoingHandleKnobOverlay;
  }
  get penCloseTargetHoverOverlay() {
    return this.deps.penChrome.penCloseTargetHoverOverlay;
  }
  get penOpenPathContinueHoverOverlay() {
    return this.deps.penChrome.penOpenPathContinueHoverOverlay;
  }
  get penContinuationGhostPathD(): string | null {
    return this.deps.penChrome.penContinuationGhostPathD;
  }
  get penPostInsertAnchorOverlays() {
    return this.deps.penChrome.penPostInsertAnchorOverlays;
  }
  get penSessionPathNodeOverlays() {
    return this.deps.penChrome.penSessionPathNodeOverlays;
  }
  get showPathNodeEditOverlays(): boolean {
    return this.root.showPathNodeEditOverlays;
  }
  get pathSelectionOutlineOverlays() {
    return this.root.pathSelectionOutlineOverlays;
  }
  get penSessionPathOutlineOverlayD(): string | null {
    return this.deps.penChrome.penSessionPathOutlineOverlayD;
  }
  get pathBooleanPreviewOverlayD(): string | null {
    return this.deps.pathBooleanChrome.pathBooleanPreviewOverlayD;
  }
  get pathNodeControlHandleOverlays() {
    return this.deps.pathNodeEditSession.getPathNodeControlHandleOverlays();
  }
  get pathNodeAnchorOverlays() {
    return this.deps.pathNodeEditSession.getPathNodeAnchorOverlays();
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
    return this.deps.inlineTextEditSession.isActive;
  }
  get inlineTextEditOverlayRect() {
    return this.deps.inlineTextEditSession.overlayRect;
  }
  get inlineTextEditorHint(): string {
    return this.deps.inlineTextEditSession.inlineTextEditorHint;
  }
  get inlineTextEditValue(): string {
    return this.deps.inlineTextEditSession.value;
  }
  inlineTextEditorTypographyStyle(): string {
    return this.deps.inlineTextEditSession.typographyStyle();
  }
  inlineTextEditWidthPx(rect: { width: number }): number {
    return this.deps.inlineTextEditSession.overlayWidthPx(rect);
  }
  inlineTextEditHeightPx(rect: { height: number }): number {
    return this.deps.inlineTextEditSession.overlayHeightPx(rect);
  }
  get zoomMarqueeRect() {
    return this.root.zoomMarqueeRect;
  }
  get selectionMarqueeRect() {
    return this.root.selectionMarqueeRect;
  }
}
