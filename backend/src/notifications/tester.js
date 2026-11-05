// Envoie un courriel de test pour vérifier la configuration :   npm run notif:tester -w backend
import nodemailer from 'nodemailer';

const { SMTP_URL, NOTIFICATION_EMAIL, SMTP_FROM } = process.env;
if (!SMTP_URL || !NOTIFICATION_EMAIL) {
  console.error('Définir SMTP_URL et NOTIFICATION_EMAIL dans backend/.env (voir .env.example).');
  process.exit(1);
}
try {
  await nodemailer.createTransport(SMTP_URL).sendMail({
    from: SMTP_FROM ?? NOTIFICATION_EMAIL,
    to: NOTIFICATION_EMAIL,
    subject: 'CampusLens : test des notifications',
    text: 'Si vous lisez ce message, les notifications de CampusLens fonctionnent.',
  });
  console.log(
    `✅ Courriel de test envoyé à ${NOTIFICATION_EMAIL}. Vérifiez votre boîte (et les indésirables).`,
  );
} catch (e) {
  console.error(
    `❌ Envoi impossible (${e?.code ?? e?.name ?? 'erreur'}). Vérifiez SMTP_URL (identifiant, mot de passe d'application, port).`,
  );
  process.exit(1);
}
