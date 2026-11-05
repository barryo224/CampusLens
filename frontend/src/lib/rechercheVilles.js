/** « Orléans » → « orleans » : on cherche sans tenir compte des accents ni des majuscules. */
const simplifier = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Recherche dans la liste des villes : tout ce que l'étudiant tape doit pouvoir sortir.
 * Chaque mot saisi doit correspondre à AU MOINS un champ de la ville :
 *  - le nom (« renn » → Rennes) ou la région (« corse ») ;
 *  - un code postal (« 35000 », ou « 350 » → tous les codes qui commencent ainsi) ;
 *  - le département (« 35 », « 2A ») : début du code postal ou du code INSEE.
 * Plusieurs mots se combinent (« rennes 35 », « bretagne master » ne trouve rien de faux).
 */
export function rechercherVilles(villes, saisie) {
  const mots = simplifier(saisie).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return villes;
  return villes.filter((v) => {
    const nom = simplifier(v.nom);
    const region = simplifier(v.region);
    const codes = [...(v.codesPostaux ?? []), v.codeInsee ?? ''].map(simplifier);
    return mots.every(
      (mot) =>
        nom.includes(mot) || region.includes(mot) || codes.some((code) => code.startsWith(mot)),
    );
  });
}

/**
 * Suggestions « intelligentes » pendant la frappe : les villes les plus probables d'abord, avec ce qui a correspondu
 * (le code postal tapé, le département…) pour que l'étudiant reconnaisse sa ville sans finir d'écrire.
 *  1. le nom commence par ce qui est tapé (« ren » → Rennes) ;
 *  2. un code postal commence par ce qui est tapé (« 350 » → Rennes 35000) ;
 *  3. le nom contient la saisie (« denis » → Saint-Denis) ;
 *  4. la région ou le département correspond (« corse », « 35 »).
 * À égalité : ordre alphabétique. Renvoie au plus `max` villes, chacune avec un `detail` lisible.
 */
export function suggererVilles(villes, saisie, max = 6) {
  const mots = simplifier(saisie).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return [];
  const premier = mots[0];
  return rechercherVilles(villes, saisie)
    .map((v) => {
      const nom = simplifier(v.nom);
      const codes = (v.codesPostaux ?? []).filter((c) => simplifier(c).startsWith(premier));
      let score = 4;
      if (nom.startsWith(premier)) score = 1;
      else if (codes.length > 0) score = 2;
      else if (nom.includes(premier)) score = 3;
      const code = codes[0] ?? (v.codesPostaux ?? [])[0];
      return {
        ville: v,
        score,
        detail: [code, v.region].filter(Boolean).join(' · '),
      };
    })
    .sort((a, b) => a.score - b.score || a.ville.nom.localeCompare(b.ville.nom, 'fr'))
    .slice(0, max);
}
