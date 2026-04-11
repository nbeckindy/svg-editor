import { expect, test } from '@playwright/test';
import {
  countOverlayRotateGroups,
  dragRotateHandle,
  getBlueSelectionScreenRect,
  getGhostScreenRect,
  getRotatingBlueSelectionScreenRect,
  getSelectedLayerIds,
  maxRectDelta,
  screenUnionForIds,
} from './canvas-helpers';

test.describe('Selection vs geometry after rotation', () => {
  test('Chat left heart: blue frame matches union bbox after two rotations', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('icon-palette-chat-left-heart').click();
    await expect(page.getByTestId('canvas-zoom-level')).toBeVisible();

    await page.getByTestId('canvas-viewport').locator('path').nth(1).click();

    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();

    await dragRotateHandle(page, 55, 18);
    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();
    await expect.poll(async () => countOverlayRotateGroups(page)).toBe(0);

    await dragRotateHandle(page, 40, -22);
    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();
    await expect.poll(async () => countOverlayRotateGroups(page)).toBe(0);

    const ids = await getSelectedLayerIds(page);
    expect(ids.length).toBeGreaterThan(0);

    const union = await screenUnionForIds(page, ids);
    const blue = await getBlueSelectionScreenRect(page);
    expect(union, 'union of selected shapes').not.toBeNull();
    expect(blue, 'blue selection rect').not.toBeNull();

    const d = maxRectDelta(union!, blue!);
    expect(d, `blue outline vs selection union max edge delta (px)`).toBeLessThanOrEqual(4);
  });

  /**
   * Large bundled icon (1984×1984 viewBox): stresses overlay vs screen-bbox mapping (see screen recording).
   * Default “fit” zoom is often ~25–30%; manual repro used ~13% zoom — Alt+zoom-out is flaky under Playwright,
   * so we assert alignment at the post-load fit zoom.
   */
  test('Photo NG mobile: blue frame matches union bbox after two rotations', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('icon-palette-201806-photo-ng-mobile').click();
    await expect(page.getByTestId('canvas-zoom-level')).toBeVisible();

    const zText = await page.getByTestId('canvas-zoom-level').textContent();
    const zNum = parseInt(String(zText).replace(/\D/g, '') || '0', 10);
    expect(zNum).toBeGreaterThan(5);
    expect(zNum).toBeLessThan(50);

    await page.getByTestId('canvas-viewport').locator('path').first().click();

    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();

    await dragRotateHandle(page, 70, 25);
    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();
    await expect.poll(async () => countOverlayRotateGroups(page)).toBe(0);

    await dragRotateHandle(page, 55, -30);
    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();
    await expect.poll(async () => countOverlayRotateGroups(page)).toBe(0);

    const ids = await getSelectedLayerIds(page);
    expect(ids.length).toBeGreaterThan(0);

    const union = await screenUnionForIds(page, ids);
    const blue = await getBlueSelectionScreenRect(page);
    expect(union).not.toBeNull();
    expect(blue).not.toBeNull();

    const d = maxRectDelta(union!, blue!);
    expect(d, `blue outline vs selection union max edge delta (px), zoom=${zText}`).toBeLessThanOrEqual(
      5
    );
  });

  /**
   * Regression: rotate ghost used root-space pivot inside union-local `translate(-ux,-uy)`, so after the
   * first rotate (non-zero union origin) the preview orbited the wrong center. During the second rotate
   * drag, the ghost AABB should stay aligned with the blue selection outline (same pivot/angle).
   */
  test('second rotate drag: ghost screen bounds track blue selection outline', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('icon-palette-chat-left-heart').click();
    await expect(page.getByTestId('canvas-zoom-level')).toBeVisible();

    await page.getByTestId('canvas-viewport').locator('path').nth(1).click();
    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();

    await dragRotateHandle(page, 55, 18);
    await expect.poll(async () => countOverlayRotateGroups(page)).toBe(0);

    await page.getByTestId('canvas-viewport').locator('path').nth(1).click();
    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();

    const handle = page.getByTestId('canvas-handle-rotate');
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    if (!box) throw new Error('Rotate handle has no bounding box');
    const hx = box.x + box.width / 2;
    const hy = box.y + box.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx + 48, hy + 12, { steps: 10 });

    await expect.poll(async () => countOverlayRotateGroups(page)).toBe(1);

    const ghost = await getGhostScreenRect(page);
    const blue = await getRotatingBlueSelectionScreenRect(page);
    expect(ghost).not.toBeNull();
    expect(blue).not.toBeNull();

    const d = maxRectDelta(ghost!, blue!);
    expect(
      d,
      'ghost vs blue selection AABB during second rotate (same pivot fixes arc/orbit mismatch)'
    ).toBeLessThanOrEqual(6);

    await page.mouse.up();
    await expect.poll(async () => countOverlayRotateGroups(page)).toBe(0);
  });
});
