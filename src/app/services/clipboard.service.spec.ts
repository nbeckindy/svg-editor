import { TestBed } from '@angular/core/testing';
import { ClipboardService, type ClipboardPayload } from './clipboard.service';

describe('ClipboardService', () => {
  let service: ClipboardService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClipboardService);
  });

  it('stores and returns clipboard payload clones', () => {
    const payload: ClipboardPayload = {
      shapes: [{ id: 'shape-1', markup: '<rect id="shape-1" />', insertionIndex: 0 }]
    };
    service.set(payload);

    const stored = service.get();
    expect(stored).toEqual(payload);
    expect(stored).not.toBe(payload);
    expect(stored?.shapes[0]).not.toBe(payload.shapes[0]);
  });

  it('resets and increments paste offset after set', () => {
    service.set({ shapes: [{ id: 'shape-1', markup: '<rect id="shape-1" />' }] });
    expect(service.nextPasteOffset()).toEqual({ dx: 10, dy: 10 });
    expect(service.nextPasteOffset()).toEqual({ dx: 20, dy: 20 });
  });

  it('clear empties payload and resets offset sequence', () => {
    service.set({ shapes: [{ id: 'shape-1', markup: '<rect id="shape-1" />' }] });
    service.nextPasteOffset();
    service.clear();

    expect(service.hasContent()).toBe(false);
    expect(service.get()).toBeNull();

    service.set({ shapes: [{ id: 'shape-2', markup: '<circle id="shape-2" />' }] });
    expect(service.nextPasteOffset()).toEqual({ dx: 10, dy: 10 });
  });
});
