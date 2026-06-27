import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { routes } from './app.routes';
import { DockPanelRegistryService } from './panels/dock-panel-registry.service';
import { registerDefaultDockPanels } from './panels/register-default-dock-panels';
import { CanvasBoundToolRegistrar } from './tools/canvas-bound-tool-registrar.service';
import { registerDefaultTools } from './tools/register-default-tools';
import { ToolRegistryService } from './tools/tool-registry.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    provideAppInitializer(() => {
      registerDefaultDockPanels(inject(DockPanelRegistryService));
    }),
    provideAppInitializer(() => {
      registerDefaultTools(inject(ToolRegistryService), inject(CanvasBoundToolRegistrar));
    })
  ]
};
