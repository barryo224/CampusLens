import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi, violationsAxe } from './helpers/rendu.jsx';
import { PARAMETRES_API, POSTES_API, reponseAides } from './helpers/donnees.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const api = () =>
  simulerApi({
    '/postes-rentree': POSTES_API,
    '/parametres': PARAMETRES_API,
    '/aides': reponseAides,
  });

describe('Préparer mon budget', () => {
  it('affiche les indicateurs et les postes de rentrée venant de l’API', async () => {
    api();
    rendreApp('/budget');
    const indicateurs = await screen.findByText('Budget de rentrée à prévoir');
    expect(indicateurs.closest('li')).toHaveTextContent('2 095');
    expect(screen.getByText('Plus gros poste').closest('li')).toHaveTextContent('637');
    expect(screen.getByText('Plus gros poste').closest('li')).toHaveTextContent(
      'Dépôt de garantie',
    );

    const postes = screen.getByRole('region', { name: /Ce qu’il faut prévoir à la rentrée/ });
    expect(within(postes).getAllByRole('listitem')).toHaveLength(3);
    expect(within(postes).getByText('Avance Loca-Pass ou FSL')).toBeInTheDocument();
    expect(within(postes).getByText(/Source : FAGE/)).toBeInTheDocument();
    expect(within(postes).getByText('à vérifier')).toBeInTheDocument();
  });

  it('les indicateurs de droits changent avec le profil (boursier : 0 €, international : tarif différencié)', async () => {
    const mock = api();
    rendreApp('/budget');
    const droits = async () =>
      (await screen.findByText('Droits d’inscription', { selector: 'p' })).closest('li');
    expect(await droits()).toHaveTextContent('178');

    await userEvent.click(screen.getByRole('button', { name: 'Boursier' }));
    await vi.waitFor(async () => expect(await droits()).toHaveTextContent('0 €'));
    expect(mock).toHaveBeenCalledWith('/api/postes-rentree?profil=boursier', expect.anything());

    await userEvent.click(screen.getByRole('button', { name: 'International hors UE' }));
    await vi.waitFor(async () => expect(await droits()).toHaveTextContent('2 902'));
    expect(screen.getByRole('button', { name: 'International hors UE' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('tableau des règles par profil, calculé depuis les paramètres et les aides', async () => {
    api();
    rendreApp('/budget');
    const tableau = await screen.findByRole('table', { name: 'Règles par profil' });
    const ligne = (nom) => within(tableau).getByRole('rowheader', { name: nom }).closest('tr');
    expect(ligne('Droits d’inscription (licence)')).toHaveTextContent('178');
    expect(ligne('Droits d’inscription (licence)')).toHaveTextContent('0 €');
    expect(ligne('Droits d’inscription (licence)')).toHaveTextContent('2 902 € ou exonération');
    expect(ligne('CVEC')).toHaveTextContent('105');
    expect(ligne('Aide au logement (APL / ALS)')).toHaveTextContent(/Oui.*Oui.*Sous conditions/);
    expect(ligne('Travail salarié')).toHaveTextContent('964 h / an max');
  });

  it('lien vers le simulateur', async () => {
    api();
    rendreApp('/budget');
    await screen.findByText('Budget de rentrée à prévoir');
    const appel = screen.getByRole('complementary', { name: 'Et vous, où en êtes-vous ?' });
    expect(within(appel).getByRole('link', { name: /Évaluer ma situation/ })).toHaveAttribute(
      'href',
      '/evaluer',
    );
  });

  it('UI-06 : API indisponible → message clair', async () => {
    simulerApi({
      '/postes-rentree': new Error('x'),
      '/parametres': new Error('x'),
      '/aides': new Error('x'),
    });
    rendreApp('/budget');
    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponibles/);
  });

  it('accessibilité : aucune violation axe-core', async () => {
    api();
    const { container } = rendreApp('/budget');
    await screen.findByRole('table', { name: 'Règles par profil' });
    await screen.findByText('Budget de rentrée à prévoir');
    expect(await violationsAxe(container)).toEqual([]);
  });
});
