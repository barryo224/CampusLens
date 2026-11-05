import {
  ANNEE,
  PROFILS,
  SOURCES,
  PARAMETRES,
  AIDES,
  POSTES_RENTREE,
  ASSOCIATIONS,
  RESSOURCES,
  VILLES,
  TARIFS_TRANSPORT,
  UNIVERSEL,
} from './donnees.js';

/**
 * Remplit la base avec les valeurs de départ.
 * Idempotent : on peut le relancer sans créer de doublons, et il n'écrase JAMAIS
 * une valeur déjà présente (elle a peut-être été mise à jour par un robot).
 */
export async function seed(prisma) {
  // Année universitaire (une seule « en cours »).
  const annee = await prisma.anneeUniversitaire.upsert({
    where: { libelle: ANNEE.libelle },
    update: {},
    create: ANNEE,
  });

  // Profils.
  const profils = {};
  for (const p of PROFILS) {
    profils[p.code] = await prisma.profil.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
  }

  // Sources. Identifiées par `cle` (robot) ou par nom + organisme. Pour une source qui a un
  // robot, la configuration (adresse, fréquence…) est remise à jour : ce n'est pas une
  // « valeur » modifiée par les robots, c'est le réglage du robot lui-même.
  const sources = {};
  for (const [cle, { anciensNoms = [], valideParEditeur = false, ...s }] of Object.entries(
    SOURCES,
  )) {
    let existante = s.cle ? await prisma.source.findUnique({ where: { cle: s.cle } }) : null;
    existante ??= await prisma.source.findFirst({
      where: {
        OR: [{ nom: s.nom }, ...anciensNoms.map((nom) => ({ nom }))],
        organisme: s.organisme,
      },
    });
    existante ??= anciensNoms.length
      ? await prisma.source.findFirst({ where: { nom: { in: anciensNoms } } })
      : null;
    // Configuration seulement (nom, adresse, type, fréquence, licence) : jamais l'état ni l'empreinte.
    if (existante) existante = await prisma.source.update({ where: { id: existante.id }, data: s });
    sources[cle] = existante ?? (await prisma.source.create({ data: s }));
    // Réglages éditoriaux de CampusLens : validés par l'éditeur (ils ne dépendent d'aucune source externe).
    if (valideParEditeur && !sources[cle].dernierControle) {
      const maintenant = new Date();
      sources[cle] = await prisma.source.update({
        where: { id: sources[cle].id },
        data: { statut: 'ok', dernierControle: maintenant },
      });
      await prisma.parametre.updateMany({
        where: { sourceId: sources[cle].id, verifieLe: null },
        data: { verifieLe: maintenant },
      });
    }
  }

  // Paramètres de calcul.
  for (const p of PARAMETRES) {
    const profilId = p.profil ? profils[p.profil].id : null;
    const existant = await prisma.parametre.findFirst({
      where: { cle: p.cle, niveau: p.niveau, profilId, anneeId: annee.id },
    });
    if (!existant) {
      await prisma.parametre.create({
        data: {
          cle: p.cle,
          niveau: p.niveau,
          profilId,
          anneeId: annee.id,
          valeur: p.valeur,
          unite: p.unite,
          sourceId: sources[p.source].id,
          // Réglage éditorial : validé d'office par l'éditeur.
          ...(SOURCES[p.source].valideParEditeur && { verifieLe: new Date() }),
        },
      });
    } else if (!existant.verifieLe && existant.sourceId !== sources[p.source].id) {
      // Pas encore vérifié : on peut corriger sa source (jamais celle d'une valeur déjà vérifiée).
      await prisma.parametre.update({
        where: { id: existant.id },
        data: { sourceId: sources[p.source].id },
      });
    }
  }

  // Aides et éligibilités.
  const aides = {};
  for (const { elig, source: cleSource = 'fiches', ...a } of AIDES) {
    const donnees = { ...a, sourceId: sources[cleSource].id };
    let aide = await prisma.aide.findUnique({ where: { slug: a.slug } });
    // Une aide déjà vérifiée par un humain n'est JAMAIS modifiée par le seed ; sinon on applique les corrections.
    if (!aide) aide = await prisma.aide.create({ data: donnees });
    else if (!aide.verifieLe)
      aide = await prisma.aide.update({ where: { id: aide.id }, data: donnees });
    aides[a.slug] = aide;
    const modifiable = !aide.verifieLe;
    for (const [i, code] of UNIVERSEL.entries()) {
      const [statut, precision] = elig[i];
      await prisma.eligibilite.upsert({
        where: { aideId_profilId: { aideId: aide.id, profilId: profils[code].id } },
        update: modifiable ? { statut, precision } : {},
        create: { aideId: aide.id, profilId: profils[code].id, statut, precision },
      });
    }
  }

  // Postes de rentrée.
  for (const p of POSTES_RENTREE) {
    const existant = await prisma.posteRentree.findFirst({
      where: { nom: p.nom, anneeId: annee.id },
    });
    if (!existant) {
      await prisma.posteRentree.create({
        data: {
          anneeId: annee.id,
          nom: p.nom,
          montant: p.montant,
          astuce: p.astuce,
          aideId: p.aide ? aides[p.aide].id : null,
          sourceId: sources.fage.id,
        },
      });
    }
  }

  // Associations nationales.
  for (const a of ASSOCIATIONS) {
    const existante = await prisma.association.findFirst({ where: { nom: a.nom } });
    if (!existante) {
      await prisma.association.create({ data: { ...a, sourceId: sources.associations.id } });
    }
  }

  // Ressources (on pointe vers l'officiel, on ne copie aucun fichier).
  for (const r of RESSOURCES) {
    const existante = await prisma.ressource.findFirst({ where: { url: r.url, titre: r.titre } });
    if (!existante) {
      await prisma.ressource.create({ data: { ...r, sourceId: sources.ressources.id } });
    }
  }

  // Villes étudiantes : identité seulement. Loyers et nombre de résidences CROUS sont remplis
  // par les robots de synchronisation.
  for (const v of VILLES) {
    await prisma.ville.upsert({
      where: { codeInsee: v.codeInsee },
      update: {},
      create: { ...v, sourceId: sources.loyers.id },
    });
  }

  // Abonnements de transport étudiants : créés ou corrigés tant qu'ils ne sont pas vérifiés par un humain.
  for (const { codeInsee, source: cleSource, montantAnnuel, ...t } of TARIFS_TRANSPORT) {
    const ville = await prisma.ville.findUnique({ where: { codeInsee } });
    if (!ville) continue;
    const donnees = { ...t, montantAnnuel, sourceId: sources[cleSource].id };
    const existant = await prisma.tarifTransport.findUnique({ where: { villeId: ville.id } });
    if (!existant) await prisma.tarifTransport.create({ data: { villeId: ville.id, ...donnees } });
    else if (!existant.verifieLe)
      await prisma.tarifTransport.update({ where: { id: existant.id }, data: donnees });
  }
}
