import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { prismaTest, viderBase } from './helpers/db.js';
import { createApp } from '../src/app.js';
import { creerNotificateur, notificateurDepuisEnv } from '../src/notifications/courriel.js';

describe('Notification par e-mail des nouveaux messages', () => {
  const prisma = prismaTest();
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
  });
  afterEach(() => vi.useRealTimers());

  const creerMessage = (objet = 'Question', extra = {}) =>
    prisma.messageContact.create({
      data: {
        objet,
        message: 'Contenu confidentiel du message',
        email: 'etudiant@secret.fr',
        supprimerApres: new Date(Date.now() + 1e9),
        ...extra,
      },
    });

  const monter = (options = {}) => {
    const transport = { sendMail: vi.fn(async () => ({})) };
    const journal = { error: vi.fn(), log: vi.fn() };
    const n = creerNotificateur({
      prisma,
      transport,
      destinataire: 'moi@exemple.fr',
      urlAdmin: 'https://site.test/admin/messages',
      journal,
      intervalleMs: 600_000,
      ...options,
    });
    return { n, transport, journal };
  };

  it('inactif sans configuration : rien ne s’envoie, aucune erreur', async () => {
    expect(creerNotificateur({ prisma }).actif).toBe(false);
    expect(notificateurDepuisEnv(prisma, {}).actif).toBe(false);
    expect(notificateurDepuisEnv(prisma, { SMTP_URL: 'smtp://x' }).actif).toBe(false); // destinataire manquant
    expect(() => creerNotificateur({ prisma }).prevenir()).not.toThrow();
  });

  it('se configure avec SMTP_URL et NOTIFICATION_EMAIL', () => {
    const n = notificateurDepuisEnv(prisma, {
      SMTP_URL: 'smtp://localhost:1025',
      NOTIFICATION_EMAIL: 'moi@exemple.fr',
      SITE_URL: 'https://site.test/',
    });
    expect(n.actif).toBe(true);
    n.arreter();
  });

  it('une SMTP_URL mal écrite ne fait pas planter le site, et son mot de passe n’est jamais écrit dans les journaux', () => {
    const journal = { warn: vi.fn() };
    for (const mauvaise of [
      'mtps://resend:re_MOT_DE_PASSE_SECRET@smtp.resend.com:2465', // « s » du début perdu
      'resend:re_MOT_DE_PASSE_SECRET@smtp.resend.com:2465',
      '  http://smtp.exemple.fr  ',
    ]) {
      const n = notificateurDepuisEnv(
        prisma,
        { SMTP_URL: mauvaise, NOTIFICATION_EMAIL: 'moi@exemple.fr' },
        journal,
      );
      expect(n.actif).toBe(false);
    }
    expect(journal.warn).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(journal.warn.mock.calls)).not.toContain('re_MOT_DE_PASSE_SECRET');
  });

  it('une adresse smtps:// valide (Resend, port 2465) active les notifications', () => {
    const n = notificateurDepuisEnv(
      prisma,
      {
        SMTP_URL: 'smtps://resend:re_cle@smtp.resend.com:2465',
        NOTIFICATION_EMAIL: 'moi@exemple.fr',
      },
      { warn: vi.fn() },
    );
    expect(n.actif).toBe(true);
    n.arreter();
  });

  it('un nouveau message → un courriel avec le NOMBRE et un lien, jamais le contenu ni l’expéditeur', async () => {
    const { n, transport } = monter();
    await creerMessage('Sujet très privé');
    n.prevenir();
    await vi.waitFor(() => expect(transport.sendMail).toHaveBeenCalledTimes(1));
    const mail = transport.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('moi@exemple.fr');
    expect(mail.subject).toBe('CampusLens : 1 message non lu');
    expect(mail.text).toContain('https://site.test/admin/messages');
    const tout = JSON.stringify(mail);
    for (const secret of ['Contenu confidentiel', 'etudiant@secret.fr', 'Sujet très privé'])
      expect(tout, secret).not.toContain(secret);
  });

  it('regroupe : plusieurs messages dans l’intervalle → un seul courriel suivant, avec le total (pluriel correct)', async () => {
    vi.useFakeTimers();
    const t = { v: 1_000_000 };
    const { n, transport } = monter({ maintenant: () => t.v });
    await creerMessage('1');
    n.prevenir();
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(transport.sendMail).toHaveBeenCalledTimes(1)); // l'accès à la base prend un instant réel

    // 3 messages arrivent dans les 10 minutes suivantes : AUCUN courriel tout de suite…
    t.v += 60_000;
    for (const o of ['2', '3', '4']) {
      await creerMessage(o);
      n.prevenir();
    }
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    // … puis UN courriel groupé quand l'intervalle est écoulé.
    t.v += 600_000;
    await vi.advanceTimersByTimeAsync(600_000);
    await vi.waitFor(() => expect(transport.sendMail).toHaveBeenCalledTimes(2));
    expect(transport.sendMail.mock.calls[1][0].subject).toBe('CampusLens : 4 messages non lus');
    expect(transport.sendMail.mock.calls[1][0].text).toContain('4 messages non lus');
  });

  it('rien à signaler (déjà lus ou supprimés avant l’envoi) → pas de courriel', async () => {
    const { n, transport } = monter();
    const m = await creerMessage();
    n.prevenir();
    await prisma.messageContact.update({ where: { id: m.id }, data: { luLe: new Date() } }); // lu entre-temps
    await vi.waitFor(() =>
      expect(prisma.messageContact.count({ where: { luLe: null } })).resolves.toBe(0),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('une panne du serveur de courriel ne fait rien planter et ne divulgue pas d’identifiants dans les journaux', async () => {
    const transport = {
      sendMail: vi.fn(async () => {
        throw Object.assign(
          new Error('Invalid login smtps://moi:MOT-DE-PASSE-SECRET@smtp.exemple.fr'),
          { code: 'EAUTH' },
        );
      }),
    };
    const journal = { error: vi.fn(), log: vi.fn() };
    const n = creerNotificateur({ prisma, transport, destinataire: 'moi@exemple.fr', journal });
    await creerMessage();
    n.prevenir();
    await vi.waitFor(() => expect(journal.error).toHaveBeenCalled());
    const journalise = JSON.stringify(journal.error.mock.calls);
    expect(journalise).toContain('EAUTH');
    expect(journalise).not.toContain('MOT-DE-PASSE-SECRET');
  });

  it('un seul envoi programmé à la fois ; arreter() annule', async () => {
    vi.useFakeTimers();
    const { n, transport } = monter();
    await creerMessage();
    n.prevenir();
    n.prevenir();
    n.prevenir();
    n.arreter();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('via le formulaire de contact : un message valide déclenche la prévenance, un message refusé ou un robot non', async () => {
    const prevenir = vi.fn();
    const app = createApp({ prisma, notificateur: { prevenir } });
    const valide = { objet: 'Bonjour', email: 'a@b.fr', message: 'Un message' };
    expect((await request(app).post('/api/contact').send(valide)).status).toBe(201);
    expect(prevenir).toHaveBeenCalledTimes(1);
    expect(
      (
        await request(app)
          .post('/api/contact')
          .send({ ...valide, email: 'pas-un-email' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/contact')
          .send({ ...valide, siteWeb: 'http://spam.example' })
      ).status,
    ).toBe(201); // champ piège
    expect(prevenir).toHaveBeenCalledTimes(1); // ni l'erreur de validation ni le robot ne déclenchent d'e-mail
  });
});
