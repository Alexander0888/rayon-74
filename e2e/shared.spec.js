import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { test, expect } from '@playwright/test';
import { createSharedPlanStore } from '../src/features/herbs/data/sharedPlanStore.js';
import { emptySlots } from '../src/features/herbs/data/plans.js';
import { chooseHerb, confirm, filled, noOverflow, openEditor, selectTemplate } from './helpers.js';

const settings = parseEnv(readFileSync('.env.shared.local', 'utf8'));
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(settings.VITE_SUPABASE_URL).hostname)) {
  throw new Error('Shared UI checks must never target a hosted database.');
}
const account = JSON.parse(readFileSync('supabase/demo-accounts.local', 'utf8')).find(({ role }) => role === 'manager');

async function login(page) {
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('dialog').getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter', exact: true })).toBeVisible();
}

async function managerStore() {
  const client = createClient(settings.VITE_SUPABASE_URL, settings.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw new Error('Could not sign in with the local demo manager.');
  return createSharedPlanStore(client);
}

test('orders show the Zurich delivery date, categories, statuses and responsive controls', async ({ page }) => {
  const base = { ordered_unit_id: 7, package_quantity_unit_id: 5, per_box: 12,
    price_amount: 3.80, price_unit_id: 5, currency_id: 1, origin_id: 181, counting_status: 'active' };
  const lines = [
    { ...base, id: 1, product_name: 'Clémentine de Corse', ordered_quantity: 3, validated_quantity: 2, validated_unit_id: 7, is_bio: true },
    { ...base, id: 2, product_name: 'Avocat', ordered_quantity: 1, validated_quantity: null },
    { ...base, id: 3, product_name: 'Tomate', ordered_quantity: 9, validated_quantity: null, counting_status: 'cancelled' },
    { ...base, id: 4, product_name: 'Persil haché 4G', ordered_quantity: 1, validated_quantity: null },
    { ...base, id: 5, product_name: 'Basilic', ordered_quantity: 1, validated_quantity: null },
    { ...base, id: 6, product_name: 'Olives noires', ordered_quantity: 1, validated_quantity: null },
    { ...base, id: 7, product_name: 'Dattes', ordered_quantity: 1, validated_quantity: null },
  ];
  const dates = [];
  await page.route('**/rest/v1/rpc/get_orders_for_delivery', (route) => {
    const day = route.request().postDataJSON().p_delivery_date;
    dates.push(day);
    return route.fulfill({ json: { lines: day === '2026-11-23' ? lines : [], latestDate: '2026-11-23' } });
  });
  await page.goto('/#/orders');
  await expect(page.getByText('Connectez-vous avec un compte gestionnaire pour consulter les commandes.')).toBeVisible();
  expect(dates).toHaveLength(0);
  await login(page);
  await page.clock.setFixedTime(new Date('2026-11-22T12:00:00Z'));
  await page.reload();
  const date = page.getByLabel('Date de livraison');
  await expect(date).toHaveValue('2026-11-23');
  const navigation = page.getByRole('navigation', { name: 'Accès rapide aux catégories' });
  await expect(navigation.getByRole('button')).toHaveText(['Fruits', 'Légumes', '4e gamme', 'Herbes', 'Olives', 'Fruits secs']);
  const fruits = page.getByRole('table', { name: 'Fruits', exact: true });
  await expect(fruits.getByRole('rowheader').first()).toHaveText('Avocat');
  const clementine = fruits.getByRole('row', { name: /Clémentine de Corse/ });
  await expect(clementine.getByText('Bio', { exact: true })).toBeVisible();
  await expect(clementine.getByText('2 colis', { exact: false })).toBeVisible();
  await expect(clementine.getByRole('cell', { name: /3 colis/ })).toBeVisible();
  await expect(clementine.getByText(/3,80.*€.*kg/)).toBeVisible();
  const flag = clementine.getByRole('button', { name: 'France' });
  await flag.hover();
  await expect(clementine.locator('.orders-origin-tooltip')).toBeVisible();
  await flag.click();
  await expect(flag).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('combobox', { name: 'Trier par' }).click();
  await page.getByRole('option', { name: 'Quantité · Décroissante' }).click();
  await expect(fruits.getByRole('rowheader').first()).toContainText('Clémentine');
  await expect(page.getByRole('row', { name: /Tomate/ }).getByText('Annulé', { exact: true })).toBeVisible();
  await navigation.getByRole('button', { name: 'Olives' }).click();
  await expect(page.getByRole('heading', { name: 'Olives', exact: true })).toBeFocused();
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill('clementine');
  await expect(page.getByRole('row', { name: /Tomate/ })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await noOverflow(page);
  await date.fill('2026-11-10');
  await expect(page.getByText('Aucune commande pour cette date.')).toBeVisible();
  await page.getByRole('button', { name: 'Dernière livraison importée' }).click();
  await expect(date).toHaveValue('2026-11-23');
  expect(dates).toContain('2026-11-10');
});

test('shared login persists through routes; publication updates a separate public session', async ({ page, browser }) => {
  const store = await managerStore();
  const before = await store.load(true);
  let model = await store.saveTemplate({ id: randomUUID(), name: `UI ${randomUUID()}`, slots: emptySlots(), example: false });
  const visitor = await browser.newContext();
  const publicPage = await visitor.newPage();
  try {
    await publicPage.goto('http://127.0.0.1:5181/#/herbs');
    await expect(publicPage.locator('.stand-heading h2')).toHaveText(before.published.name);
    const beforeLabels = await publicPage.locator('.slot').evaluateAll((slots) => slots.map((slot) => slot.getAttribute('aria-label')));
    await expect(publicPage.getByRole('button', { name: 'Éditeur', exact: true })).toHaveCount(0);
    await page.goto('/');
    await login(page);
    await page.getByRole('link', { name: /Herbes fraîches/ }).click();
    await openEditor(page);
    await selectTemplate(page, model.name);
    await chooseHerb(page, 'Basilic');
    await page.locator('.slot').first().click();
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByText('Modèle enregistré.', { exact: true })).toBeVisible();
    expect(await publicPage.locator('.slot').evaluateAll((slots) => slots.map((slot) => slot.getAttribute('aria-label')))).toEqual(beforeLabels);
    await page.getByRole('button', { name: 'Appliquer au présentoir', exact: true }).click();
    await expect(publicPage.locator('.stand-heading h2')).toHaveText(model.name, { timeout: 15000 });
    await filled(publicPage, 1);
    await page.getByRole('link', { name: 'Accueil', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Se déconnecter', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /Herbes fraîches/ }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Se déconnecter', exact: true })).toBeVisible();
    await filled(page, 1);
    await openEditor(page);
    await selectTemplate(page, model.name);
    await chooseHerb(page, 'Menthe');
    await page.locator('.slot').nth(1).click();
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
    await confirm(page, 'Annuler');
    await filled(page, 2);
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
    await confirm(page, 'Abandonner les modifications');
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible();
    await filled(page, 1);
    await expect(page.getByRole('button', { name: 'Éditeur', exact: true })).toHaveCount(0);
    // An employee tab returns from the menu to the latest published plan.
    await publicPage.getByRole('link', { name: 'Accueil', exact: true }).click();
    const fresh = (await store.load(true)).templates.find(({ id }) => id === model.id);
    await store.applyTemplate({ ...fresh, name: `${model.name} suivant`, slots: emptySlots() });
    await publicPage.getByRole('link', { name: /Herbes fraîches/ }).click();
    await filled(publicPage, 0);
    await expect(publicPage.locator('.stand-heading h2')).toHaveText(`${model.name} suivant`);
  } finally {
    const current = await store.load(true);
    const source = current.templates.find(({ id }) => id === before.published.templateId) || current.templates[0];
    await store.applyTemplate({ ...source, name: before.published.name, slots: before.published.slots });
    model = current.templates.find(({ id }) => id === model.id);
    if (model) await store.deleteTemplate(model);
    await visitor.close();
  }
});

