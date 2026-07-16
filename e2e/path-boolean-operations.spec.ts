import { expect, test, type Page } from '@playwright/test';
import { ensureDockSectionExpanded, getSelectedLayerIds } from './canvas-helpers';

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

const MIXED_SHAPES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<rect id="bool-rect-a" x="100" y="100" width="80" height="60" fill="#000"/>
<circle id="bool-circle-b" cx="200" cy="150" r="40" fill="#333"/>
</svg>`;

async function loadMixedShapes(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('canvas-viewport')).toBeVisible();

  const debugPanel = page.getByTestId('editor-svg-debug-panel');
  await debugPanel.getByRole('button', { name: 'Expand' }).click();
  await page.getByTestId('svg-debug-editor').fill(MIXED_SHAPES_SVG);
  await page.getByTestId('svg-debug-apply').click();
  await expect(page.locator('[data-editor-content-group] rect')).toHaveCount(1);
  await expect(page.locator('[data-editor-content-group] circle')).toHaveCount(1);
  await debugPanel.getByRole('button', { name: 'Collapse' }).click();
}

async function getCompoundOperandIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-editor-content-group] rect, [data-editor-content-group] circle, [data-editor-content-group] ellipse, [data-editor-content-group] path'))
      .map((el) => el.id)
      .filter((id) => id.length > 0)
  );
}

async function selectTwoOperandsViaLayers(page: Page, getIds: () => Promise<string[]>): Promise<void> {
  const ids = await getIds();
  expect(ids.length).toBeGreaterThanOrEqual(2);

  await page.getByTestId('tool-selector').click();
  await ensureDockSectionExpanded(page, 'layers');
  await page.getByTestId(`layer-row-${ids[0]}`).click();
  await page.keyboard.down('Shift');
  await page.getByTestId(`layer-row-${ids[1]}`).click();
  await page.keyboard.up('Shift');

  await expect.poll(async () => (await getSelectedLayerIds(page)).length).toBe(2);
  await ensureDockSectionExpanded(page, 'path-ops');
}

async function selectTwoPathsViaLayers(page: Page): Promise<void> {
  await selectTwoOperandsViaLayers(page, () => getContentPathIds(page));
  await expect(page.getByTestId('path-ops-union')).toBeEnabled();
}

test.describe('Path boolean operations', () => {
  test('path ops buttons disabled until two paths are selected', async ({ page }) => {
    await loadTwoClosedPaths(page);
    await ensureDockSectionExpanded(page, 'path-ops');

    const [firstPathId] = await getContentPathIds(page);
    await page.getByTestId('tool-selector').click();
    await ensureDockSectionExpanded(page, 'layers');
    await page.getByTestId(`layer-row-${firstPathId}`).click();
    await ensureDockSectionExpanded(page, 'path-ops');

    await expect(page.getByTestId('path-ops-union')).toBeDisabled();
    await expect(page.getByTestId('path-ops-subtract')).toBeDisabled();
    await expect(page.getByTestId('path-ops-intersect')).toBeDisabled();
    await expect(page.getByTestId('path-ops-compound')).toBeDisabled();
  });

  test('compound combines two paths into one subpath element with evenodd', async ({ page }) => {
    await loadTwoClosedPaths(page);
    await selectTwoPathsViaLayers(page);

    await page.getByTestId('path-ops-compound').click();
    await expect(page.locator('[data-editor-content-group] path')).toHaveCount(1);

    const compoundD = await page.evaluate(() => {
      const path = document.querySelector('[data-editor-content-group] path');
      return path?.getAttribute('d') ?? '';
    });
    expect((compoundD.match(/M/g) ?? []).length).toBe(2);
    expect((compoundD.match(/Z/g) ?? []).length).toBe(2);

    const fillRule = await page.evaluate(() =>
      document.querySelector('[data-editor-content-group] path')?.getAttribute('fill-rule')
    );
    expect(fillRule).toBe('evenodd');

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-editor-content-group] path')).toHaveCount(2);
  });

  test('compound combines rect and circle into one path', async ({ page }) => {
    await loadMixedShapes(page);
    await selectTwoOperandsViaLayers(page, () => getCompoundOperandIds(page));

    await expect(page.getByTestId('path-ops-compound')).toBeEnabled();
    await page.getByTestId('path-ops-compound').click();

    await expect(page.locator('[data-editor-content-group] path')).toHaveCount(1);
    await expect(page.locator('[data-editor-content-group] rect')).toHaveCount(0);
    await expect(page.locator('[data-editor-content-group] circle')).toHaveCount(0);

    const compoundD = await page.evaluate(() =>
      document.querySelector('[data-editor-content-group] path')?.getAttribute('d') ?? ''
    );
    expect((compoundD.match(/Z/g) ?? []).length).toBe(2);
    expect(compoundD).toContain('C');
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

  test('union boolean with rect and path operands', async ({ page }) => {
    const MIXED_RECT_PATH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<rect id="bool-rect-a" x="100" y="100" width="80" height="60" fill="#000"/>
<path id="bool-path-b" d="M 150 100 L 230 100 L 230 160 L 150 160 Z" fill="#333"/>
</svg>`;

    await page.goto('/');
    await expect(page.getByTestId('canvas-viewport')).toBeVisible();
    const debugPanel = page.getByTestId('editor-svg-debug-panel');
    await debugPanel.getByRole('button', { name: 'Expand' }).click();
    await page.getByTestId('svg-debug-editor').fill(MIXED_RECT_PATH_SVG);
    await page.getByTestId('svg-debug-apply').click();
    await expect(page.locator('[data-editor-content-group] rect')).toHaveCount(1);
    await expect(page.locator('[data-editor-content-group] path')).toHaveCount(1);
    await debugPanel.getByRole('button', { name: 'Collapse' }).click();

    const getMixedOperandIds = () =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            '[data-editor-content-group] rect, [data-editor-content-group] path'
          )
        )
          .map((el) => el.id)
          .filter((id) => id.length > 0)
      );

    await selectTwoOperandsViaLayers(page, getMixedOperandIds);
    await expect(page.getByTestId('path-ops-union')).toBeEnabled();

    await page.getByTestId('path-ops-union').click();
    await expect(page.getByTestId('canvas-path-boolean-preview')).toBeVisible();
    await page.getByTestId('path-ops-apply').click();

    await expect(page.locator('[data-editor-content-group] path')).toHaveCount(1);
    await expect(page.locator('[data-editor-content-group] rect')).toHaveCount(0);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-editor-content-group] rect')).toHaveCount(1);
    await expect(page.locator('[data-editor-content-group] path')).toHaveCount(1);
  });

  test('subtract boolean with circle and ellipse operands', async ({ page }) => {
    const CIRCLE_ELLIPSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<circle id="bool-circle-a" cx="200" cy="150" r="50" fill="#000"/>
<ellipse id="bool-ellipse-b" cx="240" cy="150" rx="50" ry="40" fill="#333"/>
</svg>`;

    await page.goto('/');
    await expect(page.getByTestId('canvas-viewport')).toBeVisible();
    const debugPanel = page.getByTestId('editor-svg-debug-panel');
    await debugPanel.getByRole('button', { name: 'Expand' }).click();
    await page.getByTestId('svg-debug-editor').fill(CIRCLE_ELLIPSE_SVG);
    await page.getByTestId('svg-debug-apply').click();
    await expect(page.locator('[data-editor-content-group] circle')).toHaveCount(1);
    await expect(page.locator('[data-editor-content-group] ellipse')).toHaveCount(1);
    await debugPanel.getByRole('button', { name: 'Collapse' }).click();

    const getCurvedOperandIds = () =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            '[data-editor-content-group] circle, [data-editor-content-group] ellipse'
          )
        )
          .map((el) => el.id)
          .filter((id) => id.length > 0)
      );

    await selectTwoOperandsViaLayers(page, getCurvedOperandIds);
    await expect(page.getByTestId('path-ops-subtract')).toBeEnabled();

    await page.getByTestId('path-ops-subtract').click();
    await expect(page.getByTestId('canvas-path-boolean-preview')).toBeVisible();
    await page.getByTestId('path-ops-apply').click();

    await expect(page.locator('[data-editor-content-group] path')).toHaveCount(1);
    await expect(page.locator('[data-editor-content-group] circle')).toHaveCount(0);
    await expect(page.locator('[data-editor-content-group] ellipse')).toHaveCount(0);
  });
});
