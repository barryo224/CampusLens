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
