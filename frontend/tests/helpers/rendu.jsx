import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import { vi } from 'vitest';
import App from '../../src/App.jsx';

/** Affiche toute l'application à une adresse donnée. */
export function rendreApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

/**
 * Simule l'API : `routes` associe un début d'adresse à une réponse JSON.
 * Une adresse inconnue répond 404. Renvoie le mock pour pouvoir inspecter les appels.
 */
export function simulerApi(routes = {}) {
  const mock = vi.fn(async (url, options = {}) => {
    const chemin = String(url).replace('/api', '');
    // La route la plus précise (la plus longue) l'emporte : « /admin/changements/7/valider » avant « /admin/changements ».
    const cle = Object.keys(routes)
      .filter((k) => chemin.startsWith(k))
      .sort((x, y) => y.length - x.length)[0];
    if (cle === undefined) return { ok: false, status: 404, json: async () => ({}) };
    const valeur = routes[cle];
    if (valeur instanceof Error) throw valeur;
    const reponse = typeof valeur === 'function' ? valeur(chemin, options) : valeur;
    // { __status: 401, corps } : réponse d'erreur HTTP simulée.
    if (reponse && typeof reponse === 'object' && '__status' in reponse) {
      return {
        ok: reponse.__status < 400,
        status: reponse.__status,
        json: async () => reponse.corps ?? {},
      };
    }
    return { ok: true, status: 200, json: async () => reponse };
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** Contrôle d'accessibilité automatique (axe-core). Le contraste est testé à part (jsdom ne mesure pas les couleurs). */
export async function violationsAxe(conteneur) {
  const resultat = await axe.run(conteneur, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return resultat.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}
