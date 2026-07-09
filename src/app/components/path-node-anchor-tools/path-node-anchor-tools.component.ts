import { Component, computed, inject } from '@angular/core';
import { PathNodeEditCommandBridgeService } from '../../services/path-node-edit-command-bridge.service';
import { EditorToolService } from '../../services/editor-tool.service';

@Component({
  selector: 'app-path-node-anchor-tools',
  imports: [],
  templateUrl: './path-node-anchor-tools.component.html',
  styleUrl: './path-node-anchor-tools.component.css'
})
export class PathNodeAnchorToolsComponent {
  private readonly pathNodeEditBridge = inject(PathNodeEditCommandBridgeService);
  private readonly editorTool = inject(EditorToolService);

  readonly pathNodeBridgeChrome = this.pathNodeEditBridge.chrome;

  readonly visible = computed(
    () =>
      this.editorTool.currentTool() === 'node-edit-selector' &&
      this.pathNodeBridgeChrome().hasSelectedPathNode
  );

  readonly pathNodeCornerDisabled = computed(() => {
    const c = this.pathNodeBridgeChrome();
    return c.pathLocked || !c.cornerEnabled;
  });

  readonly pathNodeMirrorDisabled = computed(() => {
    const c = this.pathNodeBridgeChrome();
    return c.pathLocked || !c.mirrorCubicEnabled;
  });

  readonly pathNodeIndependentDisabled = computed(() => {
    const c = this.pathNodeBridgeChrome();
    return c.pathLocked || !c.independentHandlesEnabled;
  });

  onPathNodeCornerAnchorClick(): void {
    this.pathNodeEditBridge.convertSelectedAnchorToCorner();
  }

  onPathNodeMirrorCubicClick(): void {
    this.pathNodeEditBridge.convertSelectedAnchorToMirrorCubic();
  }

  onPathNodeIndependentHandlesClick(): void {
    this.pathNodeEditBridge.convertSelectedAnchorToIndependentHandles();
  }
}
