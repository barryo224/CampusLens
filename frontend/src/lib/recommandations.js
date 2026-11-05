import { trouverParametre } from './simulation.js';

/**
 * Choisit jusqu'à 4 recommandations selon le profil, le résultat et la part du loyer
 * dans les revenus (spécification, section 2). Le seuil de loyer vient de la base
 * (paramètre `seuil_part_loyer`) : s'il manque, cette recommandation est simplement ignorée.
 *
 * Les textes sont des conseils (pas des chiffres de référence) ; les chiffres affichés
 * sont ceux calculés pour l'étudiant.
 */
export function choisirRecommandations({ profil, resultat, parametres }) {
  const liste = [];

  const etranger = profil.statut === 'intl';

  // Un étudiant étranger a d'abord intérêt à demander l'exonération des droits différenciés (c'est son plus gros poste).
  if (etranger && !profil.exonere && !profil.boursier) {
    liste.push({
      id: 'exoneration',
      titre: 'Demander une exonération',
      texte: 'Votre université peut ramener vos droits d’inscription au tarif national.',
      lien: { vers: '/aides?profil=intl', libelle: 'Voir les aides' },
    });
  }

  if (!profil.boursier) {
    liste.push({
      id: 'bourse',
      titre: 'Tester la bourse CROUS',
      texte: etranger
        ? 'Les étudiants étrangers y ont droit sous conditions (domicile fiscal en France depuis 2 ans). Elle offre aussi les droits d’inscription et la CVEC.'
        : 'Elle offre aussi les droits d’inscription et la CVEC.',
      lien: {
        vers: etranger ? '/aides?profil=intl' : '/aides?profil=boursier',
        libelle: 'Voir les aides',
      },
    });
  }

  let seuilLoyer = null;
  try {
    seuilLoyer = trouverParametre(parametres, 'seuil_part_loyer');
  } catch {
    seuilLoyer = null; // paramètre absent : on n'invente pas de seuil
  }
  if (
    seuilLoyer !== null &&
    resultat.partLoyer !== null &&
    resultat.partLoyer * 100 >= seuilLoyer
  ) {
    liste.push({
      id: 'loyer',
      titre: `Loyer : ${Math.round(resultat.partLoyer * 100)} % de vos revenus`,
      texte: 'Comparez les villes et demandez la garantie Visale pour éviter un garant.',
      lien: { vers: '/aides?onglet=villes', libelle: 'Comparer les villes' },
    });
  }

  if (resultat.niveau !== 'equilibre') {
    liste.push({
      id: 'urgence',
      titre: 'Aide d’urgence',
      texte:
        'Le CROUS et votre université ont des aides ponctuelles, sur rendez-vous avec une assistante sociale.',
      lien: { vers: '/aides?besoin=urgence', libelle: 'Voir les aides d’urgence' },
    });
    liste.push({
      id: 'courses',
      titre: 'Réduire les courses',
      texte: 'Épiceries solidaires, distributions alimentaires et repas CROUS à tarif social.',
      lien: { vers: '/aides?onglet=associations', libelle: 'Voir les associations' },
    });
  }

  if (resultat.niveau === 'equilibre') {
    liste.push({
      id: 'equilibre',
      titre: 'Votre budget est équilibré',
      texte: 'Anticipez les gros postes de la rentrée pour garder cette marge.',
      lien: { vers: '/budget', libelle: 'Préparer mon budget' },
    });
  }

  return liste.slice(0, 4);
}
