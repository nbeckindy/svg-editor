import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import {
  CHROME_EDITOR_APPLY_SVG_PORT,
  EDITOR_SHAPE_LIFECYCLE_SVG_PORT,
  LAYER_REORDER_GROUP_SVG_PORT,
  PROPERTIES_PANEL_SVG_PORT,
  SELECTION_TRANSFORM_APPLY_SVG_PORT
} from './app/services/chrome-apply/chrome-apply.tokens';
import { SvgManipulationService } from './app/services/svg-manipulation.service';

setupTestBed({
  zoneless: true,
  providers: [
    { provide: CHROME_EDITOR_APPLY_SVG_PORT, useExisting: SvgManipulationService },
    { provide: PROPERTIES_PANEL_SVG_PORT, useExisting: SvgManipulationService },
    { provide: LAYER_REORDER_GROUP_SVG_PORT, useExisting: SvgManipulationService },
    { provide: SELECTION_TRANSFORM_APPLY_SVG_PORT, useExisting: SvgManipulationService },
    { provide: EDITOR_SHAPE_LIFECYCLE_SVG_PORT, useExisting: SvgManipulationService }
  ]
});
