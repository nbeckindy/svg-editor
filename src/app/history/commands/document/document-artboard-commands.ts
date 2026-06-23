import type { CoalesceableCommand } from '../../../models/editor-command';
import type { DocumentArtboardCommandSvgPort } from '../../document-settings-svg.port';

export class ArtboardSizeCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey = 'artboard-size';

  constructor(
    private readonly svc: DocumentArtboardCommandSvgPort,
    private readonly oldWidth: number,
    private readonly oldHeight: number,
    private readonly oldMinX: number,
    private readonly oldMinY: number,
    private readonly newWidth: number,
    private readonly newHeight: number
  ) {
    this.description = `Resize artboard to ${newWidth}×${newHeight}`;
  }

  execute(): void {
    this.svc.setArtboardSize(this.newWidth, this.newHeight);
  }

  undo(): void {
    this.svc.setArtboardSize(this.oldWidth, this.oldHeight, {
      minX: this.oldMinX,
      minY: this.oldMinY
    });
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as ArtboardSizeCommand;
    return new ArtboardSizeCommand(
      this.svc,
      this.oldWidth,
      this.oldHeight,
      this.oldMinX,
      this.oldMinY,
      n.newWidth,
      n.newHeight
    );
  }
}

export class ArtboardBackgroundCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey = 'artboard-bg';

  constructor(
    private readonly svc: DocumentArtboardCommandSvgPort,
    private readonly oldColor: string,
    private readonly newColor: string
  ) {
    this.description = `Change background to ${newColor}`;
  }

  execute(): void {
    this.svc.setBackgroundColor(this.newColor);
  }

  undo(): void {
    this.svc.setBackgroundColor(this.oldColor);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as ArtboardBackgroundCommand;
    return new ArtboardBackgroundCommand(this.svc, this.oldColor, n.newColor);
  }
}
