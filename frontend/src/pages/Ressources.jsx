import { useMemo, useState } from 'react';
import MessageErreur from '../components/MessageErreur.jsx';
import TableauAdaptatif from '../components/TableauAdaptatif.jsx';
import RechercheCollante from '../components/RechercheCollante.jsx';
import { useRemonterSurResultats } from '../lib/useRemonterSurResultats.js';
import Icone from '../components/Icone.jsx';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { formaterDate } from '../lib/format.js';
import ChampSuggestions from '../components/ChampSuggestions.jsx';
import { suggererRessources } from '../lib/rechercheRessources.js';
import LienExterne from '../components/LienExterne.jsx';

// Libellés lisibles des catégories connues ; sinon « cout_de_la_vie » → « Cout de la vie » (les catégories viennent des données).
const LIBELLES_CATEGORIES = {
  aides: 'Aides',
  logement: 'Logement',
  etudes: 'Études',
  etudiants_etrangers: 'Étudiants étrangers',
  alimentation: 'Alimentation',
  emploi: 'Emploi',
  droits: 'Droits',
  sante: 'Santé',
};
const libelleCategorie = (c) => {
  if (LIBELLES_CATEGORIES[c]) return LIBELLES_CATEGORIES[c];
  const t = c.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const sansAccent = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Ressources() {
  usePageTitre('Ressources');
  const { data, erreur, chargement, recharger } = useApi('/ressources');
  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useState('');
  useRemonterSurResultats('resultats-ressources', recherche, categorie);
  const [choix, setChoix] = useState(null); // ressource touchée dans les suggestions : on n'affiche qu'elle

  const categories = useMemo(
    () => [...new Set((data ?? []).map((r) => r.categorie))].sort(),
    [data],
  );
  const visibles = useMemo(() => {
    if (choix) return (data ?? []).filter((r) => r.id === choix);
    const q = sansAccent(recherche.trim());
    return (data ?? []).filter(
      (r) =>
        (!categorie || r.categorie === categorie) &&
        (!q || sansAccent(`${r.titre} ${r.organisme} ${r.type}`).includes(q)),
    );
  }, [data, recherche, categorie, choix]);
  const suggestions = useMemo(
    () =>
      suggererRessources(
        (data ?? []).filter((r) => !categorie || r.categorie === categorie),
        recherche,
        libelleCategorie,
      ).map((s) => ({
        cle: s.ressource.id,
        titre: s.ressource.titre,
        detail: s.detail,
        brut: s.ressource,
      })),
    [data, recherche, categorie],
  );

  return (
    <>
      <header className="page-titre">
        <h1>Guides et sources utiles</h1>
        <p>
          Les sites officiels pour faire vos démarches, et les études sur lesquelles s’appuie
          CampusLens.
        </p>
      </header>

      <div style={data || erreur ? undefined : { minHeight: '70vh' }} aria-busy={chargement}>
        {erreur && <MessageErreur erreur={erreur} surReessayer={recharger} />}
        {chargement && (
          <p className="message" role="status">
            Chargement des ressources…
          </p>
        )}

        {data && (
          <section className="carte" aria-label="Liste des ressources">
            <RechercheCollante>
              <ChampSuggestions
                libelle="Rechercher une ressource, un rapport"
                placeholder="Titre, organisme ou thème"
                aide="Exemples : « visale », « ameli », « bourse », « logement ». Touchez une suggestion pour aller droit au résultat."
                libelleListe="Ressources proposées"
                suggestions={suggestions}
                valeur={recherche}
                idResultats="resultats-ressources"
                surChangement={(texte) => {
                  setRecherche(texte);
                  setChoix(null);
                }}
                surChoix={(r) => {
                  setRecherche(r.titre);
                  setChoix(r.id);
                }}
              />
            </RechercheCollante>
            <div className="barre-recherche">
              <div className="pastilles" role="group" aria-label="Catégorie" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`pastille${categorie === '' ? ' pastille-active' : ''}`}
                  aria-pressed={categorie === ''}
                  onClick={() => {
                    setCategorie('');
                    setChoix(null);
                  }}
                >
                  Toutes
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`pastille${categorie === c ? ' pastille-active' : ''}`}
                    aria-pressed={categorie === c}
                    onClick={() => {
                      setCategorie(c);
                      setChoix(null);
                    }}
                  >
                    {libelleCategorie(c)}
                  </button>
                ))}
              </div>
            </div>

            <div id="resultats-ressources" tabIndex={-1} style={{ outline: 'none' }}>
              <p className="sr-only" role="status">
                {visibles.length} ressource{visibles.length > 1 ? 's' : ''} affichée
                {visibles.length > 1 ? 's' : ''}
              </p>
              {visibles.length === 0 ? (
                <p className="message" style={{ marginTop: 16 }}>
                  Aucune ressource ne correspond à votre recherche.
                </p>
              ) : (
                <TableauAdaptatif libelle="Tableau des ressources" seuil={860}>
                  <table className="tableau">
                    <caption className="sr-only">Démarches et documents officiels</caption>
                    <thead>
                      <tr>
                        <th scope="col">Titre</th>
                        <th scope="col">Type</th>
                        <th scope="col">Source</th>
                        <th scope="col">Catégorie</th>
                        <th scope="col">Année</th>
                        <th scope="col">Ouvrir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((r) => (
                        <tr key={r.id}>
                          <th scope="row">
                            {r.titre}
                            {r.statutLien === 'casse' && (
                              <span className="badge badge-rouge-clair">Lien cassé : signalé</span>
                            )}
                            {r.statutLien === 'deplace' && (
                              <span className="badge badge-orange" style={{ marginLeft: 8 }}>
                                Adresse modifiée
                              </span>
                            )}
                          </th>
                          <td>{r.type}</td>
                          <td>
                            {r.organisme}
                            {r.aVerifier && (
                              <span className="a-verifier">vérification en cours</span>
                            )}
                            {r.verifieLe && (
                              <span className="fraicheur">
                                <br />
                                vérifié le {formaterDate(r.verifieLe)}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="badge badge-gris">
                              {libelleCategorie(r.categorie)}
                            </span>
                          </td>
                          <td>{r.annee ?? '—'}</td>
                          <td>
                            {r.statutLien === 'casse' ? (
                              <span className="fraicheur">Indisponible</span>
                            ) : (
                              <LienExterne
                                href={r.url}
                                annonce={false}
                                aria-label={`Ouvrir : ${r.titre} (nouvel onglet)`}
                              >
                                <Icone nom="fleche" />
                              </LienExterne>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableauAdaptatif>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
