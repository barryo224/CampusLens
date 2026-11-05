import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { synchroniser } from '../../src/sync/moteur.js';
import { ROBOTS } from '../../src/sync/robots/index.js';
import { sourcesDues } from '../../src/sync/planificateur.js';
import {
  verifierToutesLesDonneesDeLaSource,
  listerAVerifier,
} from '../../src/admin/verification.js';
import { estAVerifier } from '../../src/lib/fraicheur.js';
import { fausseSource, pageHtml } from '../helpers/sources.js';

const page = (texte) => pageHtml(`<main><h1>Garantie Visale</h1><p>${texte.repeat(40)}</p></main>`);

describe('Veille des pages dont les données sont vérifiées à la main', () => {
  const prisma = prismaTest();
  beforeAll(async () => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
  });

  const robot = ROBOTS.veille_visale;
  const visale = () => prisma.aide.findUniqueOrThrow({ where: { slug: 'garantie-visale' } });
  const src = () => prisma.source.findUniqueOrThrow({ where: { cle: 'veille_visale' } });
  const fetchPage = (texte) => fausseSource({ F33453: () => page(texte) });

  async function verifierVisale() {
    const s = await src();
    await verifierToutesLesDonneesDeLaSource(prisma, s.id);
  }

  it('la première lecture sert de référence, sans alerte ni changement de vérification', async () => {
    await verifierVisale();
    const r = await synchroniser(prisma, robot, { fetchImpl: fetchPage('Version A. ') });
    expect(r.statut).toBe('aucun_changement');
    expect((await src()).empreinte).not.toBeNull();
    expect(await prisma.changementDetecte.count()).toBe(0);
    expect((await visale()).verifieLe).not.toBeNull();
  });

  it('page inchangée : la vérification reste valable et la mention ne revient pas', async () => {
    await verifierVisale();
    await synchroniser(prisma, robot, { fetchImpl: fetchPage('Version A. ') });
    const r = await synchroniser(prisma, robot, { fetchImpl: fetchPage('Version A. ') });
    expect(r.statut).toBe('aucun_changement');
    expect(estAVerifier(await src(), (await visale()).verifieLe)).toBe(false);
  });

  it('page modifiée : alerte créée, vérification annulée (journalisée), nouvelle référence enregistrée', async () => {
    await verifierVisale();
    await synchroniser(prisma, robot, { fetchImpl: fetchPage('Version A. ') });
    const r = await synchroniser(prisma, robot, { fetchImpl: fetchPage('Version B. ') });
    expect(r.statut).toBe('en_attente_validation');
    expect(await prisma.changementDetecte.count({ where: { statut: 'a_valider' } })).toBe(1);
    expect((await visale()).verifieLe).toBeNull();
    const journal = await prisma.historiqueValeur.findFirst({
      where: {
        tableCible: 'aide',
        ligneId: String((await visale()).id),
        champ: 'verifieLe',
        nouvelleValeur: null,
      },
    });
    expect(journal).not.toBeNull();
    // Elle réapparaît dans « Données à vérifier » ; la même page ne re-signale rien.
    const items = await listerAVerifier(prisma);
    expect(items.some((i) => i.type === 'aide' && i.libelle.startsWith('Garantie Visale'))).toBe(
      true,
    );
    const encore = await synchroniser(prisma, robot, { fetchImpl: fetchPage('Version B. ') });
    expect(encore.statut).toBe('aucun_changement');
    expect(await prisma.changementDetecte.count()).toBe(1);
  });

  it('une source sous veille reste vérifiable à la main (jamais « gérée par un robot »)', async () => {
    const items = await listerAVerifier(prisma);
    const idSource = (await src()).id;
    expect(items.some((i) => i.source.id === idSource)).toBe(true);
    await expect(verifierVisale()).resolves.toBeUndefined();
  });

  it('page en erreur : la source passe en erreur donc la mention revient', async () => {
    await verifierVisale();
    await synchroniser(prisma, robot, { fetchImpl: fetchPage('Version A. ') });
    const r = await synchroniser(prisma, robot, { fetchImpl: fausseSource({}) });
    expect(r.statut).toBe('echec');
    expect(estAVerifier(await src(), (await visale()).verifieLe)).toBe(true);
  });

  it('contrôlée au moins une fois par jour, et plafond de 180 jours pour toute vérification', async () => {
    const s = await src();
    const maintenant = new Date('2026-11-10T12:00:00Z');
    const hier = new Date(maintenant.getTime() - 25 * 3_600_000);
    expect(sourcesDues([{ ...s, dernierControle: hier }], maintenant)).toHaveLength(1);
    const recent = new Date(maintenant.getTime() - 3_600_000);
    expect(sourcesDues([{ ...s, dernierControle: recent }], maintenant)).toHaveLength(0);

    const ancienne = new Date(maintenant.getTime() - 181 * 24 * 3_600_000);
    const sourceOk = { statut: 'ok', dernierControle: maintenant, frequenceHeures: 72 };
    expect(estAVerifier(sourceOk, ancienne, maintenant)).toBe(true);
    expect(
      estAVerifier(sourceOk, new Date(maintenant.getTime() - 100 * 24 * 3_600_000), maintenant),
    ).toBe(false);
  });
});
