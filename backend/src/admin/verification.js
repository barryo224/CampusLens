import { estAVerifier } from '../lib/fraicheur.js';
import { ROBOTS } from '../sync/robots/index.js';
import { ErreurMetier } from './changements.js';

/**
 * Vérification MANUELLE des données (celles qu'aucun robot ne met à jour : aides, postes de rentrée, associations,
 * réglages…). Le principe du projet : tant qu'une donnée n'est pas vérifiée, le site le dit (« vérification en cours »).
 * Quand l'administrateur a comparé la donnée à sa source officielle, il clique sur « J'ai vérifié » : la date de
 * vérification est enregistrée, la source est marquée à jour, et la mention disparaît.
 * Au bout du délai propre à la source (frequenceHeures), la mention revient : il faut revérifier.
 */

// Types de données vérifiables à la main : modèle Prisma, nom de table (pour l'historique), libellé lisible.
const TYPES = {
  parametre: {
    modele: 'parametre',
    table: 'parametre',
    include: { source: true, profil: true, annee: true },
    where: { annee: { enCours: true } },
    libelle: (p) =>
      `${p.cle}${p.niveau !== 'aucun' ? ` (${p.niveau})` : ''}${p.profil ? ` — profil ${p.profil.code}` : ''}`,
    detail: (p) => `Valeur : ${Number(p.valeur)} ${p.unite} (année ${p.annee.libelle})`,
  },
  aide: {
    modele: 'aide',
    table: 'aide',
    include: { source: true, eligibilites: { include: { profil: true } } },
    where: { active: true },
    libelle: (a) => `${a.nom} — ${a.organisme}`,
    detail: (a) =>
      `${a.description} · Comment la demander : ${a.commentDemander} · Éligibilité : ` +
      a.eligibilites
        .sort((x, y) => x.profil.code.localeCompare(y.profil.code))
        .map((e) => `${e.profil.code} = ${e.statut}${e.precision ? ` (${e.precision})` : ''}`)
        .join(' ; '),
  },
  poste: {
    modele: 'posteRentree',
    table: 'poste_rentree',
    include: { source: true, annee: true },
    where: { annee: { enCours: true } },
    libelle: (p) => p.nom,
    detail: (p) =>
      `Montant : ${Number(p.montant)} € (année ${p.annee.libelle})${p.astuce ? ` · Astuce : ${p.astuce}` : ''}`,
  },
  transport: {
    modele: 'tarifTransport',
    table: 'tarif_transport',
    include: { source: true, ville: true },
    where: {},
    libelle: (t) => `${t.ville.nom} — ${t.reseau} : ${t.libelle}`,
    detail: (t) =>
      `${t.typeTarif === 'etudiant' ? 'Tarif réservé aux étudiants · ' : 'Tarif jeunes, sans condition d’études · '}${t.montantMensuel ? `Pass mensuel : ${Number(t.montantMensuel)} € · ` : ''}${t.montantAnnuel === null ? 'Pas d’abonnement annuel' : `Prix annuel : ${Number(t.montantAnnuel)} € (≈ ${Math.round((Number(t.montantAnnuel) / 12) * 100) / 100} €/mois)`}${t.conditions ? ` · ${t.conditions}` : ''} · ${t.urlTarifs}`,
  },
  association: {
    modele: 'association',
    table: 'association',
    include: { source: true },
    where: {},
    libelle: (a) => a.nom,
    detail: (a) => `${a.description}${a.lien ? ` · ${a.lien}` : ''}`,
  },
};

export const TYPES_VERIFIABLES = Object.keys(TYPES);

/** Une source est « manuelle » si aucun robot ne la met à jour. */
const estManuelle = (source) =>
  !source?.cle || !ROBOTS[source.cle] || ROBOTS[source.cle].veilleVerification === true;

const sourcePublique = (s) => ({
  id: s.id,
  nom: s.nom,
  organisme: s.organisme,
  url: s.url,
  statut: s.statut,
  frequenceHeures: s.frequenceHeures,
  // Surveillée : un robot relit la page chaque jour ; la vérification reste valable tant qu'elle ne change pas.
  veille: Boolean(s.cle && ROBOTS[s.cle]?.veilleVerification),
});

/** Toutes les données à vérifier à la main (jamais vérifiées, ou source périmée), groupées par source. */
export async function listerAVerifier(prisma, maintenant = new Date()) {
  const items = [];
  for (const [type, t] of Object.entries(TYPES)) {
    const lignes = await prisma[t.modele].findMany({
      where: t.where,
      include: t.include,
      orderBy: { id: 'asc' },
    });
    for (const l of lignes) {
      if (!estManuelle(l.source) || !estAVerifier(l.source, l.verifieLe, maintenant)) continue;
      items.push({
        type,
        id: l.id,
        libelle: t.libelle(l),
        detail: t.detail(l),
        verifieLe: l.verifieLe,
        source: sourcePublique(l.source),
      });
    }
  }
  return items;
}

/** Marque une ligne comme vérifiée aujourd'hui (+ sa source, si elle est manuelle), et le journalise. */
async function marquer(tx, type, ligne, maintenant) {
  const t = TYPES[type];
  await tx.historiqueValeur.create({
    data: {
      tableCible: t.table,
      ligneId: String(ligne.id),
      champ: 'verifieLe',
      ancienneValeur: ligne.verifieLe ? ligne.verifieLe.toISOString() : null,
      nouvelleValeur: maintenant.toISOString(),
      changeLe: maintenant, // modification manuelle : pas de synchronisation associée
    },
  });
  await tx[t.modele].update({ where: { id: ligne.id }, data: { verifieLe: maintenant } });
  if (estManuelle(ligne.source)) {
    await tx.source.update({
      where: { id: ligne.sourceId },
      data: { statut: 'ok', dernierControle: maintenant },
    });
  }
}

export async function verifierUneDonnee(prisma, type, id, maintenant = new Date()) {
  const t = TYPES[type];
  if (!t) throw new ErreurMetier('Type de donnée inconnu.', 400);
  return prisma.$transaction(async (tx) => {
    const ligne = await tx[t.modele].findUnique({ where: { id }, include: { source: true } });
    if (!ligne) throw new ErreurMetier('Donnée introuvable.', 404);
    if (!estManuelle(ligne.source)) {
      throw new ErreurMetier(
        'Cette donnée est mise à jour par un robot : validez-la depuis « À valider ».',
        422,
      );
    }
    await marquer(tx, type, ligne, maintenant);
    return { verifiee: 1 };
  });
}

/** Marque d'un coup TOUTES les données d'une source manuelle (quand on a vérifié la source en entier). */
export async function verifierToutesLesDonneesDeLaSource(
  prisma,
  sourceId,
  maintenant = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.source.findUnique({ where: { id: sourceId } });
    if (!source) throw new ErreurMetier('Source introuvable.', 404);
    if (!estManuelle(source))
      throw new ErreurMetier('Cette source est mise à jour par un robot.', 422);
    let nb = 0;
    for (const [type, t] of Object.entries(TYPES)) {
      const lignes = await tx[t.modele].findMany({
        where: { ...t.where, sourceId },
        include: { source: true },
      });
      for (const l of lignes) {
        if (estAVerifier(l.source, l.verifieLe, maintenant)) {
          await marquer(tx, type, l, maintenant);
          nb++;
        }
      }
    }
    // Même sans ligne à marquer, la source elle-même est confirmée à jour.
    await tx.source.update({
      where: { id: sourceId },
      data: { statut: 'ok', dernierControle: maintenant },
    });
    return { verifiees: nb };
  });
}
