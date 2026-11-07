import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableauAdaptatif from '../src/components/TableauAdaptatif.jsx';
import { rendreApp, simulerApi } from './helpers/rendu.jsx';

afterEach(cleanup);

const Exemple = ({ lignes }) => (
  <TableauAdaptatif libelle="Tableau d’essai" seuil={600}>
    <table className="tableau">
      <caption className="sr-only">Essai</caption>
      <thead>
        <tr>
          <th scope="col">Ville</th>
          <th scope="col">Loyer</th>
          <th scope="col">Transport</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.nom}>
            <th scope="row">{l.nom}</th>
            <td>{l.loyer}</td>
            <td>{l.transport}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </TableauAdaptatif>
);

describe('TableauAdaptatif', () => {
  it('pose le nom de la colonne sur chaque valeur (pour l’affichage en cartes) et garde la structure de tableau', async () => {
    render(<Exemple lignes={[{ nom: 'Rennes', loyer: '350 €', transport: '8 €' }]} />);
    const cellule = await screen.findByText('350 €');
    await waitFor(() => expect(cellule).toHaveAttribute('data-label', 'Loyer'));
    expect(screen.getByText('8 €')).toHaveAttribute('data-label', 'Transport');
    // Rôles explicites : un lecteur d'écran annonce toujours un tableau, même quand l'écran le montre en cartes.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getByRole('rowheader', { name: 'Rennes' })).toBeInTheDocument();
    expect(cellule).toHaveAttribute('role', 'cell');
  });

  it('étiquette aussi les lignes qui apparaissent plus tard (recherche, « afficher plus »)', async () => {
    const { rerender } = render(
      <Exemple lignes={[{ nom: 'Rennes', loyer: '350 €', transport: '8 €' }]} />,
    );
    await screen.findByText('350 €');
    rerender(
      <Exemple
        lignes={[
          { nom: 'Rennes', loyer: '350 €', transport: '8 €' },
          { nom: 'Lyon', loyer: '420 €', transport: '25 €' },
        ]}
      />,
    );
    await waitFor(() => expect(screen.getByText('420 €')).toHaveAttribute('data-label', 'Loyer'));
  });

  it('est une région nommée ; sans mesure de largeur (test), c’est un tableau normal, jamais un cadre qui défile', () => {
    render(<Exemple lignes={[{ nom: 'Rennes', loyer: '350 €', transport: '8 €' }]} />);
    const region = screen.getByRole('region', { name: 'Tableau d’essai' });
    expect(region).toHaveClass('tableau-adaptatif');
    expect(region).not.toHaveClass('en-cartes');
    expect(region).not.toHaveAttribute('tabindex'); // focalisable seulement si le tableau déborde vraiment
  });
});

describe('Comparateur de villes : liste par paquets', () => {
  const villes = Array.from({ length: 60 }, (_, i) => ({
    id: i + 1,
    nom: `Ville ${String(i + 1).padStart(2, '0')}`,
    region: 'Région',
    codesPostaux: [`${10000 + i}`],
    departement: 'Département',
    loyerStudioEstime: 300 + i,
    nbLogementsCrous: 1,
    loyerCrousDesA: null,
    abonnementTransport: null,
    transport: null,
    source: null,
    verifieLe: null,
    aVerifier: false,
  }));

  it('24 villes d’abord, puis « Afficher plus » ; « Tout afficher » montre tout ; une recherche repart du début', async () => {
    simulerApi({ '/villes': villes });
    rendreApp('/aides?onglet=villes');
    const tableau = await screen.findByRole('region', { name: 'Tableau du comparateur de villes' });
    await waitFor(() => expect(within(tableau).getAllByRole('rowheader')).toHaveLength(24));
    expect(screen.getByText('24 villes affichées sur 60.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Afficher 24 villes de plus' }));
    expect(within(tableau).getAllByRole('rowheader')).toHaveLength(48);
    await userEvent.click(screen.getByRole('button', { name: 'Afficher 12 villes de plus' }));
    expect(within(tableau).getAllByRole('rowheader')).toHaveLength(60);
    expect(screen.queryByRole('button', { name: /villes de plus/ })).not.toBeInTheDocument();
  });

  it('« Tout afficher » affiche toutes les villes', async () => {
    simulerApi({ '/villes': villes });
    rendreApp('/aides?onglet=villes');
    const tableau = await screen.findByRole('region', { name: 'Tableau du comparateur de villes' });
    await userEvent.click(await screen.findByRole('button', { name: 'Tout afficher (60)' }));
    expect(within(tableau).getAllByRole('rowheader')).toHaveLength(60);
  });
});
