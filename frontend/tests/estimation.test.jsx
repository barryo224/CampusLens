import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi, violationsAxe } from './helpers/rendu.jsx';
import { PARAMETRES_API } from './helpers/donnees.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const VILLES = [
  { id: 1, codeInsee: '35238', nom: 'Rennes', region: 'Bretagne' },
  { id: 2, codeInsee: '75056', nom: 'Paris', region: 'Île-de-France' },
];
const RESULTAT = {
  periode: '2026-11',
  aides: [
    {
      slug: 'aide-logement-apl-als',
      nom: 'Aide au logement (APL / ALS)',
      codeOpenfisca: 'aide_logement',
      montantMensuel: 199.88,
      details: { apl: 0, als: 199.88 },
    },
  ],
  moteur: { nom: 'OpenFisca France', version: '175.0.45' },
  source: { organisme: 'OpenFisca', statut: 'ok' },
  verifieLe: '2026-11-05T14:00:00.000Z',
  aVerifier: false,
  avertissement:
    'Estimation indicative calculée avec les règles en vigueur. Elle ne remplace pas la simulation officielle de la CAF.',
};

const ouvrir = async (extra = {}) => {
  const mock = simulerApi({
    '/parametres': PARAMETRES_API,
    '/villes': VILLES,
    '/simulation/aides-estimees': RESULTAT,
    ...extra,
  });
  rendreApp('/evaluer');
  await screen.findByLabelText('Job étudiant (net)');
  return mock;
};
const saisir = async (champ, valeur) => {
  const input = screen.getByLabelText(champ);
  await userEvent.clear(input);
  await userEvent.type(input, valeur);
};
const budget = async () => {
  await saisir('Job étudiant (net)', '600');
  await saisir('Aide de la famille', '250');
  await saisir('Loyer charges comprises', '637');
  await saisir('Alimentation', '200');
  await saisir('Transport', '30');
  await saisir('Téléphone et internet', '20');
  await saisir('Santé et mutuelle', '15');
  await saisir('Autres dépenses', '50');
};
const deplier = async () => {
  await userEvent.click(screen.getByText('Estimer mon aide au logement'));
  return screen.findByRole('form', { name: 'Estimation de l’aide au logement' });
};
const appelsEstimation = (mock) => mock.mock.calls.filter(([u]) => u.includes('/simulation/'));

