import { z } from 'zod';
import { ErreurValidation } from '../lib/validation.js';

export class ErreurMetier extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

const valeursSchema = z
  .array(
    z.object({
      parametreId: z.number().int().positive(),
      valeur: z.number().finite().nonnegative().max(1_000_000),
    }),
  )
  .max(50);

/** Suggestions enregistrées par le robot (JSON dans valeur_proposee). */
export function lireSuggestions(changement) {
  try {
    return changement.valeurProposee ? JSON.parse(changement.valeurProposee) : [];
  } catch {
    return [];
  }
}

async function chargerEnAttente(tx, id) {
  const c = await tx.changementDetecte.findUnique({ where: { id }, include: { source: true } });
  if (!c) throw new ErreurMetier('Changement introuvable.', 404);
  if (c.statut !== 'a_valider') throw new ErreurMetier('Ce changement a déjà été traité.');
  return c;
}

/**
 * L'administrateur valide un changement détecté sur une page (SYN-06) :
 *  - les valeurs qu'il indique sont enregistrées (ancienne valeur conservée dans l'historique) ;
 *  - toutes les valeurs de cette source sont marquées « vérifiées aujourd'hui » ;
 *  - la nouvelle empreinte devient la référence, le statut passe à « valide ».
 */
export async function validerChangement(
  prisma,
  id,
  adminId,
  valeurs = [],
  maintenant = new Date(),
) {
  const aAppliquer = valeursSchema.safeParse(valeurs);
  if (!aAppliquer.success) throw new ErreurValidation('Valeurs invalides.');

  return prisma.$transaction(async (tx) => {
    const c = await chargerEnAttente(tx, id);
    const parametres = await tx.parametre.findMany({ where: { sourceId: c.sourceId } });
    const parId = new Map(parametres.map((p) => [p.id, p]));
    let nb = 0;
    for (const { parametreId, valeur } of aAppliquer.data) {
      const p = parId.get(parametreId);
      if (!p)
        throw new ErreurValidation(`Le paramètre ${parametreId} n'appartient pas à cette source.`);
      if (Number(p.valeur) !== valeur) {
        await tx.historiqueValeur.create({
          data: {
            tableCible: 'parametre',
            ligneId: String(p.id),
            champ: 'valeur',
            ancienneValeur: String(Number(p.valeur)),
            nouvelleValeur: String(valeur),
            synchronisationId: c.synchronisationId,
            changeLe: maintenant,
          },
        });
        nb++;
      }
    }
    for (const p of parametres) {
      const nouvelle = aAppliquer.data.find((v) => v.parametreId === p.id);
      await tx.parametre.update({
        where: { id: p.id },
        data: { verifieLe: maintenant, ...(nouvelle && { valeur: nouvelle.valeur }) },
      });
    }
    await tx.source.update({
      where: { id: c.sourceId },
      data: { empreinte: c.nouvelleEmpreinte, dernierChangement: maintenant, statut: 'ok' },
    });
    await tx.changementDetecte.update({
      where: { id },
      data: { statut: 'valide', traiteParId: adminId, traiteLe: maintenant },
    });
    return { statut: 'valide', valeursModifiees: nb };
  });
}

/** L'administrateur rejette : aucune valeur ne change (SYN-07). On retient l'empreinte pour ne pas réalerter. */
export async function rejeterChangement(prisma, id, adminId, maintenant = new Date()) {
  return prisma.$transaction(async (tx) => {
    const c = await chargerEnAttente(tx, id);
    await tx.source.update({ where: { id: c.sourceId }, data: { empreinte: c.nouvelleEmpreinte } });
    await tx.changementDetecte.update({
      where: { id },
      data: { statut: 'rejete', traiteParId: adminId, traiteLe: maintenant },
    });
    return { statut: 'rejete' };
  });
}

// Champs que l'on accepte de restaurer, et comment relire leur valeur texte.
const RESTAURABLES = {
  parametre: { valeur: { modele: 'parametre', convertir: Number } },
  ville: {
    loyerM2Appartement: { modele: 'ville', convertir: Number },
    loyerStudioEstime: { modele: 'ville', convertir: Number },
    nbLogementsCrous: { modele: 'ville', convertir: Number },
  },
  ressource: { statutLien: { modele: 'ressource', convertir: String } },
};

/**
 * Annule une modification en restaurant l'ancienne valeur (SYN-12). Refuse si la valeur
 * a encore changé depuis (pour ne pas écraser une correction plus récente).
 */
export async function annulerModification(prisma, historiqueId, maintenant = new Date()) {
  return prisma.$transaction(async (tx) => {
    const h = await tx.historiqueValeur.findUnique({ where: { id: historiqueId } });
    if (!h) throw new ErreurMetier('Modification introuvable.', 404);
    const regle = RESTAURABLES[h.tableCible]?.[h.champ];
    if (!regle || h.ancienneValeur === null)
      throw new ErreurMetier('Cette modification ne peut pas être annulée automatiquement.', 422);
    const cle = { id: Number(h.ligneId) };
    const ligne = await tx[regle.modele].findUnique({ where: cle });
    if (!ligne) throw new ErreurMetier('La ligne concernée n’existe plus.', 404);
    const actuelle =
      ligne[h.champ] === null
        ? null
        : String(Number.isNaN(Number(ligne[h.champ])) ? ligne[h.champ] : Number(ligne[h.champ]));
    if (actuelle !== h.nouvelleValeur) {
      throw new ErreurMetier(
        'La valeur a été modifiée depuis : annulation refusée pour ne rien écraser.',
      );
    }
    await tx[regle.modele].update({
      where: cle,
      data: { [h.champ]: regle.convertir(h.ancienneValeur) },
    });
    await tx.historiqueValeur.create({
      data: {
        tableCible: h.tableCible,
        ligneId: h.ligneId,
        champ: h.champ,
        ancienneValeur: h.nouvelleValeur,
        nouvelleValeur: h.ancienneValeur,
        synchronisationId: null, // modification manuelle (restauration)
        changeLe: maintenant,
      },
    });
    return { restauree: h.ancienneValeur };
  });
}
