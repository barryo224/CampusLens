import { z } from 'zod';
import { telecharger, ErreurSource } from '../http.js';
import { texteDepuisHtml } from '../outils.js';

/** Texte de la page jusqu'au bloc mouvant (exclu), s'il y en a un. */
export function couper(texte, coupeA) {
  if (!coupeA) return texte;
  const i = texte.search(coupeA);
  return i > 0 ? texte.slice(0, i).trimEnd() : texte;
}

const MIN_CARACTERES = 400; // en dessous : page d'erreur ou page vide, pas un vrai contenu

/**
 * Fabrique un robot de NIVEAU 3 (veille d'une page web) : il détecte que la page a changé,
 * propose des valeurs repérées dans le texte, mais ne modifie rien sans validation d'un admin.
 *
 * @param cle           identifiant de la source
 * @param extraire      (texte, { parametres, annees }) → [{ parametreId, valeur }] valeurs repérées
 * @param coupeA        expression : le texte est coupé à la première ligne qui y correspond. Sert à ignorer les blocs
 *                      qui changent tout seuls (« articles recommandés »…), sinon chaque lecture ressemblerait à un
 *                      changement de la page.
 */
export function creerVeillePage({
  cle,
  extraire = () => [],
  veilleVerification = false,
  coupeA = null,
}) {
  return {
    cle,
    niveau: 3,
    // Veille d'une page dont les données sont vérifiées À LA MAIN : tant que la page ne change pas, la vérification
    // reste valable ; si elle change, les données repassent en « vérification en cours » (voir moteur.js).
    veilleVerification,

    async telecharger({ source, fetchImpl }) {
      const reponse = await telecharger(source.url, { fetchImpl });
      return { contenu: couper(texteDepuisHtml(reponse.texte), coupeA) };
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
