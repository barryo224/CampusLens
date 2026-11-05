import { z } from 'zod';
import { telecharger, ErreurSource } from '../http.js';

const variableSchema = z
  .object({ id: z.string(), entity: z.string(), valueType: z.string() })
  .passthrough();

/**
 * Robot de niveau 2 — surveillance du moteur de calcul OpenFisca (spécification : « calcul à la source »).
 * Il ne copie aucune règle : il vérifie chaque jour que le moteur répond, que la variable que nous utilisons
 * (`aide_logement`) existe toujours avec la forme attendue, et il note la version du moteur dans l'historique
 * (utile pour comprendre pourquoi une estimation change).
 */
export const robotOpenfisca = {
  cle: 'openfisca',
  niveau: 1,

  async telecharger({ source, fetchImpl }) {
    const r = await telecharger(`${source.url}/variable/aide_logement`, { fetchImpl });
    return {
      contenu: `${r.entete('country-package')}|${r.entete('country-package-version')}`,
      corps: r.texte,
      paquet: r.entete('country-package'),
      version: r.entete('country-package-version'),
    };
  },

  async analyser({ corps, paquet, version }) {
    if (paquet !== 'openfisca-france' || !version)
      throw new ErreurSource('Le moteur de calcul ne se présente pas comme OpenFisca France.');
    let json;
    try {
      json = JSON.parse(corps);
    } catch (e) {
      throw new ErreurSource('Réponse inattendue d’OpenFisca.', { cause: e });
    }
    const v = variableSchema.safeParse(json);
    if (!v.success || v.data.entity !== 'famille' || v.data.valueType !== 'Float') {
      throw new ErreurSource(
        'La variable « aide_logement » a changé de forme dans OpenFisca : à vérifier.',
      );
    }
    return { version };
  },

  // Aucune donnée métier à écrire : on journalise seulement le changement de version du moteur.
  async appliquer({ tx, source, donnees }) {
    const derniere = await tx.historiqueValeur.findFirst({
      where: { tableCible: 'source', ligneId: String(source.id), champ: 'version_moteur' },
      orderBy: { id: 'desc' },
    });
    return [
      {
        table: 'source',
        ligneId: source.id,
        champ: 'version_moteur',
        ancienne: derniere?.nouvelleValeur ?? null,
        nouvelle: `openfisca-france ${donnees.version}`,
      },
    ];
  },
};
