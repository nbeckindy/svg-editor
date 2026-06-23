import { Injectable, signal } from '@angular/core';
import type { DockPanelDescriptor, DockPanelId } from './dock-panel-descriptor';

@Injectable({
  providedIn: 'root'
})
export class DockPanelRegistryService {
  private readonly panelMap = new Map<DockPanelId, DockPanelDescriptor>();
  readonly panels = signal<readonly DockPanelDescriptor[]>([]);

  register(panel: DockPanelDescriptor): void {
    this.panelMap.set(panel.id, panel);
    this.panels.set(Array.from(this.panelMap.values()));
  }

  unregister(panelId: DockPanelId): void {
    this.panelMap.delete(panelId);
    this.panels.set(Array.from(this.panelMap.values()));
  }

  get(panelId: DockPanelId): DockPanelDescriptor | undefined {
    return this.panelMap.get(panelId);
  }

  has(panelId: DockPanelId): boolean {
    return this.panelMap.has(panelId);
  }

  getDefaultPanelId(): DockPanelId {
    return this.panels()[0]?.id ?? 'properties';
  }
}
