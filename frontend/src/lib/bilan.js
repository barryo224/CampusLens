import { formaterEuroCentimes, formaterDate } from './format.js';
import { LIBELLES_NIVEAU, LIBELLES_TARIF } from './simulation.js';

// jsPDF n'aime pas les espaces insécables fines produites par Intl : on les remplace.
const sansInsecable = (t) => t.replace(/[\u202f\u00a0]/g, '\u0020');
const eur = (n) => sansInsecable(formaterEuroCentimes(n));

export const NOM_FICHIER_PAR_DEFAUT = 'bilan-campuslens';

/**
 * Nom du fichier PDF : « prenom-mon-budget.pdf ». Le prénom est nettoyé pour donner un nom de fichier sûr :
 * accents retirés, minuscules, tout ce qui n'est pas une lettre ou un chiffre devient « - » (donc ni « / », ni « . »,
 * ni caractères de contrôle). Sans prénom : « bilan-campuslens.pdf ».
 */
export function nomFichierBilan(prenom) {
  const base = String(prenom ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base ? `${base}-mon-budget.pdf` : `${NOM_FICHIER_PAR_DEFAUT}.pdf`;
}

/** « Prénom Nom » proprement espacé, ou chaîne vide si rien n'est renseigné. */
export function nomComplet({ prenom, nom } = {}) {
  return [prenom, nom]
    .map((t) =>
      String(t ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join(' ');
}

// Lettres que la police standard des PDF (Helvetica) ne sait pas dessiner, avec leur équivalent le plus proche.
const EQUIVALENTS = { ł: 'l', Ł: 'L', ı: 'i', İ: 'I', đ: 'd', Đ: 'D', ħ: 'h', Ħ: 'H' };
// Caractères disponibles dans une police PDF standard (Latin-1 + quelques signes courants).
const DISPONIBLE =
  /^[\u0020-\u007E\u00A0-\u00FF\u0152\u0153\u20AC\u2018\u2019\u201C\u201D\u2013\u2014\u2026]$/;

/**
 * Rend un texte affichable dans le PDF : les lettres hors police sont remplacées par leur équivalent
 * (ş → s, ł → l…) ou par « ? » (écritures non latines : la police standard ne les contient pas).
 */
export function texteSurPdf(texte) {
  return [...String(texte ?? '').normalize('NFC')]
    .map((c) => {
      if (DISPONIBLE.test(c)) return c;
      if (EQUIVALENTS[c]) return EQUIVALENTS[c];
      const base = c.normalize('NFD').replace(/\p{M}/gu, '');
      return DISPONIBLE.test(base) && base ? base : '?';
    })
    .join('');
}

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
  identite = {},
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
    pour: texteSurPdf(nomComplet(identite)),
    profil: profilTexte,
    revenus: Object.entries(LIBELLES_REVENUS).map(([k, l]) => [l, eur(montant(saisie[k]))]),
    totalRevenus: eur(resultat.totalRevenus),
    depenses: Object.entries(LIBELLES_DEPENSES).map(([k, l]) => [l, eur(montant(saisie[k]))]),
    fraisMensuels: [
      `Droits d’inscription (${eur(resultat.droitsInscription)}) + CVEC (${eur(resultat.cvec)}), lissés sur 12 mois`,
      eur(resultat.fraisMensuels),
    ],
    tarif: LIBELLES_TARIF[resultat.tarif],
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
  if (b.pour) ligne(`Bilan établi pour : ${b.pour}`, { taille: 12, gras: true });
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
  if (b.tarif)
    ligne(`Tarif d’inscription appliqué : ${b.tarif}`, { taille: 9.5, couleur: [74, 93, 101] });
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

  doc.save(nomFichierBilan(donnees.identite?.prenom));
  return b;
}
