import { describe, it, expect } from 'vitest';
import {
  lireCsv,
  texteDepuisHtml,
  nombreFr,
  normaliserNom,
  empreinte,
  arrondir2,
  communeDeResidence,
} from '../../src/sync/outils.js';
import { extraireDroits, extraireCvec } from '../../src/sync/robots/pagesOfficielles.js';
import { telecharger, ErreurSource } from '../../src/sync/http.js';
import { reponse, fausseSource } from '../helpers/sources.js';

describe('outils de lecture des sources', () => {
  it('lit un CSV réel : séparateur « ; », guillemets, fins de ligne Windows', () => {
    const csv = '"id";"nom";"loy"\r\n"1";"La Haute-Beaume";9,75\r\n"2";"Dit ""Bonjour"""; 12,5\r\n';
    const l = lireCsv(csv);
    expect(l).toHaveLength(2);
    expect(l[0]).toEqual({ id: '1', nom: 'La Haute-Beaume', loy: '9,75' });
    expect(l[1].nom).toBe('Dit "Bonjour"');
    expect(lireCsv('')).toEqual([]);
    expect(lireCsv('﻿a,b\n1,2', { separateur: ',' })[0]).toEqual({ a: '1', b: '2' }); // BOM retiré
    expect(lireCsv('a;b\n1')[0]).toEqual({ a: '1', b: '' }); // ligne courte : champ vide, pas d'erreur
  });

  it('nombreFr : virgule française, rejette le reste', () => {
    expect(nombreFr('9,75')).toBe(9.75);
    expect(nombreFr(' 12 ')).toBe(12);
    expect(nombreFr('-3.5')).toBe(-3.5);
    for (const x of ['', 'abc', '1e5', '1,2,3', '12 €'])
      expect(Number.isNaN(nombreFr(x)), x).toBe(true);
  });

  it('arrondir2 et normaliserNom', () => {
    expect(arrondir2(14.8749)).toBe(14.87);
    expect(arrondir2(297.4)).toBe(297.4);
    expect(normaliserNom('Saint-Étienne')).toBe(normaliserNom('SAINT ETIENNE'));
    expect(normaliserNom(null)).toBe('');
  });

  it('empreinte : stable pour un même contenu, différente sinon', () => {
    expect(empreinte('a')).toBe(empreinte('a'));
    expect(empreinte('a')).not.toBe(empreinte('b'));
    expect(empreinte('a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('texteDepuisHtml : garde le contenu utile, retire menus, scripts, pieds de page et commentaires', () => {
    const t = texteDepuisHtml(
      '<html><nav>Menu</nav><main><h1>Titre</h1><p>Un&nbsp;texte &amp; un&euro; &#233;t&#xe9;</p><script>x()</script><ul><li>a</li><li>b</li></ul></main><footer>Pied</footer></html>',
    );
    expect(t).toBe('Titre\nUn texte & un€ été\na\nb');
    expect(texteDepuisHtml('<body><p>Sans main</p><style>p{}</style></body>')).toBe('Sans main');
    expect(texteDepuisHtml('<p>Encodé deux fois : l&amp;eacute;gal</p>')).toBe(
      'Encodé deux fois : légal',
    );
  });

  it('extracteurs : rien de trouvé → aucune suggestion', () => {
    expect(extraireDroits('Page sans tableau', { parametres: [] })).toEqual([]);
    expect(extraireCvec('Rien ici', { parametres: [] })).toEqual([]);
  });
});

describe('client HTTP des robots', () => {
  it('renvoie le texte, ou les octets en mode binaire, avec l’adresse finale', async () => {
    const f = fausseSource({
      ok: () => reponse({ texte: 'bonjour', url: 'https://x.test/final', redirige: true }),
    });
    const r = await telecharger('https://x.test/ok', { fetchImpl: f });
    expect(r).toMatchObject({ texte: 'bonjour', url: 'https://x.test/final', redirige: true });
    const b = await telecharger('https://x.test/ok', { fetchImpl: f, binaire: true });
    expect(b.octets).toBeInstanceOf(Uint8Array);
  });
  it('lève ErreurSource sur 4xx/5xx, délai dépassé et panne réseau', async () => {
    await expect(
      telecharger('https://x.test/404', { fetchImpl: fausseSource({}) }),
    ).rejects.toThrow(/404/);
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    await expect(
      telecharger('https://x.test/a', { fetchImpl: fausseSource({ a: timeout }) }),
    ).rejects.toThrow(/délai dépassé/);
    await expect(
      telecharger('https://x.test/a', { fetchImpl: fausseSource({ a: new Error('boom') }) }),
    ).rejects.toBeInstanceOf(ErreurSource);
  });
});

describe('communeDeResidence', () => {
  it.each([
    ['8 rue Rollin 75005 Paris', 'Paris 05', 'paris'],
    ['3, rue de l’Annapurna - 92 160 Antony', 'Hauts-de-Seine', 'antony'],
    ['3 rue Notre-Dame de Lourdes, Nancy', 'Nancy', 'nancy'],
    ['x 69007 Lyon cedex 07', 'Lyon 7ème', 'lyon'],
    ['', 'Lyon 8ème', 'lyon'],
    ['', 'Paris 18', 'paris'],
    ['Campus 74940 Annecy-Le-Vieux', 'Annecy', 'annecy'],
    ['1 rue 59370 Mons-en-Barœul', 'Nord', 'mons en baroeul'],
  ])('%s / %s → %s', (address, zone, attendu) => {
    expect(communeDeResidence({ address, zone })).toBe(attendu);
  });
});
