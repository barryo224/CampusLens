import { z } from 'zod';
import { telecharger, ErreurSource } from '../http.js';
import { normaliserNom, communeDeResidence, empreinte } from '../outils.js';

const residenceSchema = z.object({
  id: z.number(),
  title: z.string().min(1),
  zone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  infos: z.string().nullable().optional(),
});

const LIGNE_A_IGNORER =
  /d[ée]p[ôo]t|garantie|caution|parking|frais|cotisation|assurance|caf\b|avance|internet|wifi|abonnement|m[ée]nage|nettoyage|p[ée]nalit|dossier|option/i;

/**
 * Extrait la fourchette de loyers mensuels du texte libre d'une résidence.
 * On ne retient que les montants en euros des lignes qui ne parlent ni de dépôt de garantie,
 * ni de parking, ni de frais. Renvoie { min, max } ou null si rien de fiable.
 */
export function extraireLoyers(infos) {
  const montants = [];
  for (const ligne of String(infos ?? '').split(/\r?\n/)) {
    if (!ligne.includes('€') || LIGNE_A_IGNORER.test(ligne)) continue;
    // « de 412 à 536 € » : la borne basse n'est pas suivie du signe € ; « 5,99 € » ne doit pas donner « 99 € ».
    const nombres = /(?<![\d.,])(\d{2,4}(?:[.,]\d{1,2})?)(?![\d])\s*(?:€|euros?)?/g;
    const avecEuro = ligne.replace(/\s+/g, ' ');
    for (const m of avecEuro.matchAll(nombres)) {
      const apres = avecEuro.slice(m.index + m[0].length);
      const suiviDEuro = /€|euro/i.test(m[0]);
      const bornBasse = /^\s*à\s*\d[\d.,\s]*(?:€|euros?)/i.test(apres);
      if (!suiviDEuro && !bornBasse) continue;
      const n = Number(m[1].replace(',', '.'));
      // Un loyer de chambre étudiante : on écarte les montants manifestement hors sujet.
      if (n >= 80 && n <= 2500) montants.push(n);
    }
  }
  return montants.length ? { min: Math.min(...montants), max: Math.max(...montants) } : null;
}

/**
 * Robot de niveau 1 — « Logements proposés par les CROUS » (CNOUS, portail open data du ministère).
 * Recopie les résidences des villes suivies et le nombre de résidences par ville.
 */
export const robotLogementsCrous = {
  cle: 'logements_crous',
  niveau: 1,
  // La version de la lecture fait partie de l'empreinte : si on améliore l'extraction des loyers, les résidences
  // sont relues même si le fichier du CNOUS n'a pas changé.
  empreinte: (contenu) => empreinte(`v2|${contenu}`),

  async telecharger({ source, fetchImpl }) {
    const url = `${source.url}/exports/json?select=id%2Ctitle%2Czone%2Caddress%2Cinfos&limit=-1`;
    const reponse = await telecharger(url, { fetchImpl, delaiMs: 60_000 });
    return { contenu: reponse.texte };
  },

  async analyser({ contenu }) {
    let json;
    try {
      json = JSON.parse(contenu);
    } catch (e) {
      throw new ErreurSource('Réponse inattendue du CNOUS (JSON invalide).', { cause: e });
    }
    const liste = z.array(residenceSchema).safeParse(json);
    if (!liste.success) throw new ErreurSource('Format inattendu des logements CROUS.');
    // Garde-fou : un fichier vide ne doit jamais effacer toutes les résidences.
    if (liste.data.length === 0)
      throw new ErreurSource('Liste des logements CROUS vide : aucune modification.');
    return { residences: liste.data };
  },

  async appliquer({ tx, source, donnees, now }) {
    const changements = [];
    const villes = await tx.ville.findMany();
    const parVille = new Map(villes.map((v) => [normaliserNom(v.nom), v]));
    const groupes = new Map();
    for (const r of donnees.residences) {
      const ville = parVille.get(communeDeResidence(r));
      if (!ville) continue;
      if (!groupes.has(ville.id)) groupes.set(ville.id, []);
      groupes.get(ville.id).push(r);
    }

    for (const ville of villes) {
      const residences = groupes.get(ville.id) ?? [];
      const existants = await tx.logementCrous.findMany({ where: { villeId: ville.id } });
      const parNom = new Map(existants.map((l) => [l.nomResidence, l]));
      const vus = new Set();

      for (const r of residences) {
        vus.add(r.title);
        const loyers = extraireLoyers(r.infos);
        const donneesLigne = {
          adresse: r.address?.replace(/\s+/g, ' ').trim() ?? null,
          loyerMin: loyers?.min ?? null,
          loyerMax: loyers?.max ?? null,
          sourceId: source.id,
          verifieLe: now,
        };
        const ancien = parNom.get(r.title);
        if (!ancien) {
          const cree = await tx.logementCrous.create({
            data: { villeId: ville.id, nomResidence: r.title, ...donneesLigne },
          });
          changements.push({
            table: 'logement_crous',
            ligneId: cree.id,
            champ: 'nomResidence',
            ancienne: null,
            nouvelle: r.title,
          });
        } else {
          const avant = {
            min: ancien.loyerMin === null ? null : Number(ancien.loyerMin),
            max: ancien.loyerMax === null ? null : Number(ancien.loyerMax),
          };
          if (avant.min !== donneesLigne.loyerMin)
            changements.push({
              table: 'logement_crous',
              ligneId: ancien.id,
              champ: 'loyerMin',
              ancienne: avant.min,
              nouvelle: donneesLigne.loyerMin,
            });
          if (avant.max !== donneesLigne.loyerMax)
            changements.push({
              table: 'logement_crous',
              ligneId: ancien.id,
              champ: 'loyerMax',
              ancienne: avant.max,
              nouvelle: donneesLigne.loyerMax,
            });
          await tx.logementCrous.update({ where: { id: ancien.id }, data: donneesLigne });
        }
      }
      // Résidence qui n'existe plus dans la source : on la retire (et on le journalise).
      for (const ancien of existants) {
        if (!vus.has(ancien.nomResidence)) {
          await tx.logementCrous.delete({ where: { id: ancien.id } });
          changements.push({
            table: 'logement_crous',
            ligneId: ancien.id,
            champ: 'nomResidence',
            ancienne: ancien.nomResidence,
            nouvelle: null,
          });
        }
      }
      if (ville.nbLogementsCrous !== residences.length) {
        changements.push({
          table: 'ville',
          ligneId: ville.id,
          champ: 'nbLogementsCrous',
          ancienne: ville.nbLogementsCrous,
          nouvelle: residences.length,
        });
      }
      await tx.ville.update({
        where: { id: ville.id },
        data: { nbLogementsCrous: residences.length },
      });
    }
    return changements;
  },
};
