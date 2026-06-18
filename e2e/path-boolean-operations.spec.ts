import { expect, test, type Page } from '@playwright/test';
import { getSelectedLayerIds } from './canvas-helpers';

const TWO_CLOSED_PATHS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<path id="bool-path-a" d="M 100 100 L 200 100 L 200 200 L 100 200 Z" fill="#000"/>
<path id="bool-path-b" d="M 150 100 L 250 100 L 250 200 L 150 200 Z" fill="#333"/>
</svg>`;

async function loadTwoClosedPaths(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('canvas-viewport')).toBeVisible();

  const debugPanel = page.getByTestId('editor-svg-debug-panel');
  await debugPanel.getByRole('button', { name: 'Expand' }).click();
  await expect(page.getByTestId('svg-debug-editor')).toBeVisible();

  await page.getByTestId('svg-debug-editor').fill(TWO_CLOSED_PATHS_SVG);
  await page.getByTestId('svg-debug-apply').click();
  await expect(page.locator('[data-editor-content-group] path')).toHaveCount(2);
  await debugPanel.getByRole('button', { name: 'Collapse' }).click();
}

async function getContentPathIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-editor-content-group] path'))
      .map((p) => p.id)
      .filter((id) => id.length > 0)
  );
}

async function selectTwoPathsViaLayers(page: Page): Promise<void> {
  const pathIds = await getContentPathIds(page);
  expect(pathIds.length).toBeGreaterThanOrEqual(2);

  await page.getByTestId('tool-selector').click();
  await page.getByTestId('dock-tab-layers').click();
  await page.getByTestId(`layer-row-${pathIds[0]}`).click();
  await page.keyboard.down('Shift');
  await page.getByTestId(`layer-row-${pathIds[1]}`).click();
  await page.keyboard.up('Shift');

  await expect.poll(async () => (await getSelectedLayerIds(page)).length).toBe(2);
  await page.getByTestId('dock-tab-path-ops').click();
  await expect(page.getByTestId('path-ops-union')).toBeEnabled();
}

test.describe('Path boolean operations', () => {
  test('path ops buttons disabled until two paths are selected', async ({ page }) => {
    await loadTwoClosedPaths(page);
    await page.getByTestId('dock-tab-path-ops').click();

    const [firstPathId] = await getContentPathIds(page);
    await page.getByTestId('tool-selector').click();
    await page.getByTestId('dock-tab-layers').click();
    await page.getByTestId(`layer-row-${firstPathId}`).click();
    await page.getByTestId('dock-tab-path-ops').click();

    await expect(page.getByTestId('path-ops-union')).toBeDisabled();
    await expect(page.getByTestId('path-ops-subtract')).toBeDisabled();
    await expect(page.getByTestId('path-ops-intersect')).toBeDisabled();
  });

  test('union preview, apply, undo, and intersect through path ops panel', async ({ page }) => {
    await loadTwoClosedPaths(page);
    await selectTwoPathsViaLayers(page);

    const pathCountBefore = await page.locator('[data-editor-content-group] path').count();

    await page.getByTestId('path-ops-union').click();
    await expect(page.getByTestId('canvas-path-boolean-preview')).toBeVisible();
    await expect(page.getByTestId('path-ops-apply')).toBeVisible();

    await page.getByTestId('path-ops-apply').click();
    await expect(page.getByTestId('canvas-path-boolean-preview')).toHaveCount(0);
    expect(await page.locator('[data-editor-content-group] path').count()).toBeLessThan(
      pathCountBefore
    );

    const exportedAfterUnion = await page.evaluate(() => {
      const root = document.querySelector('[data-editor-content-group]');
      return root?.innerHTML ?? '';
    });
    expect(exportedAfterUnion).toContain('<path');
    expect(exportedAfterUnion).toContain('d=');

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => page.locator('[data-editor-content-group] path').count()).toBe(
      pathCountBefore
    );

    await selectTwoPathsViaLayers(page);
    await page.getByTestId('path-ops-intersect').click();
    await expect(page.getByTestId('canvas-path-boolean-preview')).toBeVisible();
    await page.getByTestId('path-ops-cancel').click();
    await expect(page.getByTestId('canvas-path-boolean-preview')).toHaveCount(0);
  });
});
