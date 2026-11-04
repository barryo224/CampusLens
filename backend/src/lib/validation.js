import { z } from 'zod';

/** Erreur de validation : devient une réponse 400 claire. */
export class ErreurValidation extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.expose = true;
  }
}

/** Valide `donnees` avec un schéma Zod ; lève une 400 lisible sinon. */
export function valider(schema, donnees) {
  const resultat = schema.safeParse(donnees);
  if (!resultat.success) {
    const detail = resultat.error.issues
      .map((i) => `${i.path.join('.') || 'requête'} : ${i.message}`)
      .join(' ; ');
    throw new ErreurValidation(`Paramètres invalides — ${detail}`);
  }
  return resultat.data;
}

// Un code (profil, catégorie…) : lettres minuscules, chiffres et _ uniquement.
export const codeSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9_]+$/, 'caractères autorisés : a-z, 0-9 et _');

export const idSchema = z.coerce.number().int().positive();
