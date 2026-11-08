import { creerVeillePage } from './veillePage.js';
import { ErreurSource } from '../http.js';

const nombre = (t) => Number(String(t).replace(/\s/g, '').replace(',', '.'));

/**
 * Droits d'inscription (fiche Service-Public « Coût d'une inscription ») :
 * le tableau donne le taux normal par formation. On repère licence et master.
 */
export function extraireDroits(texte, { parametres }) {
  const trouve = [];
  const cible = (niveau) =>
    parametres.find(
      (p) =>
        p.cle === 'droits_inscription' && p.niveau === niveau && !p.profilId && p.annee.enCours,
    );
  const licence = texte.match(/Licence professionnelle\s+(\d[\d ]*)\s*€/);
  const master = texte.match(/grade de master\s+(\d[\d ]*)\s*€/);
  if (licence && cible('licence'))
    trouve.push({ parametreId: cible('licence').id, valeur: nombre(licence[1]) });
  if (master && cible('master'))
    trouve.push({ parametreId: cible('master').id, valeur: nombre(master[1]) });
  return trouve;
}

/** CVEC : « … pour l'année universitaire 2026-2027. Elle est de 105 € euros. » */
export function extraireCvec(texte, { parametres }) {
  const m = texte.match(
    /ann\S{1,10}e universitaire (\d{4}-\d{4})\.?\s*Elle est de (\d+(?:[.,]\d+)?)\s*€/i,
  );
  if (!m) return [];
  const param = parametres.find((p) => p.cle === 'cvec' && p.annee.libelle === m[1]);
  return param ? [{ parametreId: param.id, valeur: nombre(m[2]) }] : [];
}

/**
 * Seuil de pauvreté (Insee, « L'essentiel sur… la pauvreté ») :
 * « … Il correspond à un revenu disponible de 1 337 euros par mois pour une personne vivant seule … »
 * Le montant s'écrit avec une espace (normale, insécable ou fine) et la phrase peut être coupée par un retour à la ligne
 * (c'est le cas sur la vraie page) : tous les espacements sont acceptés.
 */
export function extraireSeuilPauvrete(texte, { parametres }) {
  const m = texte.match(
    /revenu\s+disponible\s+de\s*(\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?)\s*euros\s+par\s+mois\s+pour\s+une\s+personne\s+(?:vivant\s+)?seule/i,
  );
  if (!m) return [];
  const param = parametres.find((p) => p.cle === 'seuil_pauvrete' && p.annee.enCours);
  return param
    ? [{ parametreId: param.id, valeur: nombre(m[1].replace(/[\u00a0\u202f]/g, '')) }]
    : [];
}

/** Mots qui encadrent la phrase du seuil : la veille ne regarde que ce passage, pas les blocs mouvants de la page. */
const REPERE_SEUIL = /revenu disponible de/i;

const veilleSeuil = creerVeillePage({ cle: 'seuil_pauvrete', extraire: extraireSeuilPauvrete });

/**
 * Robot du seuil de pauvreté. La page de l'Insee contient bien d'autres textes (chiffres clés, liens, articles) qui
 * changent sans rapport avec le seuil : on ne surveille donc que le passage autour de la phrase du seuil. Si cette
 * phrase disparaît (page refaite), le robot le dit au lieu de deviner : une personne revérifie à la main.
 */
export const robotSeuilPauvrete = {
  ...veilleSeuil,
  async telecharger(args) {
    const { contenu } = await veilleSeuil.telecharger(args);
    const i = contenu.search(REPERE_SEUIL);
    if (i < 0)
      throw new ErreurSource('La phrase du seuil de pauvreté est introuvable : page modifiée.');
    return { contenu: contenu.slice(Math.max(0, i - 300), i + 500) };
  },
};

export const robotDroits = creerVeillePage({ cle: 'droits', extraire: extraireDroits });
export const robotCvec = creerVeillePage({ cle: 'cvec', extraire: extraireCvec });
