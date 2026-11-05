// Génère backend/src/seed/villes.js : les communes où le CNOUS recense au moins une résidence CROUS,
// plus quelques villes universitaires sans résidence (Corse comprise), avec leur code INSEE et leur région
// (API officielle geo.api.gouv.fr). À relancer quand de nouvelles résidences apparaissent : `node scripts/generer-villes.mjs`.
import { writeFile } from 'node:fs/promises';
import { communeDeResidence } from '../backend/src/sync/outils.js';
import { normaliserNom } from '../backend/src/sync/outils.js';

const CROUS =
  'https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr_crous_logement_france_entiere/exports/json?select=id%2Ctitle%2Czone%2Caddress&limit=-1';
// Villes universitaires à suivre même sans résidence CROUS recensée.
const EN_PLUS = ['Ajaccio', 'Bastia', 'Corte', 'Cergy', 'Nanterre', 'Saint-Denis', 'Créteil'];

const json = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

const residences = await json(CROUS);
const parNom = new Map(); // nom normalisé → { codePostal }
for (const r of residences) {
  const cle = communeDeResidence(r);
  if (!cle) continue;
  const cp = String(r.address ?? '').match(/\b(\d{2})\s?(\d{3})\b/);
  if (!parNom.has(cle)) parNom.set(cle, cp ? cp[1] + cp[2] : null);
}
for (const nom of EN_PLUS)
  if (!parNom.has(normaliserNom(nom))) parNom.set(normaliserNom(nom), null);
// Paris, Lyon et Marseille : communes à part entière (arrondissements regroupés au chargement des loyers).
const retenues = new Map();
const introuvables = [];
for (const [cle, cp] of parNom) {
  let candidats = [];
  if (cp)
    candidats = await json(
      `https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=nom,code,region`,
    );
  let c = candidats.find((x) => normaliserNom(x.nom) === cle);
  if (!c) {
    const nom = cle.replace(/ /g, '-');
    const l = await json(
      `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(cle)}&fields=nom,code,region,population&boost=population&limit=5`,
    );
    c = l.find((x) => normaliserNom(x.nom) === cle) ?? null;
    void nom;
  }
  if (c?.region) retenues.set(c.code, [c.code, c.nom, c.region.nom]);
  else introuvables.push(cle);
}
const lignes = [...retenues.values()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
const contenu = `// Fichier GÉNÉRÉ par scripts/generer-villes.mjs (communes avec résidence CROUS + villes universitaires, Corse comprise).
// Codes INSEE et régions : API geo.api.gouv.fr. Ne pas modifier à la main.
export const VILLES_SUIVIES = ${JSON.stringify(lignes, null, 2)};
`;
await writeFile(new URL('../backend/src/seed/villes.js', import.meta.url), contenu);
console.log(
  `${lignes.length} villes écrites. Sans correspondance (ignorées) : ${introuvables.join(', ') || 'aucune'}`,
);
