import { Injectable, signal } from '@angular/core';

/** Mutually exclusive anchor modes at the selected path node (node-edit chrome). */
export type PathNodeAnchorMode = 'corner' | 'mirror' | 'independent' | 'none';

/** Snapshot for Node-edit tool context bar path-node chrome (driven from svg-canvas). */
export interface PathNodeEditBridgeChrome {
  toolIsNodeEdit: boolean;
  hasSelectedPathNode: boolean;
  pathLocked: boolean;
  cornerEnabled: boolean;
  mirrorCubicEnabled: boolean;
  independentHandlesEnabled: boolean;
  /** Which of the three anchor toggles is selected at this vertex. */
  anchorMode: PathNodeAnchorMode;
}

const DEFAULT_CHROME: PathNodeEditBridgeChrome = {
  toolIsNodeEdit: false,
  hasSelectedPathNode: false,
  pathLocked: false,
  cornerEnabled: false,
  mirrorCubicEnabled: false,
  independentHandlesEnabled: false,
  anchorMode: 'none'
};

export type PathNodeAnchorCommandResult = { ok: true } | { ok: false };

export interface PathNodeEditCommandBridgeHandlers {
  convertSelectedAnchorToCorner(): PathNodeAnchorCommandResult;
  convertSelectedAnchorToMirrorCubic(): PathNodeAnchorCommandResult;
  convertSelectedAnchorToIndependentHandles(): PathNodeAnchorCommandResult;
}

/**
 * Bridges path node-edit commands from chrome (tool context bar) to the canvas.
 * {@link SvgCanvasComponent} registers handlers in its constructor and clears them on destroy.
 */
@Injectable({ providedIn: 'root' })
export class PathNodeEditCommandBridgeService {
  private handlers: PathNodeEditCommandBridgeHandlers | null = null;

  readonly chrome = signal<PathNodeEditBridgeChrome>({ ...DEFAULT_CHROME });

  register(handlers: PathNodeEditCommandBridgeHandlers | null): void {
    this.handlers = handlers;
    if (!handlers) {
      this.chrome.set({ ...DEFAULT_CHROME });
    }
  }

  setChrome(next: PathNodeEditBridgeChrome): void {
    this.chrome.set(next);
  }

  convertSelectedAnchorToCorner(): PathNodeAnchorCommandResult {
    return this.handlers?.convertSelectedAnchorToCorner() ?? { ok: false };
  }

  convertSelectedAnchorToMirrorCubic(): PathNodeAnchorCommandResult {
    return this.handlers?.convertSelectedAnchorToMirrorCubic() ?? { ok: false };
  }

  convertSelectedAnchorToIndependentHandles(): PathNodeAnchorCommandResult {
    return this.handlers?.convertSelectedAnchorToIndependentHandles() ?? { ok: false };
  }
}
