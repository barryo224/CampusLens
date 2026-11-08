import { test, expect } from '@playwright/test';

// Copier-coller : ce qu'on colle (relevé de banque, message, adresse…) doit être compris, jamais perdu ni mal lu en silence.
// On colle pour de vrai (presse-papiers du navigateur + Ctrl/Cmd+V) quand le navigateur le permet ; sinon (Safari, iPhone
// sans permission du presse-papiers) on insère le texte comme le fait un collage : même événement « input » pour l'écran.
async function coller(page, champ, texte) {
  await champ.click();
  await champ.press('ControlOrMeta+A'); // un collage remplace la sélection
  let reel = false;
  try {
    await page.evaluate((t) => navigator.clipboard.writeText(t), texte);
    await champ.press('ControlOrMeta+V');
    reel = (await champ.inputValue()) === texte || (await champ.inputValue()) !== '';
  } catch {
    reel = false;
  }
  if (!reel) await page.keyboard.insertText(texte);
}

test.beforeEach(async ({ context, browserName }) => {
  if (browserName === 'chromium')
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
});

test.describe('Évaluer ma situation', () => {
  test('montants collés « comme sur un relevé » : € , espaces, euros, séparateurs de milliers', async ({
    page,
  }) => {
    await page.goto('/evaluer');
    const job = page.getByLabel('Job étudiant (net)');
    const loyer = page.getByLabel('Loyer charges comprises');
    await coller(page, job, '1 250,50 €');
    await coller(page, loyer, '420 euros');
    await expect(page.getByTestId('total-revenus')).toContainText(/1\s?251\s?€/);
    await expect(page.getByTestId('total-depenses')).toContainText(/444\s?€/); // 420 + 24 de frais lissés
    await expect(page.getByText('Ce n’est pas un montant')).toHaveCount(0);
    for (const [texte, attendu] of [
      ['1.250,50', /1\s?251\s?€/],
      ['1,250.50', /1\s?251\s?€/],
      ['1 250 €', /1\s?250\s?€/],
    ]) {
      await coller(page, job, texte);
      await expect(page.getByTestId('total-revenus'), texte).toContainText(attendu);
    }
  });

  test('un texte collé qui n’est pas un montant est signalé (il compterait 0 € sans rien dire)', async ({
    page,
  }) => {
    await page.goto('/evaluer');
    const job = page.getByLabel('Job étudiant (net)');
    await coller(page, job, 'environ six cents');
    await expect(page.getByText('Ce n’est pas un montant')).toBeVisible();
    await expect(job).toHaveAttribute('aria-invalid', 'true');
    await coller(page, job, '600');
    await expect(page.getByText('Ce n’est pas un montant')).toHaveCount(0);
  });

  test('montant faux : champ encadré en rouge, message simple, et le bilan n’est pas créé', async ({
    page,
  }) => {
    await page.goto('/evaluer');
    let telecharge = false;
    page.on('download', () => (telecharge = true));
    const job = page.getByLabel('Job étudiant (net)');
    await page.getByLabel('Loyer charges comprises').fill('420');
    await coller(page, job, 'abc 12 euros environ');
    await expect(
      page.getByText('Écrivez seulement des chiffres, par exemple 450 ou 450,50'),
    ).toBeVisible();
    const bordure = await job.evaluate((el) => getComputedStyle(el).borderColor);
    expect(bordure).toBe('rgb(180, 35, 24)'); // rouge
    await page.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }).click();
    await expect(page.getByRole('alert')).toContainText('Votre bilan n’a pas été créé');
    await page.waitForTimeout(800);
    expect(telecharge).toBe(false);
    await page.getByRole('button', { name: 'Aller au champ à corriger' }).click();
    await expect(job).toBeFocused();
    await expect(job).toBeInViewport();
    await job.fill('600');
    await expect(job).not.toHaveAttribute('aria-invalid', 'true');
    const telechargement = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }).click();
    await telechargement;
  });

  test('prénom et nom collés (accents, tirets) : gardés tels quels', async ({ page }) => {
    await page.goto('/evaluer');
    const prenom = page.getByLabel('Prénom (facultatif)');
    await coller(page, prenom, 'Aïcha-Çağla');
    await expect(prenom).toHaveValue('Aïcha-Çağla');
  });
});

