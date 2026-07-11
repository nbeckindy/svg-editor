import type { EditorTool } from '../services/editor-tool.service';
import type { ToolDescriptor } from './tool-descriptor';
import type { ToolRegistryService } from './tool-registry.service';

/** Which canvas-bound registrar hook registers this tool's {@link CanvasTool} adapter. */
export type CanvasToolRegistrationGroup =
  | 'creation'
  | 'selector'
  | 'pen'
  | 'zoom'
  | 'pan'
  | 'text'
  | 'eyedropper';

export interface ToolBundle {
  readonly descriptor: ToolDescriptor;
  /** Single-letter editor shortcut (lowercase). */
  readonly shortcutKey?: string;
  readonly canvasRegistrationGroup: CanvasToolRegistrationGroup;
}

/** Keys that consume a shortcut but do not activate a tool (e.g. brush reserved). */
export const RESERVED_EDITOR_TOOL_SHORTCUT_KEYS = ['b'] as const;

const selectorBundle = {
  descriptor: {
    id: 'selector',
    label: 'Selector',
    title: 'Selector',
    icon: 'near_me',
    stripTestId: 'tool-selector',
    ariaLabel: 'Selector',
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 0,
    interactionKind: 'navigation',
    selectorInteraction: true,
    keepsPathNodeTopology: true
  },
  shortcutKey: 'v',
  canvasRegistrationGroup: 'selector'
} as const satisfies ToolBundle;

const nodeEditSelectorBundle = {
  descriptor: {
    id: 'node-edit-selector',
    label: 'Node edit',
    title: 'Node edit',
    icon: 'polyline',
    stripTestId: 'tool-node-edit-selector',
    ariaLabel: 'Node edit',
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 1,
    interactionKind: 'edit',
    selectorInteraction: true,
    keepsPathNodeTopology: true
  },
  shortcutKey: 'a',
  canvasRegistrationGroup: 'selector'
} as const satisfies ToolBundle;

const eyedropperBundle = {
  descriptor: {
    id: 'eyedropper',
    label: 'Eyedropper',
    title: 'Eyedropper (click: fill, Shift+click: stroke)',
    icon: 'colorize',
    stripTestId: 'tool-eyedropper',
    ariaLabel: 'Eyedropper',
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 2,
    interactionKind: 'edit'
  },
  shortcutKey: 'i',
  canvasRegistrationGroup: 'eyedropper'
} as const satisfies ToolBundle;

const zoomBundle = {
  descriptor: {
    id: 'zoom',
    label: 'Zoom',
    title: 'Zoom (Alt+click to zoom out)',
    icon: 'zoom_in',
    stripTestId: 'tool-zoom',
    ariaLabel: 'Zoom',
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 3,
    interactionKind: 'view'
  },
  shortcutKey: 'z',
  canvasRegistrationGroup: 'zoom'
} as const satisfies ToolBundle;

const panBundle = {
  descriptor: {
    id: 'pan',
    label: 'Pan',
    title: 'Pan',
    icon: 'pan_tool',
    stripTestId: 'tool-pan',
    ariaLabel: 'Pan',
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 4,
    interactionKind: 'view'
  },
  shortcutKey: 'h',
  canvasRegistrationGroup: 'pan'
} as const satisfies ToolBundle;

const rectBundle = {
  descriptor: {
    id: 'rect',
    label: 'Rectangle',
    title: 'Rectangle',
    icon: 'crop_square',
    stripTestId: 'tool-rect',
    ariaLabel: 'Rectangle',
    stripGroup: 'creation',
    stripGroupLabel: 'Creation tools',
    order: 10,
    interactionKind: 'creation'
  },
  shortcutKey: 'r',
  canvasRegistrationGroup: 'creation'
} as const satisfies ToolBundle;

