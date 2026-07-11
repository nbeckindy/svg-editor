import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import { editorPortTestProviders } from './app/testing/editor-port-test-providers';

setupTestBed({
  zoneless: true,
  providers: editorPortTestProviders
});
