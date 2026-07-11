import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { routes } from './app.routes';
import { DockPanelRegistryService } from './panels/dock-panel-registry.service';
import { registerDefaultDockPanels } from './panels/register-default-dock-panels';
import {
  CHROME_EDITOR_APPLY_SVG_PORT,
  EDITOR_SHAPE_LIFECYCLE_SVG_PORT,
  LAYER_REORDER_GROUP_SVG_PORT,
  PROPERTIES_PANEL_SVG_PORT,
  SELECTION_TRANSFORM_APPLY_SVG_PORT
} from './services/chrome-apply/chrome-apply.tokens';
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
    provideAppInitializer(() => {
      const matIconRegistry = inject(MatIconRegistry);
      const domSanitizer = inject(DomSanitizer);
      matIconRegistry.addSvgIconSet(
        domSanitizer.bypassSecurityTrustResourceUrl('assets/mdi.svg')
      );
    }),
    provideAppInitializer(() => {
      registerDefaultDockPanels(inject(DockPanelRegistryService));
    }),
    provideAppInitializer(() => {
      registerDefaultTools(inject(ToolRegistryService), inject(CanvasBoundToolRegistrar));
    })
  ]
};
