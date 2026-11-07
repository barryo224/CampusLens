import { createApp } from './app.js';
import { creerPrisma } from './db.js';
import { demarrerPlanificateur } from './sync/planificateur.js';

const port = Number(process.env.PORT) || 3001;
const prisma = creerPrisma();

const serveur = createApp({ prisma }).listen(port, () => {
  console.log(`API CampusLens sur http://localhost:${port}`);
});
// Derrière un proxy (Render, Railway, Vercel…), les connexions réutilisées restent ouvertes plus longtemps que le
// délai par défaut de Node (5 s) : sans ce réglage, le proxy envoie parfois une requête sur une connexion que Node
// vient de fermer, ce qui produit des erreurs 502 intermittentes sous charge.
serveur.keepAliveTimeout = 65_000;
serveur.headersTimeout = 66_000;
// Protection contre les connexions « lentes » (une requête dont l'envoi traîne indéfiniment bloquerait des ressources).
serveur.requestTimeout = 70_000;

// Les robots tournent dans ce même processus (node-cron). Désactivés par défaut hors production
// pour ne pas télécharger des fichiers à chaque rechargement : SYNC_ENABLED=true pour les activer.
const actif = process.env.SYNC_ENABLED
  ? process.env.SYNC_ENABLED === 'true'
  : process.env.NODE_ENV === 'production';
let arreterRobots = () => {};
if (actif) {
  arreterRobots = demarrerPlanificateur(prisma);
  console.log('Robots de synchronisation activés.');
}

// ───── Filets de sécurité : le serveur ne doit pas tomber pour une erreur isolée ─────
// Une erreur de connexion (base qui s'endort, réseau qui coupe) n'est pas un bug du site : on la note et on continue.
// Toute autre erreur imprévue est notée, puis le serveur s'arrête proprement : Render le redémarre aussitôt.
const ERREUR_RESEAU =
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|terminating connection|Connection terminated|timeout/i;
let arretEnCours = false;
function arreter(code) {
  if (arretEnCours) return;
  arretEnCours = true;
  arreterRobots();
  const secours = setTimeout(() => process.exit(code), 10_000); // si la fermeture traîne, on force
  secours.unref();
  serveur.close(() => {
    prisma
      .$disconnect()
      .catch(() => {})
      .finally(() => process.exit(code));
  });
}
process.on('unhandledRejection', (raison) => {
  console.error('[erreur non gérée] promesse rejetée :', raison?.code ?? raison?.name ?? raison);
});
process.on('uncaughtException', (erreur) => {
  console.error('[erreur non gérée]', erreur?.code ?? erreur?.name ?? 'erreur', erreur?.message);
  if (!ERREUR_RESEAU.test(`${erreur?.code} ${erreur?.message}`)) arreter(1);
});
// Render envoie SIGTERM à chaque redéploiement : on termine les requêtes en cours avant de couper.
process.on('SIGTERM', () => arreter(0));
process.on('SIGINT', () => arreter(0));
