import { describe, it, expect } from 'vitest';
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

  it('l’image est une adresse complète (obligatoire pour les réseaux sociaux) vers un fichier qui existe', () => {
    const image = meta('og:image');
    expect(image).toMatch(/^https:\/\/[^/]+\/og-image\.jpg$/);
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
