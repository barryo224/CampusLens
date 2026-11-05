import { Router } from 'express';
import { z } from 'zod';
import { valider } from '../lib/validation.js';
import { ajouterMois } from './contact.js';

export const PAGES_AVIS = [
  'accueil',
  'evaluer',
  'aides',
  'budget',
  'ressources',
  'a_propos',
  'autre',
];
export const PROFILS_AVIS = ['fr_ue', 'boursier', 'intl'];

const avisSchema = z.object({
  note: z.number().int('note de 1 à 5').min(1, 'note de 1 à 5').max(5, 'note de 1 à 5'),
  // Facultatif : une note seule suffit. Un texte vide est traité comme « pas de commentaire ».
  commentaire: z
    .string()
    .trim()
    .max(1500)
    .optional()
    .transform((t) => t || undefined),
  page: z.enum(PAGES_AVIS).optional(),
  profil: z.enum(PROFILS_AVIS).optional(),
  // Champ piège (honeypot) : invisible pour un humain, rempli par les robots.
  siteWeb: z.string().max(200).optional(),
});

/**
 * POST /api/avis : un visiteur note le site et raconte son expérience.
 * ANONYME : on ne stocke ni nom, ni e-mail, ni adresse IP (la limite de débit se fait en mémoire).
 * L'avis est supprimé automatiquement après `moisConservation` mois.
 */
export function routeAvis(prisma, { moisConservation = 12 } = {}) {
  const r = Router();
  r.post('/avis', async (req, res) => {
    const { siteWeb, ...donnees } = valider(avisSchema, req.body);
    // Un robot a rempli le champ piège : on répond « succès » sans rien enregistrer.
    if (siteWeb) return res.status(201).json({ message: 'Merci pour votre avis !' });
    await prisma.avis.create({
      data: { ...donnees, supprimerApres: ajouterMois(new Date(), moisConservation) },
    });
    res.status(201).json({ message: 'Merci pour votre avis !' });
  });
  return r;
}
