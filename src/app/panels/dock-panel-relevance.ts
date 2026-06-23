import type { EditorTool } from '../services/editor-tool.service';
import type { DockPanelDescriptor, DockPanelId } from './dock-panel-descriptor';

export interface DockPanelRelevanceContext {
  readonly currentTool: EditorTool;
  readonly selectedShapeCount: number;
  readonly selectedPathCount: number;
}

export function dockPanelContextKey(ctx: DockPanelRelevanceContext, selectedShapeIds: readonly string[]): string {
  return `${ctx.currentTool}:${selectedShapeIds.join(',')}`;
}

export function isDockPanelRelevant(
  panel: DockPanelDescriptor,
  ctx: DockPanelRelevanceContext
): boolean {
  if (!panel.relevantTools?.length) {
    return false;
  }
  if (!panel.relevantTools.includes(ctx.currentTool)) {
    return false;
  }
  if (panel.isRelevantWhen && !panel.isRelevantWhen(ctx)) {
    return false;
  }
  return true;
}

/** Prefer the last matching panel in registration order (most specific wins). */
export function suggestDockPanelId(
  panels: readonly DockPanelDescriptor[],
  ctx: DockPanelRelevanceContext
): DockPanelId | null {
  for (let i = panels.length - 1; i >= 0; i--) {
    if (isDockPanelRelevant(panels[i], ctx)) {
      return panels[i].id;
    }
  }
  return null;
}

export function pathOpsMultiPathRelevance(ctx: DockPanelRelevanceContext): boolean {
  return ctx.selectedPathCount >= 2;
}
