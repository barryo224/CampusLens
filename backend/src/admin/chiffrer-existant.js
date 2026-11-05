// Chiffre les messages et avis déjà présents en base (enregistrés avant l'arrivée du chiffrement) :
//   npm run donnees:chiffrer
// Sans danger à relancer : une valeur déjà chiffrée n'est jamais rechiffrée.
import { creerPrisma } from '../db.js';
import { chiffreurDepuisEnv } from '../lib/chiffrement.js';

export async function chiffrerDonneesExistantes(prisma, chiffreur) {
  let messages = 0;
  let avis = 0;
  for (const m of await prisma.messageContact.findMany()) {
    if (
      chiffreur.estChiffre(m.email) &&
      chiffreur.estChiffre(m.message) &&
      chiffreur.estChiffre(m.objet)
    )
      continue;
    await prisma.messageContact.update({
      where: { id: m.id },
      data: {
        objet: chiffreur.estChiffre(m.objet) ? m.objet : chiffreur.chiffrer(m.objet),
        message: chiffreur.estChiffre(m.message) ? m.message : chiffreur.chiffrer(m.message),
        email: chiffreur.estChiffre(m.email) ? m.email : chiffreur.chiffrer(m.email),
      },
    });
    messages++;
  }
  for (const a of await prisma.avis.findMany({ where: { commentaire: { not: null } } })) {
    if (chiffreur.estChiffre(a.commentaire)) continue;
    await prisma.avis.update({
      where: { id: a.id },
      data: { commentaire: chiffreur.chiffrer(a.commentaire) },
    });
    avis++;
  }
  return { messages, avis };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const prisma = creerPrisma();
  try {
    const r = await chiffrerDonneesExistantes(
      prisma,
      chiffreurDepuisEnv({ production: process.env.NODE_ENV === 'production' }),
    );
    console.log(`Chiffrés : ${r.messages} message(s) et ${r.avis} avis.`);
  } finally {
    await prisma.$disconnect();
  }
}
