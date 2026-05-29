import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Full MDI sprite (large); read once for HttpTestingController flushes. */
const mdiSvgBody = readFileSync(
  join(process.cwd(), 'node_modules/@mdi/angular-material/mdi.svg'),
  'utf8'
);

/** Use with `TestBed` before creating components that render `<mat-icon svgIcon>`. */
export const mdiIconHttpTestProviders = [provideHttpClient(), provideHttpClientTesting()];

/**
 * Registers the MDI SVG icon set on `MatIconRegistry` (mirrors `app.config.ts`).
 * Call after `await TestBed.configureTestingModule(...).compileComponents()` and before `createComponent`.
 */
export function registerMdiSvgIconSetForTests(): void {
  const matIconRegistry = TestBed.inject(MatIconRegistry);
  const domSanitizer = TestBed.inject(DomSanitizer);
  matIconRegistry.addSvgIconSet(
    domSanitizer.bypassSecurityTrustResourceUrl('assets/mdi.svg')
  );
}

/** Satisfy outstanding `HttpClient` fetches for `assets/mdi.svg` triggered by `<mat-icon svgIcon>`. */
export function flushMdiSvgIfPending(): void {
  const http = TestBed.inject(HttpTestingController);
  const reqs = http.match((r) => r.url.includes('mdi.svg'));
  for (const req of reqs) {
    if (req.cancelled) continue;
    req.flush(mdiSvgBody, { status: 200, statusText: 'OK' });
  }
}
