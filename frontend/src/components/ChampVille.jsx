import ChampSuggestions from './ChampSuggestions.jsx';
import { suggererVilles } from '../lib/rechercheVilles.js';

/** Recherche d'une ville : suggestions classées (nom, code postal, département, région). */
export default function ChampVille({ villes, valeur, surChangement, surChoix, idResultats }) {
  const suggestions = valeur.trim()
    ? suggererVilles(villes, valeur).map((s) => ({
        cle: s.ville.id,
        titre: s.ville.nom,
        detail: s.detail,
        brut: s.ville,
      }))
    : [];
  return (
    <ChampSuggestions
      libelle="Rechercher une ville"
      placeholder="Nom, code postal, département ou région"
      aide="Exemples : « rennes », « 35000 », « 35 », « corse ». Touchez une suggestion pour aller droit au résultat."
      libelleListe="Villes proposées"
      suggestions={suggestions}
      valeur={valeur}
      surChangement={surChangement}
      surChoix={surChoix}
      idResultats={idResultats}
    />
  );
}
