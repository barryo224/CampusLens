import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { synchroniser } from '../../src/sync/moteur.js';
import { ROBOTS } from '../../src/sync/robots/index.js';
import { verifierToutesLesDonneesDeLaSource } from '../../src/admin/verification.js';
import { estAVerifier } from '../../src/lib/fraicheur.js';
import { estBlocageRobot } from '../../src/sync/blocage.js';
import { fausseSource, pageHtml, reponse } from '../helpers/sources.js';

const JOUR = 24 * 3_600_000;
const page = pageHtml(`<main><h1>Garantie Visale</h1><p>${'Version A. '.repeat(40)}</p></main>`);

describe('estBlocageRobot', () => {
  it('reconnaît un refus (401, 403, 429) et une connexion coupée, pas une vraie panne', () => {
    for (const c of [401, 403, 429])
      expect(estBlocageRobot(new Error(`La source a répondu ${c} : x`))).toBe(true);
    expect(estBlocageRobot(new Error('Source injoignable (erreur réseau) : x'))).toBe(true);
    expect(estBlocageRobot(new Error('La source a répondu 500 : x'))).toBe(false);
    expect(estBlocageRobot(new Error('La source a répondu 404 : x'))).toBe(false);
    expect(estBlocageRobot(new Error('Source injoignable (délai dépassé) : x'))).toBe(false);
    expect(estBlocageRobot(null)).toBe(false);
  });
});

describe('estAVerifier : source dont le site refuse les robots', () => {
  const maintenant = new Date('2026-11-10T12:00:00Z');
  const il = (jours) => new Date(maintenant.getTime() - jours * JOUR);
  const bloquee = { statut: 'ok', bloqueRobot: true, dernierControle: il(40), frequenceHeures: 24 };

  it('une vérification humaine reste valable 90 jours, même sans aucun contrôle du robot', () => {
    expect(estAVerifier(bloquee, il(1), maintenant)).toBe(false);
    expect(estAVerifier(bloquee, il(60), maintenant)).toBe(false);
    expect(estAVerifier(bloquee, il(89), maintenant)).toBe(false);
  });
  it('au-delà de 90 jours (et non 180), elle repasse « à vérifier »', () => {
    expect(estAVerifier(bloquee, il(91), maintenant)).toBe(true);
  });
  it('jamais vérifiée, ou source en erreur : toujours « à vérifier »', () => {
    expect(estAVerifier(bloquee, null, maintenant)).toBe(true);
    expect(estAVerifier({ ...bloquee, statut: 'erreur' }, il(1), maintenant)).toBe(true);
  });
  it('une source normale garde la règle d’avant (contrôle au moins à sa fréquence, plafond 180 jours)', () => {
    const normale = { ...bloquee, bloqueRobot: false };
    expect(estAVerifier(normale, il(1), maintenant)).toBe(true); // dernier contrôle il y a 40 jours > 24 h
    expect(estAVerifier({ ...normale, dernierControle: maintenant }, il(100), maintenant)).toBe(
      false,
    );
    expect(estAVerifier({ ...normale, dernierControle: maintenant }, il(181), maintenant)).toBe(
      true,
    );
  });
});

describe('Passage du robot sur un site qui le refuse', () => {
  const prisma = prismaTest();
  beforeAll(async () => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
  });
  const robot = ROBOTS.veille_visale;
  const src = () => prisma.source.findUniqueOrThrow({ where: { cle: 'veille_visale' } });
  const visale = () => prisma.aide.findUniqueOrThrow({ where: { slug: 'garantie-visale' } });
  const verifierAMain = async () => verifierToutesLesDonneesDeLaSource(prisma, (await src()).id);

  it('403 : la source n’est PAS mise en erreur, elle est marquée bloquée, et la vérification faite à la main tient', async () => {
    await verifierAMain();
    const r = await synchroniser(prisma, robot, {
      fetchImpl: fausseSource({ F33453: () => reponse({ status: 403 }) }),
    });
    expect(r.statut).toBe('echec');
    const s = await src();
    expect(s.bloqueRobot).toBe(true);
    expect(s.statut).toBe('ok');
    expect(estAVerifier(s, (await visale()).verifieLe)).toBe(false);
    // Plus de 24 h après : le robot n'a rien pu contrôler, mais la vérification humaine vaut toujours.
    const dans3Jours = new Date(Date.now() + 3 * JOUR);
    expect(estAVerifier(s, (await visale()).verifieLe, dans3Jours)).toBe(false);
    const dans91Jours = new Date(Date.now() + 91 * JOUR);
    expect(estAVerifier(s, (await visale()).verifieLe, dans91Jours)).toBe(true);
  });

  it('connexion coupée : même traitement', async () => {
    await verifierAMain();
    await synchroniser(prisma, robot, {
      fetchImpl: fausseSource({ F33453: () => new Error('fetch failed') }),
    });
    const s = await src();
    expect(s.bloqueRobot).toBe(true);
    expect(s.statut).toBe('ok');
  });

  it('une vraie panne (500) met la source en erreur et ne la déclare pas bloquée', async () => {
    await verifierAMain();
    await synchroniser(prisma, robot, {
      fetchImpl: fausseSource({ F33453: () => reponse({ status: 500 }) }),
    });
    const s = await src();
    expect(s.bloqueRobot).toBe(false);
    expect(s.statut).toBe('erreur');
    expect(estAVerifier(s, (await visale()).verifieLe)).toBe(true);
  });

  it('dès que la page redevient lisible, le blocage est levé et la règle normale revient', async () => {
    await verifierAMain();
    await synchroniser(prisma, robot, {
      fetchImpl: fausseSource({ F33453: () => reponse({ status: 403 }) }),
    });
    expect((await src()).bloqueRobot).toBe(true);
    const r = await synchroniser(prisma, robot, {
      fetchImpl: fausseSource({ F33453: () => page }),
    });
    expect(r.statut).toBe('aucun_changement');
    const s = await src();
    expect(s.bloqueRobot).toBe(false);
    expect(s.statut).toBe('ok');
  });
});
