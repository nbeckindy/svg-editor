import { ChangeDetectorRef, Component, effect, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { GradientFillEditorSvgPort } from '../../history/gradient-fill-editor-svg.port';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import {
  type EditableGradientModel,
  serializeGradientElementToOuterHtml,
  type PaintGradientSnapshot
} from '../../models/svg-gradient';
import { GradientFillSnapshotCommand } from '../../models/editor-commands';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

@Component({
  selector: 'app-gradient-fill-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorPickerComponent],
  templateUrl: './gradient-fill-editor.component.html',
  styleUrl: './gradient-fill-editor.component.css'
})
export class GradientFillEditorComponent {
  readonly shapeId = input.required<string>();
  readonly paintProperty = input<'fill' | 'stroke'>('fill');
  /** When true, gradient edits cannot be committed (e.g. shape is on a locked layer). */
  readonly disabled = input(false);

  private readonly svc: GradientFillEditorSvgPort = inject(SvgManipulationService);
  private readonly history = inject(EditorHistoryService);
  private readonly cdr = inject(ChangeDetectorRef);

  draftModel: EditableGradientModel | null = null;
  private undoBaseline: PaintGradientSnapshot | null = null;
  private lastLoadedKey = '';

  constructor() {
    effect(() => {
      const id = this.shapeId();
      const paintProperty = this.paintProperty();
      this.history.revision();
      this.svc.documentRevision();
      const svg = this.svc.getSVGInstance();
      if (!svg) {
        this.draftModel = null;
        this.cdr.markForCheck();
        return;
      }
      this.svc.ensureDedicatedPaintGradient(id, paintProperty);
      const shape = svg.findOne(`#${id}`);
      const rawPaint = (shape?.attr(paintProperty) as string | null) ?? null;
      const m = /url\(\s*#([^)'"\s]+)\s*\)/i.exec(rawPaint?.trim() ?? '');
      const gid = m?.[1];
      if (!gid) {
        this.draftModel = null;
        this.cdr.markForCheck();
        return;
      }
      const model = this.svc.readEditableGradientModelById(gid);
      if (!model) {
        this.draftModel = null;
        this.cdr.markForCheck();
        return;
      }
      this.draftModel = JSON.parse(JSON.stringify(model)) as EditableGradientModel;
      const loadKey = `${id}:${paintProperty}`;
      if (loadKey !== this.lastLoadedKey) {
        this.undoBaseline = this.svc.capturePaintGradientSnapshot(id, paintProperty);
        this.lastLoadedKey = loadKey;
      }
      this.cdr.markForCheck();
    });
  }

  onKindChange(kind: 'linear' | 'radial'): void {
    if (this.disabled()) return;
    const d = this.draftModel;
    const id = this.shapeId();
    const paintProperty = this.paintProperty();
    if (!d) return;
    if (d.kind === kind) return;
    this.draftModel = this.svc.setGradientKindForShape(id, paintProperty, kind, d);
    this.cdr.markForCheck();
  }

  addStop(): void {
    if (this.disabled()) return;
    const d = this.draftModel;
    if (!d || d.stops.length >= 16) return;
    const last = d.stops[d.stops.length - 1];
    const prev = d.stops[d.stops.length - 2];
    const oa = parseFloat(String(last?.offset ?? '100').replace('%', '')) || 100;
    const ob = parseFloat(String(prev?.offset ?? '0').replace('%', '')) || 0;
    const mid = `${((oa + ob) / 2).toFixed(1)}%`;
    const copy = JSON.parse(JSON.stringify(d)) as EditableGradientModel;
    copy.stops.splice(copy.stops.length - 1, 0, {
      offset: mid,
      color: last?.color ?? '#888888'
    });
    this.draftModel = copy;
    this.cdr.markForCheck();
  }

  removeStop(i: number): void {
    if (this.disabled()) return;
    const d = this.draftModel;
    if (!d || d.stops.length <= 2) return;
    const copy = JSON.parse(JSON.stringify(d)) as EditableGradientModel;
    copy.stops.splice(i, 1);
    this.draftModel = copy;
    this.cdr.markForCheck();
  }

  onStopColor(i: number, hex: string): void {
    if (this.disabled()) return;
    const d = this.draftModel;
    if (!d || !d.stops[i]) return;
    d.stops[i].color = hex;
  }

  commit(): void {
    if (this.disabled()) return;
    const d = this.draftModel;
    const sid = this.shapeId();
    const paintProperty = this.paintProperty();
    if (!d || !this.undoBaseline) return;
    const after: PaintGradientSnapshot = {
      gradientId: d.id,
      shapePaintAttr: `url(#${d.id})`,
      gradientOuterHtml: serializeGradientElementToOuterHtml(d)
    };
    this.history.pushAndExecute(
      new GradientFillSnapshotCommand(this.svc, sid, paintProperty, this.undoBaseline, after)
    );
    this.undoBaseline = this.svc.capturePaintGradientSnapshot(sid, paintProperty);
    this.cdr.markForCheck();
  }
}
