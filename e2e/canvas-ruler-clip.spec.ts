import { expect, test } from '@playwright/test';

test.describe('Canvas viewport vs rulers', () => {
  test('document stage does not paint over rulers after heavy zoom and pan', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('icon-palette-chat-left-heart').click();
    await expect(page.getByTestId('canvas-zoom-level')).toBeVisible();

    const viewport = page.getByTestId('canvas-viewport');
    const vbox = await viewport.boundingBox();
    expect(vbox).not.toBeNull();

    await page.getByTestId('tool-zoom').click();
    const cx = vbox!.x + vbox!.width / 2;
    const cy = vbox!.y + vbox!.height / 2;
    await page.mouse.move(cx, cy);
    await page.keyboard.down('Control');
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, -250);
    }
    await page.keyboard.up('Control');

    await page.getByTestId('tool-pan').click();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 500, cy + 320);
    await page.mouse.up();

    const rulerBox = await page.locator('.ruler-left').boundingBox();
    expect(rulerBox).not.toBeNull();
    const rx = rulerBox!.x + rulerBox!.width / 2;
    const ry = rulerBox!.y + Math.min(80, rulerBox!.height / 2);

    const rulerHit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el !== null && el.closest('.ruler-left') !== null;
    }, { x: rx, y: ry });

    expect(rulerHit).toBe(true);
  });
});
