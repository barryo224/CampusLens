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
  it('affiche le bandeau, les 2 boutons et les 3 façons d’utiliser le site', async () => {
    simulerApi({ '/aides': AIDES_ACCUEIL });
    rendreApp('/');
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Les repères pour bien vivre ses études en France/,
      }),
    ).toBeInTheDocument();
    const hero = within(
      screen.getByRole('region', { name: /Les repères pour bien vivre ses études en France/ }),
    );
    expect(hero.getByRole('link', { name: /Évaluer ma situation/ })).toHaveAttribute(
      'href',
      '/evaluer',
    );
    expect(hero.getByRole('link', { name: 'Découvrir mes aides' })).toHaveAttribute(
      'href',
      '/aides',
    );

    // Trois façons d'utiliser le site (s'informer, explorer les villes, évaluer son budget), chacune avec son lien.
    const voies = within(screen.getByRole('region', { name: 'Que voulez-vous faire ?' }));
    expect(voies.getAllByRole('listitem')).toHaveLength(3);
    expect(voies.getByRole('link', { name: /Découvrir les aides/ })).toHaveAttribute(
      'href',
      '/aides',
    );
    expect(voies.getByRole('link', { name: /Comparer les villes/ })).toHaveAttribute(
      'href',
      '/aides?onglet=villes',
    );
    expect(voies.getByRole('link', { name: /Évaluer ma situation/ })).toHaveAttribute(
      'href',
      '/evaluer',
    );
    await screen.findByText('Garantie Visale'); // laisse finir le chargement
  });

  it('le message du site parle de comprendre, découvrir ET évaluer (plus seulement de simuler)', async () => {
    simulerApi({ '/aides': AIDES_ACCUEIL });
    rendreApp('/');
    const description = document.querySelector('.hero-description');
    expect(description).toHaveTextContent(/comprendre ses droits/);
    expect(description).toHaveTextContent(/découvrir les aides, les villes et les démarches/);
    expect(description).toHaveTextContent(/évaluer son budget/);
    await screen.findByText('Garantie Visale');
  });

  it('le bandeau : grand titre « Les repères pour bien vivre ses études en France », accroche « Comprendre pour agir ensemble » en petit', async () => {
    simulerApi({ '/aides': AIDES_ACCUEIL });
    rendreApp('/');
    const titre = screen.getByRole('heading', { level: 1 });
    expect(titre).toHaveTextContent('Les repères pour bien vivre ses études en France');
    expect(titre).not.toHaveTextContent('Comprendre pour agir ensemble'); // l'accroche n'est PAS le titre
    const accroche = screen.getByText('Comprendre pour agir ensemble');
    expect(accroche.tagName).toBe('P');
    expect(accroche).toHaveClass('hero-accroche');
    // La photo décrit la scène et réserve sa place (dimensions) : pas de saut de page au chargement.
    const photo = screen.getByRole('img', { name: /Trois étudiants souriants/ });
    expect(photo).toHaveAttribute('width');
    expect(photo).toHaveAttribute('height');
    expect(photo).toHaveAttribute('fetchpriority', 'high'); // c'est l'élément le plus visible : chargé en priorité
    expect(photo.getAttribute('srcset')).toMatch(/900w.*1600w/); // version plus légère pour les écrans moyens et mobiles
    await screen.findByText('Garantie Visale');
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
