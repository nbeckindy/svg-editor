import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Nine-point position: corners, edge midpoints, and center. */
export type OrientationPoint =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

const ORIENTATION_CELLS: readonly OrientationPoint[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
] as const;

/** Degrees to rotate an upward-pointing arrow so it faces outward from center. */
const ARROW_ROTATION_DEG: Record<Exclude<OrientationPoint, 'center'>, number> = {
  'top-left': -45,
  'top-center': 0,
  'top-right': 45,
  'middle-left': -90,
  'middle-right': 90,
  'bottom-left': -135,
  'bottom-center': 180,
  'bottom-right': 135
};

@Component({
  selector: 'app-orientation-grid',
  templateUrl: './orientation-grid.component.html',
  styleUrl: './orientation-grid.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'orientation-grid-host'
  }
})
export class OrientationGridComponent {
  /** Currently selected orientation point. */
  readonly value = input.required<OrientationPoint>();
  /** Accessible name for the radiogroup. */
  readonly ariaLabel = input('Orientation');
  /** Optional tooltip for the whole control. */
  readonly title = input<string | undefined>(undefined);
  /** Prefix for each cell `data-testid` (`${prefix}-${point}`). */
  readonly testIdPrefix = input('orientation');

  readonly valueChange = output<OrientationPoint>();

  readonly cells = ORIENTATION_CELLS;
  readonly arrowRotationDeg = ARROW_ROTATION_DEG;

  select(point: OrientationPoint): void {
    if (point === this.value()) return;
    this.valueChange.emit(point);
  }
}
