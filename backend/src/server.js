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
if (actif) {
  demarrerPlanificateur(prisma);
  console.log('Robots de synchronisation activés.');
}
