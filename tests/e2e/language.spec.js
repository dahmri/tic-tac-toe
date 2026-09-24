import { test, expect, cell, status } from './fixtures.js';

test.use({ signedIn: false });

test('switch to French: the page, the game and server messages', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page).toHaveTitle('Morpion au crayon');
  await expect(page.getByRole('tab', { name: 'Se connecter' })).toBeVisible();

  // An error from the server, in French
  const login = page.locator('#loginForm');
  await login.getByLabel("Nom d'utilisateur").fill('nobody_here');
  await login.getByLabel('Mot de passe').fill('not the password');
  await login.getByRole('button', { name: 'Se connecter' }).click();
  await expect(login.getByRole('alert')).toHaveText("Nom d'utilisateur ou mot de passe incorrect.");

  // Country names come in French too
  await page.getByRole('tab', { name: 'Créer un compte' }).click();
  await expect(page.locator('#signupForm select[name="country"] option[value="MA"]')).toHaveText(
    /Maroc/,
  );
  await expect(page.locator('#signupForm').getByTitle('Lama dramatique')).toBeVisible();

  await page.getByRole('button', { name: /Jouer en invité/ }).click();
  await expect(page.locator('#meName')).toHaveText('Invité');
  await expect(status(page)).toContainText('À toi de jouer');
  await cell(page, 4).click();
  await expect(page.locator('#lblO')).toHaveText('Ordinateur · O');

  // Remembered after a reload, and back to English in one click
  await page.reload();
  await expect(page.getByRole('button', { name: 'Nouvelle manche' })).toBeVisible();
  await page.getByLabel('Langue').selectOption('en');
  await expect(page.getByRole('button', { name: 'New round' })).toBeVisible();
  await expect(status(page)).toContainText('Your move');
});

test.describe('a Spanish browser', () => {
  test.use({ locale: 'es-ES' });

  test('starts in Spanish', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByLabel('Idioma')).toHaveValue('es');
    await page.getByRole('button', { name: /Jugar como invitado/ }).click();
    await page.getByRole('button', { name: 'En línea', exact: true }).click();
    await expect(page.locator('#guestLocked')).toContainText(
      'Las partidas en línea necesitan una cuenta gratis',
    );
  });
});
