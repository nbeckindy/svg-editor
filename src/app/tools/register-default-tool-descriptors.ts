import type { ToolRegistryService } from './tool-registry.service';
import type { ToolDescriptor } from './tool-descriptor';

const DEFAULT_TOOL_DESCRIPTORS: readonly ToolDescriptor[] = [
  {
    id: 'selector',
    label: 'Selector',
    title: 'Selector',
    icon: 'cursor-default-outline',
    stripTestId: 'tool-selector',
    ariaLabel: 'Selector',
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 0,
    interactionKind: 'navigation',
    selectorInteraction: true,
    keepsPathNodeTopology: true
  },
  {
    id: 'node-edit-selector',
    label: 'Node edit',
    title: 'Node edit',
    icon: 'vector-polyline-edit',
    stripTestId: 'tool-node-edit-selector',
    ariaLabel: 'Node edit',
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 1,
    interactionKind: 'edit',
    selectorInteraction: true,
    keepsPathNodeTopology: true
  },
  {
    id: 'eyedropper',
    label: 'Eyedropper',
    title: 'Eyedropper (click: fill, Shift+click: stroke)',
    icon: 'eyedropper',
    stripTestId: 'tool-eyedropper',
    ariaLabel: 'Eyedropper',
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 2,
    interactionKind: 'edit'
  },
  {
    id: 'zoom',
    label: 'Zoom',
    title: 'Zoom (Alt+click to zoom out)',
    icon: 'magnify',
    stripTestId: 'tool-zoom',
    ariaLabel: 'Zoom',
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 3,
    interactionKind: 'view'
  },
  {
    id: 'pan',
    label: 'Pan',
    title: 'Pan',
    icon: 'pan',
    stripTestId: 'tool-pan',
    ariaLabel: 'Pan',
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 4,
    interactionKind: 'view'
  },
  {
    id: 'rect',
    label: 'Rectangle',
    title: 'Rectangle',
    icon: 'rectangle-outline',
    stripTestId: 'tool-rect',
    ariaLabel: 'Rectangle',
    stripGroup: 'creation',
    stripGroupLabel: 'Creation tools',
    order: 10,
    interactionKind: 'creation'
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    title: 'Ellipse',
    icon: 'ellipse-outline',
    stripTestId: 'tool-ellipse',
    ariaLabel: 'Ellipse',
    stripGroup: 'creation',
    stripGroupLabel: 'Creation tools',
    order: 11,
    interactionKind: 'creation'
  },
  {
    id: 'line',
    label: 'Line',
    title: 'Line',
    icon: 'vector-line',
    stripTestId: 'tool-line',
    ariaLabel: 'Line',
    stripGroup: 'creation',
    stripGroupLabel: 'Creation tools',
    order: 12,
    interactionKind: 'creation'
  },
  {
    id: 'text',
    label: 'Text',
    title: 'Text',
    icon: 'format-text',
    stripTestId: 'tool-text',
    ariaLabel: 'Text',
    stripGroup: 'creation',
    stripGroupLabel: 'Creation tools',
    order: 13,
    interactionKind: 'edit'
  },
  {
    id: 'pen',
    label: 'Pen',
    title: 'Pen',
    icon: 'fountain-pen',
    stripTestId: 'tool-pen',
    ariaLabel: 'Pen',
    stripGroup: 'creation',
    stripGroupLabel: 'Creation tools',
    order: 14,
    interactionKind: 'edit',
    keepsPathNodeTopology: true
  }
] as const;

export function registerDefaultToolDescriptors(registry: ToolRegistryService): void {
  for (const descriptor of DEFAULT_TOOL_DESCRIPTORS) {
    registry.registerDescriptor(descriptor);
  }
}
