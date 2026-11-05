import { Router } from 'express';
import { z } from 'zod';
import { valider } from '../lib/validation.js';

const contactSchema = z.object({
  objet: z.string().trim().min(1, 'obligatoire').max(150),
  message: z.string().trim().min(1, 'obligatoire').max(5000),
  email: z.email('adresse e-mail invalide').max(254),
  // Champ piège (honeypot) : invisible pour un humain, rempli par les robots.
  siteWeb: z.string().max(200).optional(),
});

/** Date + n mois (suppression automatique du message : RGPD). */
export function ajouterMois(date, mois) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + mois);
  return d;
}

/**
 * POST /api/contact : la SEULE écriture publique.
 * On ne stocke que ce qui est nécessaire, avec une date de suppression automatique.
 */
export function routeContact(prisma, { moisConservation = 6, notificateur } = {}) {
  const r = Router();
  r.post('/contact', async (req, res) => {
    const { siteWeb, ...donnees } = valider(contactSchema, req.body);

    // Un robot a rempli le champ piège : on répond « succès » sans rien enregistrer.
    if (siteWeb) return res.status(201).json({ message: 'Message envoyé. Merci !' });

    const maintenant = new Date();
    await prisma.messageContact.create({
      data: { ...donnees, supprimerApres: ajouterMois(maintenant, moisConservation) },
    });
    notificateur?.prevenir(); // e-mail de prévenance (sans le contenu du message), si configuré
    res.status(201).json({ message: 'Message envoyé. Merci !' });
  });
  return r;
}