describe('Estimation facultative de l’aide au logement (OpenFisca)', () => {
  it('OF-UI-01 : repliée par défaut, et rien n’est envoyé (ni requête de villes) tant qu’on ne l’ouvre pas', async () => {
    const mock = await ouvrir();
    await budget();
    expect(screen.getByText('facultatif')).toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Estimation de l’aide au logement' }),
    ).not.toBeInTheDocument();
    expect(appelsEstimation(mock)).toHaveLength(0);
    expect(mock.mock.calls.every(([u]) => u.startsWith('/api/parametres'))).toBe(true);
  });

  it('OF-UI-02 : à l’ouverture, annonce clairement ce qui est envoyé, charge les villes (publiques) mais n’envoie encore rien', async () => {
    const mock = await ouvrir();
    await budget();
    const formulaire = await deplier();
    const note = within(formulaire).getByRole('note');
    for (const mot of [
      'âge',
      'ville',
      'loyer',
      'type de logement',
      'revenu',
      'rien n’est enregistré',
      'uniquement si vous cliquez',
    ]) {
      expect(note.textContent).toContain(mot);
    }
    expect(await within(formulaire).findByRole('option', { name: 'Rennes' })).toBeInTheDocument();
    expect(mock.mock.calls.some(([u]) => u === '/api/villes')).toBe(true);
    expect(appelsEstimation(mock)).toHaveLength(0);
  });

  it('OF-UI-03 : le bouton reste inactif tant que ville, âge et loyer ne sont pas valides', async () => {
    await ouvrir();
    const formulaire = await deplier();
    const bouton = within(formulaire).getByRole('button', { name: 'Estimer mon aide au logement' });
    expect(bouton).toBeDisabled();
    expect(formulaire).toHaveTextContent('Renseignez votre loyer plus haut');

    await saisir('Loyer charges comprises', '637');
    await userEvent.selectOptions(
      await within(formulaire).findByLabelText('Ville où vous étudiez'),
      'Rennes',
    );
    expect(bouton).toBeDisabled(); // âge manquant
    for (const mauvais of ['abc', '5', '200', '20,5']) {
      await userEvent.clear(within(formulaire).getByLabelText('Votre âge'));
      await userEvent.type(within(formulaire).getByLabelText('Votre âge'), mauvais);
      expect(bouton, mauvais).toBeDisabled();
    }
    await userEvent.clear(within(formulaire).getByLabelText('Votre âge'));
    await userEvent.type(within(formulaire).getByLabelText('Votre âge'), '20');
    expect(bouton).toBeEnabled();
  });

  it('OF-UI-04 : au clic, envoie EXACTEMENT les cinq informations annoncées, puis affiche l’estimation et le reste-à-vivre avec l’aide', async () => {
    const mock = await ouvrir();
    await budget();
    const formulaire = await deplier();
    await userEvent.selectOptions(
      await within(formulaire).findByLabelText('Ville où vous étudiez'),
      'Rennes',
    );
    await userEvent.type(within(formulaire).getByLabelText('Votre âge'), '20');
    await userEvent.selectOptions(within(formulaire).getByLabelText('Type de logement'), 'foyer');
    await userEvent.click(
      within(formulaire).getByRole('button', { name: 'Estimer mon aide au logement' }),
    );

    expect(await within(formulaire).findByText(/≈ 200 € par mois/)).toBeInTheDocument();
    const [appel] = appelsEstimation(mock);
    expect(appel[0]).toBe('/api/simulation/aides-estimees');
    expect(appel[1].method).toBe('POST');
    expect(JSON.parse(appel[1].body)).toEqual({
      age: 20,
      ville: '35238',
      loyer: 637,
      typeLogement: 'foyer',
      revenu: 600,
    });

    expect(formulaire).toHaveTextContent('Aide au logement estimée (ALS)');
    // reste-à-vivre : −125,58 + 199,88 = 74,30 €
    expect(formulaire).toHaveTextContent('reste-à-vivre serait d’environ 74 €');
    expect(formulaire).toHaveTextContent('Source : OpenFisca France 175.0.45');
    expect(formulaire).toHaveTextContent('calculé le 5 novembre 2026');
    expect(formulaire).toHaveTextContent('ne remplace pas la simulation officielle de la CAF');
    const caf = within(formulaire).getByRole('link', { name: /simulation officielle sur caf\.fr/ });
    expect(caf).toHaveAttribute('rel', 'noopener noreferrer');
    // La simulation principale n'a pas bougé (elle reste calculée sur place).
    expect(screen.getByTestId('reste')).toHaveTextContent('− 126 €');
  });

  it('si l’étudiant a déjà saisi une aide au logement, l’estimation la remplace dans le reste-à-vivre (pas de double compte)', async () => {
    await ouvrir();
    await budget();
    await saisir('Aide au logement (APL)', '150');
    const formulaire = await deplier();
    await userEvent.selectOptions(
      await within(formulaire).findByLabelText('Ville où vous étudiez'),
      'Rennes',
    );
    await userEvent.type(within(formulaire).getByLabelText('Votre âge'), '20');
    await userEvent.click(
      within(formulaire).getByRole('button', { name: 'Estimer mon aide au logement' }),
    );
    await within(formulaire).findByText(/≈ 200 €/);
    // reste saisi = 850+150−952−23,58 = 24,42 ; sans l'aide saisie puis avec l'estimée : 24,42 − 150 + 199,88 = 74,30
    expect(formulaire).toHaveTextContent('d’environ 74 €');
    expect(formulaire).toHaveTextContent('en remplaçant l’aide au logement que vous avez saisie');
  });

  it('OF-UI-05 : aucune aide estimée → message honnête, pas de « 0 € » trompeur', async () => {
    await ouvrir({
      '/simulation/aides-estimees': {
        ...RESULTAT,
        aides: [{ ...RESULTAT.aides[0], montantMensuel: 0, details: { apl: 0, als: 0 } }],
      },
    });
    await budget();
    const formulaire = await deplier();
    await userEvent.selectOptions(
      await within(formulaire).findByLabelText('Ville où vous étudiez'),
      'Paris',
    );
    await userEvent.type(within(formulaire).getByLabelText('Votre âge'), '25');
    await userEvent.click(
      within(formulaire).getByRole('button', { name: 'Estimer mon aide au logement' }),
    );
    expect(
      await within(formulaire).findByText(/aucune aide au logement n’est estimée/),
    ).toBeInTheDocument();
    expect(formulaire).not.toHaveTextContent('≈');
    expect(formulaire).toHaveTextContent('vérifiez auprès de la CAF');
  });

  it('OF-UI-06 : moteur indisponible → message clair ; on peut réessayer ; la simulation principale n’est pas affectée', async () => {
    let appels = 0;
    await ouvrir({
      '/simulation/aides-estimees': () => {
        appels += 1;
        return appels === 1
          ? {
              __status: 503,
              corps: {
                error:
                  'Le moteur de calcul des aides est momentanément indisponible. Réessayez plus tard.',
              },
            }
          : RESULTAT;
      },
    });
    await budget();
    const formulaire = await deplier();
    await userEvent.selectOptions(
      await within(formulaire).findByLabelText('Ville où vous étudiez'),
      'Rennes',
    );
    await userEvent.type(within(formulaire).getByLabelText('Votre âge'), '20');
    const bouton = within(formulaire).getByRole('button', { name: 'Estimer mon aide au logement' });
    await userEvent.click(bouton);
    expect(await within(formulaire).findByRole('alert')).toHaveTextContent(
      'momentanément indisponible',
    );
    expect(screen.getByTestId('reste')).toHaveTextContent('− 126 €'); // inchangé
    await userEvent.click(bouton);
    expect(await within(formulaire).findByText(/≈ 200 €/)).toBeInTheDocument();
    expect(within(formulaire).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('trop de demandes (429) → message dédié ; réseau coupé → message générique', async () => {
    await ouvrir({ '/simulation/aides-estimees': { __status: 429, corps: {} } });
    const formulaire = await deplier();
    await saisir('Loyer charges comprises', '500');
    await userEvent.selectOptions(
      await within(formulaire).findByLabelText('Ville où vous étudiez'),
      'Rennes',
    );
    await userEvent.type(within(formulaire).getByLabelText('Votre âge'), '20');
    await userEvent.click(
      within(formulaire).getByRole('button', { name: 'Estimer mon aide au logement' }),
    );
    expect(await within(formulaire).findByRole('alert')).toHaveTextContent(
      'Trop de demandes d’estimation',
    );
  });

  it('liste des villes indisponible → message, sans bloquer le reste du simulateur', async () => {
    await ouvrir({ '/villes': new Error('panne') });
    const formulaire = await deplier();
    expect(await within(formulaire).findByRole('alert')).toHaveTextContent(
      /momentanément indisponibles/,
    );
    expect(screen.getByLabelText('Job étudiant (net)')).toBeInTheDocument();
  });

  it('OF-UI-07 : les saisies négatives ou textuelles du simulateur sont envoyées comme 0 (jamais comme texte)', async () => {
    const mock = await ouvrir();
    await saisir('Loyer charges comprises', '500');
    await saisir('Job étudiant (net)', 'abc');
    const formulaire = await deplier();
    await userEvent.selectOptions(
      await within(formulaire).findByLabelText('Ville où vous étudiez'),
      'Rennes',
    );
    await userEvent.type(within(formulaire).getByLabelText('Votre âge'), '19');
    await userEvent.click(
      within(formulaire).getByRole('button', { name: 'Estimer mon aide au logement' }),
    );
    await within(formulaire).findByText(/≈ 200 €/);
    expect(JSON.parse(appelsEstimation(mock)[0][1].body)).toEqual({
      age: 19,
      ville: '35238',
      loyer: 500,
      typeLogement: 'vide',
      revenu: 0,
    });
  });

  it('accessibilité : aucune violation axe-core (repliée, ouverte, avec résultat)', async () => {
    await ouvrir();
    const { container } = { container: document.body };
    await budget();
    expect(await violationsAxe(container)).toEqual([]);
    const formulaire = await deplier();
    await userEvent.selectOptions(
      await within(formulaire).findByLabelText('Ville où vous étudiez'),
      'Rennes',
    );
    await userEvent.type(within(formulaire).getByLabelText('Votre âge'), '20');
    await userEvent.click(
      within(formulaire).getByRole('button', { name: 'Estimer mon aide au logement' }),
    );
    await within(formulaire).findByText(/≈ 200 €/);
    expect(await violationsAxe(container)).toEqual([]);
  });
});
