// Rend l'historique des modifications lisible : le nom de la donnée (au lieu de « tarif_transport #11 ») et le nom du champ
// (au lieu de « montantMensuel »). Les valeurs brutes restent dans la réponse, seuls des libellés s'y ajoutent.

const NOMS_PARAMETRES = {
  droits_inscription: 'Droits d’inscription',
  cvec: 'CVEC',
  seuil_fragile: 'Seuil « fragile »',
  seuil_part_loyer: 'Seuil part du loyer',
  surface_studio_m2: 'Surface type d’un studio',
  heures_travail_max: 'Heures de travail max',
};

export const NOMS_CHAMPS = {
  valeur: 'valeur',
  montantMensuel: 'pass mensuel',
  montantAnnuel: 'prix annuel',
  verifieLe: 'date de vérification',
  loyerStudioEstime: 'loyer d’un studio (estimé)',
  loyerM2Appartement: 'loyer au m²',
  nbLogementsCrous: 'nombre de résidences Crous',
  statutLien: 'état du lien',
  loyerMin: 'loyer minimum',
  loyerMax: 'loyer maximum',
  nomResidence: 'nom de la résidence',
};

/** Pour chaque table de l'historique : le modèle Prisma, ce qu'il faut charger, et comment nommer la ligne. */
const TABLES = {
  parametre: {
    modele: 'parametre',
    select: { cle: true, niveau: true, profil: { select: { code: true } } },
    nom: (p) =>
      `${NOMS_PARAMETRES[p.cle] ?? p.cle}${p.niveau !== 'aucun' ? ` (${p.niveau})` : ''}${p.profil ? ` — profil ${p.profil.code}` : ''}`,
  },
  aide: { modele: 'aide', select: { nom: true }, nom: (a) => a.nom },
  tarif_transport: {
    modele: 'tarifTransport',
    select: { reseau: true, libelle: true, ville: { select: { nom: true } } },
    nom: (t) => `${t.ville?.nom ? `${t.ville.nom} — ` : ''}${t.reseau} : ${t.libelle}`,
  },
  poste_rentree: { modele: 'posteRentree', select: { nom: true }, nom: (p) => p.nom },
  association: { modele: 'association', select: { nom: true }, nom: (a) => a.nom },
  ville: { modele: 'ville', select: { nom: true }, nom: (v) => v.nom },
  ressource: { modele: 'ressource', select: { titre: true }, nom: (r) => r.titre },
  logement_crous: {
    modele: 'logementCrous',
    select: { nomResidence: true, ville: { select: { nom: true } } },
    nom: (l) => `${l.nomResidence}${l.ville?.nom ? ` (${l.ville.nom})` : ''}`,
  },
};

/** Ajoute `donnee` (nom lisible de la ligne) et `champLibelle` à chaque ligne d'historique. */
export async function enrichirHistorique(prisma, lignes) {
  const parTable = new Map();
  for (const l of lignes) {
    if (!TABLES[l.tableCible] || !/^\d+$/.test(l.ligneId)) continue;
    if (!parTable.has(l.tableCible)) parTable.set(l.tableCible, new Set());
    parTable.get(l.tableCible).add(Number(l.ligneId));
  }
  const noms = new Map(); // « table:id » → nom
  for (const [table, ids] of parTable) {
    const t = TABLES[table];
    try {
      const trouvees = await prisma[t.modele].findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, ...t.select },
      });
      for (const ligne of trouvees) noms.set(`${table}:${ligne.id}`, t.nom(ligne));
    } catch {
      // une table inconnue ou un schéma qui change ne doit jamais empêcher d'afficher l'historique
    }
  }
  return lignes.map((l) => ({
    ...l,
    donnee:
      noms.get(`${l.tableCible}:${l.ligneId}`) ?? `${l.tableCible} n° ${l.ligneId} (supprimée)`,
    champLibelle: NOMS_CHAMPS[l.champ] ?? l.champ,
  }));
}
