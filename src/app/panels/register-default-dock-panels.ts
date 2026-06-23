import { BooleanPathPanelComponent } from '../components/boolean-path-panel/boolean-path-panel.component';
import { LayersPanelComponent } from '../components/layers-panel/layers-panel.component';
import { PropertiesPanelComponent } from '../components/properties-panel/properties-panel.component';
import type { DockPanelRegistryService } from './dock-panel-registry.service';
import { pathOpsMultiPathRelevance } from './dock-panel-relevance';

export function registerDefaultDockPanels(registry: DockPanelRegistryService): void {
  registry.register({
    id: 'properties',
    label: 'Properties',
    component: PropertiesPanelComponent,
    tabTestId: 'dock-tab-properties',
    areaTestId: 'editor-properties-area',
    ariaLabel: 'Properties',
    panelClass: 'properties-panel'
  });

  registry.register({
    id: 'layers',
    label: 'Layers',
    component: LayersPanelComponent,
    tabTestId: 'dock-tab-layers',
    areaTestId: 'editor-layers-area',
    ariaLabel: 'Layers',
    panelClass: 'layers-panel'
  });

  registry.register({
    id: 'pathOps',
    label: 'Path ops',
    component: BooleanPathPanelComponent,
    tabTestId: 'dock-tab-path-ops',
    areaTestId: 'editor-path-ops-area',
    ariaLabel: 'Path operations',
    panelClass: 'path-ops-panel-host',
    relevantTools: ['selector'],
    isRelevantWhen: pathOpsMultiPathRelevance
  });
}
