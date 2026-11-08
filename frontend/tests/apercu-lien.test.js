import { describe, it, expect } from 'vitest';
import { motifDeSource } from '../../scripts/motif-vercel.mjs';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const racine = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(racine, 'index.html'), 'utf8');

describe('Aperçu du lien partagé (WhatsApp, iMessage, Facebook, LinkedIn, X…)', () => {
  const meta = (cle) =>
    html.match(new RegExp(`<meta\\s+(?:property|name)="${cle}"\\s+content="([^"]*)"`, 's'))?.[1];

  it('annonce un titre, une description et une grande image', () => {
    expect(meta('og:title')).toMatch(/CampusLens/);
    expect(meta('og:description')?.length).toBeGreaterThan(40);
    expect(meta('og:type')).toBe('website');
    expect(meta('twitter:card')).toBe('summary_large_image');
  });

  it('déclare l’adresse canonique de l’accueil, identique à og:url et au plan du site', () => {
    const canonique = html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/s)?.[1];
    expect(canonique).toMatch(/^https:\/\/[^/]+\/$/);
    expect(canonique).toBe(meta('og:url'));
    const plan = readFileSync(resolve(racine, 'public', 'sitemap.xml'), 'utf8');
    expect(plan).toContain(`<loc>${canonique}</loc>`);
  });

  it('l’image est une adresse complète (obligatoire pour les réseaux sociaux) vers un fichier qui existe', () => {
    const image = meta('og:image');
    expect(image).toMatch(/^https:\/\/[^/]+\/og-image\.jpg(\?v=\d+)?$/); // « ?v=N » : change quand l'image change (les messageries gardent l'ancienne en cache)
    expect(meta('twitter:image')).toBe(image);
    const fichier = resolve(racine, 'public', 'og-image.jpg');
    const octets = statSync(fichier).size;
    expect(octets).toBeGreaterThan(10_000);
    expect(octets).toBeLessThan(300_000); // WhatsApp ignore les images trop lourdes
  });

  it('l’image fait 1200 × 630 (format recommandé)', () => {
    const jpeg = readFileSync(resolve(racine, 'public', 'og-image.jpg'));
    // Marqueur de taille JPEG (SOF0/SOF2) : hauteur puis largeur.
    let i = 2;
    while (i < jpeg.length) {
      const marqueur = jpeg[i + 1];
      if (marqueur === 0xc0 || marqueur === 0xc2) {
        expect([jpeg.readUInt16BE(i + 7), jpeg.readUInt16BE(i + 5)]).toEqual([1200, 630]);
        return;
      }
      i += 2 + jpeg.readUInt16BE(i + 2);
    }
    throw new Error('Taille du JPEG introuvable');
  });
});

describe('Référencement : tout mène à la page d’accueil', () => {
  const sitemap = readFileSync(resolve(racine, 'public', 'sitemap.xml'), 'utf8');
  const robots = readFileSync(resolve(racine, 'public', 'robots.txt'), 'utf8');
  const vercel = JSON.parse(readFileSync(resolve(racine, 'vercel.json'), 'utf8'));

  it('le plan du site ne contient que la page d’accueil', () => {
    const adresses = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(adresses).toEqual(['https://campuslens-etudiants.vercel.app/']);
  });

  it('les autres pages publiques demandent à Google de ne pas être indexées ; l’accueil, non', () => {
    const motifs = vercel.headers
      .filter((h) =>
        h.headers.some(
          (x) => x.key === 'X-Robots-Tag' && /noindex/.test(x.value) && /evaluer/.test(h.source),
        ),
      )
      .map((h) => motifDeSource(h.source));
    expect(motifs.length, 'règles noindex des pages intérieures').toBeGreaterThan(0);
    const bloquee = (chemin) => motifs.some((m) => m.test(chemin));
    for (const chemin of [
      '/evaluer',
      '/aides',
      '/budget',
      '/ressources',
      '/a-propos',
      '/contact',
      '/avis',
      '/mentions-legales',
      '/aides/',
    ])
      expect(bloquee(chemin), chemin).toBe(true);
    expect(bloquee('/')).toBe(false);
    expect(bloquee('/assets/index.js')).toBe(false);
    // Aucune règle générale (« /(.*) ») ne doit interdire l'indexation de l'accueil.
    const generale = vercel.headers.find((h) => h.source === '/(.*)');
    expect(generale.headers.some((x) => x.key === 'X-Robots-Tag')).toBe(false);
    // L'administration est exclue, y compris l'adresse « /admin » seule.
    const admin = vercel.headers.find((h) => h.source.startsWith('/admin'));
    expect(motifDeSource(admin.source).test('/admin')).toBe(true);
    expect(motifDeSource(admin.source).test('/admin/messages')).toBe(true);
  });

  it('robots.txt interdit l’administration et l’API, et indique le plan du site', () => {
    expect(robots).toMatch(/Disallow: \/admin/);
    expect(robots).toMatch(/Disallow: \/api\//);
    expect(robots).toMatch(/Sitemap: https:\/\/campuslens-etudiants\.vercel\.app\/sitemap\.xml/);
  });
});
