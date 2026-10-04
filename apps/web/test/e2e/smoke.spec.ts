import { expect, test } from '@playwright/test';

test('kingdom page renders with empty numeric fields (never 0)', async ({ page }) => {
  await page.goto('/kingdom');
  await expect(page.getByRole('heading', { name: 'Kingdom', exact: true })).toBeVisible();
  const numberInputs = page.locator('input[type="number"]');
  const count = await numberInputs.count();
  expect(count).toBeGreaterThan(10);
  for (let i = 0; i < count; i++) {
    expect(await numberInputs.nth(i).inputValue(), `number input ${i} should be empty`).toBe('');
  }
});

test('skills page lists all 16 seeded skills', async ({ page }) => {
  await page.goto('/skills');
  await expect(page.getByRole('heading', { name: 'Kingdom Skills' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(16);
});

test('leaders page lists all 8 roles', async ({ page }) => {
  await page.goto('/leaders');
  await expect(page.getByRole('heading', { name: 'Leaders' })).toBeVisible();
  const roles = ['ruler', 'counselor', 'general', 'emissary', 'magister', 'marshal', 'treasurer', 'viceroy'];
  for (const role of roles) {
    await expect(page.getByRole('heading', { name: role, exact: true })).toBeVisible();
  }
});

test('stale save shows the conflict dialog and force overwrite works', async ({ page }) => {
  await page.goto('/kingdom');
  const nameInput = page.getByPlaceholder('Kingdom name');
  await expect(nameInput).toBeVisible();

  // Dirty the draft.
  await nameInput.fill('Test Kingdom');

  // Simulate another client saving first (bumps the server version).
  const res = await page.request.get('/api/kingdom');
  const current = await res.json();
  await page.request.patch('/api/kingdom', {
    data: { ...current.data, notes: 'bumped by another client' },
    headers: { 'content-type': 'application/json' },
  });
  // Give the SSE-driven refetch a moment to land.
  await page.waitForTimeout(500);

  // Save our stale draft -> 409 -> conflict dialog.
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(page.getByText('Save conflict')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load server copy' })).toBeVisible();

  // Force overwrite with the local draft.
  await page.getByRole('button', { name: 'Overwrite with mine' }).click();
  await expect(page.getByText('Save conflict')).toBeHidden();
  const after = await (await page.request.get('/api/kingdom')).json();
  expect(after.data.name).toBe('Test Kingdom');
});