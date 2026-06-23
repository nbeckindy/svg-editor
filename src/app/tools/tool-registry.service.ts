import { Injectable } from '@angular/core';
import type { EditorTool } from '../services/editor-tool.service';
import type { CanvasTool } from './canvas-tool.interface';

@Injectable({
  providedIn: 'root'
})
export class ToolRegistryService {
  private readonly tools = new Map<EditorTool, CanvasTool>();

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
