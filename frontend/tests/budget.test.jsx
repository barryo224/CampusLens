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
    // Frais allégeables : 502 € de droit acquis (aide spécifique) + 637 € sous conditions (Loca-Pass).
    const allegeables = screen.getByText('Frais que des aides peuvent alléger').closest('li');
    expect(allegeables).toHaveTextContent('jusqu’à 1 139');
    expect(allegeables).toHaveTextContent('dont 502');
    expect(screen.queryByText('Plus gros poste')).not.toBeInTheDocument(); // doublon des droits d'inscription

    const postes = screen.getByRole('region', { name: /Ce qu’il faut prévoir à la rentrée/ });
    expect(within(postes).getAllByRole('listitem')).toHaveLength(3);
    expect(within(postes).getByText('Avance Loca-Pass ou FSL')).toBeInTheDocument();
    expect(within(postes).getByText(/Source : FAGE/)).toBeInTheDocument();
    expect(within(postes).getByText('vérification en cours')).toBeInTheDocument();
  });

  it('les indicateurs de droits changent avec le profil (boursier : 0 €, international : tarif différencié)', async () => {
    const mock = api();
    rendreApp('/budget');
    const droits = async () =>
      (await screen.findByText('Droits d’inscription', { selector: 'p' })).closest('li');
    expect(await droits()).toHaveTextContent('178');

    await userEvent.click(screen.getByRole('button', { name: 'Boursier' }));
    await vi.waitFor(async () => expect(await droits()).toHaveTextContent('0 €'));
    expect(mock).toHaveBeenCalledWith(
      '/api/postes-rentree?profil=boursier&niveau=licence',
      expect.anything(),
    );

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

  // Un budget par profil, comme le fait le vrai backend.
  const apiParProfil = () => {
    const poste = (id, nom, montant, extra = {}) => ({
      id,
      nom,
      montant,
      offert: false,
      astuce: null,
      aide: null,
      source: { id: 3, organisme: 'FAGE' },
      verifieLe: null,
      aVerifier: true,
      ...extra,
    });
    return simulerApi({
      '/postes-rentree': (chemin) => {
        const q = new URLSearchParams(chemin.split('?')[1]);
        const profil = q.get('profil');
        const base = [poste(1, 'Dépôt de garantie', 637)];
        if (profil === 'boursier')
          return {
            annee: '2026-2027',
            total: 637,
            postes: [
              ...base,
              poste(2, 'Droits d’inscription', 0, { offert: true, montantSansBourse: 178 }),
            ],
          };
        if (profil === 'intl') {
          const visa =
            q.get('situation') === 'sur_place'
              ? []
              : [poste(9, 'Taxe de validation du visa (VLS-TS)', 100)];
          return {
            annee: '2026-2027',
            total: 637 + 2902 + visa.length * 100,
            postes: [...base, poste(2, 'Droits d’inscription', 2902), ...visa],
          };
        }
        return {
          annee: '2026-2027',
          total: 815,
          postes: [...base, poste(2, 'Droits d’inscription', 178)],
        };
      },
      '/parametres': PARAMETRES_API,
      '/aides': reponseAides,
    });
  };

  it('le total change avec le profil : boursier (droits offerts) et international (droits différenciés + visa)', async () => {
    apiParProfil();
    rendreApp('/budget');
    const total = async () =>
      (await screen.findByText('Budget de rentrée à prévoir')).closest('li');
    expect(await total()).toHaveTextContent('815');

    await userEvent.click(screen.getByRole('button', { name: 'Boursier' }));
    await vi.waitFor(async () => expect(await total()).toHaveTextContent('637'));
    expect(screen.getByText(/Offert avec votre bourse \(178/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'International hors UE' }));
    await vi.waitFor(async () => expect(await total()).toHaveTextContent('3 639'));
    expect(screen.getByText('Taxe de validation du visa (VLS-TS)')).toBeInTheDocument();
  });

  it('international : à l’arrivée (visa) ou déjà en France (pas de taxe de visa), avec les ressources à justifier', async () => {
    apiParProfil();
    rendreApp('/budget?profil=intl');
    const arrivee = await screen.findByRole('button', { name: 'Je viens d’arriver en France' });
    expect(arrivee).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Taxe de validation du visa (VLS-TS)')).toBeInTheDocument();

    const ressources = screen.getByRole('region', { name: /À justifier pour votre visa/ });
    expect(ressources).toHaveTextContent('877,50');
    expect(ressources).toHaveTextContent('10 530'); // 877,50 € × 12
    expect(ressources).toHaveTextContent('964 heures par an');

    await userEvent.click(screen.getByRole('button', { name: 'Je suis déjà en France' }));
    await vi.waitFor(() =>
      expect(screen.queryByText('Taxe de validation du visa (VLS-TS)')).not.toBeInTheDocument(),
    );
    const total = screen.getByText('Budget de rentrée à prévoir').closest('li');
    expect(total).toHaveTextContent('3 539');
  });

  it('les profils français et boursier n’affichent ni choix de situation ni ressources de visa', async () => {
    apiParProfil();
    rendreApp('/budget');
    await screen.findByText('Budget de rentrée à prévoir');
    expect(
      screen.queryByRole('button', { name: 'Je suis déjà en France' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /À justifier pour votre visa/ }),
    ).not.toBeInTheDocument();
  });

  it('licence ou master : les droits et le total changent avec le niveau choisi', async () => {
    const mock = api();
    rendreApp('/budget');
    const droits = async () =>
      (await screen.findByText('Droits d’inscription', { selector: 'p' })).closest('li');
    expect(await droits()).toHaveTextContent('178');
    expect(screen.getByRole('button', { name: 'Licence' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Master' }));
    await vi.waitFor(async () => expect(await droits()).toHaveTextContent('254'));
    expect(await droits()).toHaveTextContent('en master');
    expect(mock).toHaveBeenCalledWith(
      '/api/postes-rentree?profil=fr_ue&niveau=master',
      expect.anything(),
    );
    expect(
      screen.getByRole('rowheader', { name: 'Droits d’inscription (master)' }),
    ).toBeInTheDocument();

    // International en master : droits différenciés du master.
    await userEvent.click(screen.getByRole('button', { name: 'International hors UE' }));
    await vi.waitFor(async () => expect(await droits()).toHaveTextContent('3 950'));
  });

  it('international exonéré : tarif national, demandé au serveur avec exonere=oui ; le niveau est conservé', async () => {
    const mock = api();
    rendreApp('/budget?profil=intl&niveau=master');
    const droits = async () =>
      (await screen.findByText('Droits d’inscription', { selector: 'p' })).closest('li');
    await vi.waitFor(async () => expect(await droits()).toHaveTextContent('3 950'));

    await userEvent.click(
      screen.getByRole('checkbox', { name: /exonéré des droits différenciés/ }),
    );
    await vi.waitFor(async () => expect(await droits()).toHaveTextContent('254'));
    expect(await droits()).toHaveTextContent('exonéré');
    expect(mock).toHaveBeenCalledWith(
      '/api/postes-rentree?profil=intl&niveau=master&situation=arrivee&exonere=oui',
      expect.anything(),
    );

    // L'exonération n'existe que pour le profil international.
    await userEvent.click(screen.getByRole('button', { name: 'Boursier' }));
    expect(screen.queryByRole('checkbox', { name: /exonéré/ })).not.toBeInTheDocument();
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
