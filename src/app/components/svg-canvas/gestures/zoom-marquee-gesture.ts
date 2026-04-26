import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import type { Rect } from './gesture-context';

type ClientPoint = { clientX: number; clientY: number };

export class ZoomMarqueeGesture {
  isActive = false;
  private start: ClientPoint | null = null;
  private endPoint: ClientPoint | null = null;
  private justEnded = false;

  get rect(): Rect | null {
    if (!this.isActive || !this.start || !this.endPoint) return null;
    return {
      x: Math.min(this.start.clientX, this.endPoint.clientX),
      y: Math.min(this.start.clientY, this.endPoint.clientY),
      width: Math.abs(this.endPoint.clientX - this.start.clientX),
      height: Math.abs(this.endPoint.clientY - this.start.clientY)
    };
  }

  startAt(clientX: number, clientY: number): void {
    this.isActive = true;
    this.start = { clientX, clientY };
    this.endPoint = { clientX, clientY };
  }

  move(clientX: number, clientY: number): void {
    if (!this.isActive || !this.start) return;
    this.endPoint = { clientX, clientY };
  }

  toSvgRect(rawRect: DOMRect, scale: number): { x: number; y: number; width: number; height: number } | null {
    if (!this.start || !this.endPoint || scale <= 0) return null;
    const startSvg = {
      x: (this.start.clientX - rawRect.left) / scale,
      y: (this.start.clientY - rawRect.top) / scale
    };
    const endSvg = {
      x: (this.endPoint.clientX - rawRect.left) / scale,
      y: (this.endPoint.clientY - rawRect.top) / scale
    };
    return {
      x: Math.min(startSvg.x, endSvg.x),
      y: Math.min(startSvg.y, endSvg.y),
      width: Math.max(0, Math.abs(endSvg.x - startSvg.x)),
      height: Math.max(0, Math.abs(endSvg.y - startSvg.y))
    };
  }

  isTinyDrag(): boolean {
    const rect = this.rect;
    return !rect || (rect.width < MARQUEE_MIN_DRAG_PX && rect.height < MARQUEE_MIN_DRAG_PX);
  }

  finish(appliedZoom: boolean): void {
    this.justEnded = appliedZoom;
    this.isActive = false;
    this.start = null;
    this.endPoint = null;
  }

  cancel(): void {
    this.isActive = false;
    this.start = null;
    this.endPoint = null;
  }

  consumeJustEnded(): boolean {
    if (!this.justEnded) return false;
    this.justEnded = false;
    return true;
  }
}
