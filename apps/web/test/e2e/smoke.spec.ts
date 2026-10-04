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

test('proficiency bonus updates as soon as the dropdown changes', async ({ page }) => {
  // Give the kingdom a level so bonuses can be computed.
  const res = await page.request.get('/api/kingdom');
  const kingdom = await res.json();
  await page.request.patch('/api/kingdom', {
    data: { ...kingdom.data, level: 4 },
    headers: { 'content-type': 'application/json' },
  });

  await page.goto('/skills');
  await expect(page.getByRole('heading', { name: 'Kingdom Skills' })).toBeVisible();

  const firstRow = page.locator('tbody tr').first();
  // Seeded as untrained (improvisation off): bonus is +0.
  await expect(firstRow.getByText('+0', { exact: true })).toBeVisible();

  // Switching the dropdown must update the bonus immediately, no save needed:
  // level 4 + expert (4) = +8.
  await firstRow.locator('select').selectOption('expert');
  await expect(firstRow.getByText('+8', { exact: true })).toBeVisible();
});

test('leaders page lists all 8 roles', async ({ page }) => {
  await page.goto('/leaders');
  await expect(page.getByRole('heading', { name: 'Leaders' })).toBeVisible();
  const roles = ['ruler', 'counselor', 'general', 'emissary', 'magister', 'marshal', 'treasurer', 'viceroy'];
  for (const role of roles) {
    await expect(page.getByRole('heading', { name: role, exact: true })).toBeVisible();
  }
});

test('stale autosave shows the conflict dialog and force overwrite works', async ({ page }) => {
  await page.goto('/kingdom');
  const nameInput = page.getByPlaceholder('Kingdom name');
  await expect(nameInput).toBeVisible();

  // Type a name; autosave persists it.
  await nameInput.fill('Test Kingdom');
  await expect(page.getByText('Saving…', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Start a new edit and, before the debounced autosave fires, bump the
  // server version from "another client" so the pending edit goes stale.
  await nameInput.fill('Test Kingdom 2');
  const res = await page.request.get('/api/kingdom');
  const current = await res.json();
  await page.request.patch('/api/kingdom', {
    data: { ...current.data, notes: 'bumped by another client' },
    headers: { 'content-type': 'application/json' },
  });

  // The autosave now hits a 409 -> conflict dialog.
  await expect(page.getByText('Save conflict')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Load server copy' })).toBeVisible();

  // Force overwrite with the local draft.
  await page.getByRole('button', { name: 'Overwrite with mine' }).click();
  await expect(page.getByText('Save conflict')).toBeHidden();
  const after = await (await page.request.get('/api/kingdom')).json();
  expect(after.data.name).toBe('Test Kingdom 2');
});