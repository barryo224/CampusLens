import { describe, it, expect, afterEach } from 'vitest';
import { screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi } from './helpers/rendu.jsx';

afterEach(cleanup);

const DONNEES = [
  {
    id: 1,
    titre: 'Demander une caution Visale',
    organisme: 'Action Logement',
    type: 'démarche',
    categorie: 'logement',
    url: 'https://visale.fr',
    description: '',
    verifieLe: null,
  },
  {
    id: 2,
    titre: 'Ameli : assurance maladie étudiante',
    organisme: 'Assurance Maladie',
    type: 'site',
    categorie: 'sante',
    url: 'https://etudiant.ameli.fr',
    description: '',
    verifieLe: null,
  },
];

describe('Ressources : recherche intelligente', () => {
  it('propose des suggestions dès la première lettre, et un toucher n’affiche que la ressource choisie', async () => {
    simulerApi({ '/ressources': DONNEES });
    rendreApp('/ressources');
    const champ = await screen.findByRole('combobox', {
      name: 'Rechercher une ressource, un rapport',
    });
    await userEvent.type(champ, 'a');
    const liste = await screen.findByRole('listbox', { name: 'Ressources proposées' });
    const options = within(liste).getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    await userEvent.click(within(liste).getByRole('option', { name: /Ameli/ }));
    expect(champ).toHaveValue('Ameli : assurance maladie étudiante');
    expect(document.querySelector('#resultats-ressources')).toHaveTextContent('Ameli');
    expect(document.querySelector('#resultats-ressources')).not.toHaveTextContent('Visale');
    // Retaper réaffiche tout le filtrage normal.
    await userEvent.type(champ, ' ');
    expect(document.querySelector('#resultats-ressources')).toBeTruthy();
  });
});
