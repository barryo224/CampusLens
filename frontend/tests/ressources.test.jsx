import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi, violationsAxe } from './helpers/rendu.jsx';
import { RESSOURCES_API } from './helpers/donnees.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Ressources', () => {
  it('liste les ressources avec leur source, et pointe vers l’officiel en ouvrant un nouvel onglet', async () => {
    simulerApi({ '/ressources': RESSOURCES_API });
    rendreApp('/ressources');
    expect(
      await screen.findByRole('rowheader', { name: /Demander une caution Visale/ }),
    ).toBeInTheDocument();
    const lien = screen.getByRole('link', { name: /Ouvrir : Demander une caution Visale/ });
    expect(lien).toHaveAttribute('href', 'https://www.visale.fr');
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/vérifié le 1 septembre 2026/)).toBeInTheDocument();
  });

  it('un lien cassé est signalé et n’est plus proposé', async () => {
    simulerApi({ '/ressources': RESSOURCES_API });
    rendreApp('/ressources');
    expect(await screen.findByText(/Lien cassé : signalé/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ancien guide supprimé/ })).not.toBeInTheDocument();
    expect(screen.getByText('Indisponible')).toBeInTheDocument();
  });

  it('la recherche ignore les accents et la casse', async () => {
    simulerApi({ '/ressources': RESSOURCES_API });
    rendreApp('/ressources');
    await screen.findByRole('rowheader', { name: /caution Visale/ });
    await userEvent.type(screen.getByLabelText(/Rechercher une ressource/), 'COUT');
    expect(screen.getByRole('rowheader', { name: /coût de la rentrée/ })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: /Visale/ })).not.toBeInTheDocument();
  });

  it('le filtre par catégorie (catégories tirées des données)', async () => {
    simulerApi({ '/ressources': RESSOURCES_API });
    rendreApp('/ressources');
    await screen.findByRole('rowheader', { name: /caution Visale/ });
    await userEvent.click(screen.getByRole('button', { name: 'Cout de la vie' }));
    expect(screen.getByRole('button', { name: 'Cout de la vie' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('rowheader', { name: /Visale/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Toutes' }));
    expect(screen.getByRole('rowheader', { name: /Visale/ })).toBeInTheDocument();
  });

  it('aucun résultat → message, pas de tableau vide', async () => {
    simulerApi({ '/ressources': RESSOURCES_API });
    rendreApp('/ressources');
    await screen.findByRole('rowheader', { name: /caution Visale/ });
    await userEvent.type(screen.getByLabelText(/Rechercher une ressource/), 'zzzz');
    expect(screen.getByText(/Aucune ressource ne correspond/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('UI-06 : API indisponible → message clair', async () => {
    simulerApi({ '/ressources': new Error('x') });
    rendreApp('/ressources');
    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponibles/);
  });

  it('accessibilité : aucune violation axe-core', async () => {
    simulerApi({ '/ressources': RESSOURCES_API });
    const { container } = rendreApp('/ressources');
    await screen.findByRole('rowheader', { name: /caution Visale/ });
    expect(await violationsAxe(container)).toEqual([]);
  });
});
