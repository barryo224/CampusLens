import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { routesPubliques } from './routes/publiques.js';
import { routeContact } from './routes/contact.js';
import { routeAvis } from './routes/avis.js';
import { routeSimulation } from './routes/simulation.js';
import { notificateurDepuisEnv } from './notifications/courriel.js';
import { routesAdmin } from './routes/admin.js';
import { StockageSessions } from './admin/sessions.js';

/**
 * Construit l'application Express.
 * On la sépare de server.js pour pouvoir la tester avec Supertest
 * sans ouvrir de vrai port réseau. `prisma` est injecté : les tests peuvent
 * ainsi passer une vraie base de test, ou un faux client qui plante.
 */
export function createApp({
  prisma,
  fetchImpl = fetch,
  maintenant = () => new Date(),
  notificateur = notificateurDepuisEnv(prisma),
  urlOpenfisca = process.env.OPENFISCA_URL,
  corsOrigin = process.env.CORS_ORIGIN,
  sessionSecret = process.env.SESSION_SECRET,
  production = process.env.NODE_ENV === 'production',
  trustProxy = process.env.TRUST_PROXY,
  limiteParMinute = Number(process.env.API_LIMITE_PAR_MINUTE) ||
    (process.env.NODE_ENV === 'production' ? 600 : 5000),
  moisConservationContact = Number(process.env.CONTACT_RETENTION_MONTHS) || 6,
  moisConservationAvis = Number(process.env.AVIS_RETENTION_MONTHS) || 12,
} = {}) {
  if (production && !sessionSecret) {
    throw new Error('SESSION_SECRET est obligatoire en production.');
  }

  const app = express();
  app.disable('x-powered-by');
  // Derrière Render/Railway : mettre TRUST_PROXY=1 pour lire la vraie IP du visiteur.
  if (trustProxy) app.set('trust proxy', Number(trustProxy) || trustProxy);

  app.use(helmet()); // en-têtes HTTP de sécurité
  // Compression des réponses (la liste des villes pèse 200 Ko brute : environ 10 fois moins une fois compressée).
  app.use(compression());
  // CORS restreint : seule l'adresse du site est autorisée (jamais « * »).
  app.use(cors({ origin: corsOrigin ? corsOrigin.split(',') : false, credentials: true }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Limite générale par IP. Large par défaut : sur le Wi-Fi d'une université, beaucoup d'étudiants partagent
  // la même adresse IP. Réglable avec API_LIMITE_PAR_MINUTE.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: limiteParMinute,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
    }),
  );

  // Contact : 5 messages par 10 minutes et par IP.
  app.use(
    '/api/contact',
    rateLimit({
      windowMs: 10 * 60_000,
      limit: 5,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Trop de messages envoyés. Réessayez dans quelques minutes.' },
    }),
  );

  // Avis : 5 par 10 minutes et par IP (on ne conserve pas l'adresse IP : le compteur est en mémoire).
  app.use(
    '/api/avis',
    rateLimit({
      windowMs: 10 * 60_000,
      limit: 5,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Trop d’avis envoyés. Réessayez dans quelques minutes.' },
    }),
  );

  // L'administration n'est JAMAIS mise en cache (ni par le navigateur, ni par un service de diffusion).
  app.use('/api/admin', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Sessions : uniquement pour l'espace admin (aucun cookie n'est posé aux visiteurs).
  app.use(
    '/api/admin',
    session({
      name: 'campuslens.sid',
      // En base si on a un vrai client Prisma ; sinon (tests sans base) mémoire.
      ...(prisma?.sessionAdmin ? { store: new StockageSessions(prisma) } : {}),
      secret: sessionSecret ?? 'secret-de-developpement-uniquement',
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: production,
        sameSite: 'strict',
        maxAge: 2 * 60 * 60 * 1000,
      },
    }),
    routesAdmin(prisma, { fetchImpl }),
  );

  app.use('/api', routesPubliques(prisma));
  app.use(
    '/api',
    routeSimulation(prisma, { fetchImpl, maintenant, ...(urlOpenfisca && { urlOpenfisca }) }),
  );
  app.use('/api', routeAvis(prisma, { moisConservation: moisConservationAvis }));
  app.use(
    '/api',
    routeContact(prisma, { moisConservation: moisConservationContact, notificateur }),
  );

  // Toute route inconnue (ou méthode non prévue : PUT, DELETE…) : 404 JSON propre.
  app.use((_req, res) =>
    res.set('Cache-Control', 'no-store').status(404).json({ error: 'Ressource introuvable.' }),
  );

  // Gestion d'erreurs : jamais de trace technique dans la réponse.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    res.set('Cache-Control', 'no-store'); // une erreur n'est jamais conservée en cache
    // Erreurs du lecteur JSON : on ne renvoie JAMAIS le message interne du parseur.
    if (err.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'JSON invalide.' });
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Requête trop volumineuse.' });
    }
    // Erreurs que NOUS avons écrites pour l'utilisateur (validation) : message sûr.
    if (err.expose && err.status) return res.status(err.status).json({ error: err.message });
    console.error(err); // détail uniquement dans les logs du serveur
    res.status(500).json({ error: 'Une erreur est survenue.' });
  });

  return app;
}
