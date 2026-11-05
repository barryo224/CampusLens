import { z } from 'zod';
import { telecharger, ErreurSource } from '../http.js';

const resultatSchema = z.array(
  z.object({ id: z.number(), statut: z.enum(['ok', 'deplace', 'casse']) }),
);

// Adresses des services de protection anti-robot vers lesquels un site peut nous rediriger.
const ANTI_ROBOT =
  /perfdrive\.com|radware|captcha|datadome|\/cdn-cgi\/challenge|px-cloud|incapsula/i;

const sansWww = (h) => h.replace(/^www\./, '');
/** Deux adresses désignent-elles la même page (hors http/https, www, « / » final) ? */
function memePage(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const chemin = (u) => u.pathname.replace(/\/+$/, '');
    return sansWww(x.hostname) === sansWww(y.hostname) && chemin(x) === chemin(y);
  } catch {
    return true;
  }
}

/**
 * Robot de niveau 1 — contrôle des liens de la page Ressources (spécification : « un lien cassé
 * ou un document remplacé est détecté et signalé »).
 *  - 404 / 410 → « casse »  ;  adresse finale différente → « deplace »  ;  sinon « ok ».
 *  - Une panne passagère (serveur en erreur, délai dépassé) ne change PAS le statut du lien.
 */
export const robotLiensRessources = {
  cle: 'liens_ressources',
  niveau: 1,

  async telecharger({ prisma, fetchImpl }) {
    const ressources = await prisma.ressource.findMany({ orderBy: { id: 'asc' } });
    const resultats = [];
    for (const r of ressources) {
      let statut = r.statutLien;
      try {
        const rep = await telecharger(r.url, { fetchImpl, delaiMs: 15_000 });
        // Certains sites (caf.fr…) renvoient les robots vers une page de vérification anti-robot : ce n'est ni un
        // déplacement ni un lien cassé, on ne conclut rien et on garde le statut précédent.
        if (!ANTI_ROBOT.test(rep.url)) statut = memePage(r.url, rep.url) ? 'ok' : 'deplace';
      } catch (e) {
        const code = Number(String(e.message).match(/répondu (\d{3})/)?.[1]);
        if (code === 404 || code === 410) statut = 'casse';
        // autre erreur (5xx, réseau, délai) : on garde le statut précédent
      }
      resultats.push({ id: r.id, statut });
    }
    return { contenu: JSON.stringify(resultats) };
  },

  async analyser({ contenu }) {
    const r = resultatSchema.safeParse(JSON.parse(contenu));
    if (!r.success) throw new ErreurSource('Résultat du contrôle des liens invalide.');
    return { resultats: r.data };
  },

  async appliquer({ tx, donnees, now }) {
    const changements = [];
    for (const { id, statut } of donnees.resultats) {
      const actuel = await tx.ressource.findUnique({ where: { id } });
      if (!actuel) continue;
      if (actuel.statutLien !== statut) {
        changements.push({
          table: 'ressource',
          ligneId: id,
          champ: 'statutLien',
          ancienne: actuel.statutLien,
          nouvelle: statut,
        });
      }
      await tx.ressource.update({ where: { id }, data: { statutLien: statut, verifieLe: now } });
    }
    return changements;
  },
};
