import { describe, it, expect } from 'vitest';
import {
  RASTER_INSERT_MAX_FILE_BYTES,
  validateRasterFileForInsert,
  validateRasterPixelBudget,
  isAllowedRasterMimeType
} from './raster-insert-file';

describe('raster-insert-file validation', () => {
  it('isAllowedRasterMimeType accepts ADR types', () => {
    expect(isAllowedRasterMimeType('image/png')).toBe(true);
    expect(isAllowedRasterMimeType('image/jpeg')).toBe(true);
    expect(isAllowedRasterMimeType('image/webp')).toBe(true);
    expect(isAllowedRasterMimeType('image/gif')).toBe(true);
    expect(isAllowedRasterMimeType('image/svg+xml')).toBe(false);
  });

  it('validateRasterFileForInsert rejects oversize file', () => {
    const file = new File([new Uint8Array(8)], 'x.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: RASTER_INSERT_MAX_FILE_BYTES + 1 });
    const r = validateRasterFileForInsert(file);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/too large/i);
  });

  it('validateRasterPixelBudget rejects huge decode', () => {
    const r = validateRasterPixelBudget(9000, 9000);
    expect(r.ok).toBe(false);
  });
});
