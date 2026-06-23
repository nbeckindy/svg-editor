import type { Type } from '@angular/core';
import type { EditorTool } from '../services/editor-tool.service';
import type { DockPanelRelevanceContext } from './dock-panel-relevance';

/** Identifier for a registered right-dock inspector panel. */
export type DockPanelId = string;

export interface DockPanelDescriptor {
  readonly id: DockPanelId;
  readonly label: string;
  readonly component: Type<unknown>;
  /** Playwright / test hook for the tab button (`dock-tab-*`). */
  readonly tabTestId: string;
  /** Playwright / test hook for the tabpanel region (`editor-*-area`). */
  readonly areaTestId: string;
  readonly ariaLabel: string;
  /** Optional CSS class on the tabpanel host section. */
  readonly panelClass?: string;
  /** Which tool(s) make this panel relevant for auto-show. */
  readonly relevantTools?: readonly EditorTool[];
  /** Extra relevance gate beyond {@link relevantTools} (e.g. multi-path selection). */
  readonly isRelevantWhen?: (ctx: DockPanelRelevanceContext) => boolean;
}
