import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SVG_DEBUG_PANEL_SVG_PORT } from '../../services/manipulation-port-tokens';
import { EditorPointerIntentDebugService } from '../../services/editor-pointer-intent-debug.service';
import {
  formatSvgXmlPlain,
  validateSvgXmlForEdit
} from '../../utils/svg-debug-xml';

@Component({
  selector: 'app-svg-debug-panel',
  imports: [CommonModule],
  templateUrl: './svg-debug-panel.component.html',
  styleUrl: './svg-debug-panel.component.css'
})
export class SvgDebugPanelComponent {
  private readonly svg = inject(SVG_DEBUG_PANEL_SVG_PORT);
  private readonly pointerIntentDebug = inject(EditorPointerIntentDebugService);

  readonly svgContentApplied = output<string>();

  readonly isCollapsed = signal(true);
  readonly draftXml = signal('');
  readonly isDirty = signal(false);
  readonly parseError = signal<string | null>(null);

  readonly pointerIntent = this.pointerIntentDebug.snapshot;

  readonly hasDocument = computed(() => {
    this.svg.documentRevision();
    return this.svg.exportSVG().trim().length > 0;
  });

  constructor() {
    effect(() => {
      this.pointerIntentDebug.samplingEnabled.set(!this.isCollapsed());
    });

    effect(() => {
      if (this.isDirty()) {
        return;
      }
      this.svg.documentRevision();
      const raw = this.svg.exportSVG().trim();
      this.draftXml.set(raw ? formatSvgXmlPlain(raw) : '');
      this.parseError.set(null);
    });
  }

  toggleCollapsed(): void {
    this.isCollapsed.update((value) => !value);
  }

  onDraftInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.draftXml.set(value);
    this.isDirty.set(true);
    this.parseError.set(null);
  }

  onDraftKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.applyToCanvas();
    }
  }

  revertDraft(): void {
    this.isDirty.set(false);
    this.parseError.set(null);
    const raw = this.svg.exportSVG().trim();
    this.draftXml.set(raw ? formatSvgXmlPlain(raw) : '');
  }

  applyToCanvas(): void {
    const validation = validateSvgXmlForEdit(this.draftXml());
    if (!validation.ok) {
      this.parseError.set(validation.message ?? 'Invalid SVG.');
      return;
    }

    const trimmed = this.draftXml().trim();
    this.isDirty.set(false);
    this.parseError.set(null);
    this.svgContentApplied.emit(trimmed);
  }
}
