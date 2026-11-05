import cron from 'node-cron';
import { synchroniser } from './moteur.js';
import { ROBOTS } from './robots/index.js';
import { maintenanceQuotidienne } from './maintenance.js';

/** Une source est « due » quand elle n'a jamais été contrôlée ou que sa fréquence est écoulée. */
export function sourcesDues(sources, maintenant = new Date()) {
  return sources.filter(
    (s) =>
      s.cle &&
      ROBOTS[s.cle] &&
      (!s.dernierControle || (maintenant - s.dernierControle) / 3_600_000 >= s.frequenceHeures),
  );
}

/** Un passage : lance les robots dont la fréquence est écoulée, l'un après l'autre. */
export async function passageDesRobots(
  prisma,
  { fetchImpl = fetch, maintenant = () => new Date(), journal = console } = {},
) {
  const sources = await prisma.source.findMany({ where: { cle: { not: null } } });
  const resultats = [];
  for (const s of sourcesDues(sources, maintenant())) {
    try {
      const r = await synchroniser(prisma, ROBOTS[s.cle], { fetchImpl, maintenant });
      journal.log(`[sync] ${s.cle} → ${r.statut}${r.message ? ` (${r.message})` : ''}`);
      resultats.push({ cle: s.cle, ...r });
    } catch (e) {
      journal.error(`[sync] ${s.cle} : erreur inattendue`, e);
    }
  }
  return resultats;
}

/**
 * Planification dans le processus de l'API (node-cron) :
 *  - toutes les heures : robots dont la fréquence est écoulée ;
 *  - chaque jour à 3 h : maintenance (année en cours, sources périmées, suppression RGPD).
 * Renvoie une fonction `arreter()`.
 */
export function demarrerPlanificateur(prisma, options = {}) {
  const heure = cron.schedule(
    '7 * * * *',
    () => void passageDesRobots(prisma, options).catch((e) => console.error('[sync]', e)),
  );
  const jour = cron.schedule(
    '15 3 * * *',
    () => void maintenanceQuotidienne(prisma).catch((e) => console.error('[maintenance]', e)),
  );
  // Au démarrage : on rattrape ce qui est dû, sans bloquer le serveur.
  void maintenanceQuotidienne(prisma).catch((e) => console.error('[maintenance]', e));
  void passageDesRobots(prisma, options).catch((e) => console.error('[sync]', e));
  return () => {
    heure.stop();
    jour.stop();
  };
}
