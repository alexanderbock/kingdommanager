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

test('settlements page: seeded village, add settlement, place buildings, overcrowding', async ({ page }) => {
  await page.goto('/settlements');
  await expect(page.getByRole('heading', { name: 'Settlements', exact: true })).toBeVisible();

  // The seeded village is present.
  const nameInputs = page.locator('input[aria-label="Settlement name"]');
  await expect(nameInputs.first()).toHaveValue('New Halvong');

  // Add a town.
  await page.getByRole('button', { name: 'Add settlement' }).click();
  const dialog = page.getByRole('dialog', { name: 'New settlement' });
  await dialog.getByLabel('Name').fill('Test Town');
  await dialog.getByLabel('Size').selectOption('town');
  await dialog.getByRole('button', { name: 'Add settlement' }).click();
  await expect(page.locator('.card')).toHaveCount(2);

  const card = page.locator('.card').last();
  await expect(card.locator('input[aria-label="Settlement name"]')).toHaveValue('Test Town');

  // Create a non-residential building: its block is occupied with no
  // residential lots, so the settlement is overcrowded.
  await card.getByRole('button', { name: '+ Add building' }).click();
  const building = page.getByRole('dialog', { name: 'New building' });
  await building.getByLabel('Name').fill('Tavern');
  await building.getByRole('button', { name: 'Choose location' }).click();
  await card.getByRole('button', { name: 'Lot 1.1' }).click();
  await expect(card.getByText('Overcrowded')).toBeVisible();

  // Add a residential lot: housing becomes sufficient.
  await card.getByRole('button', { name: '+ Add building' }).click();
  const housing = page.getByRole('dialog', { name: 'New building' });
  await housing.getByLabel('Name').fill('Housing');
  await housing.getByLabel('Residential').check();
  await housing.getByRole('button', { name: 'Choose location' }).click();
  await card.getByRole('button', { name: 'Lot 1.2' }).click();
  await expect(card.getByText('Housing OK')).toBeVisible();
});

// Runs last: it creates a scratch settlement, so it must not run before the
// test above that asserts on the seeded card count.
test('settlements: force overwrite does not re-open the conflict via a racing autosave', async ({ page }) => {
  await page.goto('/settlements');

  // Create a dedicated settlement for this test.
  await page.getByRole('button', { name: 'Add settlement' }).click();
  const dialog = page.getByRole('dialog', { name: 'New settlement' });
  await dialog.getByLabel('Name').fill('Race Test');
  await dialog.getByRole('button', { name: 'Add settlement' }).click();
  const card = page.locator('.card').last();
  const nameInput = card.locator('input[aria-label="Settlement name"]');
  await expect(nameInput).toHaveValue('Race Test');

  // Make an edit and let it autosave cleanly.
  await nameInput.fill('Race Test X');
  await expect(card.getByText('✓', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Start a new edit, then bump the server version from "another client" so
  // the pending edit goes stale -> 409 -> conflict dialog.
  await nameInput.fill('Race Test Y');
  const list = await (await page.request.get('/api/settlements')).json();
  const target = list.find((s: any) => s.data.name === 'Race Test X');
  await page.request.patch(`/api/settlements/${target.id}`, {
    data: { data: { ...target.data, location: 'bumped by another client' }, version: target.version },
    headers: { 'content-type': 'application/json' },
  });

  // The autosave now hits a 409 -> conflict dialog.
  await expect(page.getByText('Save conflict')).toBeVisible({ timeout: 10_000 });

  // Force overwrite with the local draft.
  await page.getByRole('button', { name: 'Overwrite with mine' }).click();
  await expect(page.getByText('Save conflict')).toBeHidden();

  // Regression: a redundant autosave used to fire right after the overwrite
  // with a stale version and 409 again, re-opening the dialog. Give it time
  // to (try to) fire; the dialog must stay closed and the edit must persist.
  await page.waitForTimeout(2500);
  await expect(page.getByText('Save conflict')).toBeHidden();
  const after = await (await page.request.get('/api/settlements')).json();
  const saved = after.find((s: any) => s.id === target.id);
  expect(saved.data.name).toBe('Race Test Y');
});

test('settlements: delete a settlement removes it', async ({ page }) => {
  await page.goto('/settlements');

  // Create a dedicated settlement to delete.
  await page.getByRole('button', { name: 'Add settlement' }).click();
  const dialog = page.getByRole('dialog', { name: 'New settlement' });
  await dialog.getByLabel('Name').fill('Doomed Town');
  await dialog.getByRole('button', { name: 'Add settlement' }).click();
  const doomed = page.locator('.card').last();
  await expect(doomed.locator('input[aria-label="Settlement name"]')).toHaveValue('Doomed Town');
  const countBefore = await page.locator('.card').count();

  // Delete it (accept the confirm dialog). The DELETE must succeed (no 400
  // from an empty JSON body) and remove the card.
  page.once('dialog', (d) => d.accept());
  await doomed.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.card')).toHaveCount(countBefore - 1);
});
test('armies page: add an army, edit the stat block, autosave persists', async ({ page }) => {
  await page.goto('/armies');
  await expect(page.getByRole('heading', { name: 'Armies' })).toBeVisible();

  await page.getByRole('button', { name: 'Add army' }).click();
  const dialog = page.getByRole('dialog', { name: 'New army' });
  await dialog.getByLabel('Name').fill('Guard Company');
  await dialog.getByLabel('Type').selectOption('infantry');
  await dialog.getByRole('button', { name: 'Add army' }).click();

  const card = page.locator('.card').first();
  await expect(card.locator('input[aria-label="Army name"]')).toHaveValue('Guard Company');

  // Fill in stat block numbers: level, max HP, and rout threshold (half of max HP).
  await card.getByLabel('Level').fill('2');
  await card.getByLabel('Max HP').fill('40');
  await card.getByLabel('Rout threshold').fill('20');
  await expect(card.getByText('✓', { exact: true })).toBeVisible({ timeout: 10_000 });

  const list = await (await page.request.get('/api/armies')).json();
  const army = list.find((a: any) => a.data.name === 'Guard Company');
  expect(army.data.level).toBe(2);
  expect(army.data.maxHp).toBe(40);
  expect(army.data.routThreshold).toBe(20);
});