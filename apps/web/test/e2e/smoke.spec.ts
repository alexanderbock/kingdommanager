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

  // Type a name; autosave persists it in the background.
  await nameInput.fill('Test Kingdom');
  await expect
    .poll(async () => (await (await page.request.get('/api/kingdom')).json()).data.name)
    .toBe('Test Kingdom');

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
  await expect
    .poll(async () => {
      const list = await (await page.request.get('/api/settlements')).json();
      return list.some((s: any) => s.data.name === 'Race Test X');
    })
    .toBe(true);

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
  await expect
    .poll(async () => {
      const list = await (await page.request.get('/api/armies')).json();
      return list.find((a: any) => a.data.name === 'Guard Company')?.data;
    })
    .toMatchObject({ level: 2, maxHp: 40, routThreshold: 20 });

  const list = await (await page.request.get('/api/armies')).json();
  const army = list.find((a: any) => a.data.name === 'Guard Company');
  expect(army.data.level).toBe(2);
  expect(army.data.maxHp).toBe(40);
  expect(army.data.routThreshold).toBe(20);
});

test('turn log: setup is not logged, next-turn logs changes live', async ({ page }) => {
  await page.goto('/turn-log');
  await expect(page.getByRole('heading', { name: 'Turn Log', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start turn 1' })).toBeVisible();

  // A setup change (turn 0) is not logged.
  const res = await page.request.get('/api/kingdom');
  const kingdom = await res.json();
  await page.request.patch('/api/kingdom', {
    data: { ...kingdom.data, notes: 'setup change' },
    headers: { 'content-type': 'application/json' },
  });
  await expect(page.getByText('No turns yet.')).toBeVisible();

  // Start turn 1; a change now is logged and appears live via SSE.
  await page.getByRole('button', { name: 'Start turn 1' }).click();
  await expect(page.getByRole('button', { name: 'Next turn' })).toBeVisible();
  // No "Turn created" lifecycle entry: the active turn starts empty.
  await expect(page.getByText('No changes yet this turn.')).toBeVisible();

  const res2 = await page.request.get('/api/kingdom');
  const kingdom2 = await res2.json();
  await page.request.patch('/api/kingdom', {
    data: { ...kingdom2.data, resourcePoints: 4 },
    headers: { 'content-type': 'application/json' },
  });
  await expect(page.getByText(/resourcePoints/)).toBeVisible();

  // A work site change lists only the added item, not the whole work site list.
  const res3 = await page.request.get('/api/kingdom');
  const kingdom3 = await res3.json();
  await page.request.patch('/api/kingdom', {
    data: {
      ...kingdom3.data,
      workSites: [
        ...kingdom3.data.workSites,
        { id: 'mine-2', type: 'mine', resourceHexes: 1, location: '', comments: '' },
      ],
    },
    headers: { 'content-type': 'application/json' },
  });
  await page.getByText('show workSites').click();
  const showBlock = page.locator('details:has(summary:text("show workSites")) pre');
  await expect(showBlock).toContainText('added:');
  await expect(showBlock).toContainText('type: mine');
  await expect(showBlock).not.toContainText('farmland');
});

test('turn page: step list, AoN links, activity pickers, finish turn', async ({ page }) => {
  // The turn-log test may have left turn 1 active; start one if not.
  const active = await page.request.get('/api/turns/active');
  if (active.status() === 404) {
    const started = await page.request.post('/api/turn-log/next-turn', { data: {} });
    expect(started.status()).toBe(201);
  }
  const turn = await (await page.request.get('/api/turns/active')).json();
  const n = turn.data.number;

  // Mark the ruler as a PC leader so the leadership picker has a card.
  const leaders = await (await page.request.get('/api/leaders')).json();
  const ruler = leaders.find((l: any) => l.id === 'ruler');
  await page.request.patch('/api/leaders/ruler', {
    data: { data: { ...ruler.data, isPC: true, vacant: false, holderName: 'Morgan' }, version: ruler.version },
    headers: { 'content-type': 'application/json' },
  });
  const settlements = await (await page.request.get('/api/settlements')).json();
  const village = settlements.find((s: any) => s.data.name === 'New Halvong');

  await page.goto('/turn');
  await expect(page.getByRole('heading', { name: `Turn ${n}`, exact: true })).toBeVisible();
  await expect(page.getByText('0 of 16 steps done').first()).toBeVisible();

  // Phases and steps are listed in order.
  for (const phase of ['Upkeep', 'Commerce', 'Activity', 'Event']) {
    await expect(page.getByText(phase, { exact: true })).toBeVisible();
  }
  const nav = page.getByRole('navigation', { name: 'Turn steps' });
  await expect(nav.getByRole('button', { name: /Assign Leadership Roles/ })).toBeVisible();

  // The current step shows its AoN rule links.
  const firstLink = page.getByRole('link', { name: /Step 1: Assign Leadership Roles/ });
  await expect(firstLink).toBeVisible();
  await expect(firstLink).toHaveAttribute('href', 'https://2e.aonprd.com/Rules.aspx?ID=1796');

  // Leadership activities: pick an activity and outcome for the PC leader.
  await nav.getByRole('button', { name: /Leadership Activities/ }).click();
  await expect(page.getByRole('link', { name: /Step 1: Leadership Activities/ })).toHaveAttribute(
    'href',
    'https://2e.aonprd.com/Rules.aspx?ID=1806',
  );
  const leaderCard = page.locator('[data-testid="activity-actor"]', { hasText: 'Morgan' });
  await leaderCard.locator('select').first().selectOption('take-charge');
  await leaderCard.locator('select').nth(1).selectOption('success');
  await expect
    .poll(async () => {
      const t = await (await page.request.get('/api/turns/active')).json();
      return t.data.stepState['leadership-activities'].activities;
    })
    .toEqual([{ actorId: 'ruler', activityKey: 'take-charge', outcome: 'success' }]);

  // Region activities: one collective card with three slots.
  await nav.getByRole('button', { name: /Region Activities/ }).click();
  const partyCard = page.locator('[data-testid="activity-actor"]').first();
  await expect(partyCard.getByText('The party')).toBeVisible();
  await partyCard.locator('select').first().selectOption('claim-hex');
  await partyCard.locator('select').nth(1).selectOption('crit-success');
  await expect
    .poll(async () => {
      const t = await (await page.request.get('/api/turns/active')).json();
      return t.data.stepState['region-activities'].activities;
    })
    .toEqual([{ actorId: 'party', activityKey: 'claim-hex', outcome: 'crit-success' }]);

  // Civic activities: one slot per settlement.
  await nav.getByRole('button', { name: /Civic Activities/ }).click();
  const townCard = page.locator('[data-testid="activity-actor"]', { hasText: 'New Halvong' });
  await townCard.locator('select').first().selectOption('build-structure');
  await townCard.locator('select').nth(1).selectOption('failure');
  await expect
    .poll(async () => {
      const t = await (await page.request.get('/api/turns/active')).json();
      return t.data.stepState['civic-activities'].activities;
    })
    .toEqual([{ actorId: village.id, activityKey: 'build-structure', outcome: 'failure' }]);

  // Mark every step done, then finish the turn (which starts the next one).
  for (const step of turn.data.template.steps) {
    await page.request.patch(`/api/turns/${n}/steps/${step.key}`, {
      data: { done: true },
      headers: { 'content-type': 'application/json' },
    });
  }
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: `Finish turn ${n}` }).click();
  await expect(page.getByRole('heading', { name: `Turn ${n + 1}`, exact: true })).toBeVisible();

  // The new turn starts fresh: no activity selections carried over.
  const next = await (await page.request.get('/api/turns/active')).json();
  expect(next.data.number).toBe(n + 1);
  expect(next.data.stepState['leadership-activities'].activities ?? []).toHaveLength(0);
});

test('settings: reset the kingdom to its default state', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  // Earlier tests left the kingdom modified.
  const before = await (await page.request.get('/api/kingdom')).json();
  expect(before.data.name).not.toBe('');

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reset kingdom to defaults' }).click();

  // The reset wipes and re-seeds the database; poll until it has landed.
  await expect.poll(async () => {
    const res = await page.request.get('/api/kingdom');
    return (await res.json()).data.name;
  }).toBe('');
  const log = await (await page.request.get('/api/turn-log')).json();
  expect(log.activeTurnNumber).toBeNull();
  expect(log.turns).toHaveLength(0);
  const settlements = await (await page.request.get('/api/settlements')).json();
  expect(settlements.map((s: any) => s.data.name)).toEqual(['New Halvong']);
  // The page reloaded back to a working state.
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});