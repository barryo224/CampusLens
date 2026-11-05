import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { synchroniser } from '../../src/sync/moteur.js';
import { ROBOTS } from '../../src/sync/robots/index.js';
import { montantsAffiches } from '../../src/sync/robots/veilleTransport.js';
import { verifierToutesLesDonneesDeLaSource } from '../../src/admin/verification.js';
import { estAVerifier } from '../../src/lib/fraicheur.js';
import { fausseSource, pageHtml } from '../helpers/sources.js';

// Page de tarifs de Toulouse : 169,60 € l'an, 16 € le mois. La section « titres similaires » change à chaque visite.
const page = ({ annuel = '169,60', mensuel = '16', similaires = '4,90 €' } = {}) =>
  pageHtml(
    `<main><h1>Annuel étudiant</h1><p>Nouveau prix ${annuel} € ; pass 31 jours étudiant ${mensuel} €. ` +
      `${'Texte descriptif du titre de transport. '.repeat(12)}</p><aside>Titres similaires : ${similaires}</aside></main>`,
  );

describe('Veille des pages de tarifs de transport', () => {
  const prisma = prismaTest();
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
  });

  const robot = ROBOTS.veille_transport_toulouse;
  const source = () =>
    prisma.source.findUniqueOrThrow({ where: { cle: 'veille_transport_toulouse' } });
  const tarif = async () =>
    prisma.tarifTransport.findFirstOrThrow({ where: { sourceId: (await source()).id } });
  const lire = (options) =>
    synchroniser(prisma, robot, { fetchImpl: fausseSource({ tisseo: () => page(options) }) });

  async function verifier() {
    await verifierToutesLesDonneesDeLaSource(prisma, (await source()).id);
  }

  it('lit les montants en euros écrits à la française', () => {
    expect(montantsAffiches('1 200 € ou 19,95 € et 28€ ; 5,9 euros ; 120 euros')).toEqual([
      '5.90',
      '19.95',
      '28',
      '120',
      '1200',
    ]);
  });

  it('première lecture = référence ; page inchangée ou section « similaires » modifiée → aucune alerte', async () => {
    await verifier();
    expect((await lire()).statut).toBe('aucun_changement');
    expect((await lire({ similaires: '12,80 € 59 €' })).statut).toBe('aucun_changement'); // bruit : ignoré
    expect(await prisma.changementDetecte.count()).toBe(0);
    expect((await tarif()).verifieLe).not.toBeNull();
    expect(estAVerifier(await source(), (await tarif()).verifieLe)).toBe(false);
  });

  it('le réseau change son prix : alerte, tarifs du réseau repassent en « vérification en cours »', async () => {
    await verifier();
    await lire();
    const r = await lire({ annuel: '175,00' }); // 169,60 € a disparu de la page
    expect(r.statut).toBe('en_attente_validation');
    const alerte = await prisma.changementDetecte.findFirstOrThrow({
      where: { statut: 'a_valider' },
    });
    expect(alerte.resume).toContain('169.60');
    expect((await tarif()).verifieLe).toBeNull();
    // Les anciens prix restent affichés (jamais effacés), mais la mention revient.
    expect(Number((await tarif()).montantAnnuel)).toBe(169.6);
    expect(estAVerifier(await source(), (await tarif()).verifieLe)).toBe(true);
    // Même page le lendemain : pas de nouvelle alerte.
    expect((await lire({ annuel: '175,00' })).statut).toBe('aucun_changement');
    expect(await prisma.changementDetecte.count()).toBe(1);
  });

  it('page illisible (vide, 403, sans montant) : échec enregistré, tarifs conservés, mention qui revient', async () => {
    await verifier();
    await lire();
    const vide = await synchroniser(prisma, robot, {
      fetchImpl: fausseSource({ tisseo: () => pageHtml('<main>Chargement…</main>') }),
    });
    expect(vide.statut).toBe('echec');
    const interdit = await synchroniser(prisma, robot, { fetchImpl: fausseSource({}) });
    expect(interdit.statut).toBe('echec');
    expect(Number((await tarif()).montantAnnuel)).toBe(169.6);
    expect(estAVerifier(await source(), (await tarif()).verifieLe)).toBe(true);
  });

  it('25 réseaux surveillés, vérifiables à la main (jamais « gérés par un robot »)', async () => {
    const sources = await prisma.source.findMany({
      where: { cle: { startsWith: 'veille_transport_' } },
    });
    expect(sources).toHaveLength(25);
    expect(sources.every((s) => ROBOTS[s.cle]?.veilleVerification === true)).toBe(true);
    expect(sources.every((s) => s.frequenceHeures === 72)).toBe(true);
  });
});
