/**
 * Tâches de maintenance quotidiennes (indépendantes des sources).
 * Chacune reçoit `maintenant` pour pouvoir être testée à n'importe quelle date.
 */

/** Une source dont le dernier contrôle dépasse sa fréquence passe en « à vérifier » (SYN-08). */
export async function marquerSourcesPerimees(prisma, maintenant = new Date()) {
  const sources = await prisma.source.findMany({ where: { statut: 'ok' } });
  const perimees = sources.filter(
    (s) => !s.dernierControle || (maintenant - s.dernierControle) / 3_600_000 > s.frequenceHeures,
  );
  if (perimees.length) {
    await prisma.source.updateMany({
      where: { id: { in: perimees.map((s) => s.id) } },
      data: { statut: 'a_verifier' },
    });
  }
  return perimees.length;
}

/**
 * Désigne comme « en cours » l'année universitaire qui contient la date du jour (SYN-10).
 * Le simulateur lit toujours l'année en cours : il passe donc seul à la nouvelle année.
 * Si aucune année ne couvre la date (année suivante pas encore saisie), on ne change rien.
 */
export async function mettreAJourAnneeEnCours(prisma, maintenant = new Date()) {
  const jour = new Date(
    Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()),
  );
  const courante = await prisma.anneeUniversitaire.findFirst({
    where: { dateDebut: { lte: jour }, dateFin: { gte: jour } },
    orderBy: { dateDebut: 'desc' },
  });
  if (!courante || courante.enCours) return courante?.libelle ?? null;
  await prisma.$transaction([
    prisma.anneeUniversitaire.updateMany({ where: { enCours: true }, data: { enCours: false } }),
    prisma.anneeUniversitaire.update({ where: { id: courante.id }, data: { enCours: true } }),
  ]);
  return courante.libelle;
}

/** Nombre de mois avant la fin de l'année en cours à partir desquels on prépare la suivante. */
const MOIS_AVANCE = 4;

/**
 * Prépare l'année universitaire suivante pour que le site bascule seul au 1er septembre.
 *
 * À partir de MOIS_AVANCE mois avant la fin de l'année en cours, si l'année suivante n'existe pas :
 *  - on la crée (1er septembre → 31 août, libellé « 2027-2028 ») ;
 *  - on y recopie les paramètres et les postes de rentrée de l'année en cours, TOUS marqués « non vérifiés » :
 *    le site affichera « vérification en cours » tant que les robots ou un administrateur n'ont pas confirmé
 *    ou corrigé chaque montant (jamais un montant ancien présenté comme vérifié).
 * Idempotente : si l'année suivante existe déjà (même vide), on ne touche à rien.
 * Renvoie le libellé de l'année créée, ou null.
 */
export async function preparerAnneeSuivante(prisma, maintenant = new Date()) {
  const courante = await prisma.anneeUniversitaire.findFirst({ where: { enCours: true } });
  if (!courante) return null;
  const debutPreparation = new Date(courante.dateFin);
  debutPreparation.setUTCMonth(debutPreparation.getUTCMonth() - MOIS_AVANCE);
  if (maintenant < debutPreparation) return null;

  const debut = new Date(courante.dateFin);
  debut.setUTCDate(debut.getUTCDate() + 1); // lendemain de la fin de l'année en cours
  const existante = await prisma.anneeUniversitaire.findFirst({
    where: { dateDebut: { gte: debut } },
  });
  if (existante) return null;

  const an = debut.getUTCFullYear();
  const libelle = `${an}-${an + 1}`;
  const fin = new Date(Date.UTC(an + 1, debut.getUTCMonth(), debut.getUTCDate() - 1));

  return prisma.$transaction(async (tx) => {
    if (await tx.anneeUniversitaire.findUnique({ where: { libelle } })) return null;
    const suivante = await tx.anneeUniversitaire.create({
      data: { libelle, dateDebut: debut, dateFin: fin, enCours: false },
    });
    const parametres = await tx.parametre.findMany({ where: { anneeId: courante.id } });
    await tx.parametre.createMany({
      data: parametres.map((p) => ({
        cle: p.cle,
        niveau: p.niveau,
        profilId: p.profilId,
        anneeId: suivante.id,
        valeur: p.valeur,
        unite: p.unite,
        sourceId: p.sourceId,
        verifieLe: null,
      })),
    });
    const postes = await tx.posteRentree.findMany({ where: { anneeId: courante.id } });
    await tx.posteRentree.createMany({
      data: postes.map((p) => ({
        anneeId: suivante.id,
        nom: p.nom,
        montant: p.montant,
        astuce: p.astuce,
        aideId: p.aideId,
        sourceId: p.sourceId,
        parametreCle: p.parametreCle,
        gratuitBoursier: p.gratuitBoursier,
        profilCode: p.profilCode,
        situation: p.situation,
        verifieLe: null,
      })),
    });
    return libelle;
  });
}

/** RGPD : supprime les messages de contact arrivés à leur date de suppression. */
export async function purgerMessagesContact(prisma, maintenant = new Date()) {
  const { count } = await prisma.messageContact.deleteMany({
    where: { supprimerApres: { lte: maintenant } },
  });
  return count;
}

/** RGPD : supprime les avis arrivés à leur date de suppression. */
export async function purgerAvis(prisma, maintenant = new Date()) {
  const { count } = await prisma.avis.deleteMany({
    where: { supprimerApres: { lte: maintenant } },
  });
  return count;
}

export async function purgerSessionsExpirees(prisma, maintenant = new Date()) {
  const { count } = await prisma.sessionAdmin.deleteMany({
    where: { expire: { lte: maintenant } },
  });
  return count;
}

export async function maintenanceQuotidienne(prisma, maintenant = new Date()) {
  return {
    anneePreparee: await preparerAnneeSuivante(prisma, maintenant),
    anneeEnCours: await mettreAJourAnneeEnCours(prisma, maintenant),
    sourcesPerimees: await marquerSourcesPerimees(prisma, maintenant),
    messagesSupprimes: await purgerMessagesContact(prisma, maintenant),
    avisSupprimes: await purgerAvis(prisma, maintenant),
    sessionsSupprimees: await purgerSessionsExpirees(prisma, maintenant),
  };
}
