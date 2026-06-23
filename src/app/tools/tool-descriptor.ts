import type { Type } from '@angular/core';
import type { EditorTool } from '../services/editor-tool.service';

export type ToolInteractionKind = 'creation' | 'navigation' | 'edit' | 'view';

export type ToolStripGroupId = 'selection-view' | 'creation';

/** UI and classification metadata for a canvas tool (mirrors {@link DockPanelDescriptor}). */
export interface ToolDescriptor {
  readonly id: EditorTool;
  readonly label: string;
  readonly title: string;
  readonly icon: string;
  readonly stripTestId: string;
  readonly ariaLabel: string;
  readonly stripGroup: ToolStripGroupId;
  readonly stripGroupLabel: string;
  readonly order: number;
  readonly interactionKind: ToolInteractionKind;
  /** Marquee, resize, skew, rotate, and drag selection gestures. */
  readonly selectorInteraction?: boolean;
  /** Retains or rebuilds path-node edit topology on tool switch. */
  readonly keepsPathNodeTopology?: boolean;
  readonly contextBarComponent?: Type<unknown>;
  readonly inspectorComponent?: Type<unknown>;
}

export interface ToolStripGroup {
  readonly id: ToolStripGroupId;
  readonly ariaLabel: string;
  readonly descriptors: readonly ToolDescriptor[];
}