test('waste dashboard ranks subgroups, reveals articles and keeps report controls independent', async ({ page }) => {
  const products = [
    [1, 'Aubergine CH', 'Légumes', 'Aubergines', 'Aubergines KG', '1001'],
    [2, 'Aubergine IMP', 'Légumes', 'Aubergines', 'Aubergines KG', '1002'],
    [3, 'Aubergine Bio', 'Légumes', 'Aubergines Bio', 'Aubergines Bio KG', '1003'],
    ...Array.from({ length: 10 }, (_, index) => [
      index + 4, `Pomme ${index + 1}`, 'Fruits', 'Pommes', `Pommes ${index + 1} KG`,
    ]),
  ];
  const historical = Array.from({ length: 53 }, (_, index) => [
    index + 20, `Poire ${index + 1}`, 'Fruits', 'Poires', `Poires ${index + 1} KG`,
  ]);
  const entries = [
    ...products.map(([id]) => ['2026-11-13', id, 1435 - id * 100, 2870 - id * 200]),
    ...historical.map(([id]) => ['2026-10-02', id, 100, 200]),
  ];
  let requests = 0;
  await page.route('**/rest/v1/rpc/get_waste_dashboard', (route) => {
    requests += 1;
    return route.fulfill({ json: {
      importedAt: '2026-11-20T06:30:00Z', coverage: [['2026-09-01', '2026-11-13']], products: [...products, ...historical], entries,
    } });
  });

  async function select(scope, name, option) {
    await scope.getByRole('combobox', { name, exact: true }).click();
    await scope.getByRole('listbox', { name, exact: true }).getByRole('option', { name: option, exact: true }).click();
  }

  await page.goto('/#/waste');
  await expect(page.getByText('Connectez-vous avec un compte gestionnaire pour consulter les pertes.')).toBeVisible();
  expect(requests).toBe(0);
  await login(page);
  await page.clock.setFixedTime(new Date('2026-11-21T11:00:00Z'));
  await page.reload();
  const summaries = page.locator('.waste-summary');
  const first = summaries.first();
  const dashboard = page.locator('.waste-page');
  await expect(summaries).toHaveCount(3);
  await expect(dashboard.locator('.waste-freshness').getByText('Dernier jour chargé')).toBeVisible();
  await expect(dashboard.locator('select')).toHaveCount(0);
  const firstPeriod = first.getByRole('combobox', { name: 'Période' });
  await expect(firstPeriod).toHaveText('Dernier jour chargé');
  await expect(first).toContainText('13 novembre 2026');
  await expect(first.locator('.waste-total')).toHaveText(/^96\sCHF$/);
  await select(first, 'Période', 'Hier');
  await expect(first).toContainText('20 novembre 2026');
  await expect(first).toContainText('Aucune donnée pour cette période.');
  await select(first, 'Période', 'Aujourd’hui');
  await expect(first).toContainText('21 novembre 2026');
  await select(first, 'Période', 'Avant-hier');
  await expect(first).toContainText('19 novembre 2026');
  await select(first, 'Période', 'Choisir une date');
  const date = first.getByLabel('Date du rapport');
  const periodBox = await firstPeriod.boundingBox();
  const dateBox = await date.boundingBox();
  expect(dateBox.x).toBeGreaterThanOrEqual(periodBox.x + periodBox.width);
  expect(Math.abs(dateBox.y + dateBox.height / 2 - periodBox.y - periodBox.height / 2)).toBeLessThanOrEqual(2);
  await date.fill('2026-11-12');
  await expect(first.locator('.waste-total')).toHaveText(/^0\sCHF$/);
  await date.fill('2026-11-13');
  await expect(first.locator('.waste-total')).toHaveText(/^96 CHF$/);
  await select(dashboard, 'Évaluation des pertes', 'Prix de vente (Ventes)');
  await expect(first.locator('.waste-total')).toHaveText(/^191 CHF$/);
  await expect(page.getByRole('columnheader', { name: 'Pertes au prix de vente (CHF)' })).toBeVisible();
  await select(dashboard, 'Évaluation des pertes', 'Prix d’achat (PA)');
  await expect(summaries.nth(1)).toContainText('7 nov.');
  const week = 'Cette semaine (Semaine 47)';
  await select(summaries.nth(1), 'Période', week);
  await expect(summaries.nth(1)).toContainText('Aucune donnée pour cette période.');
  await select(summaries.nth(1), 'Période', '7 derniers jours');
  const fruits = first.getByRole('button', { name: /^Fruits \d/ });
  await expect(first.locator('.waste-breakdown button').first()).toHaveText(/^Fruits/);
  await expect(first.locator('.waste-breakdown button').nth(1)).toHaveText(/^Légumes/);
  await fruits.hover();
  await expect(first.locator('.waste-ring-slice[data-category="Fruits"]')).toHaveClass(/is-active/);
  const ring = first.locator('.waste-ring');
  const ringBounds = await ring.boundingBox();
  await ring.hover({ position: { x: ringBounds.width - 8, y: ringBounds.height / 2 } });
  await expect(fruits).toHaveAttribute('aria-pressed', 'true');
  await select(first, 'Classement par', 'Groupe');
  await expect(first.getByRole('button', { name: /^Pommes Fruits/ })).toBeVisible();
  await select(first, 'Classement par', 'Produit');
  await first.getByRole('button', { name: 'Aubergines KG', exact: true }).click();
  await expect(first.getByText('Aubergine IMP')).toBeVisible();
  await expect(first.getByText('1002')).toBeVisible();
  await first.getByRole('button', { name: 'Aubergines KG', exact: true }).click();

  const trend = page.locator('.waste-trend');
  const detail = page.locator('.waste-detail');
  await select(trend, 'Période', week);
  await expect(trend.getByText('Aucune donnée pour cette période.')).toBeVisible();
  await expect(detail.locator('tbody tr')).toHaveCount(12);
  await select(detail, 'Période', week);
  await expect(detail.locator('tbody tr')).toHaveCount(0);
  await select(detail, 'Période', '30 derniers jours');

  const group = detail.getByRole('button', { name: 'Groupe', exact: true });
  await expect(group).toBeDisabled();
  await detail.getByRole('button', { name: 'Catégorie', exact: true }).click();
  const categoryMenu = detail.getByRole('group', { name: 'Catégorie', exact: true });
  const detailVegetables = categoryMenu.getByRole('checkbox', { name: 'Légumes', exact: true });
  await expect(detailVegetables).toBeChecked();
  await categoryMenu.getByRole('button', { name: 'Tout décocher' }).click();
  await expect(detailVegetables).not.toBeChecked();
  await expect(detail.locator('tbody tr')).toHaveCount(12);
  await page.keyboard.press('Escape');
  await expect(categoryMenu).toBeHidden();
  await detail.getByRole('button', { name: 'Catégorie', exact: true }).click();
  await expect(detailVegetables).toBeChecked();
  await categoryMenu.getByRole('button', { name: 'Tout décocher' }).click();
  await detailVegetables.check();
  await categoryMenu.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(categoryMenu).toBeHidden();
  await expect(detail.locator('tbody tr')).toHaveCount(2);
  await expect(group).toBeEnabled();
  await group.click();
  await detail.getByRole('group', { name: 'Groupe', exact: true }).getByRole('button', { name: 'Aubergines', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(detail.locator('tbody tr')).toHaveCount(1);
  await detail.getByRole('button', { name: 'Aubergines KG', exact: true }).click();
  await expect(detail.locator('tbody tr')).toHaveCount(3);
  await expect(detail.getByText('Aubergine IMP')).toBeVisible();
  await detail.getByRole('button', { name: 'Aubergines KG', exact: true }).click();
  await detail.getByRole('button', { name: 'Catégorie', exact: true }).click();
  await categoryMenu.getByRole('button', { name: 'Tout cocher' }).click();
  await categoryMenu.getByRole('button', { name: 'Appliquer', exact: true }).click();

  await detail.getByRole('button', { name: 'Produit', exact: true }).click();
  await expect(detail.locator('tbody tr').first()).toContainText('Aubergines Bio KG');
  await detail.getByRole('button', { name: 'Produit', exact: true }).click();
  await expect(detail.getByRole('columnheader', { name: 'Produit' })).toHaveAttribute('aria-sort', 'descending');
  await expect(detail.locator('tbody tr').first()).toContainText('Pommes 10 KG');
  await detail.getByRole('button', { name: 'Pertes au PA (CHF)', exact: true }).click();
  await expect(detail.locator('tbody tr').first()).toContainText('Aubergines KG');
  await detail.getByRole('button', { name: 'Pertes au PA (CHF)', exact: true }).click();
  await expect(detail.locator('tbody tr').first()).toContainText('Pommes 10 KG');

  const search = detail.getByRole('searchbox', { name: 'Rechercher un produit' });
  await search.fill('aub');
  await expect(detail.locator('tbody tr')).toHaveCount(2);
  await expect(detail.locator('tbody')).toContainText('Aubergines KG');
  await expect(detail.locator('tbody')).not.toContainText('Aubergine IMP');
  await trend.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await expect(search).toHaveValue('aub');
  await expect(detail.locator('tbody tr')).toHaveCount(2);

  await page.setViewportSize({ width: 390, height: 844 });
  const phonePeriod = await firstPeriod.boundingBox();
  const phoneDate = await date.boundingBox();
  expect(phoneDate.x).toBeGreaterThanOrEqual(phonePeriod.x + phonePeriod.width);
  expect(Math.abs(phoneDate.y + phoneDate.height / 2 - phonePeriod.y - phonePeriod.height / 2)).toBeLessThanOrEqual(2);
  await select(first, 'Période', 'Dernier jour chargé');
  await expect(first.locator('.waste-total')).toHaveText(/^96\sCHF$/);
  for (let index = 1; index < 3; index += 1) {
    const previous = await summaries.nth(index - 1).boundingBox();
    const current = await summaries.nth(index).boundingBox();
    expect(current.y).toBeGreaterThan(previous.y + previous.height - 1);
  }
  await expect(first.locator('.waste-ranking ol > li:visible')).toHaveCount(5);
  await first.getByRole('button', { name: 'Voir le top 10' }).click();
  await expect(first.locator('.waste-ranking ol > li:visible')).toHaveCount(10);

  const chart = page.getByRole('group', { name: /Graphique des pertes par jour/ });
  const trendButton = trend.getByRole('button', { name: 'Choisir les catégories' });
  await trendButton.click();
  const trendMenu = trend.getByRole('group', { name: 'Choisir les catégories' });
  const trendFruits = trendMenu.getByRole('checkbox', { name: 'Fruits', exact: true });
  await expect(trendFruits).toBeChecked();
  await trendMenu.getByRole('button', { name: 'Tout décocher' }).click();
  await expect(trendFruits).not.toBeChecked();
  await expect(chart).toBeVisible();
  await trendMenu.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(trend.getByText('Sélectionnez au moins une catégorie.')).toBeVisible();
  await trendButton.click();
  await expect(trendFruits).not.toBeChecked();
  await trendMenu.getByRole('button', { name: 'Tout cocher' }).click();
  await trendMenu.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await chart.press('End');
  await expect(chart.getByRole('status')).toContainText('13 novembre');
  await expect(chart.getByRole('status')).toContainText('Moyenne mobile');
  const heat = page.locator('.waste-heat');
  await expect(heat.getByRole('columnheader', { name: '8 nov.', exact: true })).toHaveCount(0);
  await heat.getByRole('button', { name: 'Aubergines KG', exact: true }).click();
  await expect(heat.getByText('Aubergine IMP')).toBeVisible();
  await heat.locator('.waste-heat-child .waste-heat-cell').first().click();
  await expect(heat.locator('.waste-heat-selection')).toContainText('CHF');
  await page.setViewportSize({ width: 1024, height: 768 });
  await select(heat, 'Période', 'Mois précédent');
  await expect(heat.locator('tbody tr')).toHaveCount(50);
  await expect(heat.getByRole('columnheader', { name: '31 oct.', exact: true })).toBeVisible();
  expect(await heat.locator('.waste-heat-scroll').evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const square = await heat.locator('.waste-heat-cell').first().boundingBox();
  expect(Math.abs(square.width - square.height)).toBeLessThanOrEqual(1);
  await heat.getByRole('button', { name: 'Suivant' }).click();
  await expect(heat.locator('tbody tr')).toHaveCount(3);
  await select(heat, 'Période', 'Période personnalisée');
  await heat.getByLabel('Du', { exact: true }).fill('2026-10-01');
  await heat.getByLabel('Au', { exact: true }).fill('2026-10-31');
  await expect(heat.getByText('Choisissez une période de 30 jours maximum.')).toBeVisible();
  await expect(heat.locator('tbody tr')).toHaveCount(0);
  await heat.getByLabel('Au', { exact: true }).fill('2026-10-30');
  await expect(heat.locator('tbody tr')).toHaveCount(50);
});

test('a failed save during navigation keeps the draft and allows retry', async ({ page }) => {
  const store = await managerStore();
  let model = await store.saveTemplate({ id: randomUUID(), name: `UI ${randomUUID()}`, slots: emptySlots(), example: false });
  try {
    await page.goto('/#/herbs');
    await login(page);
    await expect(page.locator('button.slot')).toHaveCount(48);
    await selectTemplate(page, model.name);
    await chooseHerb(page, 'Basilic');
    await page.locator('.slot').first().click();
    let releaseRequest;
    const gate = new Promise((resolve) => { releaseRequest = resolve; });
    await page.route('**/rest/v1/plan_templates?*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      await gate;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Test: temporary outage' }) });
    });
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByRole('link', { name: 'Accueil', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Opération en cours');
    releaseRequest();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Abandonner les modifications ?');
    await confirm(page, 'Annuler');
    await filled(page, 1);
    await expect(page.getByText('Modifications non enregistrées', { exact: true })).toBeVisible();
    await page.unroute('**/rest/v1/plan_templates?*');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByText('Modèle enregistré.', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Accueil', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les outils du rayon');
  } finally {
    model = (await store.load(true)).templates.find(({ id }) => id === model.id);
    if (model) await store.deleteTemplate(model);
  }
});
