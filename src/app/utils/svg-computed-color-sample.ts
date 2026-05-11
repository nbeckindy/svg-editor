/**
 * Resolve a solid sRGB hex from CSS paint strings (`fill` / `stroke` / `color`).
 * Returns null for gradients, patterns, `none`, or unsupported syntax.
 */
export function parseCssPaintToHex(value: string | null): string | null {
  if (value == null) return null;
  const v = value.trim().toLowerCase();
  if (v === '' || v === 'none' || v === 'transparent') return null;
  if (v.startsWith('url(')) return null;

  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  const rgb = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (rgb) {
    const r = clamp255(Number(rgb[1]));
    const g = clamp255(Number(rgb[2]));
    const b = clamp255(Number(rgb[3]));
    const a = rgb[4] != null ? Number(rgb[4]) : 1;
    if (a <= 0) return null;
    return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
  }

  return null;
}

/**
 * Walk ancestors and read computed `fill` or `stroke` until a solid color is found.
 */
export function sampleSolidComputedPaint(element: Element, kind: 'fill' | 'stroke'): string | null {
  let current: Element | null = element;
  while (current) {
    const cs = getComputedStyle(current);
    const rawPaint = kind === 'fill' ? cs.fill : cs.stroke;
    const resolved = rawPaint === 'currentColor' ? cs.color : rawPaint;
    const hex = parseCssPaintToHex(resolved);
    if (hex) return hex;
    current = current.parentElement;
  }
  return null;
}

function clamp255(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function byteToHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}
