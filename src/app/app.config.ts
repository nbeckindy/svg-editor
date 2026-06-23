import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { DockPanelRegistryService } from './panels/dock-panel-registry.service';
import { registerDefaultDockPanels } from './panels/register-default-dock-panels';
import { CanvasBoundToolRegistrar } from './tools/canvas-bound-tool-registrar.service';
import { registerDefaultTools } from './tools/register-default-tools';
import { ToolRegistryService } from './tools/tool-registry.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    provideHttpClient(),
    provideRouter(routes),
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
