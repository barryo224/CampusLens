import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

/**
 * Deuxième étape de la connexion : un code à 6 chiffres envoyé par e-mail (comme beaucoup de sites).
 *  - le code n'est JAMAIS stocké en clair : seulement une empreinte salée (HMAC-SHA256) dans la session côté serveur ;
 *  - valable une seule fois, remplacé à chaque renvoi (l'ancien ne marche plus) ;
 *  - renvoi possible 30 secondes après l'envoi précédent, au plus 4 envois par tentative de connexion.
 */
export const DELAI_RENVOI_MS = 30_000;
export const ENVOIS_MAX_PAR_CONNEXION = 4;

export const genererCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

const empreinte = (code, sel) => crypto.createHmac('sha256', sel).update(String(code)).digest();

/** Prépare ce qu'on garde en session pour un code : empreinte salée, jamais le code. */
export function preparerCode(code, maintenant = Date.now()) {
  const sel = crypto.randomBytes(16).toString('hex');
  return { sel, empreinte: empreinte(code, sel).toString('hex'), envoyeLe: maintenant };
}

/** Comparaison en temps constant ; accepte les espaces saisis par erreur (« 123 456 »). */
export function codeCorrect(saisie, memorise) {
  if (!memorise?.sel || !memorise?.empreinte) return false;
  const propre = String(saisie ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(propre)) return false;
  return crypto.timingSafeEqual(
    empreinte(propre, memorise.sel),
    Buffer.from(memorise.empreinte, 'hex'),
  );
}

/** « ousmane@gmail.com » → « o*****e@gmail.com » : on confirme la boîte sans l'afficher en entier. */
export function masquerAdresse(email) {
  const [local = '', domaine = ''] = String(email).split('@');
  if (local.length <= 2) return `${local[0] ?? ''}*@${domaine}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 6))}${local.at(-1)}@${domaine}`;
}

/** Envoyeur inactif : sans configuration d'e-mail, la connexion garde l'application d'authentification seule. */
export const ENVOYEUR_INACTIF = { actif: false, async envoyer() {} };

export function creerEnvoyeurCode({ transport, expediteur, journal = console } = {}) {
  if (!transport || !expediteur) return ENVOYEUR_INACTIF;
  return {
    actif: true,
    /** Renvoie true si le message est parti. Ne journalise jamais le code ni l'adresse. */
    async envoyer(destinataire, code) {
      try {
        await transport.sendMail({
          from: expediteur,
          to: destinataire,
          subject: 'CampusLens : votre code de connexion',
          text:
            `Votre code de connexion CampusLens : ${code}\n\n` +
            `Il est valable 5 minutes et ne sert qu'une fois.\n` +
            `Si vous n'êtes pas à l'origine de cette connexion, changez votre mot de passe sans attendre ` +
            `et ne communiquez ce code à personne.`,
        });
        return true;
      } catch (e) {
        journal.error('[connexion] envoi du code impossible :', e?.code ?? e?.name ?? 'erreur');
        return false;
      }
    },
  };
}

export function envoyeurCodeDepuisEnv(env = process.env, journal = console) {
  const adresse = String(env.SMTP_URL ?? '').trim();
  const expediteur = env.SMTP_FROM || env.NOTIFICATION_EMAIL;
  if (!adresse || !expediteur) return ENVOYEUR_INACTIF;
  if (!/^smtps?:\/\//i.test(adresse)) return ENVOYEUR_INACTIF; // l'avertissement est déjà donné par les notifications
  try {
    return creerEnvoyeurCode({
      transport: nodemailer.createTransport(adresse),
      expediteur,
      journal,
    });
  } catch {
    return ENVOYEUR_INACTIF;
  }
}
