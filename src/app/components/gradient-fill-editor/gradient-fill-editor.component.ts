import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GRADIENT_FILL_EDITOR_SVG_PORT } from '../../services/manipulation-port-tokens';
import { EditorHistoryService } from '../../services/editor-history.service';
import {
  type EditableGradientModel,
  applyLinearGradientAngleDegrees,
  applyLinearGradientEndpointSpan,
  applyRadialCenter,
  applyRadialRadius,
  cssGradientPreviewForSlider,
  interpolateGradientStopColor,
  linearGradientAngleDegrees,
  linearGradientEndpointSpan,
  normalizeGradientModelToObjectBoundingBox,
  serializeGradientElementToOuterHtml,
  switchGradientKindModel,
  type GradientEndpointSpan,
  type GradientStopModel,
  type PaintGradientSnapshot
} from '../../models/svg-gradient';
import { GradientFillSnapshotCommand } from '../../models/editor-commands';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { GradientStopSliderComponent } from '../gradient-stop-slider/gradient-stop-slider.component';

@Component({
  selector: 'app-gradient-fill-editor',
  imports: [CommonModule, FormsModule, ColorPickerComponent, GradientStopSliderComponent],
  templateUrl: './gradient-fill-editor.component.html',
  styleUrl: './gradient-fill-editor.component.css'
})
export class GradientFillEditorComponent {
  readonly shapeId = input.required<string>();
  readonly paintProperty = input<'fill' | 'stroke'>('fill');
  readonly disabled = input(false);

  private readonly svc = inject(GRADIENT_FILL_EDITOR_SVG_PORT);
  private readonly history = inject(EditorHistoryService);

  readonly draftModel = signal<EditableGradientModel | null>(null);
  private undoBaseline: PaintGradientSnapshot | null = null;
  private lastLoadedKey = '';

  readonly selectedStopIndex = signal(0);
  readonly isInteracting = signal(false);

  readonly previewCss = computed(() => {
    const d = this.draftModel();
    if (!d) return 'linear-gradient(90deg, #000 0%, #fff 100%)';
    const span = d.kind === 'linear' ? linearGradientEndpointSpan(d) : undefined;
    return cssGradientPreviewForSlider(d, span);
  });

  readonly endpointSpan = computed((): GradientEndpointSpan => {
    const d = this.draftModel();
    if (!d || d.kind !== 'linear') return { start: 0, end: 100 };
    return linearGradientEndpointSpan(d);
  });

  readonly angleDegrees = computed(() => {
    const d = this.draftModel();
    if (!d || d.kind !== 'linear') return 0;
    return Math.round(linearGradientAngleDegrees(d));
  });

  readonly radialCenterX = computed(() => this.parsePercent(this.draftModel()?.cx, 50));
  readonly radialCenterY = computed(() => this.parsePercent(this.draftModel()?.cy, 50));
  readonly radialRadius = computed(() => this.parsePercent(this.draftModel()?.r, 50));

