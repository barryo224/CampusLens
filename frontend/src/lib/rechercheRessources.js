const simplifier = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Suggestions « intelligentes » pour la recherche d'une ressource, pendant la frappe. Chaque mot saisi doit se trouver
 * dans le titre, l'organisme, le type ou la catégorie. Les plus probables d'abord :
 *  1. le titre commence par ce qui est tapé (« visa » → « Visa… ») ;
 *  2. un mot du titre commence par ce qui est tapé (« caution » → « Demander une caution Visale ») ;
 *  3. l'organisme correspond (« ameli », « caf ») ;
 *  4. le reste (type, catégorie).
 * À égalité : ordre alphabétique. Au plus `max` propositions, chacune avec son organisme et sa catégorie.
 */
export function suggererRessources(ressources, saisie, libelleCategorie = (c) => c, max = 6) {
  const mots = simplifier(saisie).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return [];
  const premier = mots[0];
  return ressources
    .filter((r) => {
      const texte = simplifier(
        `${r.titre} ${r.organisme} ${r.type} ${libelleCategorie(r.categorie)}`,
      );
      return mots.every((m) => texte.includes(m));
    })
    .map((r) => {
      const titre = simplifier(r.titre);
      let score = 4;
      if (titre.startsWith(premier)) score = 1;
      else if (titre.split(/[^a-z0-9]+/).some((w) => w.startsWith(premier))) score = 2;
      else if (simplifier(r.organisme).includes(premier)) score = 3;
      return {
        ressource: r,
        score,
        detail: [r.organisme, libelleCategorie(r.categorie)].filter(Boolean).join(' · '),
      };
    })
    .sort((a, b) => a.score - b.score || a.ressource.titre.localeCompare(b.ressource.titre, 'fr'))
    .slice(0, max);
}
