import { formaterEuroCentimes, formaterDate } from './format.js';
import { LIBELLES_NIVEAU } from './simulation.js';

// jsPDF n'aime pas les espaces insécables fines produites par Intl : on les remplace.
const sansInsecable = (t) => t.replace(/[\u202f\u00a0]/g, '\u0020');
const eur = (n) => sansInsecable(formaterEuroCentimes(n));

const LIBELLES_REVENUS = {
  job: 'Job étudiant (net)',
  famille: 'Aide de la famille',
  bourse: 'Bourse',
  aideLogement: 'Aide au logement (APL)',
};
const LIBELLES_DEPENSES = {
  loyer: 'Loyer charges comprises',
  alimentation: 'Alimentation',
  transport: 'Transport',
  telephone: 'Téléphone et internet',
  sante: 'Santé et mutuelle',
  autres: 'Autres dépenses',
};
export const LIBELLE_STATUT = {
  fr_ue: 'Étudiant français ou UE',
  intl: 'Étudiant international hors UE',
};

/**
 * Construit le contenu du bilan sous forme de sections de texte (testable sans PDF).
 * Rien n'est envoyé : le PDF est fabriqué dans le navigateur.
 */
export function construireBilan({
  profil,
  saisie,
  resultat,
  recommandations,
  sources,
  date = new Date(),
}) {
  const montant = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const profilTexte = [
    LIBELLE_STATUT[profil.statut],
    profil.niveau === 'master' ? 'Master' : 'Licence',
    profil.boursier ? 'boursier CROUS' : null,
    profil.statut === 'intl' && profil.exonere ? 'exonéré des droits différenciés' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    titre: 'CampusLens — Mon bilan budget',
    date: formaterDate(date.toISOString()),
    profil: profilTexte,
    revenus: Object.entries(LIBELLES_REVENUS).map(([k, l]) => [l, eur(montant(saisie[k]))]),
    totalRevenus: eur(resultat.totalRevenus),
    depenses: Object.entries(LIBELLES_DEPENSES).map(([k, l]) => [l, eur(montant(saisie[k]))]),
    fraisMensuels: [
      `Droits d’inscription (${eur(resultat.droitsInscription)}) + CVEC (${eur(resultat.cvec)}), lissés sur 12 mois`,
      eur(resultat.fraisMensuels),
    ],
    totalDepenses: eur(resultat.totalDepenses + resultat.fraisMensuels),
    reste: eur(resultat.resteAVivre),
    niveau: `Situation ${LIBELLES_NIVEAU[resultat.niveau]}`,
    recommandations: recommandations.map((r) => `${r.titre} — ${r.texte}`),
    sources: sources.map(
      (s) =>
        `${s.organisme}${s.verifieLe ? `, vérifié le ${formaterDate(s.verifieLe)}` : ' (à vérifier)'}`,
    ),
    avertissement:
      'Simulation indicative, calculée sur votre appareil : rien n’a été envoyé ni enregistré. Elle ne remplace ni le CROUS, ni la CAF, ni un service social.',
  };
}

/** Génère le PDF (bibliothèque chargée seulement au clic, pour garder le site léger). */
export async function telechargerBilan(donnees) {
  const { jsPDF } = await import('jspdf');
  const b = construireBilan(donnees);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const gauche = 18;
  const droite = 192;
  let y = 22;

  const ligne = (texte, { taille = 11, gras = false, couleur = [16, 36, 43] } = {}) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    doc.setTextColor(...couleur);
    for (const morceau of doc.splitTextToSize(texte, droite - gauche)) {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(morceau, gauche, y);
      y += taille * 0.5 + 1.5;
    }
  };
  const paire = (g, d, gras = false) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', gras ? 'bold' : 'normal');
    doc.setFontSize(11);
    doc.setTextColor(16, 36, 43);
    doc.text(g, gauche, y);
    doc.text(d, droite, y, { align: 'right' });
    y += 6.5;
  };
  const titreSection = (t) => {
    y += 4;
    ligne(t, { taille: 13, gras: true, couleur: [15, 76, 90] });
  };

  ligne(b.titre, { taille: 20, gras: true, couleur: [15, 76, 90] });
  ligne(`Établi le ${b.date}`, { taille: 10, couleur: [74, 93, 101] });
  y += 2;
  ligne(b.profil);

  titreSection('Revenus mensuels');
  b.revenus.forEach(([l, v]) => paire(l, v));
  paire('Total revenus', b.totalRevenus, true);

  titreSection('Dépenses mensuelles');
  b.depenses.forEach(([l, v]) => paire(l, v));
  paire(
    b.fraisMensuels[0].length > 60 ? 'Inscription + CVEC (÷ 12)' : b.fraisMensuels[0],
    b.fraisMensuels[1],
  );
  paire('Total dépenses', b.totalDepenses, true);

  titreSection('Résultat');
  paire('Reste-à-vivre mensuel', b.reste, true);
  ligne(b.niveau, { gras: true });

  if (b.recommandations.length) {
    titreSection('Aides et astuces pour vous');
    b.recommandations.forEach((r) => ligne(`• ${r}`, { taille: 10.5 }));
  }
  if (b.sources.length) {
    titreSection('Sources des montants');
    b.sources.forEach((s) => ligne(`• ${s}`, { taille: 10 }));
  }
  y += 4;
  ligne(b.avertissement, { taille: 9, couleur: [74, 93, 101] });

  doc.save('bilan-campuslens.pdf');
  return b;
}
