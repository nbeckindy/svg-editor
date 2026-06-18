import { expect, test } from '@playwright/test';

test.describe('Editor shell layout', () => {
  test('shows top bar, left rail, canvas, and right dock', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('app-root')).toBeVisible();
    await expect(page.getByTestId('editor-main')).toBeVisible();
    await expect(page.getByTestId('editor-top-bar')).toBeVisible();
    await expect(page.getByTestId('editor-tool-context-bar')).toBeVisible();
    await expect(page.getByTestId('editor-left-rail')).toBeVisible();
    await expect(page.getByTestId('editor-canvas-column')).toBeVisible();
    await expect(page.getByTestId('editor-canvas-area')).toBeVisible();
    await expect(page.getByTestId('editor-svg-canvas')).toBeVisible();
    await expect(page.getByTestId('editor-debug-strip')).toBeVisible();
    await expect(page.getByTestId('editor-right-dock')).toBeVisible();

    const debugToggle = page.getByTestId('editor-svg-debug-panel').getByRole('button');
    await expect(debugToggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('defaults to properties tab', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('dock-tab-properties')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-properties-area')).toBeVisible();
    await expect(page.getByTestId('editor-layers-area')).toBeHidden();
    await expect(page.getByTestId('editor-path-ops-area')).toBeHidden();
  });

  test('switches between properties, layers, and path ops tabs', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('dock-tab-layers').click();
    await expect(page.getByTestId('dock-tab-layers')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-layers-area')).toBeVisible();
    await expect(page.getByTestId('editor-properties-area')).toBeHidden();
    await expect(page.getByTestId('editor-path-ops-area')).toBeHidden();

    await page.getByTestId('dock-tab-path-ops').click();
    await expect(page.getByTestId('dock-tab-path-ops')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-path-ops-area')).toBeVisible();
    await expect(page.getByTestId('editor-properties-area')).toBeHidden();
    await expect(page.getByTestId('editor-layers-area')).toBeHidden();

    await page.getByTestId('dock-tab-properties').click();
    await expect(page.getByTestId('dock-tab-properties')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-properties-area')).toBeVisible();
    await expect(page.getByTestId('editor-layers-area')).toBeHidden();
    await expect(page.getByTestId('editor-path-ops-area')).toBeHidden();
  });

  // Narrow-viewport responsive / compact layout is covered in svg-editor-8x1.6; this is a 1000×900 smoke only.
  test('keeps rails, dock tabs, and canvas visible at 1000×900', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.goto('/');

    await expect(page.getByTestId('editor-left-rail')).toBeVisible();
    await expect(page.getByTestId('editor-right-dock')).toBeVisible();
    await expect(page.getByTestId('dock-tab-properties')).toBeVisible();
    await expect(page.getByTestId('dock-tab-layers')).toBeVisible();
    await expect(page.getByTestId('dock-tab-path-ops')).toBeVisible();
    await expect(page.getByTestId('editor-canvas-area')).toBeVisible();
  });

  test('collapses dock to strip and expands while preserving active tab', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('dock-tab-layers').click();
    await expect(page.getByTestId('dock-tab-layers')).toHaveAttribute('aria-selected', 'true');

    await page.getByTestId('dock-collapse').click();
    await expect(page.getByTestId('dock-expanded-region')).toBeHidden();
    await expect(page.getByTestId('dock-expand-handle')).toBeVisible();

    await page.getByTestId('dock-expand-handle').click();
    await expect(page.getByTestId('dock-expanded-region')).toBeVisible();
    await expect(page.getByTestId('dock-tab-layers')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-layers-area')).toBeVisible();
    await expect(page.getByTestId('editor-properties-area')).toBeHidden();
  });
});
