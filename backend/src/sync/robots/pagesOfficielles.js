import { creerVeillePage } from './veillePage.js';

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

export const robotDroits = creerVeillePage({ cle: 'droits', extraire: extraireDroits });
export const robotCvec = creerVeillePage({ cle: 'cvec', extraire: extraireCvec });