  constructor() {
    effect(() => {
      if (this.isInteracting()) return;
      const id = this.shapeId();
      const paintProperty = this.paintProperty();
      this.history.revision();
      this.svc.documentRevision();
      const svg = this.svc.getSVGInstance();
      if (!svg) {
        this.draftModel.set(null);
        return;
      }
      this.svc.ensureDedicatedPaintGradient(id, paintProperty);
      const shape = svg.findOne(`#${id}`);
      const rawPaint = (shape?.attr(paintProperty) as string | null) ?? null;
      const m = /url\(\s*#([^)'"\s]+)\s*\)/i.exec(rawPaint?.trim() ?? '');
      const gid = m?.[1];
      if (!gid) {
        this.draftModel.set(null);
        return;
      }
      const model = this.svc.readEditableGradientModelById(gid);
      if (!model) {
        this.draftModel.set(null);
        return;
      }
      this.draftModel.set(JSON.parse(JSON.stringify(model)) as EditableGradientModel);
      const loadKey = `${id}:${paintProperty}`;
      if (loadKey !== this.lastLoadedKey) {
        this.undoBaseline = this.svc.capturePaintGradientSnapshot(id, paintProperty);
        this.lastLoadedKey = loadKey;
        this.selectedStopIndex.set(0);
      }
    });
  }

  onKindChange(kind: 'linear' | 'radial'): void {
    if (this.disabled()) return;
    const d = this.draftModel();
    if (!d || d.kind === kind) return;
    const next = switchGradientKindModel(d, kind);
    next.gradientUnits = 'objectBoundingBox';
    this.draftModel.set(next);
    this.commitLive();
  }

  onInteractingChange(interacting: boolean): void {
    this.isInteracting.set(interacting);
  }

  onStopsChange(stops: GradientStopModel[]): void {
    if (this.disabled()) return;
    const d = this.draftModel();
    if (!d) return;
    this.draftModel.set({ ...d, stops: [...stops] });
    this.commitLive();
  }

  onSelectedStopIndexChange(index: number): void {
    this.selectedStopIndex.set(index);
  }

  onAddStopAt(offsetPercent: number): void {
    if (this.disabled()) return;
    const d = this.draftModel();
    if (!d || d.stops.length >= 16) return;
    const offset = `${offsetPercent}%`;
    const color = interpolateGradientStopColor(d.stops, offsetPercent);
    const stops = [...d.stops, { offset, color }].sort(
      (a, b) => Number.parseFloat(a.offset) - Number.parseFloat(b.offset)
    );
    const newIndex = stops.findIndex((s) => s.offset === offset);
    this.draftModel.set({ ...d, stops });
    this.selectedStopIndex.set(newIndex >= 0 ? newIndex : stops.length - 1);
    this.commitLive();
  }

  onRemoveStop(index: number): void {
    if (this.disabled()) return;
    const d = this.draftModel();
    if (!d || d.stops.length <= 2) return;
    const stops = d.stops.filter((_, i) => i !== index);
    this.draftModel.set({ ...d, stops });
    this.selectedStopIndex.set(Math.min(index, stops.length - 1));
    this.commitLive();
  }

  onEndpointSpanChange(span: GradientEndpointSpan): void {
    if (this.disabled()) return;
    const d = this.draftModel();
    if (!d || d.kind !== 'linear') return;
    this.draftModel.set(applyLinearGradientEndpointSpan(d, span));
    this.commitLive();
  }

  onAngleInput(event: Event): void {
    if (this.disabled()) return;
    const d = this.draftModel();
    if (!d || d.kind !== 'linear') return;
    const raw = (event.target as HTMLInputElement).value;
    const degrees = Number.parseFloat(raw);
    if (!Number.isFinite(degrees)) return;
    this.isInteracting.set(true);
    this.draftModel.set(applyLinearGradientAngleDegrees(d, degrees));
    this.commitLive();
  }

  onAngleChange(): void {
    this.isInteracting.set(false);
  }

  onRadialCenterInput(axis: 'cx' | 'cy', event: Event): void {
    if (this.disabled()) return;
    const d = this.draftModel();
    if (!d || d.kind !== 'radial') return;
    const value = Number.parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.isInteracting.set(true);
    const cx = axis === 'cx' ? value : this.radialCenterX();
    const cy = axis === 'cy' ? value : this.radialCenterY();
    this.draftModel.set(applyRadialCenter(d, cx, cy));
    this.commitLive();
  }

  onRadialRadiusInput(event: Event): void {
    if (this.disabled()) return;
    const d = this.draftModel();
    if (!d || d.kind !== 'radial') return;
    const value = Number.parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.isInteracting.set(true);
    this.draftModel.set(applyRadialRadius(d, value));
    this.commitLive();
  }

  onRadialControlChange(): void {
    this.isInteracting.set(false);
  }

  onStopColor(hex: string): void {
    if (this.disabled()) return;
    const d = this.draftModel();
    const i = this.selectedStopIndex();
    if (!d || !d.stops[i]) return;
    const stops = [...d.stops];
    stops[i] = { ...stops[i], color: hex };
    this.draftModel.set({ ...d, stops });
    this.commitLive();
  }

  commitLive(): void {
    if (this.disabled()) return;
    let d = this.draftModel();
    const sid = this.shapeId();
    const paintProperty = this.paintProperty();
    if (!d || !this.undoBaseline) return;

    if (d.gradientUnits === 'userSpaceOnUse') {
      const bbox = this.svc.getShapeBBoxForGradient(sid);
      if (bbox) {
        d = normalizeGradientModelToObjectBoundingBox(d, bbox);
        this.draftModel.set(d);
      }
    }

    const after: PaintGradientSnapshot = {
      gradientId: d.id,
      shapePaintAttr: `url(#${d.id})`,
      gradientOuterHtml: serializeGradientElementToOuterHtml(d)
    };
    this.history.pushAndExecute(
      new GradientFillSnapshotCommand(this.svc, sid, paintProperty, this.undoBaseline, after)
    );
    this.undoBaseline = this.svc.capturePaintGradientSnapshot(sid, paintProperty);
  }

  private parsePercent(raw: string | undefined, fallback: number): number {
    if (raw == null || raw === '') return fallback;
    const t = raw.trim();
    if (t.endsWith('%')) {
      const n = Number.parseFloat(t.slice(0, -1));
      return Number.isFinite(n) ? n : fallback;
    }
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n)) return fallback;
    return n <= 1 ? n * 100 : n;
  }
}
