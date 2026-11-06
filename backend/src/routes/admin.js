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
import { nomCookieSession } from '../lib/cookie.js';
import { chiffreurDepuisEnv } from '../lib/chiffrement.js';
import { adresseOtpauth, formaterSecret, genererSecret, verifierCode } from '../admin/totp.js';
import { empreinteCode, genererCodesSecours, trouverCode } from '../admin/codes-secours.js';
import { ROBOTS } from '../sync/robots/index.js';

const loginSchema = z.object({
  email: z.email().max(254),
  motDePasse: z.string().min(1).max(200),
});

const COUT_BCRYPT = 12;
/** Après le mot de passe, on dispose de 5 minutes et de 5 essais pour saisir le code de la double authentification. */
export const DUREE_ATTENTE_CODE_MS = 5 * 60 * 1000;
export const ESSAIS_CODE_PAR_CONNEXION = 5;
/** Une session s'éteint au plus tard 12 h après la connexion, même si on l'utilise sans arrêt. */
export const DUREE_ABSOLUE_SESSION_MS = 12 * 60 * 60 * 1000;
// Inactivité : une session sans AUCUNE action de l'administrateur pendant ce délai est refusée par le serveur, même si le
// navigateur garde le cookie et même si l'onglet est resté ouvert. Les requêtes d'arrière-plan du site (contrôle de la
// session, compteur de non lus), signalées par l'en-tête « X-Controle: 1 », ne comptent pas comme une action.
export const INACTIVITE_MAX_MS = 20 * 60 * 1000;
/** Après 10 échecs de connexion d'affilée, le compte est verrouillé 15 minutes (quelle que soit l'adresse IP de l'attaquant). */
export const ECHECS_AVANT_VERROU = 10;
export const DUREE_VERROU_MS = 15 * 60 * 1000;

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

// Réponses « pas de session » : le `code` permet au site de les distinguer d'un simple mauvais mot de passe (autre 401)
// et d'ouvrir la fenêtre de reconnexion sans perdre ce que l'administrateur était en train de saisir.
const SESSION_REQUISE = { error: 'Authentification requise.', code: 'session_expiree' };
const SESSION_EXPIREE = { error: 'Session expirée : reconnectez-vous.', code: 'session_expiree' };
const SESSION_INACTIVE = {
  error: 'Session expirée par inactivité : reconnectez-vous.',
  code: 'session_expiree',
};

/** Garde : toute route admin exige une session ouverte. */
export function exigerAdmin(req, res, next) {
  if (!req.session?.adminId) {
    return res.status(401).json(SESSION_REQUISE);
  }
  // Durée absolue : une session volée ou oubliée ne reste pas valable indéfiniment. Une session sans date de connexion
  // (ouverte avant cette règle) est considérée comme expirée.
  if (Date.now() - (req.session.connecteLe ?? 0) > DUREE_ABSOLUE_SESSION_MS) {
    return req.session.destroy(() => res.status(401).json(SESSION_EXPIREE));
  }
  const derniereActivite = req.session.derniereActivite ?? req.session.connecteLe ?? 0;
  if (Date.now() - derniereActivite > INACTIVITE_MAX_MS) {
    return req.session.destroy(() => res.status(401).json(SESSION_INACTIVE));
  }
  if (req.get('X-Controle') !== '1') req.session.derniereActivite = Date.now();
  next();
}

