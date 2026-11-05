import nodemailer from 'nodemailer';

/**
 * Prévient l'administrateur par e-mail qu'il a des messages non lus.
 *
 * Confidentialité : le courriel ne contient NI le message, NI l'adresse de l'expéditeur. Il indique seulement
 * le nombre de messages non lus et un lien vers l'espace d'administration (où il faut se connecter).
 *
 * Anti-déluge : au plus un courriel toutes les `intervalleMs` (10 min par défaut). Les messages qui arrivent
 * dans l'intervalle sont regroupés dans le courriel suivant (« 3 messages non lus »), jamais perdus.
 *
 * Sans configuration (SMTP_URL et NOTIFICATION_EMAIL), le notificateur est inactif : rien ne s'envoie.
 */
export function creerNotificateur({
  prisma,
  transport,
  destinataire,
  expediteur,
  urlAdmin = 'http://localhost:5173/admin/messages',
  intervalleMs = 10 * 60_000,
  maintenant = () => Date.now(),
  planifier = setTimeout,
  annuler = clearTimeout,
  journal = console,
} = {}) {
  if (!transport || !destinataire) return { actif: false, prevenir() {}, arreter() {} };

  let dernierEnvoi = 0;
  let minuterie = null;

  async function envoyer() {
    minuterie = null;
    try {
      const nombre = await prisma.messageContact.count({ where: { luLe: null } });
      if (nombre === 0) return; // déjà lus (ou supprimés) entre-temps : rien à signaler
      await transport.sendMail({
        from: expediteur ?? destinataire,
        to: destinataire,
        subject: `CampusLens : ${nombre} message${nombre > 1 ? 's' : ''} non lu${nombre > 1 ? 's' : ''}`,
        text:
          `Vous avez ${nombre} message${nombre > 1 ? 's' : ''} non lu${nombre > 1 ? 's' : ''} sur CampusLens.\n\n` +
          `Pour le${nombre > 1 ? 's' : ''} lire, connectez-vous à l'espace d'administration :\n${urlAdmin}\n\n` +
          `Par confidentialité, ce courriel ne contient pas le contenu des messages.`,
      });
      dernierEnvoi = maintenant();
    } catch (e) {
      // On ne journalise que le type d'erreur : le message d'erreur d'un serveur de courriel peut citer des identifiants.
      journal.error('[notification] envoi impossible :', e?.code ?? e?.name ?? 'erreur');
    }
  }

  return {
    actif: true,
    /** À appeler quand un message arrive : programme l'envoi (immédiat, ou différé si un courriel vient de partir). */
    prevenir() {
      if (minuterie) return; // un envoi est déjà programmé : il comptera ce message aussi
      const attente = Math.max(0, dernierEnvoi + intervalleMs - maintenant());
      minuterie = planifier(envoyer, attente);
      minuterie?.unref?.();
    },
    arreter() {
      if (minuterie) annuler(minuterie);
      minuterie = null;
    },
    envoyer, // exposé pour les tests
  };
}

/** Construit le notificateur depuis les variables d'environnement (inactif si elles manquent). */
export function notificateurDepuisEnv(prisma, env = process.env) {
  if (!env.SMTP_URL || !env.NOTIFICATION_EMAIL) return creerNotificateur({ prisma });
  const site = (env.SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  return creerNotificateur({
    prisma,
    transport: nodemailer.createTransport(env.SMTP_URL),
    destinataire: env.NOTIFICATION_EMAIL,
    expediteur: env.SMTP_FROM,
    urlAdmin: `${site}/admin/messages`,
    intervalleMs: (Number(env.NOTIFICATION_INTERVALLE_MIN) || 10) * 60_000,
  });
}
