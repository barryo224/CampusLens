import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { fausseSource } from '../helpers/sources.js';

// On remplace node-cron : on vérifie ce qui est planifié sans attendre l'heure.
const cron = vi.hoisted(() => ({ taches: [], arrets: 0 }));
vi.mock('node-cron', () => ({
  default: {
    schedule: (expression, fonction) => {
      cron.taches.push({ expression, fonction });
      return { stop: () => cron.arrets++ };
    },
  },
}));

const { demarrerPlanificateur } = await import('../../src/sync/planificateur.js');

describe('planificateur node-cron', () => {
  const prisma = prismaTest();
  beforeAll(async () => {
    await viderBase(prisma);
    await seed(prisma);
  });
  afterAll(() => prisma.$disconnect());

  it('planifie les robots toutes les heures et la maintenance chaque nuit, et s’arrête proprement', async () => {
    const journal = { log: vi.fn(), error: vi.fn() };
    const arreter = demarrerPlanificateur(prisma, { fetchImpl: fausseSource({}), journal });
    expect(cron.taches.map((t) => t.expression)).toEqual(['7 * * * *', '15 3 * * *']);
    // Les deux tâches se déclenchent sans lever d'erreur, même si toutes les sources répondent 404.
    cron.taches.forEach((t) => t.fonction());
    await new Promise((r) => setTimeout(r, 300));
    expect(journal.error).not.toHaveBeenCalled();
    arreter();
    expect(cron.arrets).toBe(2);
  });
});
