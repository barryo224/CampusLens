import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi, violationsAxe } from './helpers/rendu.jsx';
import { PARAMETRES_API } from './helpers/donnees.js';

// Le PDF est généré par jsPDF : on le remplace pour vérifier ce qu'on lui demande d'écrire.
const pdf = vi.hoisted(() => ({ textes: [], sauvegardes: [] }));
vi.mock('jspdf', () => ({
  jsPDF: class {
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    addPage() {}
    splitTextToSize(t) {
      return [t];
    }
    text(t) {
      pdf.textes.push(String(t));
    }
    save(nom) {
      pdf.sauvegardes.push(nom);
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pdf.textes.length = 0;
  pdf.sauvegardes.length = 0;
});

async function saisir(champ, valeur) {
  const input = screen.getByLabelText(champ);
  await userEvent.clear(input);
  await userEvent.type(input, valeur);
}
async function budgetDeReference() {
  await saisir('Job étudiant (net)', '600');
  await saisir('Aide de la famille', '250');
  await saisir('Loyer charges comprises', '637');
  await saisir('Alimentation', '200');
  await saisir('Transport', '30');
  await saisir('Téléphone et internet', '20');
  await saisir('Santé et mutuelle', '15');
  await saisir('Autres dépenses', '50');
}
async function ouvrir() {
  const mock = simulerApi({ '/parametres': PARAMETRES_API });
  rendreApp('/evaluer');
  await screen.findByLabelText('Job étudiant (net)');
  return mock;
}

describe('Simulateur — Évaluer ma situation', () => {
  it('UI-01 : modifier un montant met à jour le reste-à-vivre et la jauge sans rechargement', async () => {
    await ouvrir();
    await budgetDeReference();
    expect(screen.getByTestId('reste')).toHaveTextContent('− 126 €');
    expect(screen.getByTestId('total-revenus')).toHaveTextContent('850');
    expect(screen.getByTestId('total-depenses')).toHaveTextContent('976'); // 952 + 24 de frais lissés

    const angleAvant = Number(screen.getByTestId('aiguille').dataset.angle);
    await saisir('Job étudiant (net)', '950'); // +350 € : sort de la zone rouge
    expect(screen.getByTestId('reste')).toHaveTextContent('224 €');
    expect(Number(screen.getByTestId('aiguille').dataset.angle)).toBeGreaterThan(angleAvant);
    expect(screen.getByText(/Budget équilibré/)).toBeInTheDocument();
  });

  it('calcule exactement comme la fonction de simulation (frais 178 + CVEC 105 inclus)', async () => {
    await ouvrir();
    await budgetDeReference();
    const resume = screen.getByText(/Droits d’inscription de/);
    expect(resume).toHaveTextContent('178');
    expect(resume).toHaveTextContent('105');
    expect(screen.getByRole('img', { name: /Reste-à-vivre : -125,58/ })).toBeInTheDocument();
  });

  it('UI-02 : le profil international affiche « exonéré » et le rappel 964 h ; masqués sinon', async () => {
    await ouvrir();
    expect(screen.queryByLabelText(/exonéré des droits différenciés/)).not.toBeInTheDocument();
    expect(screen.queryByText(/964 heures/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /international hors UE/ }));
    expect(screen.getByLabelText(/exonéré des droits différenciés/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('964 heures par an');

    await userEvent.click(screen.getByRole('radio', { name: /français ou UE/ }));
    expect(screen.queryByLabelText(/exonéré des droits différenciés/)).not.toBeInTheDocument();
    expect(screen.queryByText(/964 heures/)).not.toBeInTheDocument();
  });

  it('le statut international applique les droits différenciés, sauf si exonéré ou boursier', async () => {
    await ouvrir();
    await budgetDeReference();
    await userEvent.click(screen.getByRole('radio', { name: /international hors UE/ }));
    expect(screen.getByRole('img', { name: /-352,58/ })).toBeInTheDocument(); // SIM-02
    await userEvent.click(screen.getByLabelText(/exonéré des droits différenciés/));
    expect(screen.getByRole('img', { name: /-125,58/ })).toBeInTheDocument(); // SIM-03
    await userEvent.click(screen.getByLabelText(/exonéré/)); // on décoche
    await userEvent.click(screen.getByLabelText('Je suis boursier CROUS'));
    expect(screen.getByRole('img', { name: /-102,00/ })).toBeInTheDocument(); // SIM-14
    await userEvent.click(screen.getByRole('radio', { name: 'Master' }));
    expect(screen.getByRole('img', { name: /-102,00/ })).toBeInTheDocument();
  });

  it('UI-03 : résultat négatif → « Budget en difficulté : des aides existent » + lien vers Mes aides', async () => {
    await ouvrir();
    await budgetDeReference();
    expect(screen.getByText('Budget en difficulté : des aides existent')).toBeInTheDocument();
    const lien = screen.getByRole('link', { name: /Voir les aides pour moi/ });
    expect(lien).toHaveAttribute('href', '/aides?profil=fr_ue');
    await userEvent.click(screen.getByLabelText('Je suis boursier CROUS'));
    expect(screen.getByRole('link', { name: /Voir les aides pour moi/ })).toHaveAttribute(
      'href',
      '/aides?profil=boursier',
    );
  });

  it('saisies vides, négatives ou texte : aucune erreur, traitées comme 0', async () => {
    await ouvrir();
    await saisir('Alimentation', 'abc');
    await saisir('Loyer charges comprises', '-300');
    expect(screen.getByTestId('total-depenses')).toHaveTextContent('24 €'); // seuls les frais lissés
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('affiche des recommandations selon le profil et le résultat', async () => {
    await ouvrir();
    await budgetDeReference();
    const section = screen.getByRole('region', { name: 'Les aides et astuces pour vous' });
    expect(
      within(section).getByRole('heading', { name: 'Tester la bourse CROUS' }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole('heading', { name: /Loyer : 75 % de vos revenus/ }),
    ).toBeInTheDocument(); // 637/850
    expect(within(section).getByRole('heading', { name: 'Aide d’urgence' })).toBeInTheDocument();
    expect(within(section).getAllByRole('listitem').length).toBeLessThanOrEqual(4);
  });

  it('E2E-02 (version composant) : seules des requêtes GET sans montant partent vers l’API', async () => {
    const mock = await ouvrir();
    await budgetDeReference();
    await userEvent.click(screen.getByLabelText('Je suis boursier CROUS'));
    for (const [url, options] of mock.mock.calls) {
      expect(String(url)).toMatch(/^\/api\/parametres/);
      expect(options?.method ?? 'GET').toBe('GET');
      expect(options?.body).toBeUndefined();
      expect(String(url)).not.toMatch(/637|600|250/);
    }
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('UI-08 : « Télécharger mon bilan » génère un PDF avec profil, montants, résultat et date', async () => {
    await ouvrir();
    await budgetDeReference();
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }));
    await vi.waitFor(() => expect(pdf.sauvegardes).toEqual(['bilan-campuslens.pdf']));
    const contenu = pdf.textes.join('\n');
    expect(contenu).toContain('Mon bilan budget');
    expect(contenu).toContain('Étudiant français ou UE');
    expect(contenu).toContain('Licence');
    expect(contenu).toContain('600,00');
    expect(contenu).toContain('637,00');
    expect(contenu).toMatch(/125,58/);
    expect(contenu).toContain('Situation en difficulté');
    expect(contenu).toMatch(/Établi le \d{1,2} \p{L}+ \d{4}/u);
    expect(contenu).toContain('Service-Public.fr');
    expect(contenu.match(/• Service-Public\.fr/g)).toHaveLength(1); // pas de doublon de source
    expect(contenu).toContain('rien n’a été envoyé');
  });

  it('API indisponible → message clair, aucun calcul inventé', async () => {
    simulerApi({ '/parametres': new Error('panne') });
    rendreApp('/evaluer');
    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponibles/);
    expect(screen.queryByLabelText('Job étudiant (net)')).not.toBeInTheDocument();
  });

  it('paramètres incomplets (pas de CVEC) → message d’indisponibilité, pas de montant deviné', async () => {
    const sansCvec = {
      ...PARAMETRES_API,
      parametres: PARAMETRES_API.parametres.filter((p) => p.cle !== 'cvec'),
    };
    simulerApi({ '/parametres': sansCvec });
    rendreApp('/evaluer');
    await screen.findByLabelText('Job étudiant (net)');
    expect(screen.getByRole('alert')).toHaveTextContent(/calcul est indisponible/);
    expect(screen.queryByTestId('reste')).not.toBeInTheDocument();
  });

  it('accessibilité : aucune violation axe-core, tous les champs ont un label', async () => {
    simulerApi({ '/parametres': PARAMETRES_API });
    const { container } = rendreApp('/evaluer');
    await screen.findByLabelText('Job étudiant (net)');
    await budgetDeReference();
    expect(await violationsAxe(container)).toEqual([]);
  });
});
