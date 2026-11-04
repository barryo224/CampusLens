import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi, violationsAxe } from './helpers/rendu.jsx';
import { AIDES_ACCUEIL } from './helpers/donnees.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Page Accueil', () => {
  it('affiche le bandeau, les 2 boutons et les 3 étapes', async () => {
    simulerApi({ '/aides': AIDES_ACCUEIL });
    rendreApp('/');
    expect(
      screen.getByRole('heading', { level: 1, name: /Comprendre pour agir ensemble/ }),
    ).toBeInTheDocument();
    const hero = within(screen.getByRole('region', { name: /Comprendre pour agir ensemble/ }));
    expect(hero.getByRole('link', { name: /Évaluer ma situation/ })).toHaveAttribute(
      'href',
      '/evaluer',
    );
    expect(hero.getByRole('link', { name: 'Découvrir mes aides' })).toHaveAttribute(
      'href',
      '/aides',
    );

    const etapes = within(screen.getByRole('region', { name: 'Comment ça marche ?' })).getAllByRole(
      'listitem',
    );
    expect(etapes).toHaveLength(3);
    await screen.findByText('Garantie Visale'); // laisse finir le chargement
  });

  it('charge les aides mises en avant depuis l’API (rien d’écrit en dur)', async () => {
    const mock = simulerApi({ '/aides': AIDES_ACCUEIL });
    rendreApp('/');
    expect(await screen.findByText('Bourse sur critères sociaux')).toBeInTheDocument();
    expect(screen.getByText('Aide d’urgence')).toBeInTheDocument();
    expect(mock).toHaveBeenCalledWith('/api/aides?miseEnAvant=true', expect.anything());
  });

  it('les raccourcis « Je suis… » mènent à Mes aides avec le bon profil', async () => {
    simulerApi({ '/aides': AIDES_ACCUEIL });
    rendreApp('/');
    expect(screen.getByRole('link', { name: /Étudiant boursier/ })).toHaveAttribute(
      'href',
      '/aides?profil=boursier',
    );
    expect(screen.getByRole('link', { name: /Étudiant international/ })).toHaveAttribute(
      'href',
      '/aides?profil=intl',
    );
    expect(screen.getByRole('link', { name: /français ou européen/ })).toHaveAttribute(
      'href',
      '/aides?profil=fr_ue',
    );
    await screen.findByText('Garantie Visale');
  });

  it('UI-06 : API indisponible → message compréhensible, la page reste utilisable', async () => {
    simulerApi({ '/aides': new Error('réseau coupé') });
    rendreApp('/');
    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent(/momentanément indisponibles/);
    expect(alerte.textContent).not.toMatch(/réseau coupé|Error|TypeError/); // pas de détail technique
    // Le reste de l'accueil est toujours là.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Bon à savoir')).toBeInTheDocument();
  });

  it('UI-06 bis : « Réessayer » relance la requête', async () => {
    let appels = 0;
    simulerApi({
      '/aides': () => {
        appels += 1;
        if (appels === 1) throw new Error('panne');
        return AIDES_ACCUEIL;
      },
    });
    rendreApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Garantie Visale')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('erreur 500 de l’API → même message clair', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    rendreApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponibles/);
  });

  it('accessibilité : aucune violation axe-core', async () => {
    simulerApi({ '/aides': AIDES_ACCUEIL });
    const { container } = rendreApp('/');
    await waitFor(() => expect(screen.getByText('Garantie Visale')).toBeInTheDocument());
    expect(await violationsAxe(container)).toEqual([]);
  });
});
