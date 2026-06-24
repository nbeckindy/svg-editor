import { ChangeDetectionStrategy, Component, input, NO_ERRORS_SCHEMA } from '@angular/core';
import type {
  PathNodeAnchorOverlay,
  PathNodeControlHandleOverlay,
  PathNodeInsertAffordanceOverlay,
  PathNodeLineOverlay,
  PathNodePointOverlay,
  PathNodeSessionOverlay,
  PathSelectionOutlineOverlay
} from './path-node-overlay.model';

@Component({
  selector: 'g[app-path-node-overlay]',
  templateUrl: './path-node-overlay.component.html',
  styleUrl: './path-node-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA]
})
export class PathNodeOverlayComponent {
  readonly postInsertAnchors = input<readonly PathNodePointOverlay[]>([]);
  readonly insertAffordance = input<PathNodeInsertAffordanceOverlay | null>(null);
  readonly penSessionNodes = input<PathNodeSessionOverlay | null>(null);
  readonly penSessionPathOutlineD = input<string | null>(null);
  readonly showPathNodeEditOverlays = input(false);
  readonly pathSelectionOutlines = input<readonly PathSelectionOutlineOverlay[]>([]);
  readonly controlHandles = input<readonly PathNodeControlHandleOverlay[]>([]);
  readonly anchors = input<readonly PathNodeAnchorOverlay[]>([]);
  readonly pendingCurveHandleGuides = input<readonly PathNodeLineOverlay[]>([]);
  readonly showPendingCurveHandleGuides = input(false);
}
