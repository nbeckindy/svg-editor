import { BooleanPathPanelComponent } from '../components/boolean-path-panel/boolean-path-panel.component';
import { LayersPanelComponent } from '../components/layers-panel/layers-panel.component';
import { PropertiesPanelComponent } from '../components/properties-panel/properties-panel.component';
import type { DockPanelRegistryService } from './dock-panel-registry.service';
import { pathOpsMultiPathRelevance } from './dock-panel-relevance';

/**
 * Registers the seven dock stack sections in locked product order.
 * Document / Colors / Stroke / Align use placeholders until later uos beads.
 */
export function registerDefaultDockPanels(registry: DockPanelRegistryService): void {
  registry.register({
    id: 'document',
    label: 'Document',
    order: 1,
    availability: 'always-available',
    headerTestId: 'dock-section-document',
    areaTestId: 'editor-document-area',
    ariaLabel: 'Document',
    defaultExpanded: false,
    placeholderMessage: 'Document settings will appear here.'
  });

  registry.register({
    id: 'properties',
    label: 'Properties',
    order: 2,
    availability: 'selection-aware',
    component: PropertiesPanelComponent,
    headerTestId: 'dock-section-properties',
    areaTestId: 'editor-properties-area',
    ariaLabel: 'Properties',
    panelClass: 'properties-panel',
    defaultExpanded: true
  });

  registry.register({
    id: 'colors',
    label: 'Colors',
    order: 3,
    availability: 'selection-aware',
    headerTestId: 'dock-section-colors',
    areaTestId: 'editor-colors-area',
    ariaLabel: 'Colors',
    defaultExpanded: false,
    placeholderMessage: 'Fill and opacity controls will appear here.'
  });

  registry.register({
    id: 'stroke',
    label: 'Stroke',
    order: 4,
    availability: 'selection-aware',
    headerTestId: 'dock-section-stroke',
    areaTestId: 'editor-stroke-area',
    ariaLabel: 'Stroke',
    defaultExpanded: false,
    placeholderMessage: 'Stroke paint and styling will appear here.'
  });

  registry.register({
    id: 'alignDistribute',
    label: 'Align & distribute',
    order: 5,
    availability: 'selection-aware',
    headerTestId: 'dock-section-align-distribute',
    areaTestId: 'editor-align-distribute-area',
    ariaLabel: 'Align and distribute',
    defaultExpanded: false,
    placeholderMessage: 'Align and distribute controls will appear here.'
  });

  registry.register({
    id: 'layers',
    label: 'Layers',
    order: 6,
    availability: 'always-available',
    component: LayersPanelComponent,
    headerTestId: 'dock-section-layers',
    areaTestId: 'editor-layers-area',
    ariaLabel: 'Layers',
    panelClass: 'layers-panel',
    defaultExpanded: true
  });

  registry.register({
    id: 'pathOps',
    label: 'Path Ops',
    order: 7,
    availability: 'selection-aware',
    component: BooleanPathPanelComponent,
    headerTestId: 'dock-section-path-ops',
    areaTestId: 'editor-path-ops-area',
    ariaLabel: 'Path operations',
    panelClass: 'path-ops-panel-host',
    defaultExpanded: false,
    relevantTools: ['selector'],
    isRelevantWhen: pathOpsMultiPathRelevance
  });
}
