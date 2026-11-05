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
    niveauCode: resultat.niveau,
    recommandations: recommandations.map((r) => `${r.titre} — ${r.texte}`),
    sources: sources.map(
      (s) =>
        `${s.organisme}${s.verifieLe ? `, vérifié le ${formaterDate(s.verifieLe)}` : ' (vérification en cours)'}`,
    ),
    avertissement:
      'Simulation indicative, calculée sur votre appareil : rien n’a été envoyé ni enregistré. Elle ne remplace ni le CROUS, ni la CAF, ni un service social.',
  };
}

// ───── Mise en page du PDF (couleurs du site) ─────
const C = {
  teal: [15, 76, 90],
  tealClair: [226, 238, 241],
  texte: [16, 36, 43],
  doux: [74, 93, 101],
  ambre: [245, 158, 11],
  zebre: [246, 249, 250],
  filet: [221, 229, 232],
  blanc: [255, 255, 255],
};
// Encadré du résultat : vert (équilibre), orange (fragile), rouge (en difficulté).
const TONS = {
  equilibre: { fond: [230, 244, 234], bord: [46, 125, 50], texte: [27, 94, 32] },
  fragile: { fond: [255, 244, 224], bord: [217, 119, 6], texte: [146, 64, 14] },
  en_difficulte: { fond: [253, 232, 232], bord: [220, 38, 38], texte: [153, 27, 27] },
};
const PAGE = { largeur: 210, hauteur: 297, marge: 16, basPage: 268 };
const LARGEUR_UTILE = PAGE.largeur - 2 * PAGE.marge;

/** Le logo de CampusLens (même dessin que l'icône du site), en vectoriel : net à toute taille. */
function dessinerLogo(doc, x, y, taille) {
  const k = taille / 40;
  doc.setFillColor(...C.blanc);
  doc.roundedRect(x, y, taille, taille, 11 * k, 11 * k, 'F');
  doc.setFillColor(...C.teal);
  doc.roundedRect(
    x + 1.2 * k,
    y + 1.2 * k,
    taille - 2.4 * k,
    taille - 2.4 * k,
    10 * k,
    10 * k,
    'F',
  );
  doc.setDrawColor(...C.blanc);
  doc.setLineWidth(3 * k);
  doc.circle(x + 18 * k, y + 18 * k, 8 * k, 'S');
  doc.setFillColor(...C.ambre);
  doc.circle(x + 18 * k, y + 18 * k, 3 * k, 'F');
  doc.setLineWidth(3.5 * k);
  doc.setLineCap('round');
  doc.line(x + 24 * k, y + 24 * k, x + 31 * k, y + 31 * k);
  doc.setLineCap('butt');
}

