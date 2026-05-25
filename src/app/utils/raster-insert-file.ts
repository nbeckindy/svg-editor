/** ADR 0001 limits and MIME allowlist for toolbar / drop raster insert. */

export const RASTER_INSERT_MAX_FILE_BYTES = 16 * 1024 * 1024;
export const RASTER_INSERT_MAX_DECODE_PIXELS = 32 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function isAllowedRasterMimeType(mime: string): boolean {
  const t = mime.trim().toLowerCase();
  return ALLOWED_MIME.has(t);
}

export function validateRasterFileForInsert(file: File): { ok: true } | { ok: false; message: string } {
  if (!isAllowedRasterMimeType(file.type)) {
    return { ok: false, message: `Unsupported image type: ${file.type || '(unknown)'}` };
  }
  if (file.size > RASTER_INSERT_MAX_FILE_BYTES) {
    return { ok: false, message: 'Image is too large (max 16 MiB).' };
  }
  return { ok: true };
}

export function validateRasterPixelBudget(
  width: number,
  height: number
): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, message: 'Could not read image dimensions.' };
  }
  const px = width * height;
  if (px > RASTER_INSERT_MAX_DECODE_PIXELS) {
    return { ok: false, message: 'Image has too many pixels (max 32 megapixels).' };
  }
  return { ok: true };
}

/**
 * Decode raster dimensions from a `File` (object URL + bitmap decode).
 */
export async function readRasterIntrinsicDimensionsFromFile(
  file: File
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      try {
        return { width: bmp.width, height: bmp.height };
      } finally {
        bmp.close?.();
      }
    } catch {
      /* fall through */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image-load'));
    });
    img.src = url;
    await loaded;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    return { width: w, height: h };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') resolve(r);
      else reject(new Error('readAsDataURL'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader'));
    reader.readAsDataURL(file);
  });
}
