import { Component, effect, ElementRef, inject, viewChildren } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { DockPanelRegistryService } from '../../panels/dock-panel-registry.service';
import { EditorLayoutService } from '../../services/editor-layout.service';

@Component({
  selector: 'app-editor-right-dock',
  imports: [NgComponentOutlet],
  templateUrl: './editor-right-dock.component.html',
  styleUrl: './editor-right-dock.component.css'
})
export class EditorRightDockComponent {
  protected readonly layout = inject(EditorLayoutService);
  private readonly dockPanelRegistry = inject(DockPanelRegistryService);

  readonly dockPanels = this.dockPanelRegistry.panels;

  private readonly sectionEls = viewChildren<ElementRef<HTMLElement>>('dockSection');

  constructor() {
    effect(() => {
      const sectionId = this.layout.pendingScrollSectionId();
      const sections = this.sectionEls();
      if (!sectionId || sections.length === 0) {
        return;
      }
      const host = sections.find(
        (ref) => ref.nativeElement.dataset['dockSectionId'] === sectionId
      );
      if (!host) {
        return;
      }
      requestAnimationFrame(() => {
        const el = host.nativeElement;
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        this.layout.clearScrollRequest();
      });
    });
  }
}
