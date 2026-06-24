import type { GridLineOverlay, SmartGuideLineOverlay } from './overlays/canvas-guide-overlay.model';

/** Target number of major ticks visible across the ruler at any zoom level. */
const RULER_TICK_COUNT = 30;

/** Round to nearest "nice" step (1, 2, 5 × 10^n) for readable labels. */
function roundToNiceStep(value: number): number {
  if (value <= 0 || !Number.isFinite(value)) return 1;
  const exp = Math.floor(Math.log10(value));
  const mag = Math.pow(10, exp);
  const normalized = value / mag;
  const nice = normalized <= 1.5 ? 1 : normalized <= 3.5 ? 2 : normalized <= 7.5 ? 5 : 10;
  return mag * nice;
}

/** Host slice for {@link CanvasViewportChromePresenter} (ruler, grid, smart guides). */
export interface CanvasViewportChromePresenterHost {
  getWrapperWidth(): number;
  getWrapperHeight(): number;
  getRulerOriginOffsetX(): number;
  getRulerOriginOffsetY(): number;
  getCanvasScale(): number;
  getCanvasPanX(): number;
  getCanvasPanY(): number;
  isGridSnapEnabled(): boolean;
  hasSvgContent(): boolean;
  isAltKeyPressed(): boolean;
  isDraggingShape(): boolean;
  isResizingSelection(): boolean;
  getDragActiveGuides(): { vertical: number[]; horizontal: number[] };
  getResizeActiveGuides(): { vertical: number[]; horizontal: number[] };
  svgBboxToOverlayPixels(bbox: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  getViewBoxOverlayRect(): { x: number; y: number; width: number; height: number } | null;
}

/** Editor-chrome bindings for rulers, grid, and smart-guide overlays. */
export class CanvasViewportChromePresenter {
  constructor(private readonly host: CanvasViewportChromePresenterHost) {}

  get overlayWidthPx(): number {
    return this.host.getWrapperWidth() * this.host.getCanvasScale();
  }

  get overlayHeightPx(): number {
    return this.host.getWrapperHeight() * this.host.getCanvasScale();
  }

  get zoomLevelPercent(): number {
    return Math.round(this.host.getCanvasScale() * 100);
  }

  get horizontalRulerTicks(): { position: number; value: number; major: boolean }[] {
    const originX = this.host.getRulerOriginOffsetX() + this.host.getCanvasPanX();
    return this.getRulerTicks(
      (0 - originX) / this.host.getCanvasScale(),
      (this.host.getWrapperWidth() - originX) / this.host.getCanvasScale(),
      this.host.getCanvasScale(),
      (svgVal) => this.host.getRulerOriginOffsetX() + this.host.getCanvasPanX() + svgVal * this.host.getCanvasScale(),
      this.host.getWrapperWidth(),
      RULER_TICK_COUNT
    );
  }

  get verticalRulerTicks(): { position: number; value: number; major: boolean }[] {
    const originY = this.host.getRulerOriginOffsetY() + this.host.getCanvasPanY();
    return this.getRulerTicks(
      (0 - originY) / this.host.getCanvasScale(),
      (this.host.getWrapperHeight() - originY) / this.host.getCanvasScale(),
      this.host.getCanvasScale(),
      (svgVal) => this.host.getRulerOriginOffsetY() + this.host.getCanvasPanY() + svgVal * this.host.getCanvasScale(),
      this.host.getWrapperHeight(),
      Math.max(1, Math.floor(RULER_TICK_COUNT / 2))
    );
  }

  get showGridOverlay(): boolean {
    return (
      this.host.isGridSnapEnabled() &&
      this.host.hasSvgContent() &&
      this.host.getWrapperWidth() > 0 &&
      this.host.getWrapperHeight() > 0 &&
      this.host.getCanvasScale() > 0
    );
  }

  get verticalGridLines(): GridLineOverlay[] {
    if (!this.showGridOverlay) return [];
    const { minSvgX, maxSvgX, minSvgY, maxSvgY } = this.getVisibleSvgBoundsFromRulerFrame();
    const step = this.gridStepSvgUnits;
    const majorStep = step * 5;
    const first = Math.floor(minSvgX / step) * step;
    const out: GridLineOverlay[] = [];
    for (let x = first; x <= maxSvgX + step * 0.5; x += step) {
      const xOverlay = this.host.svgBboxToOverlayPixels({ x, y: minSvgY, width: 0, height: 0 }).x;
      const top = this.host.svgBboxToOverlayPixels({ x, y: minSvgY, width: 0, height: 0 }).y;
      const bottom = this.host.svgBboxToOverlayPixels({ x, y: maxSvgY, width: 0, height: 0 }).y;
      const major = Math.abs(x / majorStep - Math.round(x / majorStep)) < 1e-6;
      out.push({
        key: `vx-${x.toFixed(4)}`,
        x1: xOverlay,
        y1: Math.min(top, bottom),
        x2: xOverlay,
        y2: Math.max(top, bottom),
        major
      });
    }
    return out;
  }

