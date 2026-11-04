import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('API : erreurs serveur', () => {
  afterEach(() => vi.restoreAllMocks());

  it('API-14 : erreur serveur simulée → 500 sans trace technique', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prismaCasse = {
      aide: {
        findMany: () => {
          throw new Error('connexion refusée à postgres://secret:motdepasse@db.interne:5432');
        },
      },
      profil: { findUnique: async () => ({ id: 1 }) },
    };
    const app = createApp({ prisma: prismaCasse });

    const res = await request(app).get('/api/aides?profil=fr_ue');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Une erreur est survenue.' });
    const texte = JSON.stringify(res.body) + JSON.stringify(res.headers);
    expect(texte).not.toMatch(/postgres|motdepasse|stack|\.js|Error:/i);
    expect(log).toHaveBeenCalled(); // le détail reste dans les logs du serveur
  });

  it('refuse de démarrer en production sans SESSION_SECRET', () => {
    expect(() => createApp({ prisma: {}, production: true, sessionSecret: undefined })).toThrow(
      /SESSION_SECRET/,
    );
  });
});
