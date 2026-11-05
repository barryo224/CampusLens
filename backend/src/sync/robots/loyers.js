import { z } from 'zod';
import { telecharger, ErreurSource } from '../http.js';
import { lireCsv, nombreFr, arrondir2 } from '../outils.js';

const RECHERCHE =
  'https://www.data.gouv.fr/api/1/datasets/?q=carte+des+loyers+indicateurs+de+loyers+d%27annonce+par+commune&page_size=30';
const TITRE_RESSOURCE = 'Indicateurs de loyer appartement';

const metaSchema = z.object({
  data: z.array(
    z.object({
      title: z.string(),
      resources: z.array(
        z.object({
          title: z.string().nullable().optional(),
          format: z.string().nullable().optional(),
          url: z.string(),
        }),
      ),
    }),
  ),
});

// Un loyer au m² plausible : garde-fou contre un fichier mal formé (pas une règle métier).
const loyerSchema = z.number().positive().max(300);

/**
 * Robot de niveau 1 — « Carte des loyers » (ministère du Logement / ANIL, data.gouv.fr).
 * Trouve tout seul l'édition la plus récente (détection de la nouvelle édition), lit le CSV
 * et met à jour le loyer au m² et le loyer estimé d'un studio des villes suivies.
 */
export const robotLoyers = {
  cle: 'loyers',
  niveau: 1,

  async telecharger({ fetchImpl }) {
    const recherche = await telecharger(RECHERCHE, { fetchImpl });
    let meta;
    try {
      meta = metaSchema.parse(JSON.parse(recherche.texte));
    } catch (e) {
      throw new ErreurSource('Réponse inattendue de data.gouv.fr (liste des jeux de données).', {
        cause: e,
      });
    }
    // Édition la plus récente : « … par commune en 2025 » → 2025.
    const editions = meta.data
      .map((d) => ({
        d,
        annee: Number(d.title.match(/^\s*"?Carte des loyers"?.*par commune en (\d{4})/i)?.[1]),
      }))
      .filter((e) => Number.isFinite(e.annee))
      .sort((a, b) => b.annee - a.annee);
    const derniere = editions[0];
    const ressource = derniere?.d.resources.find(
      (r) => r.title === TITRE_RESSOURCE && /csv/i.test(r.format ?? ''),
    );
    if (!ressource)
      throw new ErreurSource(
        'Fichier « Indicateurs de loyer appartement » introuvable dans la dernière édition.',
      );

    const fichier = await telecharger(ressource.url, { fetchImpl, binaire: true, delaiMs: 90_000 });
    // Le fichier est encodé en Windows-1252 (accents), pas en UTF-8.
    const contenu = new TextDecoder('windows-1252').decode(fichier.octets);
    return { contenu, meta: { annee: derniere.annee, url: ressource.url } };
  },

  async analyser({ contenu, meta }, { prisma }) {
    const lignes = lireCsv(contenu, { separateur: ';' });
    if (lignes.length === 0) throw new ErreurSource('Fichier des loyers vide.');
    for (const col of ['INSEE_C', 'LIBGEO', 'loypredm2']) {
      if (!(col in lignes[0]))
        throw new ErreurSource(`Colonne « ${col} » absente du fichier des loyers.`);
    }
    const suivies = new Set(
      (await prisma.ville.findMany({ select: { codeInsee: true } })).map((v) => v.codeInsee),
    );
    const loyers = {};
    for (const l of lignes) {
      if (!suivies.has(l.INSEE_C)) continue;
      const valeur = loyerSchema.safeParse(nombreFr(l.loypredm2));
      if (!valeur.success) {
        throw new ErreurSource(
          `Loyer invalide pour la commune ${l.INSEE_C} (${l.LIBGEO}) : « ${l.loypredm2} ».`,
        );
      }
      loyers[l.INSEE_C] = valeur.data;
    }
    if (Object.keys(loyers).length === 0)
      throw new ErreurSource('Aucune ville suivie trouvée dans le fichier des loyers.');
    return { annee: meta.annee, loyers };
  },

  async appliquer({ tx, source, donnees, now }) {
    // Surface type d'un studio : un paramètre de la base, pas un chiffre du code.
    const surfaceLigne = await tx.parametre.findFirst({
      where: { cle: 'surface_studio_m2', annee: { enCours: true } },
    });
    if (!surfaceLigne) throw new ErreurSource('Paramètre manquant : surface_studio_m2.');
    const surface = Number(surfaceLigne.valeur);

    const changements = [];
    const villes = await tx.ville.findMany({
      where: { codeInsee: { in: Object.keys(donnees.loyers) } },
    });
    for (const v of villes) {
      const m2 = arrondir2(donnees.loyers[v.codeInsee]);
      const studio = arrondir2(m2 * surface);
      const anciens = {
        loyerM2Appartement: v.loyerM2Appartement === null ? null : Number(v.loyerM2Appartement),
        loyerStudioEstime: v.loyerStudioEstime === null ? null : Number(v.loyerStudioEstime),
      };
      if (anciens.loyerM2Appartement !== m2)
        changements.push({
          table: 'ville',
          ligneId: v.id,
          champ: 'loyerM2Appartement',
          ancienne: anciens.loyerM2Appartement,
          nouvelle: m2,
        });
      if (anciens.loyerStudioEstime !== studio)
        changements.push({
          table: 'ville',
          ligneId: v.id,
          champ: 'loyerStudioEstime',
          ancienne: anciens.loyerStudioEstime,
          nouvelle: studio,
        });
      // La date de vérification est mise à jour même si la valeur est identique : la source a confirmé.
      await tx.ville.update({
        where: { id: v.id },
        data: {
          loyerM2Appartement: m2,
          loyerStudioEstime: studio,
          verifieLe: now,
          sourceId: source.id,
        },
      });
    }
    return changements;
  },
};
