import { z } from 'zod';
import { telecharger, ErreurSource } from '../http.js';
import { texteDepuisHtml } from '../outils.js';

const MIN_CARACTERES = 400; // en dessous : page d'erreur ou page vide, pas un vrai contenu

/**
 * Fabrique un robot de NIVEAU 3 (veille d'une page web) : il détecte que la page a changé,
 * propose des valeurs repérées dans le texte, mais ne modifie rien sans validation d'un admin.
 *
 * @param cle           identifiant de la source
 * @param extraire      (texte, { parametres, annees }) → [{ parametreId, valeur }] valeurs repérées
 */
export function creerVeillePage({ cle, extraire = () => [], veilleVerification = false }) {
  return {
    cle,
    niveau: 3,
    // Veille d'une page dont les données sont vérifiées À LA MAIN : tant que la page ne change pas, la vérification
    // reste valable ; si elle change, les données repassent en « vérification en cours » (voir moteur.js).
    veilleVerification,

    async telecharger({ source, fetchImpl }) {
      const reponse = await telecharger(source.url, { fetchImpl });
      return { contenu: texteDepuisHtml(reponse.texte) };
    },

    async analyser({ contenu }) {
      const r = z.string().min(MIN_CARACTERES).safeParse(contenu);
      if (!r.success) throw new ErreurSource('Page vide ou trop courte : contenu ignoré.');
      if (
        /^Erreur \d{3}|Page not found|provisoirement indisponible/im.test(contenu.slice(0, 300))
      ) {
        throw new ErreurSource('La page affiche une erreur : contenu ignoré.');
      }
      return { texte: contenu };
    },

    async proposer({ source, donnees, prisma }) {
      const parametres = await prisma.parametre.findMany({
        where: { sourceId: source.id },
        include: { annee: true, profil: true },
      });
      const reperees = extraire(donnees.texte, { parametres });
      const suggestions = reperees.map((s) => {
        const p = parametres.find((x) => x.id === s.parametreId);
        return {
          parametreId: p.id,
          cle: p.cle,
          niveau: p.niveau,
          profil: p.profil?.code ?? null,
          annee: p.annee.libelle,
          valeurActuelle: Number(p.valeur),
          valeur: s.valeur,
        };
      });
      const detail = suggestions.length
        ? ` Valeurs repérées : ${suggestions
            .map(
              (s) =>
                `${s.cle}${s.niveau !== 'aucun' ? ` (${s.niveau})` : ''} = ${s.valeur} (actuel : ${s.valeurActuelle})`,
            )
            .join(' ; ')}.`
        : ' Aucune valeur n’a pu être repérée automatiquement : relisez la page.';
      return {
        resume: `La page « ${source.nom} » a changé (${source.empreinte ? 'nouvelle version' : 'première lecture'}).${detail}`,
        suggestions,
      };
    },
  };
}
