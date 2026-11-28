import { test, expect } from '@playwright/test';
import { chooseHerb, confirm, filled, noOverflow, openEditor, selectTemplate, templateAction } from './helpers.js';

test('home, direct links, refresh, browser history and unknown addresses', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les outils du rayon');
  await expect(page).toHaveTitle('Manor | Rayon 74 · Fruits et légumes');
  const footer = page.getByRole('contentinfo');
  await expect(footer).toHaveText('Créé par nous, pour un avenir meilleur, ensemble.');
  const menu = page.getByRole('list', { name: 'Outils du rayon' });
  const headings = menu.getByRole('heading');
  await expect(headings).toHaveCount(16);
  await expect(menu.getByRole('link').getByRole('heading')).toHaveText([
    'Herbes fraîches', 'Analyse des déchets', 'Analyse des commandes', 'Visite virtuelle',
  ]);
  await expect(headings.nth(3)).toHaveText('Visite virtuelle');
  await expect(menu.getByText('En développement', { exact: true })).toHaveCount(13);
  const visit = menu.getByRole('link', { name: /Visite virtuelle/ });
  await expect(visit).toContainText('En développement');
  await expect(visit).toHaveAttribute('href', '#/visit');
  await expect(visit).toHaveClass(/section-draft/);
  await expect(menu.getByRole('article').getByRole('button')).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  await page.getByRole('link', { name: /Analyse des déchets/ }).click();
  await expect(page).toHaveURL(/#\/waste$/);
  await expect(page.getByText('Connectez l’application à Supabase pour consulter les pertes.')).toBeVisible();
  const breadcrumb = page.getByRole('navigation', { name: 'Navigation' });
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Analyse des déchets');
  const wasteWidth = (await page.locator('main').boundingBox()).width;
  await breadcrumb.getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les outils du rayon');
  await page.getByRole('link', { name: /Analyse des commandes/ }).click();
  await expect(page).toHaveURL(/#\/orders$/);
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Analyse des commandes');
  await expect(page.getByText('Connectez l’application à Supabase pour consulter les commandes.')).toBeVisible();
  expect((await page.locator('main').boundingBox()).width).toBe(wasteWidth);
  await breadcrumb.getByRole('link', { name: 'Accueil', exact: true }).click();
  await page.getByRole('link', { name: /Herbes fraîches/ }).click();
  await expect(page).toHaveURL(/#\/herbs$/);
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Herbes fraîches');
  expect((await page.locator('main').boundingBox()).width).toBe(wasteWidth);
  await expect(page.locator('.stand-row')).toHaveCount(8);
  for (const row of await page.locator('.stand-row').all()) await expect(row.locator('.slot')).toHaveCount(6);
  await filled(page, 36);
  const guide = page.getByRole('region', { name: 'Mise en rayon' });
  await expect(guide.getByRole('listitem')).toHaveCount(3);
  await expect(footer).toBeVisible();
  await expect(page.locator('main')).toBeFocused();
  await page.reload();
  await filled(page, 36);
  await page.getByRole('link', { name: 'Rayon 74 · Fruits et légumes · Accueil' }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan du présentoir');
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les outils du rayon');
  await page.goto('/#/unknown');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page introuvable');
  await expect(footer).toBeVisible();
  await page.getByRole('link', { name: 'Retour à l’accueil' }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(errors).toEqual([]);
});

test('the virtual visit opens the combined map and acknowledges its draft notice', async ({ page }) => {
  test.setTimeout(90_000);
  const draft = page.getByRole('dialog', { name: 'Visite virtuelle en développement' });
  await page.goto('/');
  await page.getByRole('link', { name: /Visite virtuelle/ }).click();
  await expect(page).toHaveURL(/#\/visit$/);
  await expect(draft).toBeVisible();
  await expect(page.getByText('Mode démo', { exact: true })).toBeVisible();
  await draft.getByRole('button', { name: 'Compris' }).click();
  await expect(draft).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Visite du rayon');

  const supportsWebGL = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  });
  if (supportsWebGL) {
    const walk = page.getByRole('button', { name: 'À pied', exact: true });
    await expect(walk).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Se placer près de la charrette' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Se placer près du présentoir de Noël' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Se placer près du stand de carottes' })).toBeEnabled();
    const salads = page.getByRole('button', { name: 'Se placer près des salades et des champignons' });
    await expect(salads).toBeEnabled();
    const groceries = page.getByRole('button', { name: 'Se placer près des olives et des herbes fraîches' });
    await expect(groceries).toBeEnabled();
    const bakery = page.getByRole('button', { name: 'Se placer près de la pâtisserie et de la boulangerie' });
    await expect(bakery).toBeEnabled();
    const edit = page.getByRole('button', { name: 'Mode déplacement', exact: true });
    const add = page.getByRole('button', { name: 'Ajouter un objet', exact: true });
    const hud = page.getByRole('button', { name: 'Mode HUD', exact: true });
    const actions = page.getByLabel('Actions de la scène', { exact: true });
    const undo = page.getByRole('button', { name: 'Annuler la dernière modification', exact: true });
    const redo = page.getByRole('button', { name: 'Rétablir la modification annulée', exact: true });
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await expect(undo).toBeHidden();
    await expect(add).toBeDisabled();
    await expect(page.locator('input[type=file]')).toBeHidden();
    await actions.click();
    await expect(page.getByRole('button', { name: 'Rétablir les caisses de poires' })).toBeDisabled();
    await actions.click();
    await edit.click();
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    await expect(add).toBeEnabled();
    await actions.click();
    await expect(page.getByRole('button', { name: 'Rétablir les caisses de poires' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Rétablir les caisses de salades et de champignons' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Rétablir les olives et les herbes' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Rétablir les produits de la pâtisserie' })).toBeEnabled();
    await actions.click();
    await page.getByRole('button', { name: 'Se placer près du présentoir de Noël' }).click();
    const fullscreen = page.getByRole('button', { name: 'Plein écran', exact: true });
    const exitFullscreen = page.getByRole('button', { name: 'Quitter le plein écran', exact: true });
    const canvas = page.locator('.noel-canvas');
    await fullscreen.click();
    await expect(exitFullscreen).toBeVisible();
    const frame = await canvas.boundingBox();
    await add.click();
    await page.getByRole('dialog', { name: 'Choisir un objet' })
      .getByRole('button', { name: 'Panettone turquoise, ruban brun', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Annuler le déplacement', exact: true })).toBeVisible();
    expect(await canvas.boundingBox()).toEqual(frame);
    const lowerRow = await page.locator('.noel-stage-bottom').evaluate((row) => {
      const modules = [...row.querySelectorAll('.noel-object-name, .noel-object-buttons, .noel-placement-note, .noel-camera-actions')]
        .map((node) => node.getBoundingClientRect());
      const midpoints = modules.map(({ y, height }) => y + height / 2);
      const gap = (modules[0].right + modules[1].left) / 2;
      return {
        alignment: Math.max(...midpoints) - Math.min(...midpoints),
        transparentGap: modules[1].left > modules[0].right &&
          document.elementFromPoint(gap, midpoints[0])?.matches('.noel-canvas'),
      };
    });
    expect(lowerRow.alignment).toBeLessThan(1);
    expect(lowerRow.transparentGap).toBe(true);
    await undo.click();
    await exitFullscreen.click();
    await groceries.click();
    await bakery.click();
    await hud.click();
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await expect(hud).toHaveAttribute('aria-pressed', 'true');
    await hud.click();
    await walk.click();
    await expect(walk).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Avancer', exact: true }).click();
  }
  await noOverflow(page);
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les outils du rayon');
  await page.goto('/#/visit/rayon');
  await expect(page).toHaveURL(/#\/visit$/);
  await expect(draft).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(draft).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Visite du rayon');
});

test('AI badges animate and the cards respect reduced motion', async ({ page }, info) => {
  await page.goto('/');
  const cards = page.getByRole('article').filter({ has: page.getByText('IA', { exact: true }) });
  await expect(cards.getByRole('heading')).toHaveText([
    'Commandes automatiques par IA', 'Posez toutes vos questions', 'Réassort des olives',
  ]);
  const card = cards.first();
  const badge = card.getByText('IA', { exact: true });
  await expect(badge).toHaveCSS('animation-duration', '3.6s');
  await expect(badge).toHaveCSS('animation-iteration-count', 'infinite');
  if (info.project.name === 'desktop') {
    await card.hover();
    await expect(card).toHaveCSS('animation-duration', '0.44s');
    await expect(card).toHaveCSS('animation-iteration-count', '1');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(badge).toHaveCSS('animation-name', 'none');
  await expect(card).toHaveCSS('animation-name', 'none');
});

test('unsaved draft blocks Accueil and browser Back, with cancel and discard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Herbes fraîches/ }).click();
  await openEditor(page);
  await chooseHerb(page, 'Basilic');
  await page.locator('.slot').first().click();
  await filled(page, 37);
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Abandonner les modifications ?');
  await confirm(page, 'Annuler');
  await filled(page, 37);
  await page.getByRole('link', { name: 'Rayon 74 · Fruits et légumes · Accueil' }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Abandonner les modifications ?');
  await confirm(page, 'Annuler');
  await filled(page, 37);
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeVisible();
  await confirm(page, 'Annuler');
  await expect(page).toHaveURL(/#\/herbs$/);
  await filled(page, 37);
  await page.goBack();
  await confirm(page, 'Abandonner les modifications');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les outils du rayon');
  await page.goForward();
  await filled(page, 36);
  await openEditor(page);
  await filled(page, 36);
  await chooseHerb(page, 'Basilic');
  await page.locator('.slot').first().click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Modèle enregistré.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: /Herbes fraîches/ }).click();
  await filled(page, 36);
  await openEditor(page);
  await filled(page, 37);
});

test('template operations preserve independent copies and the published snapshot', async ({ page }) => {
  await page.goto('/#/herbs');
  await openEditor(page);
  await page.locator('.slot').first().click();
  await filled(page, 36); // No herb selected initially.
  await chooseHerb(page, 'Basilic');
  await page.locator('.slot').first().click();
  await filled(page, 37);
  await page.locator('.slot').first().click();
  await filled(page, 36);
  await templateAction(page, 'Dupliquer');
  await page.getByLabel('Nom du modèle', { exact: true }).fill('Copie de contrôle');
  await confirm(page, 'Dupliquer');
  await expect(page.getByText('Copie créée.', { exact: true })).toBeVisible();
  await page.locator('.slot').first().click();
  await filled(page, 37);
  await templateAction(page, 'Renommer');
  await page.getByLabel('Nom du modèle', { exact: true }).fill('Plan du matin');
  await confirm(page, 'Renommer');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Modèle enregistré.', { exact: true })).toBeVisible();
  await selectTemplate(page, 'Journée normale');
  await filled(page, 36);
  await selectTemplate(page, 'Forte demande');
  await filled(page, 48);
  await page.getByRole('button', { name: /^(Consultation|Plan)$/ }).click();
  await filled(page, 36);
  await openEditor(page);
  await selectTemplate(page, 'Plan du matin');
  await filled(page, 37);
  await page.getByRole('button', { name: 'Appliquer au présentoir', exact: true }).click();
  await expect(page.getByText('Plan appliqué au présentoir.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tout vider', exact: true }).click();
  await confirm(page, 'Annuler');
  await filled(page, 37);
  await page.getByRole('button', { name: 'Tout vider', exact: true }).click();
  await confirm(page, 'Tout vider');
  await filled(page, 0);
  await page.getByRole('button', { name: 'Réinitialiser les modifications', exact: true }).click();
  await confirm(page, 'Abandonner les modifications');
  await filled(page, 37);
  await page.getByRole('button', { name: 'Vider la case', exact: true }).click();
  await page.locator('.slot').first().click();
  await filled(page, 36);
  await templateAction(page, 'Supprimer');
  await confirm(page, 'Annuler');
  await expect(page.locator('.stand-heading h2')).toHaveText('Plan du matin');
  await templateAction(page, 'Supprimer');
  await confirm(page, 'Supprimer');
  await expect(page.getByText('Modèle supprimé.', { exact: true })).toBeVisible();
  await page.reload();
  await filled(page, 37);
  await expect(page.locator('.stand-heading h2')).toHaveText('Plan du matin');
  await openEditor(page);
  await templateAction(page, 'Nouveau');
  await page.getByLabel('Nom du modèle', { exact: true }).fill('Modèle vide');
  await confirm(page, 'Créer');
  await filled(page, 0);
});

test('responsive picker, grid and counters remain usable', async ({ page }, info) => {
  await page.goto('/#/herbs');
  await openEditor(page);
  await noOverflow(page);
  const width = page.viewportSize().width;
  const compact = page.getByRole('combobox', { name: 'Herbe à placer', exact: true });
  if (width <= 700) {
    await expect(compact).toBeVisible();
    await compact.click();
    await expect(page.getByRole('listbox', { name: 'Herbe à placer' })).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(18);
    await page.screenshot({ path: info.outputPath('picker.png'), fullPage: true });
    await page.getByRole('option', { name: 'Basilic', exact: true }).click();
    const arrowInset = await compact.evaluate((el) => el.getBoundingClientRect().right - el.querySelector('.choice-chevron').getBoundingClientRect().right);
    expect(arrowInset).toBeGreaterThanOrEqual(12);
  } else {
    await expect(compact).toBeHidden();
    await expect(page.locator('.picker-buttons button')).toHaveCount(17);
    await expect(page.locator('.picker-buttons')).toBeVisible();
    const stand = await page.locator('.stand-card').boundingBox();
    const picker = await page.locator('.picker').boundingBox();
    if (width <= 1000) expect(picker.y).toBeGreaterThanOrEqual(stand.y + stand.height);
    else expect(picker.x).toBeGreaterThanOrEqual(stand.x + stand.width);
    await chooseHerb(page, 'Basilic');
  }
  await page.locator('.slot').first().click();
  await filled(page, 37);
  const counts = await page.locator('.legend-list li strong').allTextContents();
  const numbers = counts.map(Number);
  expect(numbers.reduce((a, b) => a + b, 0)).toBe(37);
  expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('editor.png'), fullPage: true });
});

test('keyboard selection and a narrow 320px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await noOverflow(page);
  await page.goto('/#/herbs');
  await openEditor(page);
  const picker = page.getByRole('combobox', { name: 'Herbe à placer', exact: true });
  await picker.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(picker).toContainText('Persil plat');
  await page.locator('.slot').first().focus();
  await page.keyboard.press('Enter');
  await filled(page, 37);
  await noOverflow(page);
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await filled(page, 37);
});
