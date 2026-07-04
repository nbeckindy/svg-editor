import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import type { EditableGradientKind, GradientEndpointSpan, GradientStopModel } from '../../models/svg-gradient';

const MIN_ENDPOINT_SPAN = 2;

type DragKind = 'stop' | 'start-endpoint' | 'end-endpoint';

@Component({
  selector: 'app-gradient-stop-slider',
  templateUrl: './gradient-stop-slider.component.html',
  styleUrl: './gradient-stop-slider.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    tabindex: '0',
    '(document:pointermove)': 'onDocumentPointerMove($event)',
    '(document:pointerup)': 'onDocumentPointerUp($event)',
    '(document:keydown)': 'onDocumentKeyDown($event)',
    '(pointerdown)': 'onHostPointerDown($event)',
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'onFocusOut($event)'
  }
})
export class GradientStopSliderComponent {
  readonly kind = input<EditableGradientKind>('linear');
  readonly stops = input.required<GradientStopModel[]>();
  readonly previewCss = input.required<string>();
  readonly disabled = input(false);
  readonly selectedIndex = input(0);
  readonly endpointSpan = input<GradientEndpointSpan>({ start: 0, end: 100 });

  readonly stopsChange = output<GradientStopModel[]>();
  readonly selectedIndexChange = output<number>();
  readonly addStopAt = output<number>();
  readonly removeStop = output<number>();
  readonly endpointSpanChange = output<GradientEndpointSpan>();
  readonly interactingChange = output<boolean>();

  private readonly trackRef = viewChild<ElementRef<HTMLElement>>('track');

  private readonly dragKind = signal<DragKind | null>(null);
  private readonly dragStopIndex = signal(-1);
  private readonly focused = signal(false);

  readonly sortedStopIndices = computed(() =>
    this.stops()
      .map((_, index) => index)
      .sort((a, b) => this.parseOffset(this.stops()[a]?.offset) - this.parseOffset(this.stops()[b]?.offset))
  );

  readonly stopTrackPositions = computed(() => {
    const span = this.normalizedSpan();
    return this.stops().map((stop) => this.svgOffsetToTrackPosition(this.parseOffset(stop.offset), span));
  });

  trackBackgroundStyle(): string {
    return this.previewCss();
  }

  normalizedSpan(): GradientEndpointSpan {
    const span = this.endpointSpan();
    const start = Math.min(span.start, span.end);
    const end = Math.max(span.start, span.end);
    return { start, end: Math.max(end, start + MIN_ENDPOINT_SPAN) };
  }

  onHostPointerDown(event: PointerEvent): void {
    if (this.disabled()) return;
    (event.currentTarget as HTMLElement)?.focus();
  }

  onFocusIn(): void {
    this.focused.set(true);
  }

  onTrackPointerDown(event: PointerEvent): void {
    if (this.disabled()) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-stop-handle], [data-endpoint-handle]')) return;
    event.preventDefault();
    const trackPos = this.trackPositionFromClientX(event.clientX);
    const span = this.normalizedSpan();
    if (trackPos < span.start || trackPos > span.end) return;
    const svgOffset = this.trackPositionToSvgOffset(trackPos, span);
    this.addStopAt.emit(Math.round(svgOffset * 10) / 10);
    this.interactingChange.emit(true);
    this.interactingChange.emit(false);
  }

  onStopPointerDown(event: PointerEvent, index: number): void {
    if (this.disabled()) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectedIndexChange.emit(index);
    this.dragKind.set('stop');
    this.dragStopIndex.set(index);
    this.interactingChange.emit(true);
  }

  onEndpointPointerDown(event: PointerEvent, which: 'start' | 'end'): void {
    if (this.disabled() || this.kind() !== 'linear') return;
    event.preventDefault();
    event.stopPropagation();
    this.dragKind.set(which === 'start' ? 'start-endpoint' : 'end-endpoint');
    this.interactingChange.emit(true);
  }

  onDocumentPointerMove(event: PointerEvent): void {
    const kind = this.dragKind();
    if (!kind || this.disabled()) return;
    const trackPos = this.trackPositionFromClientX(event.clientX);
    if (kind === 'stop') {
      this.updateStopOffset(this.dragStopIndex(), trackPos);
      return;
    }
    this.updateEndpointSpan(kind, trackPos);
  }

  onDocumentPointerUp(_event: PointerEvent): void {
    if (!this.dragKind()) return;
    this.dragKind.set(null);
    this.dragStopIndex.set(-1);
    this.interactingChange.emit(false);
  }

  onDocumentKeyDown(event: KeyboardEvent): void {
    if (this.disabled() || !this.focused()) return;
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const index = this.selectedIndex();
    if (index < 0 || this.stops().length <= 2) return;
    event.preventDefault();
    this.removeStop.emit(index);
  }

  onFocusOut(event: FocusEvent): void {
    const root = event.currentTarget as HTMLElement | null;
    const next = event.relatedTarget as Node | null;
    if (root && next && root.contains(next)) return;
    this.focused.set(false);
    this.dragKind.set(null);
    this.dragStopIndex.set(-1);
  }

  ariaStopLabel(index: number): string {
    const offset = this.parseOffset(this.stops()[index]?.offset ?? '0%');
    return `Gradient stop at ${Math.round(offset)}%`;
  }

  private updateStopOffset(index: number, trackPos: number): void {
    const stops = [...this.stops()];
    const stop = stops[index];
    if (!stop) return;
    const span = this.normalizedSpan();
    const svgOffset = this.trackPositionToSvgOffset(trackPos, span);
    const sorted = this.sortedStopIndices();
    const order = sorted.indexOf(index);
    const minNeighbor =
      order <= 0 ? 0 : this.parseOffset(stops[sorted[order - 1]!]?.offset ?? '0%') + 0.1;
    const maxNeighbor =
      order >= sorted.length - 1
        ? 100
        : this.parseOffset(stops[sorted[order + 1]!]?.offset ?? '100%') - 0.1;
    const clamped = Math.max(minNeighbor, Math.min(maxNeighbor, svgOffset));
    stops[index] = { ...stop, offset: `${Math.round(clamped * 10) / 10}%` };
    this.stopsChange.emit(stops);
  }

  private updateEndpointSpan(kind: 'start-endpoint' | 'end-endpoint', trackPos: number): void {
    const span = this.normalizedSpan();
    const next =
      kind === 'start-endpoint'
        ? { start: Math.min(trackPos, span.end - MIN_ENDPOINT_SPAN), end: span.end }
        : { start: span.start, end: Math.max(trackPos, span.start + MIN_ENDPOINT_SPAN) };
    this.endpointSpanChange.emit({
      start: Math.max(0, Math.min(100, next.start)),
      end: Math.max(0, Math.min(100, next.end))
    });
  }

  private trackPositionFromClientX(clientX: number): number {
    const track = this.trackRef()?.nativeElement;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(100, ratio * 100));
  }

  private svgOffsetToTrackPosition(offset: number, span: GradientEndpointSpan): number {
    if (this.kind() === 'radial') return offset;
    const range = span.end - span.start || 1;
    return span.start + (offset / 100) * range;
  }

  private trackPositionToSvgOffset(trackPos: number, span: GradientEndpointSpan): number {
    if (this.kind() === 'radial') return trackPos;
    const range = span.end - span.start || 1;
    return ((trackPos - span.start) / range) * 100;
  }

  private parseOffset(raw: string | undefined): number {
    const t = (raw ?? '0%').trim();
    if (t.endsWith('%')) {
      const n = Number.parseFloat(t.slice(0, -1));
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n)) return 0;
    return n <= 1 ? n * 100 : n;
  }
}
