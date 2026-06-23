import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { DockPanelRegistryService } from './panels/dock-panel-registry.service';
import { registerDefaultDockPanels } from './panels/register-default-dock-panels';

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
    })
  ]
};
