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

/** RGPD : supprime les messages de contact arrivés à leur date de suppression. */
export async function purgerMessagesContact(prisma, maintenant = new Date()) {
  const { count } = await prisma.messageContact.deleteMany({
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
    anneeEnCours: await mettreAJourAnneeEnCours(prisma, maintenant),
    sourcesPerimees: await marquerSourcesPerimees(prisma, maintenant),
    messagesSupprimes: await purgerMessagesContact(prisma, maintenant),
    sessionsSupprimees: await purgerSessionsExpirees(prisma, maintenant),
  };
}
