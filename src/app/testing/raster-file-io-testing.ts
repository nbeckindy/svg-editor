/** Stubs raster decode helpers used by `readRasterIntrinsicDimensionsFromFile` / `readFileAsDataUrl`. */
export function stubRasterFileIo(
  dimensions: { width: number; height: number },
  dataUrl = 'data:image/png;base64,abcd'
): () => void {
  const origBitmap = globalThis.createImageBitmap;
  const OrigReader = globalThis.FileReader;

  globalThis.createImageBitmap = vi.fn().mockResolvedValue({
    width: dimensions.width,
    height: dimensions.height,
    close: vi.fn()
  }) as typeof createImageBitmap;

  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;
    readAsDataURL(_file: Blob): void {
      this.result = dataUrl;
      queueMicrotask(() => this.onload?.({} as ProgressEvent<FileReader>));
    }
  }
  globalThis.FileReader = MockFileReader as unknown as typeof FileReader;

  return () => {
    if (origBitmap) {
      globalThis.createImageBitmap = origBitmap;
    } else {
      delete (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap;
    }
    globalThis.FileReader = OrigReader;
  };
}
