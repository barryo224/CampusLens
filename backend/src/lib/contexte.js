import { ErreurValidation } from './validation.js';

/** Année universitaire : « en_cours » (défaut) ou un libellé comme « 2026-2027 ». */
export async function trouverAnnee(prisma, annee = 'en_cours') {
  const where = annee === 'en_cours' ? { enCours: true } : { libelle: annee };
  const trouvee = await prisma.anneeUniversitaire.findFirst({ where });
  if (!trouvee) throw new ErreurValidation(`Année universitaire introuvable : ${annee}`);
  return trouvee;
}

/** Vérifie qu'un code de profil existe en base (la liste des profils vient de la base). */
export async function trouverProfil(prisma, code) {
  const profil = await prisma.profil.findUnique({ where: { code } });
  if (!profil) throw new ErreurValidation(`Profil inconnu : ${code}`);
  return profil;
}
