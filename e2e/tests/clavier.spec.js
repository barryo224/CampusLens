import { test, expect } from '@playwright/test';

// E2E-07 : navigation au clavier seul. Toutes les actions sont accessibles, le focus est toujours visible,
// et il n'y a aucun « piège clavier » (on peut toujours avancer).

/** Le focus est-il visible ? Pour les boutons radio cachés, c'est leur étiquette (.choix) qui porte le contour. */
async function focusVisible(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { ok: false, quoi: 'aucun élément focalisé' };
    const porteur = el.matches('input[type="radio"]') ? (el.closest('.choix') ?? el) : el;
    const style = getComputedStyle(porteur);
    const contour = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    const ombre = style.boxShadow && style.boxShadow !== 'none';
    return {
      ok: contour || Boolean(ombre),
      quoi: `${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') || el.textContent || el.id || '').trim().slice(0, 40)}`,
    };
  });
}

/** Éléments qu'un utilisateur au clavier doit pouvoir atteindre (un seul arrêt par groupe de radios). */
const compterAttendus = (page) =>
  page.evaluate(() => {
    const visible = (e) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return (
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        (r.width > 0 || r.height > 0 || e.matches('input[type="radio"]'))
      );
    };
    const liste = [
      ...document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, summary, [tabindex="0"]',
      ),
    ].filter(
      (e) =>
        e.getAttribute('tabindex') !== '-1' && !e.closest('[aria-hidden="true"]') && visible(e),
    );
    const radios = new Set();
    let total = 0;
    for (const e of liste) {
      if (e.matches('input[type="radio"]')) {
        if (radios.has(e.name)) continue; // un seul arrêt par groupe
        radios.add(e.name);
      }
      total += 1;
    }
    return total;
  });

const PAGES = [
  '/',
  '/evaluer',
  '/aides',
  '/budget',
  '/ressources',
  '/a-propos',
  '/contact',
  '/mentions-legales',
];

for (const chemin of PAGES) {
  test(`E2E-07 : ${chemin} — on parcourt toute la page au clavier, focus visible, sans piège`, async ({
    page,
  }) => {
    await page.goto(chemin);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const attendus = await compterAttendus(page);
    expect(attendus).toBeGreaterThan(5);
    const vus = new Set();
    const sansContour = [];
    let sortiDeLaPage = false; // le focus quitte la page après le dernier élément : c'est la preuve qu'il n'y a pas de piège
    for (let i = 0; i < attendus + 4; i++) {
      await page.keyboard.press('Tab');
      const f = await focusVisible(page);
      if (f.quoi === 'aucun élément focalisé') {
        sortiDeLaPage = true;
        continue;
      }
      if (!f.ok) sansContour.push(f.quoi);
      vus.add(
        await page.evaluate(() => {
          const el = document.activeElement;
          if (!el.dataset.kb) el.dataset.kb = String(Math.random());
          return el.dataset.kb;
        }),
      );
    }
    expect(sansContour, 'éléments sans focus visible').toEqual([]);
    // On a visité au moins autant d'arrêts distincts que d'éléments attendus (pas de piège, rien d'inatteignable).
    expect(vus.size).toBeGreaterThanOrEqual(attendus);
    expect(sortiDeLaPage, 'le focus doit pouvoir quitter la page (aucun piège clavier)').toBe(true);
  });
}

test('E2E-07 : lien d’évitement, puis un budget complet saisi au clavier jusqu’au téléchargement du bilan', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 1. Premier arrêt : « Aller au contenu » ; Entrée amène le focus dans le contenu.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenu')).toBeFocused();

  // 2. Aller à « Évaluer ma situation » avec le clavier uniquement.
  await page.goto('/');
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    if (
      await page
        .getByRole('navigation', { name: 'Navigation principale' })
        .getByRole('link', { name: 'Évaluer ma situation' })
        .evaluate((e) => e === document.activeElement)
    )
      break;
  }
  await expect(
    page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: 'Évaluer ma situation' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Évaluez votre situation');

  // 3. Remplir en tapant, choisir le statut avec les flèches, cocher avec la barre d'espace.
  await page.getByLabel('Prénom (facultatif)', { exact: true }).focus();
  await page.keyboard.type('Zoé');
  await page.getByLabel('Job étudiant (net)').focus();
  await page.keyboard.type('600');
  await page.getByLabel('Loyer charges comprises').focus();
  await page.keyboard.type('637');
  await page.getByRole('radio', { name: /français ou UE/ }).focus();
  await page.keyboard.press('ArrowDown'); // radio suivant : international
  await expect(page.getByRole('radio', { name: /international hors UE/ })).toBeChecked();
  await expect(page.getByTestId('explication-tarif')).toContainText('droits différenciés');
  await page.getByLabel('Je suis boursier CROUS').focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Je suis boursier CROUS')).toBeChecked();

  // 4. La section d'estimation se déplie avec Entrée (élément <summary>).
  await page.locator('summary', { hasText: 'Estimer mon aide au logement' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('form', { name: 'Estimation de l’aide au logement' })).toBeVisible();
  await page.keyboard.press('Enter'); // referme
  await expect(page.getByRole('form', { name: 'Estimation de l’aide au logement' })).toHaveCount(0);

  // 5. Télécharger le bilan avec Entrée.
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }).focus();
  await page.keyboard.press('Enter');
  expect((await telechargement).suggestedFilename()).toBe('zoe-mon-budget.pdf');
});

test('E2E-07 : Mes aides — onglets aux flèches, aide dépliée au clavier (aria-expanded)', async ({
  page,
}) => {
  await page.goto('/aides');
  await page.getByRole('tab', { name: 'Aides financières' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Associations & entraide' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Associations & entraide' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Aides financières' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // On attend que la liste soit chargée (elle se recharge au retour sur l'onglet) avant d'agir au clavier.
  await expect(page.getByText(/aides? accessibles? pour votre profil/)).toBeVisible();
  // La 1re aide, repérée par sa position : le nom du bouton change (« Comment l’obtenir » → « Masquer ») après le clic.
  const bouton = page.locator('li.aide').first().getByRole('button');
  await bouton.focus();
  await expect(bouton).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(bouton).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(bouton).toHaveAttribute('aria-expanded', 'false');
});

test('E2E-07 : formulaire de contact complet au clavier', async ({ page }) => {
  await page.route('**/api/contact', (r) => r.fulfill({ status: 201, json: { message: 'ok' } }));
  await page.goto('/contact');
  await page.getByLabel('Objet').focus();
  await page.keyboard.type('Question');
  await page.keyboard.press('Tab');
  await page.keyboard.type('etudiant@exemple.fr');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Bonjour');
  // Le champ piège (anti-robot) est ignoré par la tabulation : le prochain arrêt est le bouton.
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: /Mentions légales et confidentialité/ }).first(),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Envoyer' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Message envoyé');
});
