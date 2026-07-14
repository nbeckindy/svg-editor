import { TestBed } from '@angular/core/testing';
import { EditorPointerIntentDebugService } from './editor-pointer-intent-debug.service';

describe('EditorPointerIntentDebugService', () => {
  let service: EditorPointerIntentDebugService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorPointerIntentDebugService);
  });

  it('starts with sampling disabled', () => {
    expect(service.samplingEnabled()).toBe(false);
  });

  it('still publishes snapshots when sampling is disabled', () => {
    service.publish({
      clientX: 1,
      clientY: 2,
      sampledAtMs: 3,
      expectedCursorLine: 'Expected cursor: default',
      primaryLine: 'selector: idle',
      detailLines: []
    });

    expect(service.snapshot()?.primaryLine).toBe('selector: idle');
  });
});
