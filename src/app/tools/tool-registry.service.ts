import { Injectable, computed, signal } from '@angular/core';
import type { EditorTool } from '../services/editor-tool.service';
import type { CanvasTool } from './canvas-tool.interface';
import type { ToolDescriptor, ToolInteractionKind, ToolStripGroup, ToolStripGroupId } from './tool-descriptor';

@Injectable({
  providedIn: 'root'
})
export class ToolRegistryService {
  private readonly tools = new Map<EditorTool, CanvasTool>();
  private readonly descriptors = new Map<EditorTool, ToolDescriptor>();
  private readonly descriptorsRevision = signal(0);

  readonly stripGroups = computed((): readonly ToolStripGroup[] => {
    this.descriptorsRevision();
    const byGroup = new Map<ToolStripGroupId, ToolDescriptor[]>();
    for (const descriptor of this.descriptors.values()) {
      const list = byGroup.get(descriptor.stripGroup) ?? [];
      list.push(descriptor);
      byGroup.set(descriptor.stripGroup, list);
    }
    const groupOrder: ToolStripGroupId[] = ['selection-view', 'creation'];
    return groupOrder
      .filter((id) => byGroup.has(id))
      .map((id) => {
        const items = byGroup.get(id)!.slice().sort((a, b) => a.order - b.order);
        return {
          id,
          ariaLabel: items[0]?.stripGroupLabel ?? id,
          descriptors: items
        };
      });
  });

  registerDescriptor(descriptor: ToolDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor);
    this.descriptorsRevision.update((n) => n + 1);
  }

  getDescriptor(toolId: EditorTool): ToolDescriptor | undefined {
    return this.descriptors.get(toolId);
  }

  getInteractionKind(toolId: EditorTool): ToolInteractionKind | undefined {
    return this.descriptors.get(toolId)?.interactionKind;
  }

  isCreationTool(toolId: EditorTool): boolean {
    return this.getInteractionKind(toolId) === 'creation';
  }

  isSelectorInteractionTool(toolId: EditorTool): boolean {
    return this.descriptors.get(toolId)?.selectorInteraction === true;
  }

  keepsPathNodeTopology(toolId: EditorTool): boolean {
    return this.descriptors.get(toolId)?.keepsPathNodeTopology === true;
  }

  register(tool: CanvasTool): void {
    this.tools.set(tool.toolId, tool);
  }

  unregister(toolId: EditorTool): void {
    this.tools.delete(toolId);
  }

  get(toolId: EditorTool): CanvasTool | undefined {
    return this.tools.get(toolId);
  }

  has(toolId: EditorTool): boolean {
    return this.tools.has(toolId);
  }
}
