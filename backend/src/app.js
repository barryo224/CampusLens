import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

/**
 * Construit l'application Express.
 * On la sépare de server.js pour pouvoir la tester avec Supertest
 * sans ouvrir de vrai port réseau.
 */
export function createApp({ corsOrigin = process.env.CORS_ORIGIN } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet()); // en-têtes HTTP de sécurité
  // CORS restreint : seule l'adresse du site est autorisée (jamais « * »).
  app.use(cors({ origin: corsOrigin ? corsOrigin.split(',') : false }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Toute route inconnue : 404 JSON propre, sans détail technique.
  app.use((_req, res) => {
    res.status(404).json({ error: 'Ressource introuvable.' });
  });

  // Erreurs inattendues : message générique, jamais de trace dans la réponse.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Une erreur est survenue.' });
  });

  return app;
}
