import { Injectable } from '@angular/core';
import { screenPointToRootSvgUserPoint } from '../utils/svg-screen-user';
import type { CanvasSvgPoint } from '../tools/canvas-adapter-context';

export type OverlayViewBox = { vbMinX: number; vbMinY: number; vbW: number; vbH: number };

export interface CanvasCoordinateMappingBindings {
  getMainSvgElement(): SVGSVGElement | null;
  getOverlayViewBoxString(): string;
  getZoomWrapperElement(): HTMLElement | null;
  getCanvasScale(): number;
  getWrapperWidth(): number;
  getWrapperHeight(): number;
}

/**
 * Maps between client/screen coordinates, document SVG user space, and overlay pixel space.
 * Bind from {@link SvgCanvasComponent} once view refs exist.
 */
@Injectable({ providedIn: 'root' })
export class CanvasCoordinateMappingService {
  private bindings: CanvasCoordinateMappingBindings | null = null;

  bind(bindings: CanvasCoordinateMappingBindings): void {
    this.bindings = bindings;
  }

  unbind(): void {
    this.bindings = null;
  }

  parseOverlayViewBox(overlayViewBox?: string): OverlayViewBox | null {
    const raw = overlayViewBox ?? this.bindings?.getOverlayViewBoxString() ?? '';
    const parts = raw.split(/\s+/);
    if (parts.length < 4) return null;
    return {
      vbMinX: Number(parts[0]) || 0,
      vbMinY: Number(parts[1]) || 0,
      vbW: Number(parts[2]) || 100,
      vbH: Number(parts[3]) || 100
    };
  }

  clientToEditorSvgPoint(clientX: number, clientY: number): CanvasSvgPoint | null {
    const mainSvg = this.bindings?.getMainSvgElement() ?? null;
    if (!mainSvg) return null;
    const fromCtm = screenPointToRootSvgUserPoint(mainSvg, clientX, clientY);
    if (fromCtm) return fromCtm;
    const vb = this.parseOverlayViewBox();
    const r = mainSvg.getBoundingClientRect();
    if (!vb || r.width <= 0 || r.height <= 0) return null;
    const { vbMinX, vbMinY, vbW, vbH } = vb;
    return {
      x: vbMinX + ((clientX - r.left) / r.width) * vbW,
      y: vbMinY + ((clientY - r.top) / r.height) * vbH
    };
  }

  svgBboxToOverlayPixels(bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): { x: number; y: number; width: number; height: number } {
    const b = this.bindings;
    const parts = (b?.getOverlayViewBoxString() ?? '0 0 100 100').split(/\s+/);
    const vbMinX = parts.length >= 4 ? Number(parts[0]) || 0 : 0;
    const vbMinY = parts.length >= 4 ? Number(parts[1]) || 0 : 0;
    const vbW = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
    const vbH = parts.length >= 4 ? Number(parts[3]) || 100 : 100;
    const canvasScale = b?.getCanvasScale() ?? 1;
    const mainSvg = b?.getMainSvgElement() ?? null;
    if (!mainSvg) {
      const wrapperWidth = b?.getWrapperWidth() ?? 100;
      const wrapperHeight = b?.getWrapperHeight() ?? 100;
      const sx = (wrapperWidth * canvasScale) / vbW;
      const sy = (wrapperHeight * canvasScale) / vbH;
      return {
        x: (bbox.x - vbMinX) * sx,
        y: (bbox.y - vbMinY) * sy,
        width: bbox.width * sx,
        height: bbox.height * sy
      };
    }
    const wrapperRect = b?.getZoomWrapperElement()?.getBoundingClientRect();
    const svgRect = mainSvg.getBoundingClientRect();
    let viewportW = svgRect.width;
    let viewportH = svgRect.height;
    let svgLeftInWrapper = 0;
    let svgTopInWrapper = 0;
    const usingVisualRects = Boolean(wrapperRect && viewportW > 0 && viewportH > 0);
    if (!usingVisualRects) {
      viewportW = b?.getWrapperWidth() ?? viewportW;
      viewportH = b?.getWrapperHeight() ?? viewportH;
    } else {
      svgLeftInWrapper = svgRect.left - wrapperRect!.left;
      svgTopInWrapper = svgRect.top - wrapperRect!.top;
    }
    const par = mainSvg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
    const isNone = par.split(/\s+/)[0] === 'none';
    if (isNone) {
      const sx = (viewportW * (usingVisualRects ? 1 : canvasScale)) / vbW;
      const sy = (viewportH * (usingVisualRects ? 1 : canvasScale)) / vbH;
      const px = svgLeftInWrapper + (bbox.x - vbMinX) * (viewportW / vbW);
      const py = svgTopInWrapper + (bbox.y - vbMinY) * (viewportH / vbH);
      return {
        x: usingVisualRects ? px : px * canvasScale,
        y: usingVisualRects ? py : py * canvasScale,
        width: bbox.width * sx,
        height: bbox.height * sy
      };
    }
    const scaleFit = Math.min(viewportW / vbW, viewportH / vbH);
    const align = par.split(/\s+/)[0].toLowerCase();
    const contentW = scaleFit * vbW;
    const contentH = scaleFit * vbH;
    let offsetX: number;
    let offsetY: number;
    if (align.includes('xmin')) offsetX = 0;
    else if (align.includes('xmid')) offsetX = (viewportW - contentW) / 2;
    else offsetX = viewportW - contentW;
    if (align.includes('ymin')) offsetY = 0;
    else if (align.includes('ymid')) offsetY = (viewportH - contentH) / 2;
    else offsetY = viewportH - contentH;
    const viewportX = offsetX + (bbox.x - vbMinX) * scaleFit;
    const viewportY = offsetY + (bbox.y - vbMinY) * scaleFit;
    if (usingVisualRects) {
      return {
        x: svgLeftInWrapper + viewportX,
        y: svgTopInWrapper + viewportY,
        width: bbox.width * scaleFit,
        height: bbox.height * scaleFit
      };
    }
    return {
      x: (svgLeftInWrapper + viewportX) * canvasScale,
      y: (svgTopInWrapper + viewportY) * canvasScale,
      width: bbox.width * scaleFit * canvasScale,
      height: bbox.height * scaleFit * canvasScale
    };
  }
}