  get horizontalGridLines(): GridLineOverlay[] {
    if (!this.showGridOverlay) return [];
    const { minSvgX, maxSvgX, minSvgY, maxSvgY } = this.getVisibleSvgBoundsFromRulerFrame();
    const step = this.gridStepSvgUnits;
    const majorStep = step * 5;
    const first = Math.floor(minSvgY / step) * step;
    const out: GridLineOverlay[] = [];
    for (let y = first; y <= maxSvgY + step * 0.5; y += step) {
      const yOverlay = this.host.svgBboxToOverlayPixels({ x: minSvgX, y, width: 0, height: 0 }).y;
      const left = this.host.svgBboxToOverlayPixels({ x: minSvgX, y, width: 0, height: 0 }).x;
      const right = this.host.svgBboxToOverlayPixels({ x: maxSvgX, y, width: 0, height: 0 }).x;
      const major = Math.abs(y / majorStep - Math.round(y / majorStep)) < 1e-6;
      out.push({
        key: `hy-${y.toFixed(4)}`,
        x1: Math.min(left, right),
        y1: yOverlay,
        x2: Math.max(left, right),
        y2: yOverlay,
        major
      });
    }
    return out;
  }

  get verticalSmartGuideLines(): SmartGuideLineOverlay[] {
    if (this.host.isAltKeyPressed()) return [];
    const guides = this.host.isDraggingShape()
      ? this.host.getDragActiveGuides().vertical
      : this.host.isResizingSelection()
        ? this.host.getResizeActiveGuides().vertical
        : [];
    if (guides.length === 0 || this.overlayHeightPx <= 0) return [];
    return guides.map((x) => {
      const mapped = this.host.svgBboxToOverlayPixels({ x, y: 0, width: 0, height: 0 });
      return {
        key: `smart-v-${x.toFixed(4)}`,
        x1: mapped.x,
        y1: 0,
        x2: mapped.x,
        y2: this.overlayHeightPx
      };
    });
  }

  get horizontalSmartGuideLines(): SmartGuideLineOverlay[] {
    if (this.host.isAltKeyPressed()) return [];
    const guides = this.host.isDraggingShape()
      ? this.host.getDragActiveGuides().horizontal
      : this.host.isResizingSelection()
        ? this.host.getResizeActiveGuides().horizontal
        : [];
    if (guides.length === 0 || this.overlayWidthPx <= 0) return [];
    return guides.map((y) => {
      const mapped = this.host.svgBboxToOverlayPixels({ x: 0, y, width: 0, height: 0 });
      return {
        key: `smart-h-${y.toFixed(4)}`,
        x1: 0,
        y1: mapped.y,
        x2: this.overlayWidthPx,
        y2: mapped.y
      };
    });
  }

  get viewBoxOverlayRect(): { x: number; y: number; width: number; height: number } | null {
    return this.host.getViewBoxOverlayRect();
  }

  get gridStepSvgUnits(): number {
    const baseStep = 10;
    const minScreenSpacingPx = 16;
    const maxScreenSpacingPx = 48;
    const scale = this.host.getCanvasScale();
    if (scale <= 0 || !Number.isFinite(scale)) return baseStep;

    let step = baseStep;
    let screenSpacing = step * scale;
    if (screenSpacing < minScreenSpacingPx) {
      while (screenSpacing < minScreenSpacingPx) {
        step *= 2;
        screenSpacing *= 2;
      }
      return step;
    }
    while (screenSpacing > maxScreenSpacingPx && step > baseStep / 64) {
      step /= 2;
      screenSpacing /= 2;
    }
    return step;
  }

  private getVisibleSvgBoundsFromRulerFrame(): {
    minSvgX: number;
    maxSvgX: number;
    minSvgY: number;
    maxSvgY: number;
  } {
    const originX = this.host.getRulerOriginOffsetX() + this.host.getCanvasPanX();
    const originY = this.host.getRulerOriginOffsetY() + this.host.getCanvasPanY();
    const scale = this.host.getCanvasScale() || 1;
    return {
      minSvgX: (0 - originX) / scale,
      maxSvgX: (this.host.getWrapperWidth() - originX) / scale,
      minSvgY: (0 - originY) / scale,
      maxSvgY: (this.host.getWrapperHeight() - originY) / scale
    };
  }

  private getRulerTicks(
    minSvg: number,
    maxSvg: number,
    scale: number,
    toPosition: (svgVal: number) => number,
    sizePx: number,
    tickCount: number
  ): { position: number; value: number; major: boolean }[] {
    if (sizePx <= 0 || scale <= 0 || tickCount <= 0) return [];
    const visibleRangeSvg = sizePx / scale;
    const rawStep = visibleRangeSvg / tickCount;
    const step = roundToNiceStep(rawStep);
    const minorStep = step / 2;
    const first = Math.floor(minSvg / minorStep) * minorStep;
    const out: { position: number; value: number; major: boolean }[] = [];
    for (let v = first; v <= maxSvg + minorStep * 0.5; v += minorStep) {
      const pos = toPosition(v);
      if (pos >= -0.5 && pos <= sizePx + 0.5) {
        const isMajor = Math.abs(v / step - Math.round(v / step)) < 1e-6;
        out.push({ position: pos, value: isMajor ? Math.round(v) : v, major: isMajor });
      }
    }
    return out;
  }
}
