import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { valider } from '../lib/validation.js';

const loginSchema = z.object({
  email: z.email().max(254),
  motDePasse: z.string().min(1).max(200),
});

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

export function routesAdmin(prisma) {
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

  r.get('/me', async (req, res) => {
    const admin = await prisma.administrateur.findUnique({ where: { id: req.session.adminId } });
    if (!admin) return res.status(401).json({ error: 'Authentification requise.' });
    res.json({ email: admin.email, role: admin.role });
  });

  return r;
}
