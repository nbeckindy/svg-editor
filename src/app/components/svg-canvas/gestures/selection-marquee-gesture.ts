import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import type { GestureContext, Rect } from './gesture-context';

type ClientPoint = { clientX: number; clientY: number };

export class SelectionMarqueeGesture {
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

  move(clientX: number, clientY: number, ctx: GestureContext): void {
    if (!this.isActive || !this.start) return;
    this.endPoint = { clientX, clientY };
    ctx.cdr.detectChanges();
  }

  endAt(clientX: number, clientY: number, shiftKey: boolean, ctx: GestureContext): void {
    if (!this.isActive || !this.start) {
      this.reset();
      return;
    }
    this.endPoint = { clientX, clientY };
    const rect = this.rect;
    if (!rect) {
      this.reset();
      return;
    }

    const isTinyDrag = rect.width < MARQUEE_MIN_DRAG_PX && rect.height < MARQUEE_MIN_DRAG_PX;
    if (!isTinyDrag) {
      const startSvg = ctx.clientToEditorSvgPoint(this.start.clientX, this.start.clientY);
      const endSvg = ctx.clientToEditorSvgPoint(this.endPoint!.clientX, this.endPoint!.clientY);
      if (startSvg && endSvg) {
        const x = Math.min(startSvg.x, endSvg.x);
        const y = Math.min(startSvg.y, endSvg.y);
        const w = Math.max(0, Math.abs(endSvg.x - startSvg.x));
        const h = Math.max(0, Math.abs(endSvg.y - startSvg.y));
        const hits = ctx.svgManipulation.getShapePropertiesIntersectingRect({ x, y, width: w, height: h });
        const expanded = ctx.svgManipulation.expandSelectionByClipGroups(hits);
        if (shiftKey) {
          if (expanded.length > 0) {
            ctx.shapeSelection.mergeShapesIntoSelection(expanded);
          }
        } else if (expanded.length > 0) {
          ctx.shapeSelection.selectShapes(expanded);
        } else {
          ctx.shapeSelection.clearSelection();
        }
        ctx.svgManipulation.clearHighlight();
        this.justEnded = true;
      }
    }

    this.isActive = false;
    this.start = null;
    this.endPoint = null;
    ctx.cdr.detectChanges();
  }

  cancel(): void {
    this.reset();
  }

  consumeJustEnded(): boolean {
    if (!this.justEnded) return false;
    this.justEnded = false;
    return true;
  }

  private reset(): void {
    this.isActive = false;
    this.start = null;
    this.endPoint = null;
  }
}
