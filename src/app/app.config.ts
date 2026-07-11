import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { routes } from './app.routes';
import { DockPanelRegistryService } from './panels/dock-panel-registry.service';
import { registerDefaultDockPanels } from './panels/register-default-dock-panels';
import {
  CHROME_EDITOR_APPLY_SVG_PORT,
  CLIP_PATH_SVG_PORT,
  EDITOR_SHAPE_LIFECYCLE_SVG_PORT,
  LAYER_REORDER_GROUP_SVG_PORT,
  PROPERTIES_PANEL_SVG_PORT,
  SELECTION_TRANSFORM_APPLY_SVG_PORT
} from './services/chrome-apply/chrome-apply.tokens';
import {
  RASTER_IMAGE_INSERT_HISTORY_PORT,
  RASTER_IMAGE_INSERT_SELECTION_PORT,
  RASTER_IMAGE_INSERT_SVG_PORT,
  RASTER_IMAGE_INSERT_TOOL_PORT
} from './services/raster-image-insert.tokens';
import { EditorHistoryService } from './services/editor-history.service';
import { EditorToolService } from './services/editor-tool.service';
import { ShapeSelectionService } from './services/shape-selection.service';
import { SvgManipulationService } from './services/svg-manipulation.service';
import { CanvasBoundToolRegistrar } from './tools/canvas-bound-tool-registrar.service';
import { registerDefaultTools } from './tools/register-default-tools';
import { ToolRegistryService } from './tools/tool-registry.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    { provide: CHROME_EDITOR_APPLY_SVG_PORT, useExisting: SvgManipulationService },
    { provide: PROPERTIES_PANEL_SVG_PORT, useExisting: SvgManipulationService },
    { provide: LAYER_REORDER_GROUP_SVG_PORT, useExisting: SvgManipulationService },
    { provide: SELECTION_TRANSFORM_APPLY_SVG_PORT, useExisting: SvgManipulationService },
    { provide: EDITOR_SHAPE_LIFECYCLE_SVG_PORT, useExisting: SvgManipulationService },
    { provide: CLIP_PATH_SVG_PORT, useExisting: SvgManipulationService },
    { provide: RASTER_IMAGE_INSERT_SVG_PORT, useExisting: SvgManipulationService },
    { provide: RASTER_IMAGE_INSERT_HISTORY_PORT, useExisting: EditorHistoryService },
    { provide: RASTER_IMAGE_INSERT_SELECTION_PORT, useExisting: ShapeSelectionService },
    { provide: RASTER_IMAGE_INSERT_TOOL_PORT, useExisting: EditorToolService },
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    provideAppInitializer(() => {
      registerDefaultDockPanels(inject(DockPanelRegistryService));
    }),
    provideAppInitializer(() => {
      registerDefaultTools(inject(ToolRegistryService), inject(CanvasBoundToolRegistrar));
    })
  ]
};
