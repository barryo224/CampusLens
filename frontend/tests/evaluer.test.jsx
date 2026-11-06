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
    // Dessin (bandeau, logo, tableaux, encadré) : sans effet dans le test, seul le texte est vérifié.
    setFillColor() {}
    setDrawColor() {}
    setLineWidth() {}
    setLineCap() {}
    rect() {}
    roundedRect() {}
    circle() {}
    line() {}
    setPage() {}
    getNumberOfPages() {
      return 1;
    }
    getTextWidth(t) {
      return String(t).length * 2;
    }
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
    const explication = screen.getByTestId('explication-tarif');
    expect(explication).toHaveTextContent('Tarif national');
    expect(explication).toHaveTextContent('178');
    expect(explication).toHaveTextContent('105');
    expect(screen.getByRole('img', { name: /Reste-à-vivre : -125,58/ })).toBeInTheDocument();
  });

  it('international : compare les ressources déclarées au seuil du visa ; rien pour un Français', async () => {
    simulerApi({ '/parametres': PARAMETRES_API });
    rendreApp('/evaluer');
    await screen.findByText('Votre profil');
    await userEvent.type(screen.getByLabelText('Aide de la famille'), '700');
    expect(screen.queryByTestId('ressources-visa')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /international hors UE/ }));
    const bloc = await screen.findByTestId('ressources-visa');
    expect(bloc).toHaveTextContent('877,50');
    expect(bloc).toHaveTextContent('700,00');
    expect(bloc).toHaveTextContent('en dessous du seuil');

    await userEvent.type(screen.getByLabelText('Job étudiant (net)'), '200');
    expect(screen.getByTestId('ressources-visa')).toHaveTextContent('atteint le seuil');
    expect(screen.getByRole('link', { name: 'le budget de rentrée' })).toHaveAttribute(
      'href',
      '/budget?profil=intl',
    );
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
    await userEvent.click(screen.getByLabelText('Je suis boursier CROUS'));
    expect(screen.getByRole('img', { name: /-102,00/ })).toBeInTheDocument(); // SIM-14
    await userEvent.click(screen.getByRole('radio', { name: 'Master' }));
    expect(screen.getByRole('img', { name: /-102,00/ })).toBeInTheDocument();
  });

  it('boursier et exonéré s’excluent : cocher l’un décoche l’autre, mêmes cases que pour un Français', async () => {
    await ouvrir();
    await budgetDeReference();
    await userEvent.click(screen.getByRole('radio', { name: /international hors UE/ }));
    const boursier = () => screen.getByRole('checkbox', { name: 'Je suis boursier CROUS' });
    const exonere = () => screen.getByRole('checkbox', { name: /exonéré des droits différenciés/ });

    await userEvent.click(exonere());
    expect(exonere()).toBeChecked();
    await userEvent.click(boursier());
    expect(boursier()).toBeChecked();
    expect(exonere()).not.toBeChecked(); // l'un remplace l'autre
    expect(screen.getByRole('img', { name: /-102,00/ })).toBeInTheDocument(); // même résultat qu'un boursier français
    expect(screen.queryByText(/Si vous perdez la bourse/)).not.toBeInTheDocument();

    await userEvent.click(exonere());
    expect(boursier()).not.toBeChecked();
    expect(screen.getByRole('img', { name: /-125,58/ })).toBeInTheDocument();

    // Plus rien de coché : l'étudiant redevient « international », droits différenciés.
    await userEvent.click(exonere());
    expect(screen.getByRole('img', { name: /-352,58/ })).toBeInTheDocument();
  });

  it('changer de statut remet les cases à zéro : rien ne reste coché en revenant', async () => {
    await ouvrir();
    await budgetDeReference();
    const boursier = () => screen.getByRole('checkbox', { name: 'Je suis boursier CROUS' });

    // Français boursier → on change d'option → on revient : la case n'est plus cochée.
    await userEvent.click(boursier());
    expect(boursier()).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /international hors UE/ }));
    expect(boursier()).not.toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /français ou UE/ }));
    expect(boursier()).not.toBeChecked();
    expect(screen.getByTestId('explication-tarif')).toHaveTextContent('Tarif national');

    // International exonéré → français → international : plus exonéré.
    await userEvent.click(screen.getByRole('radio', { name: /international hors UE/ }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: /exonéré des droits différenciés/ }),
    );
    expect(screen.getByRole('img', { name: /-125,58/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /français ou UE/ }));
    expect(screen.queryByRole('checkbox', { name: /exonéré/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /international hors UE/ }));
    expect(
      screen.getByRole('checkbox', { name: /exonéré des droits différenciés/ }),
    ).not.toBeChecked();
    expect(screen.getByRole('img', { name: /-352,58/ })).toBeInTheDocument();
  });

  it('l’explication sous le résultat dit QUEL tarif est appliqué, dans les 4 situations', async () => {
    await ouvrir();
    await budgetDeReference();
    const explication = () => screen.getByTestId('explication-tarif');

    // Français / UE : tarif national.
    expect(explication()).toHaveTextContent(
      'Tarif national (licence) : droits d’inscription de 178 € et CVEC de 105 €',
    );
    expect(explication()).toHaveTextContent('soit 24 € par mois');
    expect(explication()).not.toHaveTextContent('exonération');

    // International non exonéré : droits différenciés, avec la piste de l'exonération.
    await userEvent.click(screen.getByRole('radio', { name: /international hors UE/ }));
    expect(explication()).toHaveTextContent('Tarif étudiant international (droits différenciés)');
    expect(explication()).toHaveTextContent('droits d’inscription de 2 902 € et CVEC de 105 €');
    expect(explication()).toHaveTextContent('soit 251 € par mois');
    expect(explication()).toHaveTextContent('Une exonération des droits différenciés est possible');

    // Master international : le tarif différencié du master.
    await userEvent.click(screen.getByRole('radio', { name: 'Master' }));
    expect(explication()).toHaveTextContent('(master)');
    expect(explication()).toHaveTextContent('3 950 €');
    await userEvent.click(screen.getByRole('radio', { name: 'Licence' }));

    // International exonéré : retour au tarif national, et le dit.
    await userEvent.click(screen.getByLabelText(/exonéré des droits différenciés/));
    expect(explication()).toHaveTextContent('Exonération des droits différenciés : tarif national');
    expect(explication()).toHaveTextContent('droits d’inscription de 178 €');
    expect(explication()).not.toHaveTextContent(
      'Une exonération des droits différenciés est possible',
    );

    // Boursier : tout est offert.
    await userEvent.click(screen.getByLabelText('Je suis boursier CROUS'));
    expect(explication()).toHaveTextContent(
      'Boursier : droits d’inscription et CVEC offerts (0 €).',
    );
    expect(explication()).not.toHaveTextContent('178');
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

  it('après un téléchargement réussi, le formulaire est vide à nouveau (montants et nom), avec une confirmation', async () => {
    await ouvrir();
    await budgetDeReference();
    await saisir('Prénom (facultatif)', 'Awa');
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }));
    await vi.waitFor(() => expect(pdf.sauvegardes).toEqual(['awa-mon-budget.pdf']));
    expect(await screen.findByText(/Le formulaire a été vidé/)).toBeInTheDocument();
    expect(screen.getByLabelText('Job étudiant (net)')).toHaveValue('');
    expect(screen.getByLabelText('Loyer charges comprises')).toHaveValue('');
    expect(screen.getByLabelText('Prénom (facultatif)')).toHaveValue('');
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
    expect(contenu).toContain('Tarif d’inscription appliqué : Tarif national');
    expect(contenu).toMatch(/Établi le \d{1,2} \p{L}+ \d{4}/u);
    expect(contenu).toContain('Service-Public.fr');
    expect(pdf.textes.filter((t) => t.startsWith('Service-Public.fr'))).toHaveLength(1); // pas de doublon de source
    expect(contenu).toContain('rien n’a été envoyé');
  });

  it('prénom et nom : facultatifs, vides par défaut, avec une phrase qui dit qu’ils ne sont pas envoyés', async () => {
    await ouvrir();
    const prenom = screen.getByLabelText('Prénom (facultatif)');
    const nom = screen.getByLabelText('Nom (facultatif)');
    expect(prenom).toHaveValue('');
    expect(nom).toHaveValue('');
    expect(prenom).not.toBeRequired();
    expect(nom).not.toBeRequired();
    expect(prenom).toHaveAttribute('autocomplete', 'off');
    expect(nom).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByText(/Votre nom n’est pas envoyé/)).toBeInTheDocument();
    // Sans nom, le bilan se télécharge normalement.
    await budgetDeReference();
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }));
    await vi.waitFor(() => expect(pdf.sauvegardes).toEqual(['bilan-campuslens.pdf']));
    expect(pdf.textes.join('\n')).not.toContain('Bilan établi pour');
  });

  it('avec un prénom et un nom : ils figurent sur le PDF et le fichier s’appelle « prénom-mon-budget.pdf »', async () => {
    await ouvrir();
    await saisir('Prénom (facultatif)', 'Zoé');
    await saisir('Nom (facultatif)', 'Dupont-Martin');
    await budgetDeReference();
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }));
    await vi.waitFor(() => expect(pdf.sauvegardes).toEqual(['zoe-mon-budget.pdf']));
    expect(pdf.textes.join('\n')).toMatch(/Bilan établi pour\nZoé Dupont-Martin/);
  });

  it('le nom reste dans le navigateur : aucune requête ne le contient, rien n’est mémorisé', async () => {
    const mock = await ouvrir();
    await saisir('Prénom (facultatif)', 'Marie');
    await saisir('Nom (facultatif)', 'Confidentielle');
    await budgetDeReference();
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }));
    await vi.waitFor(() => expect(pdf.sauvegardes).toHaveLength(1));

    const toutesLesRequetes = JSON.stringify(mock.mock.calls);
    expect(toutesLesRequetes).not.toMatch(/Marie|Confidentielle/);
    expect(
      mock.mock.calls.every(
        ([u, o]) => String(u).startsWith('/api/parametres') && (o?.method ?? 'GET') === 'GET',
      ),
    ).toBe(true);
    // Rien n'est gardé : ni stockage local, ni cookie.
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/Marie|Confidentielle/);
    expect(JSON.stringify({ ...sessionStorage })).not.toMatch(/Marie|Confidentielle/);
    expect(document.cookie).not.toMatch(/Marie|Confidentielle/);
  });

  it('bilan PDF sans aucun montant : refusé avec un message clair, rien n’est téléchargé, le curseur va au 1er champ', async () => {
    await ouvrir();
    const bouton = screen.getByRole('button', { name: 'Télécharger mon bilan (PDF)' });
    await userEvent.click(bouton);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Renseignez au moins un revenu ou une dépense pour générer votre bilan.',
    );
    expect(pdf.sauvegardes).toEqual([]);
    expect(pdf.textes).toEqual([]);
    expect(screen.getByLabelText('Job étudiant (net)')).toHaveFocus();
    // Un prénom et un profil ne suffisent pas : il faut au moins un montant.
    await saisir('Prénom (facultatif)', 'Zoé');
    await userEvent.click(screen.getByLabelText('Je suis boursier CROUS'));
    await userEvent.click(bouton);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(pdf.sauvegardes).toEqual([]);
    // Saisies invalides (texte, négatif, vide) = 0 : toujours refusé.
    await saisir('Job étudiant (net)', 'abc');
    await saisir('Loyer charges comprises', '-300');
    await userEvent.click(bouton);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(pdf.sauvegardes).toEqual([]);
  });

  it('le message d’erreur disparaît dès que l’étudiant saisit un montant, et le bilan se télécharge alors', async () => {
    await ouvrir();
    const bouton = screen.getByRole('button', { name: 'Télécharger mon bilan (PDF)' });
    await userEvent.click(bouton);
    await screen.findByRole('alert');
    await saisir('Alimentation', '200'); // une seule dépense suffit
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(bouton);
    await vi.waitFor(() => expect(pdf.sauvegardes).toEqual(['bilan-campuslens.pdf']));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un seul revenu (sans dépense) suffit aussi pour générer le bilan', async () => {
    await ouvrir();
    await saisir('Aide de la famille', '250');
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }));
    await vi.waitFor(() => expect(pdf.sauvegardes).toHaveLength(1));
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
