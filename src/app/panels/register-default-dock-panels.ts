import { AlignDistributePanelComponent } from '../components/align-distribute-panel/align-distribute-panel.component';
import { BooleanPathPanelComponent } from '../components/boolean-path-panel/boolean-path-panel.component';
import { ColorsPanelComponent } from '../components/colors-panel/colors-panel.component';
import { DocumentSettingsComponent } from '../components/document-settings/document-settings.component';
import { LayersPanelComponent } from '../components/layers-panel/layers-panel.component';
import { PropertiesPanelComponent } from '../components/properties-panel/properties-panel.component';
import { StrokePanelComponent } from '../components/stroke-panel/stroke-panel.component';
import { TextPanelComponent } from '../components/text-panel/text-panel.component';
import type { DockPanelRegistryService } from './dock-panel-registry.service';
import { pathOpsMultiPathRelevance, textPanelRelevance } from './dock-panel-relevance';

/**
 * Registers the eight dock stack sections in locked product order.
 */
export function registerDefaultDockPanels(registry: DockPanelRegistryService): void {
  registry.register({
    id: 'document',
    label: 'Document',
    order: 1,
    availability: 'always-available',
    component: DocumentSettingsComponent,
    headerTestId: 'dock-section-document',
    areaTestId: 'editor-document-area',
    ariaLabel: 'Document',
    panelClass: 'document-settings-panel',
    defaultExpanded: true
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
    id: 'text',
    label: 'Text',
    order: 3,
    availability: 'selection-aware',
    component: TextPanelComponent,
    headerTestId: 'dock-section-text',
    areaTestId: 'editor-text-area',
    ariaLabel: 'Text',
    panelClass: 'text-panel-host',
    defaultExpanded: false,
    relevantTools: ['text', 'selector'],
    isRelevantWhen: textPanelRelevance
  });

  registry.register({
    id: 'colors',
    label: 'Colors',
    order: 4,
    availability: 'selection-aware',
    component: ColorsPanelComponent,
    headerTestId: 'dock-section-colors',
    areaTestId: 'editor-colors-area',
    ariaLabel: 'Colors',
    panelClass: 'colors-panel-host',
    defaultExpanded: false
  });

  registry.register({
    id: 'stroke',
    label: 'Stroke',
    order: 5,
    availability: 'selection-aware',
    component: StrokePanelComponent,
    headerTestId: 'dock-section-stroke',
    areaTestId: 'editor-stroke-area',
    ariaLabel: 'Stroke',
    panelClass: 'stroke-panel-host',
    defaultExpanded: false
  });

  registry.register({
    id: 'alignDistribute',
    label: 'Align & distribute',
    order: 6,
    availability: 'selection-aware',
    component: AlignDistributePanelComponent,
    headerTestId: 'dock-section-align-distribute',
    areaTestId: 'editor-align-distribute-area',
    ariaLabel: 'Align and distribute',
    panelClass: 'align-distribute-panel-host',
    defaultExpanded: false
  });

  registry.register({
    id: 'layers',
    label: 'Layers',
    order: 7,
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
    order: 8,
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
