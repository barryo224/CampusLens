import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { valider, idSchema } from '../lib/validation.js';
import { estAVerifier } from '../lib/fraicheur.js';
import {
  validerChangement,
  rejeterChangement,
  annulerModification,
  lireSuggestions,
} from '../admin/changements.js';
import {
  listerAVerifier,
  verifierUneDonnee,
  verifierToutesLesDonneesDeLaSource,
  TYPES_VERIFIABLES,
} from '../admin/verification.js';
import { synchroniser } from '../sync/moteur.js';
import { ROBOTS } from '../sync/robots/index.js';

const loginSchema = z.object({
  email: z.email().max(254),
  motDePasse: z.string().min(1).max(200),
});

const COUT_BCRYPT = 12;

const changementSchema = z
  .object({ ancien: z.string().min(1).max(200), nouveau: z.string().max(200) })
  .strict();

/** Règles du nouveau mot de passe. Renvoie un message d'erreur clair, ou null si tout va bien. */
export function verifierNouveauMotDePasse(nouveau, ancien, email) {
  if (nouveau.length < 12) return 'Le nouveau mot de passe doit contenir au moins 12 caractères.';
  if (nouveau === ancien) return 'Le nouveau mot de passe doit être différent de l’ancien.';
  const identifiant = String(email).split('@')[0].toLowerCase();
  if (identifiant.length >= 4 && nouveau.toLowerCase().includes(identifiant)) {
    return 'Le mot de passe ne doit pas contenir votre adresse e-mail.';
  }
  if (new Set(nouveau).size < 5)
    return 'Le mot de passe est trop répétitif : variez les caractères.';
  return null;
}

// Hash factice : on compare toujours un mot de passe, même si l'e-mail n'existe pas,
// pour ne pas révéler par le temps de réponse quels e-mails sont des comptes admin.
const HASH_FACTICE = bcrypt.hashSync('mot-de-passe-factice', 12);

/** Garde : toute route admin exige une session ouverte. */
export function exigerAdmin(req, res, next) {
  if (!req.session?.adminId) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  next();
}