/** Génère le PDF (bibliothèque chargée seulement au clic, pour garder le site léger). */
export async function telechargerBilan(donnees) {
  const { jsPDF } = await import('jspdf');
  const b = construireBilan(donnees);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const { marge } = PAGE;
  const droite = PAGE.largeur - marge;
  let y = 0;

  const texte = (t, x, yy, { taille = 10.5, gras = false, couleur = C.texte, align } = {}) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    doc.setTextColor(...couleur);
    doc.text(t, x, yy, align ? { align } : undefined);
  };

  const nouvellePage = () => {
    doc.addPage();
    doc.setFillColor(...C.teal);
    doc.rect(0, 0, PAGE.largeur, 12, 'F');
    dessinerLogo(doc, marge, 2.2, 7.6);
    texte('CampusLens — Mon bilan budget', marge + 11, 7.4, {
      taille: 9.5,
      gras: true,
      couleur: C.blanc,
    });
    y = 22;
  };
  const place = (hauteur) => {
    if (y + hauteur > PAGE.basPage) nouvellePage();
  };

  // ── Bandeau d'en-tête : logo, nom, titre, date ──
  doc.setFillColor(...C.teal);
  doc.rect(0, 0, PAGE.largeur, 29, 'F');
  doc.setFillColor(...C.ambre);
  doc.rect(0, 29, PAGE.largeur, 1.4, 'F');
  dessinerLogo(doc, marge, 6, 17);
  texte('CampusLens', marge + 22, 15.5, { taille: 21, gras: true, couleur: C.blanc });
  texte('Mon bilan budget', marge + 22, 22.5, { taille: 12, couleur: [196, 224, 230] });
  texte(`Établi le ${b.date}`, droite, 15.5, { taille: 9.5, couleur: C.blanc, align: 'right' });
  y = 39;

  // ── Pour qui ──
  if (b.pour) {
    texte('Bilan établi pour', marge, y, { taille: 8.5, couleur: C.doux });
    texte(b.pour, marge, y + 5.6, { taille: 13, gras: true });
    y += 10.5;
  }
  texte(b.profil, marge, y + (b.pour ? 0.5 : 0), { taille: 9.5, couleur: C.doux });
  y += 9;

  // ── Titre de section : filet ambre + titre ──
  const titreSection = (t) => {
    place(22);
    doc.setFillColor(...C.ambre);
    doc.rect(marge, y - 4.6, 1.6, 6.2, 'F');
    texte(t, marge + 4.5, y, { taille: 12.5, gras: true, couleur: C.teal });
    y += 5;
  };

  // ── Tableau : lignes alternées, total en relief ──
  const HAUTEUR_LIGNE = 5.5;
  const ligneTableau = (g, d, { index = 0, total = false } = {}) => {
    place(HAUTEUR_LIGNE);
    if (total) {
      doc.setFillColor(...C.tealClair);
      doc.rect(marge, y, LARGEUR_UTILE, HAUTEUR_LIGNE, 'F');
    } else if (index % 2 === 1) {
      doc.setFillColor(...C.zebre);
      doc.rect(marge, y, LARGEUR_UTILE, HAUTEUR_LIGNE, 'F');
    }
    const base = y + HAUTEUR_LIGNE - 1.8;
    texte(g, marge + 2.5, base, { gras: total, couleur: total ? C.teal : C.texte });
    texte(d, droite - 2.5, base, {
      gras: total,
      couleur: total ? C.teal : C.texte,
      align: 'right',
    });
    y += HAUTEUR_LIGNE;
  };

  titreSection('Revenus mensuels');
  b.revenus.forEach(([l, v], i) => ligneTableau(l, v, { index: i }));
  ligneTableau('Total revenus', b.totalRevenus, { total: true });
  y += 8;

  titreSection('Dépenses mensuelles');
  b.depenses.forEach(([l, v], i) => ligneTableau(l, v, { index: i }));
  ligneTableau(
    b.fraisMensuels[0].length > 60 ? 'Inscription + CVEC (÷ 12)' : b.fraisMensuels[0],
    b.fraisMensuels[1],
    { index: b.depenses.length },
  );
  if (b.tarif) {
    place(6);
    texte(`Tarif d’inscription appliqué : ${b.tarif}`, marge + 2.5, y + 4.2, {
      taille: 8.5,
      couleur: C.doux,
    });
    y += 6;
  }
  ligneTableau('Total dépenses', b.totalDepenses, { total: true });
  y += 9;

  // ── Résultat : encadré coloré selon la situation ──
  place(28);
  const ton = TONS[b.niveauCode] ?? TONS.fragile;
  doc.setFillColor(...ton.fond);
  doc.setDrawColor(...ton.bord);
  doc.setLineWidth(0.5);
  doc.roundedRect(marge, y, LARGEUR_UTILE, 21, 3, 3, 'FD');
  texte('Reste-à-vivre mensuel', marge + 6, y + 7.5, { taille: 9, couleur: C.doux });
  texte(b.reste, marge + 6, y + 16, { taille: 20, gras: true, couleur: ton.texte });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const largeurBadge = doc.getTextWidth(b.niveau) + 10;
  doc.setFillColor(...ton.bord);
  doc.roundedRect(droite - 6 - largeurBadge, y + 6.2, largeurBadge, 8.5, 4.25, 4.25, 'F');
  texte(b.niveau, droite - 6 - largeurBadge / 2, y + 11.9, {
    taille: 10,
    gras: true,
    couleur: C.blanc,
    align: 'center',
  });
  y += 28;

  // ── Aides et astuces : titre en gras, détail dessous ──
  if (b.recommandations.length) {
    titreSection('Aides et astuces pour vous');
    y += 1;
    for (const r of b.recommandations) {
      const [titre, ...reste] = r.split(' — ');
      const detail = reste.join(' — ');
      const lignes = doc.splitTextToSize(detail, LARGEUR_UTILE - 8);
      place(6 + lignes.length * 4.2);
      doc.setFillColor(...C.ambre);
      doc.circle(marge + 2, y - 1.2, 1, 'F');
      texte(titre, marge + 6, y, { gras: true });
      y += 4.4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.2);
      doc.setTextColor(...C.doux);
      for (const l of lignes) {
        doc.text(l, marge + 6, y);
        y += 4.1;
      }
      y += 1.8;
    }
    y += 1;
  }

  // ── Sources : une par ligne, discrètes, avec l'état de vérification de chacune ──
  if (b.sources.length) {
    const lignes = b.sources.map((src) =>
      src
        .replace(/ \(vérification en cours\)$/, ' · vérification en cours')
        .replace(/, vérifié le (.*)$/, ' · vérifié le $1'),
    );
    place(8 + lignes.length * 4.2);
    texte('Sources des montants', marge, y, { taille: 10, gras: true, couleur: C.teal });
    y += 5;
    for (const l of lignes) {
      texte(l, marge, y, { taille: 8.8, couleur: C.doux });
      y += 4.2;
    }
  }

  // ── Pied de page sur chaque page : mention, adresse, numéro ──
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...C.filet);
    doc.setLineWidth(0.3);
    doc.line(marge, 272, droite, 272);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.doux);
    doc.text(doc.splitTextToSize(b.avertissement, LARGEUR_UTILE), marge, 277);
    texte('campuslens-etudiants.vercel.app', marge, 289, {
      taille: 8,
      couleur: C.teal,
      gras: true,
    });
    texte(`Page ${p} / ${total}`, droite, 289, { taille: 8, couleur: C.doux, align: 'right' });
  }

  doc.save(nomFichierBilan(donnees.identite?.prenom));
  return b;
}