export function routesAdmin(
  prisma,
  { fetchImpl = fetch, production = false, chiffreur = chiffreurDepuisEnv({ production }) } = {},
) {
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

  /** Un échec (mot de passe ou code) : compté sur le COMPTE ; verrouillé 15 min après trop d'échecs d'affilée. */
  async function enregistrerEchec(admin, maintenant) {
    const apres = await prisma.administrateur.update({
      where: { id: admin.id },
      data: { echecsConsecutifs: { increment: 1 } },
    });
    if (apres.echecsConsecutifs >= ECHECS_AVANT_VERROU) {
      await prisma.administrateur.update({
        where: { id: admin.id },
        data: {
          echecsConsecutifs: 0,
          verrouilleJusqua: new Date(maintenant.getTime() + DUREE_VERROU_MS),
        },
      });
    }
  }

  const regenerer = (req) =>
    new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );

  /** Ouvre vraiment la session de l'administrateur (après le mot de passe, et le code s'il a la double authentification). */
  async function ouvrirSession(req, res, admin) {
    await regenerer(req); // nouvelle session à chaque connexion (évite la fixation de session)
    req.session.adminId = admin.id;
    req.session.connecteLe = Date.now(); // pour la durée absolue de la session
    req.session.derniereActivite = Date.now(); // pour le délai d'inactivité
    await prisma.administrateur.update({
      where: { id: admin.id },
      data: { derniereConnexion: new Date(), echecsConsecutifs: 0, verrouilleJusqua: null },
    });
    res.json({ email: admin.email, role: admin.role });
  }

  const verrouille = (admin, maintenant) =>
    Boolean(admin?.verrouilleJusqua && admin.verrouilleJusqua > maintenant);
  const REPONSE_VERROU = { error: 'Trop de tentatives. Réessayez dans quelques minutes.' };

  r.post('/login', limiteConnexion, async (req, res) => {
    const { email, motDePasse } = valider(loginSchema, req.body);
    const admin = await prisma.administrateur.findUnique({ where: { email: email.toLowerCase() } });
    const maintenant = new Date();
    // Compte verrouillé : on refuse, même avec le bon mot de passe (sinon le verrou ne protégerait de rien).
    if (verrouille(admin, maintenant)) {
      await bcrypt.compare(motDePasse, HASH_FACTICE); // même durée de réponse
      return res.status(429).json(REPONSE_VERROU);
    }
    const ok = await bcrypt.compare(motDePasse, admin?.motDePasseHash ?? HASH_FACTICE);
    if (!admin || !ok) {
      if (admin) await enregistrerEchec(admin, maintenant);
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }
    // Double authentification activée : le mot de passe ne suffit PAS. La session n'est pas ouverte : elle attend le code.
    if (admin.totpActifLe) {
      await regenerer(req);
      req.session.attente2fa = { adminId: admin.id, le: Date.now(), essais: 0 };
      return res.json({ etape: 'code' });
    }
    await ouvrirSession(req, res, admin);
  });

  // Deuxième étape : le code à 6 chiffres de l'application d'authentification, ou un code de secours.
  r.post('/login/code', limiteConnexion, async (req, res) => {
    const { code } = valider(z.object({ code: z.string().min(1).max(40) }), req.body);
    const attente = req.session?.attente2fa;
    if (!attente || Date.now() - attente.le > DUREE_ATTENTE_CODE_MS) {
      return res.status(401).json({ error: 'Session de connexion expirée : recommencez.' });
    }
    const admin = await prisma.administrateur.findUnique({ where: { id: attente.adminId } });
    const maintenant = new Date();
    if (!admin?.totpActifLe)
      return res.status(401).json({ error: 'Session de connexion expirée : recommencez.' });
    if (verrouille(admin, maintenant)) return res.status(429).json(REPONSE_VERROU);

    const echouer = async () => {
      await enregistrerEchec(admin, maintenant);
      attente.essais += 1;
      // Trop d'erreurs dans cette tentative : on détruit la session, il faut ressaisir le mot de passe.
      if (attente.essais >= ESSAIS_CODE_PAR_CONNEXION) {
        return req.session.destroy(() =>
          res.status(401).json({ error: 'Trop d’erreurs : recommencez la connexion.' }),
        );
      }
      res.status(401).json({ error: 'Code incorrect.' });
    };

    const secret = chiffreur.dechiffrer(admin.totpSecret);
    const pas = verifierCode(secret, code, { dernierPas: admin.totpDernierPas });
    if (pas !== null) {
      await prisma.administrateur.update({
        where: { id: admin.id },
        data: { totpDernierPas: pas },
      });
      return ouvrirSession(req, res, admin);
    }
    // Pas un code de l'application : peut-être un code de secours (valable une seule fois).
    const position = trouverCode(admin.codesSecours ?? [], code);
    if (position === -1) return echouer();
    const restants = admin.codesSecours.filter((_, i) => i !== position);
    await prisma.administrateur.update({
      where: { id: admin.id },
      data: { codesSecours: restants },
    });
    await ouvrirSession(req, res, admin);
  });

  // Tout ce qui suit exige une session. (Routes de validation : phase 6.)
  r.use(exigerAdmin);

  r.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(nomCookieSession(production), {
        path: '/',
        secure: production,
        httpOnly: true,
        sameSite: 'strict',
      });
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
        // « Veille » : un robot relit la page chaque jour, mais c'est vous qui vérifiez les valeurs (« Données à vérifier »).
        veille: Boolean(s.cle && ROBOTS[s.cle]?.veilleVerification),
        // Sans robot, ou avec une simple veille : les valeurs se vérifient À LA MAIN dans « Données à vérifier ».
        verificationManuelle: !s.cle || !ROBOTS[s.cle] || ROBOTS[s.cle].veilleVerification === true,
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
    // Lus et déchiffrés seulement ici, pour l'administrateur connecté.
    res.json(
      messages.map((m) => ({
        ...m,
        objet: chiffreur.dechiffrer(m.objet),
        message: chiffreur.dechiffrer(m.message),
        email: chiffreur.dechiffrer(m.email),
      })),
    );
  });

  // Pastille « non lus » : le nombre de messages jamais ouverts.
  r.get('/messages/non-lus', exigerRoleAdmin, async (_req, res) => {
    res.json({
      nombre: await prisma.messageContact.count({ where: { luLe: null } }),
      avis: await prisma.avis.count({ where: { luLe: null } }), // pastille de l'onglet « Avis »
    });
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

  // ───── Avis des visiteurs sur le site (anonymes, supprimés automatiquement) ─────
  // Réponse : des statistiques sur TOUS les avis (moyenne, répartition des notes) et les 200 plus récents.
  r.get('/avis', exigerRoleAdmin, async (_req, res) => {
    const [total, groupes, nonLus, avis] = await Promise.all([
      prisma.avis.count(),
      prisma.avis.groupBy({ by: ['note'], _count: { _all: true } }),
      prisma.avis.count({ where: { luLe: null } }),
      prisma.avis.findMany({ orderBy: { id: 'desc' }, take: 200 }),
    ]);
    const repartition = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, 0]));
    let somme = 0;
    for (const g of groupes) {
      repartition[g.note] = g._count._all;
      somme += g.note * g._count._all;
    }
    res.json({
      stats: {
        total,
        nonLus,
        moyenne: total ? Math.round((somme / total) * 10) / 10 : null,
        repartition,
      },
      avis: avis.map((a) => ({ ...a, commentaire: chiffreur.dechiffrer(a.commentaire) })),
    });
  });

  r.post('/avis/tout-lire', exigerRoleAdmin, async (_req, res) => {
    const { count } = await prisma.avis.updateMany({
      where: { luLe: null },
      data: { luLe: new Date() },
    });
    res.json({ marques: count });
  });

  r.post('/avis/:id/lu', exigerRoleAdmin, async (req, res) => {
    const id = valider(idSchema, req.params.id);
    if (!(await prisma.avis.findUnique({ where: { id }, select: { id: true } }))) {
      return res.status(404).json({ error: 'Avis introuvable.' });
    }
    await prisma.avis.updateMany({ where: { id, luLe: null }, data: { luLe: new Date() } });
    res.status(204).end();
  });

  r.delete('/avis/:id', exigerRoleAdmin, async (req, res) => {
    const id = valider(idSchema, req.params.id);
    const { count } = await prisma.avis.deleteMany({ where: { id } });
    if (count === 0) return res.status(404).json({ error: 'Avis introuvable.' });
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
      return res.status(404).json({
        error:
          'Cette source n’a pas de robot : ses données se vérifient à la main, dans « Données à vérifier ».',
      });
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
    if (!admin) return res.status(401).json(SESSION_REQUISE);

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
    const connecteLe = req.session.connecteLe; // changer son mot de passe ne prolonge pas la durée absolue de la session
    await new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.adminId = admin.id;
    req.session.connecteLe = connecteLe;
    req.session.derniereActivite = Date.now();
    res.json({ message: 'Mot de passe modifié.' });
  });

  // ───── Double authentification (TOTP) : activer, désactiver ─────
  r.get('/2fa', async (req, res) => {
    const admin = await prisma.administrateur.findUnique({ where: { id: req.session.adminId } });
    res.json({
      actif: Boolean(admin?.totpActifLe),
      codesSecoursRestants: admin?.totpActifLe ? (admin.codesSecours ?? []).length : 0,
    });
  });

  // Étape 1 : une clé secrète est générée (chiffrée en base, pas encore active). L'utilisateur l'enregistre dans son application.
  r.post('/2fa/preparer', async (req, res) => {
    const admin = await prisma.administrateur.findUnique({ where: { id: req.session.adminId } });
    if (admin.totpActifLe)
      return res.status(409).json({ error: 'La double authentification est déjà activée.' });
    const secret = genererSecret();
    await prisma.administrateur.update({
      where: { id: admin.id },
      data: { totpSecret: chiffreur.chiffrer(secret), totpDernierPas: null },
    });
    res.json({
      secret: formaterSecret(secret),
      adresse: adresseOtpauth({ secret, email: admin.email }),
    });
  });

  // Étape 2 : le code produit par l'application prouve qu'elle est bien réglée. Les codes de secours sont affichés UNE fois.
  r.post('/2fa/activer', async (req, res) => {
    const { code } = valider(z.object({ code: z.string().min(1).max(20) }), req.body);
    const admin = await prisma.administrateur.findUnique({ where: { id: req.session.adminId } });
    if (admin.totpActifLe)
      return res.status(409).json({ error: 'La double authentification est déjà activée.' });
    if (!admin.totpSecret)
      return res
        .status(409)
        .json({ error: 'Commencez par « Activer la double authentification ».' });
    const pas = verifierCode(chiffreur.dechiffrer(admin.totpSecret), code);
    if (pas === null)
      return res
        .status(400)
        .json({ error: 'Code incorrect. Vérifiez l’heure de votre téléphone.' });
    const codesSecours = genererCodesSecours();
    await prisma.administrateur.update({
      where: { id: admin.id },
      data: {
        totpActifLe: new Date(),
        totpDernierPas: pas,
        codesSecours: codesSecours.map(empreinteCode),
      },
    });
    res.json({ codesSecours });
  });

  // Désactiver exige le mot de passe ET un code : une session volée ne peut pas retirer la protection.
  r.post('/2fa/desactiver', limiteConnexion, async (req, res) => {
    const { motDePasse, code } = valider(
      z.object({ motDePasse: z.string().min(1).max(200), code: z.string().min(1).max(40) }),
      req.body,
    );
    const admin = await prisma.administrateur.findUnique({ where: { id: req.session.adminId } });
    if (!admin.totpActifLe)
      return res.status(409).json({ error: 'La double authentification n’est pas activée.' });
    if (!(await bcrypt.compare(motDePasse, admin.motDePasseHash)))
      return res.status(400).json({ error: 'Mot de passe incorrect.' });
    const pas = verifierCode(chiffreur.dechiffrer(admin.totpSecret), code, {
      dernierPas: admin.totpDernierPas,
    });
    if (pas === null && trouverCode(admin.codesSecours ?? [], code) === -1)
      return res.status(400).json({ error: 'Code incorrect.' });
    await prisma.administrateur.update({
      where: { id: admin.id },
      data: { totpSecret: null, totpActifLe: null, totpDernierPas: null, codesSecours: [] },
    });
    res.json({ message: 'Double authentification désactivée.' });
  });

  r.get('/me', async (req, res) => {
    const admin = await prisma.administrateur.findUnique({ where: { id: req.session.adminId } });
    if (!admin) return res.status(401).json(SESSION_REQUISE);
    res.json({ email: admin.email, role: admin.role, deuxFacteurs: Boolean(admin.totpActifLe) });
  });

  return r;
}
