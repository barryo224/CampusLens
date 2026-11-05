// Sur téléphone et tablette (écran de 900 px ou moins), le menu est replié derrière les « trois tirets » : on l'ouvre
// avant d'y cliquer. Sur grand écran le bouton n'est pas affiché et cette fonction ne fait rien.
export async function ouvrirMenu(page) {
  const bouton = page.locator('button.menu-bouton');
  await bouton.waitFor({ state: 'attached' }); // l'administration se charge à la demande
  const petitEcran = await page.evaluate(() => matchMedia('(max-width: 900px)').matches);
  if (!petitEcran) return;
  await bouton.waitFor({ state: 'visible' });
  if ((await bouton.getAttribute('aria-expanded')) === 'false') await bouton.click();
  // Le menu se déroule en glissant : on attend la fin de l'animation (sinon les mesures de contraste sont faussées).
  const id = await bouton.getAttribute('aria-controls');
  await page.waitForFunction((cible) => {
    const menu = document.getElementById(cible);
    return (
      menu &&
      getComputedStyle(menu).opacity === '1' &&
      getComputedStyle(menu).visibility === 'visible'
    );
  }, id);
}