test.describe('Recherches', () => {
  test('Ressources : un titre collé trouve la ressource', async ({ page }) => {
    await page.goto('/ressources');
    const champ = page.getByRole('combobox', { name: 'Rechercher une ressource, un rapport' });
    await coller(page, champ, 'caution visale');
    await expect(page.getByText('Demander une caution Visale').first()).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Rechercher une ressource, un rapport' }),
    ).toHaveValue('caution visale');
  });

  test('Ressources : un texte collé avec des espaces et des majuscules marche aussi', async ({
    page,
  }) => {
    await page.goto('/ressources');
    const champ = page.getByRole('combobox', { name: 'Rechercher une ressource, un rapport' });
    await coller(page, champ, '   CAUTION   Visale  ');
    await expect(page.getByText('Demander une caution Visale').first()).toBeVisible();
  });

  test('Villes : un nom collé (avec accent) trouve la ville', async ({ page }) => {
    await page.goto('/aides?onglet=villes');
    const champ = page.getByRole('combobox', { name: 'Rechercher une ville' });
    await coller(page, champ, 'Rennes');
    await expect(page.getByText('Rennes').first()).toBeVisible();
    await coller(page, champ, 'saint-étienne');
    await expect(page.getByText(/Saint-Étienne/).first()).toBeVisible();
  });
});

test.describe('Contact et avis', () => {
  test('contact : objet, adresse (avec espaces autour) et message collés, envoyés proprement', async ({
    page,
  }) => {
    let envoye = null;
    await page.route('**/api/contact', async (r) => {
      envoye = r.request().postDataJSON();
      await r.fulfill({ status: 201, json: { message: 'ok' } });
    });
    await page.goto('/contact');
    await coller(page, page.getByLabel('Objet'), 'Erreur sur l’aide Visale');
    await coller(page, page.getByLabel('Votre adresse e-mail'), '  awa.diop@exemple.fr \n');
    await coller(
      page,
      page.getByLabel('Message'),
      'Bonjour,\nle lien ne marche pas.\n\nMerci d’avance — Awa',
    );
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await expect(page.getByRole('status')).toContainText('Message envoyé');
    expect(envoye.email).toBe('awa.diop@exemple.fr'); // espaces et retour à la ligne retirés
    expect(envoye.objet).toBe('Erreur sur l’aide Visale');
    expect(envoye.message).toContain('le lien ne marche pas.\n\nMerci d’avance — Awa'); // les retours à la ligne sont gardés
  });

  test('avis : un long commentaire collé met à jour le compteur et respecte la limite de 1 500 caractères', async ({
    page,
  }) => {
    await page.goto('/avis');
    const champ = page.getByLabel('Racontez votre expérience');
    await coller(page, champ, 'Très utile. '.repeat(20));
    await expect(page.getByText(/240 \/ 1 500 caractères/)).toBeVisible();
    await coller(page, champ, 'x'.repeat(1700));
    expect((await champ.inputValue()).length).toBe(1500); // coupé à la limite, sans erreur
    await expect(page.getByText(/1\s?500 \/ 1\s?500 caractères/)).toBeVisible();
  });
});

test.describe('Administration (connexion)', () => {
  test('adresse et mot de passe collés : gardés exactement (même avec des caractères spéciaux)', async ({
    page,
  }) => {
    await page.goto('/admin');
    const email = page.getByLabel('Adresse e-mail');
    const mdp = page.getByLabel('Mot de passe');
    await coller(page, email, 'admin@exemple.fr');
    await coller(page, mdp, 'Un m0t-de-passe ç@ractères "spéciaux" 100 % !');
    await expect(email).toHaveValue('admin@exemple.fr');
    await expect(mdp).toHaveValue('Un m0t-de-passe ç@ractères "spéciaux" 100 % !');
  });

  for (const [collage, attendu] of [
    ['123456', '123456'],
    ['123 456', '123 456'], // le serveur accepte les espaces
  ]) {
    test(`code reçu par e-mail collé (« ${collage} ») : validé tout seul`, async ({ page }) => {
      let corps = null;
      await page.route('**/api/admin/me', (r) => r.fulfill({ status: 401, json: { error: 'x' } }));
      await page.route('**/api/admin/login', (r) =>
        r.fulfill({
          json: {
            etape: 'code',
            methode: 'courriel',
            adresse: 'a***n@exemple.fr',
            renvoyerApres: 30,
          },
        }),
      );
      await page.route('**/api/admin/login/code', async (r) => {
        corps = r.request().postDataJSON();
        await r.fulfill({ status: 401, json: { error: 'Code incorrect.' } });
      });
      await page.goto('/admin');
      await page.getByLabel('Adresse e-mail').fill('admin@exemple.fr');
      await page.getByLabel('Mot de passe').fill('un-mot-de-passe-long');
      await page.getByRole('button', { name: 'Se connecter' }).click();
      const code = page.getByLabel('Code reçu par e-mail');
      await expect(code).toBeVisible();
      await coller(page, code, collage);
      await expect.poll(() => corps).toEqual({ code: attendu }); // envoyé sans clic sur « Valider »
    });
  }
});
