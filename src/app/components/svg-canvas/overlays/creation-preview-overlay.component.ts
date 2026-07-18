import { ChangeDetectionStrategy, Component, computed, input, NO_ERRORS_SCHEMA } from '@angular/core';

export type CreationPreviewShapeType = 'rect' | 'ellipse' | 'line';

export interface CreationPreviewGhostRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CreationPreviewLineOverlay {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type CreationPreviewLayer = 'paint' | 'guide';

/** Paint first (under), guide on top — matches click+drag chrome + placed look. */
const LAYER_ORDER: readonly CreationPreviewLayer[] = ['paint', 'guide'];

@Component({
  selector: 'g[app-creation-preview-overlay]',
  templateUrl: './creation-preview-overlay.component.html',
  styleUrl: './creation-preview-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA]
})
export class CreationPreviewOverlayComponent {
  readonly shapeType = input<CreationPreviewShapeType | string>('rect');
  readonly ghostRect = input<CreationPreviewGhostRect | null>(null);
  readonly lineOverlay = input<CreationPreviewLineOverlay | null>(null);
  readonly fill = input.required<string>();
  readonly stroke = input.required<string>();
  readonly strokeWidth = input.required<number>();
  /** Overlay-pixel corner radius for rect ghosts (rx = ry). */
  readonly cornerRadiusOverlay = input<number | null>(null);

  readonly layers = LAYER_ORDER;

  readonly paintFill = computed(() =>
    this.shapeType() === 'line' ? 'none' : this.fill()
  );

  layerClass(layer: CreationPreviewLayer): string {
    return layer === 'guide'
      ? 'creation-ghost-shape creation-ghost-guide'
      : 'creation-ghost-shape creation-ghost-paint';
  }

  layerTestId(layer: CreationPreviewLayer): string {
    return layer === 'guide' ? 'canvas-creation-ghost' : 'canvas-creation-ghost-paint';
  }

  layerFill(layer: CreationPreviewLayer): string | null {
    return layer === 'guide' ? null : this.paintFill();
  }

  layerStroke(layer: CreationPreviewLayer): string | null {
    return layer === 'guide' ? null : this.stroke();
  }

  layerStrokeWidth(layer: CreationPreviewLayer): number | null {
    return layer === 'guide' ? null : this.strokeWidth();
  }
}
