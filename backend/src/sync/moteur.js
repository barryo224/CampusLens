import { empreinte as hash } from './outils.js';

const DELAI_VERROU_MS = 30 * 60 * 1000; // une synchronisation « en cours » depuis plus longtemps est considérée comme morte

/** Message d'erreur sûr à stocker et afficher (jamais de trace technique). */
import { estBlocageRobot } from './blocage.js';

const messageSur = (e) => String(e?.message ?? 'Erreur inconnue').slice(0, 300);

const estConflitUnique = (e) =>
  e?.code === 'P2002' || e?.cause?.code === '23505' || /unique/i.test(e?.message ?? '');

/**
 * Exécute UN passage de robot sur UNE source (spécification, section 6) :
 * verrou → téléchargement → validation Zod → comparaison d'empreinte → application ou alerte.
 *
 * Garanties :
 *  - une erreur (source injoignable, format inattendu) ne modifie JAMAIS les données ;
 *  - deux robots sur la même source : un seul s'exécute (verrou en base) ;
 *  - chaque modification est écrite dans historique_valeur.
 *
 * @param robot { cle, niveau (1 | 3), telecharger, analyser, appliquer | proposer }
 */
export async function synchroniser(
  prisma,
  robot,
  { fetchImpl = fetch, maintenant = () => new Date() } = {},
) {
  const source = await prisma.source.findUnique({ where: { cle: robot.cle } });
  if (!source) throw new Error(`Aucune source configurée pour le robot « ${robot.cle} ».`);

  // 1. Verrou : on libère d'abord un verrou périmé (processus planté), puis on tente de poser le nôtre.
  await prisma.synchronisation.updateMany({
    where: {
      sourceId: source.id,
      statut: 'en_cours',
      debut: { lt: new Date(maintenant().getTime() - DELAI_VERROU_MS) },
    },
    data: { statut: 'echec', fin: maintenant(), messageErreur: 'Interrompue (verrou périmé).' },
  });
  let passage;
  try {
    passage = await prisma.synchronisation.create({
      data: { sourceId: source.id, statut: 'en_cours', debut: maintenant() },
    });
  } catch (e) {
    if (estConflitUnique(e))
      return {
        statut: 'ignoree',
        raison: 'Une synchronisation est déjà en cours pour cette source.',
      };
    throw e;
  }

  const terminer = (statut, extra = {}) =>
    prisma.synchronisation.update({
      where: { id: passage.id },
      data: { statut, fin: maintenant(), ...extra },
    });

  try {
    // 2. Téléchargement puis validation du format (Zod) : en cas d'échec, on s'arrête ici.
    const brut = await robot.telecharger({ source, fetchImpl, prisma });
    // La page a pu être lue : le site n'est (plus) fermé aux robots.
    if (source.bloqueRobot)
      await prisma.source.update({ where: { id: source.id }, data: { bloqueRobot: false } });
    const donnees = await robot.analyser(brut, { source, prisma });
    const nouvelleEmpreinte = (robot.empreinte ?? hash)(brut.contenu);
    const now = maintenant();

    // 3. Rien n'a changé : on note seulement la date de contrôle.
    if (nouvelleEmpreinte === source.empreinte) {
      await prisma.source.update({
        where: { id: source.id },
        data: { dernierControle: now, statut: 'ok' },
      });
      await terminer('aucun_changement', { nbChangements: 0 });
      return { statut: 'aucun_changement', nbChangements: 0, synchronisationId: passage.id };
    }

    // 4a. Niveaux 1 et 2 : on enregistre et on journalise chaque différence.
    if (robot.niveau === 1) {
      const nb = await prisma.$transaction(
        async (tx) => {
          const changements = await robot.appliquer({ tx, source, donnees, now });
          for (const c of changements) {
            await tx.historiqueValeur.create({
              data: {
                tableCible: c.table,
                ligneId: String(c.ligneId),
                champ: c.champ,
                ancienneValeur:
                  c.ancienne === null || c.ancienne === undefined ? null : String(c.ancienne),
                nouvelleValeur:
                  c.nouvelle === null || c.nouvelle === undefined ? null : String(c.nouvelle),
                synchronisationId: passage.id,
                changeLe: now,
              },
            });
          }
          await tx.source.update({
            where: { id: source.id },
            data: {
              empreinte: nouvelleEmpreinte,
              dernierControle: now,
              dernierChangement: now,
              statut: 'ok',
            },
          });
          return changements.length;
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
      await terminer('succes', { nbChangements: nb });
      return { statut: 'succes', nbChangements: nb, synchronisationId: passage.id };
    }

    // 4a bis. Veille d'une page vérifiée à la main : la première lecture sert de référence (rien à signaler) ;
    // ensuite, un changement de la page annule les vérifications des données qui en dépendent.
    if (robot.veilleVerification && !source.empreinte) {
      await prisma.source.update({
        where: { id: source.id },
        data: { empreinte: nouvelleEmpreinte, dernierControle: now, statut: 'ok' },
      });
      await terminer('aucun_changement', { nbChangements: 0 });
      return { statut: 'aucun_changement', nbChangements: 0, synchronisationId: passage.id };
    }

    // 4b. Niveau 3 : on ne touche à aucune valeur, on prévient l'administrateur.
    const proposition = await robot.proposer({
      source,
      donnees,
      prisma,
      ancienneEmpreinte: source.empreinte,
    });
    const dejaSignale = await prisma.changementDetecte.findFirst({
      where: { sourceId: source.id, statut: 'a_valider', nouvelleEmpreinte },
    });
    if (!dejaSignale) {
      await prisma.changementDetecte.create({
        data: {
          sourceId: source.id,
          synchronisationId: passage.id,
          resume: proposition.resume,
          ancienneEmpreinte: source.empreinte,
          nouvelleEmpreinte,
          tableCible: proposition.suggestions?.length ? 'parametre' : null,
          champ: proposition.suggestions?.length ? 'valeur' : null,
          valeurProposee: proposition.suggestions?.length
            ? JSON.stringify(proposition.suggestions)
            : null,
        },
      });
    }
    if (robot.veilleVerification) {
      await annulerVerifications(prisma, source, passage.id, now);
    }
    await prisma.source.update({
      where: { id: source.id },
      data: {
        dernierControle: now,
        statut: 'ok',
        // Veille : la nouvelle page devient la référence (l'alerte est déjà créée, on ne la répète pas).
        ...(robot.veilleVerification && { empreinte: nouvelleEmpreinte, dernierChangement: now }),
      },
    });
    await terminer('en_attente_validation', { nbChangements: dejaSignale ? 0 : 1 });
    return {
      statut: 'en_attente_validation',
      nbChangements: dejaSignale ? 0 : 1,
      synchronisationId: passage.id,
    };
  } catch (e) {
    // Échec : données conservées, nouvel essai au prochain passage. Si le site refuse simplement les robots du serveur,
    // la source n'est PAS mise « en erreur » : une vérification faite à la main reste valable (voir lib/fraicheur.js).
    await prisma.source.update({
      where: { id: source.id },
      data: estBlocageRobot(e) ? { bloqueRobot: true } : { statut: 'erreur' },
    });
    await terminer('echec', { messageErreur: messageSur(e) });
    return { statut: 'echec', message: messageSur(e), synchronisationId: passage.id };
  }
}

const MODELES_VERIFIES = [
  ['parametre', 'parametre'],
  ['aide', 'aide'],
  ['posteRentree', 'poste_rentree'],
  ['association', 'association'],
  ['tarifTransport', 'tarif_transport'],
];

/** La page source a changé : les données vérifiées qui en dépendent repassent en « vérification en cours ». */
async function annulerVerifications(prisma, source, synchronisationId, now) {
  for (const [modele, table] of MODELES_VERIFIES) {
    const lignes = await prisma[modele].findMany({
      where: { sourceId: source.id, verifieLe: { not: null } },
    });
    for (const l of lignes) {
      await prisma.historiqueValeur.create({
        data: {
          tableCible: table,
          ligneId: String(l.id),
          champ: 'verifieLe',
          ancienneValeur: l.verifieLe.toISOString(),
          nouvelleValeur: null,
          synchronisationId,
          changeLe: now,
        },
      });
      await prisma[modele].update({ where: { id: l.id }, data: { verifieLe: null } });
    }
  }
}