const ellipseBundle = {
  descriptor: {
    id: 'ellipse',
    label: 'Ellipse',
    title: 'Ellipse',
    icon: 'circle',
    stripTestId: 'tool-ellipse',
    ariaLabel: 'Ellipse',
    stripGroup: 'creation',
    stripGroupLabel: 'Creation tools',
    order: 11,
    interactionKind: 'creation'
  },
  shortcutKey: 'o',
  canvasRegistrationGroup: 'creation'
} as const satisfies ToolBundle;

const lineBundle = {
  descriptor: {
    id: 'line',
    label: 'Line',
    title: 'Line',
    icon: 'diagonal_line',
    stripTestId: 'tool-line',
    ariaLabel: 'Line',
    stripGroup: 'creation',
    stripGroupLabel: 'Creation tools',
    order: 12,
    interactionKind: 'creation'
  },
  shortcutKey: 'l',
  canvasRegistrationGroup: 'creation'
} as const satisfies ToolBundle;

const textBundle = {
  descriptor: {
    id: 'text',
    label: 'Text',
    title: 'Text',
    icon: 'text_fields',
    stripTestId: 'tool-text',
    ariaLabel: 'Text',
    stripGroup: 'creation',
    stripGroupLabel: 'Creation tools',
    order: 13,
    interactionKind: 'edit'
  },
  shortcutKey: 't',
  canvasRegistrationGroup: 'text'
} as const satisfies ToolBundle;

const penBundle = {
  descriptor: {
    id: 'pen',
    label: 'Pen',
    title: 'Pen',
    icon: 'ink_pen',
    stripTestId: 'tool-pen',
    ariaLabel: 'Pen',
    stripGroup: 'creation',
    stripGroupLabel: 'Creation tools',
    order: 14,
    interactionKind: 'edit',
    keepsPathNodeTopology: true
  },
  shortcutKey: 'p',
  canvasRegistrationGroup: 'pen'
} as const satisfies ToolBundle;

export const DEFAULT_TOOL_BUNDLES = [
  selectorBundle,
  nodeEditSelectorBundle,
  eyedropperBundle,
  zoomBundle,
  panBundle,
  rectBundle,
  ellipseBundle,
  lineBundle,
  textBundle,
  penBundle
] as const;

type BundleForGroup<G extends CanvasToolRegistrationGroup> = Extract<
  (typeof DEFAULT_TOOL_BUNDLES)[number],
  { canvasRegistrationGroup: G }
>;

export type CreationCanvasToolId = BundleForGroup<'creation'>['descriptor']['id'];
export type SelectorInteractionToolId = BundleForGroup<'selector'>['descriptor']['id'];

export function toolIdsForCanvasRegistrationGroup<G extends CanvasToolRegistrationGroup>(
  group: G
): readonly BundleForGroup<G>['descriptor']['id'][] {
  return DEFAULT_TOOL_BUNDLES.filter((bundle) => bundle.canvasRegistrationGroup === group).map(
    (bundle) => bundle.descriptor.id
  ) as unknown as readonly BundleForGroup<G>['descriptor']['id'][];
}

export const CREATION_TOOL_IDS = toolIdsForCanvasRegistrationGroup('creation');
export const SELECTOR_INTERACTION_TOOL_IDS = toolIdsForCanvasRegistrationGroup('selector');

export function registerDefaultToolDescriptors(registry: ToolRegistryService): void {
  for (const bundle of DEFAULT_TOOL_BUNDLES) {
    registry.registerDescriptor(bundle.descriptor);
  }
}

export function buildEditorToolShortcutMap(): Record<string, EditorTool | 'reserved'> {
  const map: Record<string, EditorTool | 'reserved'> = {};
  for (const bundle of DEFAULT_TOOL_BUNDLES) {
    if (bundle.shortcutKey) {
      map[bundle.shortcutKey] = bundle.descriptor.id;
    }
  }
  for (const key of RESERVED_EDITOR_TOOL_SHORTCUT_KEYS) {
    map[key] = 'reserved';
  }
  return map;
}
