import { expect, test, type Page } from '@playwright/test';
import { ensureDockSectionExpanded, getSelectedLayerIds } from './canvas-helpers';

/** Cmd on macOS, Ctrl elsewhere — matches editor shortcut handling. */
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function getShapeScreenLeft(page: Page, shapeId: string): Promise<number> {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    return el?.getBoundingClientRect().left ?? NaN;
  }, shapeId);
}

async function getImageId(page: Page, index = 0): Promise<string | null> {
  return page.evaluate((idx) => {
    const img = document.querySelectorAll('[data-editor-content-group] image')[idx] as SVGImageElement | undefined;
    return img?.id ?? null;
  }, index);
}

async function getRectId(page: Page, index = 0): Promise<string | null> {
  return page.evaluate((idx) => {
    const rect = document.querySelectorAll('[data-editor-content-group] rect')[idx] as SVGRectElement | undefined;
    return rect?.id ?? null;
  }, index);
}

async function countContentShapes(page: Page): Promise<{ images: number; rects: number }> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-editor-content-group]');
    if (!root) return { images: 0, rects: 0 };
    return {
      images: root.querySelectorAll('image').length,
      rects: root.querySelectorAll('rect').length
    };
  });
}

async function insertImageAndDrawRect(page: Page): Promise<{ imageId: string; rectId: string }> {
  await page.goto('/');

  await page.getByTestId('input-insert-image-file').setInputFiles('e2e/fixtures/tiny.png');
  await expect(page.locator('[data-editor-content-group] image')).toHaveCount(1, { timeout: 20_000 });

  const imageId = await getImageId(page);
  expect(imageId).toBeTruthy();

  await page.getByTestId('tool-rect').click();
  const vp = page.getByTestId('canvas-viewport');
  const box = await vp.boundingBox();
  expect(box).not.toBeNull();
  const x0 = box!.x + box!.width * 0.62;
  const y0 = box!.y + box!.height * 0.18;
  const x1 = box!.x + box!.width * 0.88;
  const y1 = box!.y + box!.height * 0.42;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 10 });
  await page.mouse.up();

  await page.getByTestId('tool-selector').click();
  await expect(page.locator('[data-editor-content-group] rect')).toHaveCount(1);

  const rectId = await getRectId(page);
  expect(rectId).toBeTruthy();

  return { imageId: imageId!, rectId: rectId! };
}

async function selectShapeViaLayers(page: Page, shapeId: string): Promise<void> {
  await ensureDockSectionExpanded(page, 'layers');
  await page.getByTestId(`layer-row-${shapeId}`).click();
  await ensureDockSectionExpanded(page, 'properties');
}

async function selectAllShapes(page: Page): Promise<void> {
  await page.getByTestId('tool-selector').click();
  await page.getByTestId('canvas-viewport').click({ position: { x: 40, y: 40 } });
  await page.keyboard.press(`${mod}+a`);
}

test.describe('Raster image selection QA (d4m)', () => {
  test('image-only selection: properties panel X/Y/W/H/R inputs are editable', async ({ page }) => {
    const { imageId } = await insertImageAndDrawRect(page);
    await selectShapeViaLayers(page, imageId);

    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();

    const xInput = page.getByTestId('properties-transform-x');
    await expect(xInput).toBeVisible();
    expect(await xInput.evaluate((el) => el.tagName)).toBe('INPUT');

    const before = await page.evaluate((id) => document.getElementById(id)?.getBBox().x ?? NaN, imageId);
    expect(Number.isFinite(before)).toBe(true);

    const targetX = before + 25;
    await xInput.fill(String(targetX));
    await xInput.dispatchEvent('change');

    await expect(xInput).toHaveValue(String(targetX));

    for (const field of ['properties-transform-y', 'properties-transform-w', 'properties-transform-h', 'properties-transform-r'] as const) {
      await expect(page.getByTestId(field)).toBeVisible();
    }
  });

  test('mixed image+rect: align-left shortcut moves selection', async ({ page }) => {
    const { imageId, rectId } = await insertImageAndDrawRect(page);

    await selectAllShapes(page);
    await expect.poll(async () => (await getSelectedLayerIds(page)).length).toBe(2);

    const rectLeftBefore = await getShapeScreenLeft(page, rectId);
    const imageLeftBefore = await getShapeScreenLeft(page, imageId);
    expect(Number.isFinite(rectLeftBefore)).toBe(true);
    expect(Number.isFinite(imageLeftBefore)).toBe(true);
    expect(rectLeftBefore).toBeGreaterThan(imageLeftBefore + 1);

    await page
      .locator('.align-distribute-group .align-toolbar')
      .getByRole('button', { name: 'Left', exact: true })
      .click();

    const rectLeftAfter = await getShapeScreenLeft(page, rectId);
    const imageLeftAfter = await getShapeScreenLeft(page, imageId);
    expect(rectLeftAfter).toBeCloseTo(imageLeftAfter, 0);
    expect(rectLeftAfter).toBeLessThan(rectLeftBefore - 1);
  });

  test('mixed image+rect: copy, paste, duplicate, and cut', async ({ page }) => {
    const { imageId } = await insertImageAndDrawRect(page);

    await selectAllShapes(page);
    await expect.poll(async () => (await getSelectedLayerIds(page)).length).toBe(2);

    await page.keyboard.press(`${mod}+c`);
    await page.keyboard.press(`${mod}+v`);
    await expect
      .poll(async () => countContentShapes(page))
      .toEqual({ images: 2, rects: 2 });

    await selectAllShapes(page);
    await page.keyboard.press(`${mod}+d`);
    await expect
      .poll(async () => countContentShapes(page))
      .toEqual({ images: 4, rects: 4 });

    await selectShapeViaLayers(page, imageId);
    await page.keyboard.press(`${mod}+x`);
    await expect
      .poll(async () => countContentShapes(page))
      .toEqual({ images: 3, rects: 4 });

    await page.keyboard.press(`${mod}+v`);
    await expect
      .poll(async () => countContentShapes(page))
      .toEqual({ images: 4, rects: 4 });
  });
});
