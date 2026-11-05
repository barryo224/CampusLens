import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import { suggererVilles } from '../src/lib/rechercheVilles.js';
import ChampVille from '../src/components/ChampVille.jsx';
import Sidebar from '../src/components/Sidebar.jsx';

afterEach(cleanup);

const VILLES = [
  {
    id: 1,
    nom: 'Rennes',
    region: 'Bretagne',
    codesPostaux: ['35000', '35200'],
    codeInsee: '35238',
  },
  {
    id: 2,
    nom: 'Grenoble',
    region: 'Auvergne-Rhône-Alpes',
    codesPostaux: ['38000'],
    codeInsee: '38185',
  },
  {
    id: 3,
    nom: 'Saint-Denis',
    region: 'Île-de-France',
    codesPostaux: ['93200'],
    codeInsee: '93066',
  },
  { id: 4, nom: 'Denain', region: 'Hauts-de-France', codesPostaux: ['59220'], codeInsee: '59172' },
];

describe('suggererVilles : prédire la ville avant la fin de la saisie', () => {
  it('rien de tapé : aucune suggestion', () => {
    expect(suggererVilles(VILLES, '')).toEqual([]);
    expect(suggererVilles(VILLES, '   ')).toEqual([]);
  });

  it('le nom qui commence par la saisie passe avant celui qui la contient', () => {
    const noms = suggererVilles(VILLES, 'ren').map((s) => s.ville.nom);
    expect(noms).toEqual(['Rennes', 'Grenoble']);
  });

  it('un début de code postal retrouve la ville et affiche le code correspondant', () => {
    const [premiere] = suggererVilles(VILLES, '352');
    expect(premiere.ville.nom).toBe('Rennes');
    expect(premiere.detail).toBe('35200 · Bretagne');
  });

  it('sans accent ni majuscule, et au milieu du nom', () => {
    expect(suggererVilles(VILLES, 'ÎLE')[0].ville.nom).toBe('Saint-Denis'); // région
    expect(suggererVilles(VILLES, 'denis')[0].ville.nom).toBe('Saint-Denis');
  });

  it('au plus `max` suggestions', () => {
    expect(suggererVilles(VILLES, 'e', 2)).toHaveLength(2);
  });
});

function Essai({ surChoix = () => {} }) {
  const [valeur, setValeur] = useState('');
  return (
    <>
      <ChampVille
        villes={VILLES}
        valeur={valeur}
        idResultats="resultats"
        surChangement={setValeur}
        surChoix={(v) => {
          setValeur(v.nom);
          surChoix(v);
        }}
      />
      <div id="resultats" />
    </>
  );
}

describe('Champ de recherche de ville', () => {
  it('propose des villes dès les premières lettres ; toucher une suggestion la choisit et ferme la liste', async () => {
    const surChoix = vi.fn();
    render(<Essai surChoix={surChoix} />);
    const champ = screen.getByRole('combobox', { name: 'Rechercher une ville' });
    expect(champ).toHaveAttribute('aria-expanded', 'false');

    await userEvent.type(champ, 'ren');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Rennes35000 · Bretagne',
      'Grenoble38000 · Auvergne-Rhône-Alpes',
    ]);
    expect(champ).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(options[0]);
    expect(surChoix).toHaveBeenCalledWith(expect.objectContaining({ id: 1, nom: 'Rennes' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(champ).toHaveValue('Rennes');
  });

  it('au clavier : flèche bas, Entrée choisit ; Échap referme', async () => {
    const surChoix = vi.fn();
    render(<Essai surChoix={surChoix} />);
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, '35');
    await userEvent.keyboard('{ArrowDown}');
    expect(champ).toHaveAttribute('aria-activedescendant');
    await userEvent.keyboard('{Enter}');
    expect(surChoix).toHaveBeenCalledWith(expect.objectContaining({ nom: 'Rennes' }));

    await userEvent.clear(champ);
    await userEvent.type(champ, 'gre');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('aucune suggestion quand rien ne correspond : pas de liste vide affichée', async () => {
    render(<Essai />);
    await userEvent.type(screen.getByRole('combobox'), 'zzzz');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('Menu repliable (téléphone et tablette)', () => {
  const rendre = () =>
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<Sidebar />} />
        </Routes>
      </MemoryRouter>,
    );

  it('les trois tirets ouvrent et ferment le menu, et annoncent leur état', async () => {
    rendre();
    const bouton = screen.getByRole('button', { name: 'Ouvrir le menu' });
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(bouton).toHaveAttribute('aria-controls', 'nav-principale');
    await userEvent.click(bouton);
    expect(screen.getByRole('button', { name: 'Fermer le menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le menu' }));
    expect(screen.getByRole('button', { name: 'Ouvrir le menu' })).toBeInTheDocument();
  });

  it('Échap referme le menu', async () => {
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Ouvrir le menu' })).toBeInTheDocument();
  });

  it('choisir une page referme le menu', async () => {
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    await userEvent.click(screen.getByRole('link', { name: 'Mes aides' }));
    expect(screen.getByRole('button', { name: 'Ouvrir le menu' })).toBeInTheDocument();
  });

  it('toucher en dehors du menu le referme', async () => {
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    await userEvent.click(document.body);
    expect(screen.getByRole('button', { name: 'Ouvrir le menu' })).toBeInTheDocument();
  });
});