export function routesAdmin(prisma, { fetchImpl = fetch } = {}) {
  const r = Router();

  // 5 échecs de connexion par IP et par 15 min, puis blocage temporaire (429).
  const limiteConnexion = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
  });

  r.post('/login', limiteConnexion, async (req, res) => {
    const { email, motDePasse } = valider(loginSchema, req.body);
    const admin = await prisma.administrateur.findUnique({ where: { email: email.toLowerCase() } });
    const ok = await bcrypt.compare(motDePasse, admin?.motDePasseHash ?? HASH_FACTICE);
    if (!admin || !ok) return res.status(401).json({ error: 'Identifiants incorrects.' });

    // Nouvelle session à chaque connexion (évite la fixation de session).
    await new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.adminId = admin.id;
    await prisma.administrateur.update({
      where: { id: admin.id },
      data: { derniereConnexion: new Date() },
    });
    res.json({ email: admin.email, role: admin.role });
  });

  // Tout ce qui suit exige une session. (Routes de validation : phase 6.)
  r.use(exigerAdmin);

  r.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('campuslens.sid');
      res.status(204).end();
    });
  });

  // Les actions sensibles sont réservées au rôle « admin » (le « relecteur » valide et consulte).
  const exigerRoleAdmin = async (req, res, next) => {
    const admin = await prisma.administrateur.findUnique({ where: { id: req.session.adminId } });
    if (admin?.role !== 'admin')
      return res.status(403).json({ error: 'Action réservée aux administrateurs.' });
    next();
  };

  // État des sources : dernière vérification, statut, fréquence, changements en attente.
  r.get('/sources', async (_req, res) => {
    const sources = await prisma.source.findMany({
      orderBy: { id: 'asc' },
      include: {
        synchronisations: { orderBy: { debut: 'desc' }, take: 1 },
        _count: { select: { changementsDetectes: { where: { statut: 'a_valider' } } } },
      },
    });
    const maintenant = new Date();
    res.json(
      sources.map((s) => ({
        id: s.id,
        cle: s.cle,
        nom: s.nom,
        organisme: s.organisme,
        url: s.url,
        type: s.type,
        niveau: s.type === 'page_web' || s.type === 'pdf' ? 3 : s.type === 'moteur_calcul' ? 2 : 1,
        frequenceHeures: s.frequenceHeures,
        statut: s.statut,
        aVerifier: estAVerifier(s, s.dernierControle, maintenant),
        dernierControle: s.dernierControle,
        dernierChangement: s.dernierChangement,
        robot: Boolean(s.cle && ROBOTS[s.cle]),
        derniereSynchronisation: s.synchronisations[0]
          ? {
              statut: s.synchronisations[0].statut,
              debut: s.synchronisations[0].debut,
              nbChangements: s.synchronisations[0].nbChangements,
              messageErreur: s.synchronisations[0].messageErreur,
            }
          : null,
        changementsEnAttente: s._count.changementsDetectes,
      })),
    );
  });

  // Changements détectés sur des pages web / PDF, avec les valeurs proposées et celles de la source.
  r.get('/changements', async (req, res) => {
    const { statut } = valider(
      z.object({ statut: z.enum(['a_valider', 'valide', 'rejete']).default('a_valider') }),
      req.query,
    );
    const changements = await prisma.changementDetecte.findMany({
      where: { statut },
      orderBy: { id: 'desc' },
      take: 100,
      include: { source: true, traitePar: { select: { email: true } } },
    });
    const sortie = [];
    for (const c of changements) {
      const parametres = await prisma.parametre.findMany({
        where: { sourceId: c.sourceId, annee: { enCours: true } },
        include: { profil: true },
        orderBy: [{ cle: 'asc' }, { niveau: 'asc' }],
      });
      sortie.push({
        id: c.id,
        statut: c.statut,
        resume: c.resume,
        source: {
          id: c.source.id,
          nom: c.source.nom,
          organisme: c.source.organisme,
          url: c.source.url,
        },
        detecteLe: c.traiteLe ?? null,
        traitePar: c.traitePar?.email ?? null,
        suggestions: lireSuggestions(c),
        parametres: parametres.map((p) => ({
          id: p.id,
          cle: p.cle,
          niveau: p.niveau,
          profil: p.profil?.code ?? null,
          valeur: Number(p.valeur),
          unite: p.unite,
        })),
      });
    }
    res.json(sortie);
  });

  r.post('/changements/:id/valider', async (req, res) => {
    const id = valider(idSchema, req.params.id);
    const { valeurs } = valider(
      z.object({
        valeurs: z.array(z.object({ parametreId: z.number(), valeur: z.number() })).default([]),
      }),
      req.body ?? {},
    );
    res.json(await validerChangement(prisma, id, req.session.adminId, valeurs));
  });

  r.post('/changements/:id/rejeter', async (req, res) => {
    const id = valider(idSchema, req.params.id);
    res.json(await rejeterChangement(prisma, id, req.session.adminId));
  });

  // Dernières modifications de données (pour afficher « mis à jour le… » et annuler une erreur).
  r.get('/historique', async (_req, res) => {
    const lignes = await prisma.historiqueValeur.findMany({ orderBy: { id: 'desc' }, take: 50 });
    res.json(lignes);
  });

  r.post('/historique/:id/annuler', exigerRoleAdmin, async (req, res) => {
    const id = valider(idSchema, req.params.id);
    res.json(await annulerModification(prisma, id));
  });

  // Messages du formulaire de contact. Données personnelles (e-mail) : rôle « admin » uniquement.
  // Ils sont supprimés automatiquement à `supprimerApres` ; l'admin peut aussi les effacer plus tôt
  // (après réponse, ou à la demande de la personne : droit à l'effacement).
  r.get('/messages', exigerRoleAdmin, async (_req, res) => {
    const messages = await prisma.messageContact.findMany({ orderBy: { id: 'desc' }, take: 200 });
    res.json(messages);
  });

  // Pastille « non lus » : le nombre de messages jamais ouverts.
  r.get('/messages/non-lus', exigerRoleAdmin, async (_req, res) => {
    res.json({ nombre: await prisma.messageContact.count({ where: { luLe: null } }) });
  });

  r.post('/messages/tout-lire', exigerRoleAdmin, async (_req, res) => {
    const { count } = await prisma.messageContact.updateMany({
      where: { luLe: null },
      data: { luLe: new Date() },
    });
    res.json({ marques: count });
  });

  r.post('/messages/:id/lu', exigerRoleAdmin, async (req, res) => {
    const id = valider(idSchema, req.params.id);
    if (!(await prisma.messageContact.findUnique({ where: { id }, select: { id: true } }))) {
      return res.status(404).json({ error: 'Message introuvable.' });
    }
    await prisma.messageContact.updateMany({
      where: { id, luLe: null },
      data: { luLe: new Date() },
    });
    res.status(204).end();
  });

  r.delete('/messages/:id', exigerRoleAdmin, async (req, res) => {
    const id = valider(idSchema, req.params.id);
    const { count } = await prisma.messageContact.deleteMany({ where: { id } });
    if (count === 0) return res.status(404).json({ error: 'Message introuvable.' });
    res.status(204).end();
  });

  // ───── Données à vérifier à la main (aides, postes de rentrée, associations, réglages…) ─────
  r.get('/verification', async (_req, res) => {
    res.json(await listerAVerifier(prisma));
  });

  r.post('/verification/source/:id', async (req, res) => {
    const id = valider(idSchema, req.params.id);
    res.json(await verifierToutesLesDonneesDeLaSource(prisma, id));
  });

  r.post('/verification/:type/:id', async (req, res) => {
    const { type } = valider(z.object({ type: z.enum(TYPES_VERIFIABLES) }), {
      type: req.params.type,
    });
    const id = valider(idSchema, req.params.id);
    res.json(await verifierUneDonnee(prisma, type, id));
  });

  // Lancer un robot tout de suite (admin).
  r.post('/sources/:id/synchroniser', exigerRoleAdmin, async (req, res) => {
    const id = valider(idSchema, req.params.id);
    const source = await prisma.source.findUnique({ where: { id } });
    if (!source?.cle || !ROBOTS[source.cle])
      return res.status(404).json({ error: 'Aucun robot pour cette source.' });
    res.json(await synchroniser(prisma, ROBOTS[source.cle], { fetchImpl }));
  });

  // ───── Changer son mot de passe ─────
  // Les mauvais « mot de passe actuel » comptent comme des échecs de connexion (5 par 15 min, puis blocage).
  const limiteChangement = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
  });

  r.post('/mot-de-passe', limiteChangement, async (req, res) => {
    const { ancien, nouveau } = valider(changementSchema, req.body);
    const admin = await prisma.administrateur.findUnique({ where: { id: req.session.adminId } });
    if (!admin) return res.status(401).json({ error: 'Authentification requise.' });

    if (!(await bcrypt.compare(ancien, admin.motDePasseHash))) {
      return res.status(401).json({ error: 'Le mot de passe actuel est incorrect.' });
    }
    const probleme = verifierNouveauMotDePasse(nouveau, ancien, admin.email);
    if (probleme) return res.status(400).json({ error: probleme });

    await prisma.administrateur.update({
      where: { id: admin.id },
      data: { motDePasseHash: await bcrypt.hash(nouveau, COUT_BCRYPT) },
    });

    // Sécurité : toutes les AUTRES sessions de ce compte sont fermées (quelqu'un d'autre était peut-être
    // connecté avec l'ancien mot de passe). La session courante reçoit un nouvel identifiant.
    await prisma.sessionAdmin.deleteMany({
      where: { donnees: { path: ['adminId'], equals: admin.id } },
    });
    await new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.adminId = admin.id;
    res.json({ message: 'Mot de passe modifié.' });
  });

  r.get('/me', async (req, res) => {
    const admin = await prisma.administrateur.findUnique({ where: { id: req.session.adminId } });
    if (!admin) return res.status(401).json({ error: 'Authentification requise.' });
    res.json({ email: admin.email, role: admin.role });
  });

  return r;
}
