import { expect, test } from '@playwright/test';
import { ensureDockSectionExpanded } from './canvas-helpers';

test.describe('Editor shell: Properties vs document context', () => {
  test('default document: Document + Properties sections expanded; artboard settings in Document; no shape transform readouts', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByTestId('dock-section-document')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('editor-document-area')).toBeVisible();
    await expect(page.getByTestId('document-settings-panel')).toBeVisible();
    await expect(page.getByTestId('document-settings')).toBeVisible();

    await expect(page.getByTestId('dock-section-properties')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('editor-properties-area')).toBeVisible();

    await expect(page.getByTestId('properties-transform-x')).toHaveCount(0);
  });

  test('bundled icon + path selection: transform readouts in Properties; Document settings still available', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('icon-palette-chat-left-heart').click();
    await expect(page.getByTestId('canvas-zoom-level')).toBeVisible();

    await page.getByTestId('canvas-viewport').locator('path').nth(1).click();
    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();

    const xReadout = page.getByTestId('properties-transform-x');
    await expect(xReadout).toBeVisible();
    const xText = (await xReadout.textContent())?.trim() ?? '';
    expect(xText.length).toBeGreaterThan(0);

    await ensureDockSectionExpanded(page, 'document');
    await expect(page.getByTestId('document-settings-panel')).toBeVisible();
    await expect(page.getByTestId('document-settings')).toBeVisible();
  });
});
