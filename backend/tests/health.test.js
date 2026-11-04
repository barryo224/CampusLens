import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('API de base', () => {
  const app = createApp({ prisma: {}, corsOrigin: 'http://localhost:5173' });

  it('GET /api/health répond 200 { status: "ok" }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('envoie les en-têtes de sécurité Helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('route inconnue : 404 JSON', async () => {
    const res = await request(app).get('/api/nexiste-pas');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});
