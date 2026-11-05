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
  for (const [cle, { anciensNoms = [], ...s }] of Object.entries(SOURCES)) {
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
    if (existante && s.cle) {
      const { cle: cleRobot, ...config } = s;
      existante = await prisma.source.update({
        where: { id: existante.id },
        data: { ...config, cle: cleRobot },
      });
    }
    sources[cle] = existante ?? (await prisma.source.create({ data: s }));
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
        },
      });
    }
  }

  // Aides et éligibilités.
  const aides = {};
  for (const { elig, ...a } of AIDES) {
    aides[a.slug] = await prisma.aide.upsert({
      where: { slug: a.slug },
      update: {},
      create: { ...a, sourceId: sources.fiches.id },
    });
    for (const [i, code] of UNIVERSEL.entries()) {
      const [statut, precision] = elig[i];
      await prisma.eligibilite.upsert({
        where: { aideId_profilId: { aideId: aides[a.slug].id, profilId: profils[code].id } },
        update: {},
        create: { aideId: aides[a.slug].id, profilId: profils[code].id, statut, precision },
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
}
