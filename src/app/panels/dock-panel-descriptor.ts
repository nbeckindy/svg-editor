import type { Type } from '@angular/core';
import type { EditorTool } from '../services/editor-tool.service';
import type { DockPanelRelevanceContext } from './dock-panel-relevance';

/** Identifier for a registered right-dock stack section. */
export type DockPanelId = string;

/** Whether a stack section’s subject is Selection-gated. */
export type DockPanelAvailability = 'always-available' | 'selection-aware';

export interface DockPanelDescriptor {
  readonly id: DockPanelId;
  readonly label: string;
  /**
   * Body host component. Omit for placeholder-only sections
   * (use {@link placeholderMessage}).
   */
  readonly component?: Type<unknown>;
  /** Playwright / test hook for the section collapse header (`dock-section-*`). */
  readonly headerTestId: string;
  /** Playwright / test hook for the section region (`editor-*-area`). */
  readonly areaTestId: string;
  readonly ariaLabel: string;
  /** Locked stack order (ascending, top → bottom). */
  readonly order: number;
  readonly availability: DockPanelAvailability;
  /** Initial expanded state when the dock loads (default true). */
  readonly defaultExpanded?: boolean;
  /** Shown when {@link component} is omitted. */
  readonly placeholderMessage?: string;
  /** Optional CSS class on the section body host. */
  readonly panelClass?: string;
  /** Which tool(s) make this section relevant for auto-expand. */
  readonly relevantTools?: readonly EditorTool[];
  /** Extra relevance gate beyond {@link relevantTools} (e.g. multi-path selection). */
  readonly isRelevantWhen?: (ctx: DockPanelRelevanceContext) => boolean;
}
