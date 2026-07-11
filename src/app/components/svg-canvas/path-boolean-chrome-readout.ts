import type { PathBooleanPreviewService } from '../../services/path-boolean-preview.service';

/**
 * Path-boolean preview getter for **Editor chrome** — keeps {@link SvgCanvasComponent}
 * from proxying overlay projection for the boolean preview overlay.
 */
export class PathBooleanChromeReadout {
  constructor(
    private readonly preview: PathBooleanPreviewService,
    private readonly rootUserPathDToOutlineOverlayD: (pathD: string) => string | null
  ) {}

  get pathBooleanPreviewOverlayD(): string | null {
    const d = this.preview.previewRootUserD();
    if (!d?.trim()) return null;
    return this.rootUserPathDToOutlineOverlayD(d);
  }
}
