import { describe, it, expect, vi, afterEach } from 'vitest';
import { get, post, ErreurApi } from '../src/lib/api.js';

afterEach(() => vi.unstubAllGlobals());
const reponse = (ok, status, corps) => ({ ok, status, json: async () => corps });

describe('client API', () => {
  it('get renvoie le JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reponse(true, 200, { a: 1 })),
    );
    expect(await get('/x')).toEqual({ a: 1 });
  });
  it('get : réseau coupé / statut d’erreur / JSON cassé → ErreurApi lisible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(get('/x')).rejects.toBeInstanceOf(ErreurApi);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reponse(false, 500, {})),
    );
    await expect(get('/x')).rejects.toMatchObject({ status: 500 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('x');
        },
      })),
    );
    await expect(get('/x')).rejects.toBeInstanceOf(ErreurApi);
  });
  it('get : une requête annulée n’est pas une erreur d’affichage', async () => {
    const abandon = Object.assign(new Error('abandon'), { name: 'AbortError' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw abandon;
      }),
    );
    await expect(get('/x')).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('post : succès, 429 et erreur de validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reponse(true, 201, { message: 'ok' })),
    );
    expect(await post('/contact', {})).toEqual({ message: 'ok' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reponse(false, 429, {})),
    );
    await expect(post('/x', {})).rejects.toThrow(/Trop de demandes/);
    await expect(post('/contact', {}, { message429: 'Trop de messages envoyés.' })).rejects.toThrow(
      /Trop de messages/,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reponse(false, 400, { error: 'e-mail invalide' })),
    );
    await expect(post('/contact', {})).rejects.toThrow('e-mail invalide');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('x');
      }),
    );
    await expect(post('/contact', {})).rejects.toBeInstanceOf(ErreurApi);
  });
});
