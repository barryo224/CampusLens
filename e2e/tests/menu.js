// Sur téléphone et tablette, le menu est replié derrière les « trois tirets » : on l'ouvre avant d'y cliquer.
// Sur grand écran le bouton existe mais n'est pas affiché : cette fonction ne fait alors rien.
export async function ouvrirMenu(page) {
  const bouton = page.locator('button.menu-bouton');
  // Le bouton est toujours dans la page (le CSS le cache sur grand écran) ; l'admin se charge à la demande.
  await bouton.waitFor({ state: 'attached' });
  if ((await bouton.isVisible()) && (await bouton.getAttribute('aria-expanded')) === 'false')
    await bouton.click();
}
