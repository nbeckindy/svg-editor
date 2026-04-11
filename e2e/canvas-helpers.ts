import type { Page } from '@playwright/test';

/** Screen-space union of `getBoundingClientRect()` for elements with the given ids. */
export async function screenUnionForIds(
  page: Page,
  ids: string[]
): Promise<{ left: number; top: number; width: number; height: number } | null> {
  return page.evaluate((shapeIds: string[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of shapeIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      minX = Math.min(minX, r.left);
      minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.right);
      maxY = Math.max(maxY, r.bottom);
    }
    if (!Number.isFinite(minX)) return null;
    return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
  }, ids);
}

export async function getSelectedLayerIds(page: Page): Promise<string[]> {
  return page.locator('.layers-panel .layer-row.selected .layer-id').allTextContents();
}

/** Blue selection stroke rect (#2196F3) in screen space. */
export async function getBlueSelectionScreenRect(page: Page): Promise<{
  left: number;
  top: number;
  width: number;
  height: number;
} | null> {
  return page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="canvas-selection-overlay-svg"]');
    if (!overlay) return null;
    const blue = Array.from(overlay.querySelectorAll('rect')).find(
      (r) => r.getAttribute('stroke') === '#2196F3'
    );
    if (!blue) return null;
    const br = blue.getBoundingClientRect();
    return { left: br.left, top: br.top, width: br.width, height: br.height };
  });
}

export function maxRectDelta(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number }
): number {
  return Math.max(
    Math.abs(a.left - b.left),
    Math.abs(a.top - b.top),
    Math.abs(a.width - b.width),
    Math.abs(a.height - b.height)
  );
}

/** Count of overlay groups still using a rotate() transform (should be 0 when not dragging). */
export async function countOverlayRotateGroups(page: Page): Promise<number> {
  return page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="canvas-selection-overlay-svg"]');
    if (!overlay) return -1;
    return overlay.querySelectorAll('g[transform*="rotate"]').length;
  });
}

/** Screen-space union of all rotate-preview ghost roots (`[data-editor-ghost]`). */
export async function getGhostScreenRect(page: Page): Promise<{
  left: number;
  top: number;
  width: number;
  height: number;
} | null> {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll('[data-editor-ghost]');
    if (nodes.length === 0) return null;
    let minL = Infinity;
    let minT = Infinity;
    let maxR = -Infinity;
    let maxB = -Infinity;
    for (const g of Array.from(nodes)) {
      const r = g.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      minL = Math.min(minL, r.left);
      minT = Math.min(minT, r.top);
      maxR = Math.max(maxR, r.right);
      maxB = Math.max(maxB, r.bottom);
    }
    if (!Number.isFinite(minL)) return null;
    return { left: minL, top: minT, width: maxR - minL, height: maxB - minT };
  });
}

/** Blue selection stroke rect during rotate (inside overlay, #2196F3). */
export async function getRotatingBlueSelectionScreenRect(page: Page): Promise<{
  left: number;
  top: number;
  width: number;
  height: number;
} | null> {
  return page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="canvas-selection-overlay-svg"]');
    if (!overlay) return null;
    const blue = Array.from(overlay.querySelectorAll('rect')).find(
      (r) => r.getAttribute('stroke') === '#2196F3'
    );
    if (!blue) return null;
    const br = blue.getBoundingClientRect();
    return { left: br.left, top: br.top, width: br.width, height: br.height };
  });
}

export async function dragRotateHandle(page: Page, dx: number, dy: number): Promise<void> {
  const handle = page.getByTestId('canvas-handle-rotate');
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Rotate handle has no bounding box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}
