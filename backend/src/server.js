import { createApp } from './app.js';
import { creerPrisma } from './db.js';
import { demarrerPlanificateur } from './sync/planificateur.js';

const port = Number(process.env.PORT) || 3001;
const prisma = creerPrisma();

createApp({ prisma }).listen(port, () => {
  console.log(`API CampusLens sur http://localhost:${port}`);
});

// Les robots tournent dans ce même processus (node-cron). Désactivés par défaut hors production
// pour ne pas télécharger des fichiers à chaque rechargement : SYNC_ENABLED=true pour les activer.
const actif = process.env.SYNC_ENABLED
  ? process.env.SYNC_ENABLED === 'true'
  : process.env.NODE_ENV === 'production';
if (actif) {
  demarrerPlanificateur(prisma);
  console.log('Robots de synchronisation activés.');
}
