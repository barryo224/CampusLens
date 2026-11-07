import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MessageErreur from '../components/MessageErreur.jsx';
import TableauAdaptatif from '../components/TableauAdaptatif.jsx';
import Fraicheur from '../components/Fraicheur.jsx';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { trouverParametre } from '../lib/simulation.js';
import { formaterEuro, formaterEuroCentimes } from '../lib/format.js';

const SITUATIONS = [
  { code: 'arrivee', libelle: 'Je viens d’arriver en France' },
  { code: 'sur_place', libelle: 'Je suis déjà en France' },
];

const PROFILS = [
  { code: 'fr_ue', libelle: 'Étudiant français ou UE' },
  { code: 'boursier', libelle: 'Étudiant boursier' },
  { code: 'intl', libelle: 'Étudiant international hors UE' },
];

const NIVEAUX = [
  { code: 'licence', libelle: 'Licence' },
  { code: 'master', libelle: 'Master' },
];

/** Droits d'inscription et CVEC d'un profil et d'un niveau d'études, d'après les paramètres de la base. */
function fraisProfil(parametres, code, niveau, exonere = false) {
  try {
    if (code === 'boursier') return { droits: 0, cvec: 0 };
    const droits = trouverParametre(parametres, 'droits_inscription', {
      niveau,
      profil: code === 'intl' && !exonere ? 'intl' : null,
    });
    return { droits, cvec: trouverParametre(parametres, 'cvec') };
  } catch {
    return null; // donnée absente : on affiche « — », jamais un montant deviné
  }
}

/** « Je viens d’arriver en France » → « je viens d’arriver en France » (seule la première lettre change : « France » garde sa majuscule). */
const minusculeInitiale = (texte) => texte.charAt(0).toLowerCase() + texte.slice(1);

export default function Budget() {
  usePageTitre('Préparer mon budget');
  const [params, setParams] = useSearchParams();
  const profil = PROFILS.some((p) => p.code === params.get('profil'))
    ? params.get('profil')
    : 'fr_ue';
  // Pour un étudiant étranger, le budget n'est pas le même à l'arrivée (visa) et quand on est déjà en France.
  const situation =
    profil === 'intl' && params.get('situation') === 'sur_place' ? 'sur_place' : 'arrivee';
  const niveau = params.get('niveau') === 'master' ? 'master' : 'licence';
  // Un étudiant étranger exonéré des droits différenciés paie le tarif national.
  const exonere = profil === 'intl' && params.get('exonere') === 'oui';
  const choisir = (changements) => {
    const suivant = new URLSearchParams(params);
    for (const [cle, valeur] of Object.entries(changements)) {
      if (valeur) suivant.set(cle, valeur);
      else suivant.delete(cle);
    }
    setParams(suivant, { replace: true });
  };
  const requete = new URLSearchParams({ profil, niveau });
  if (profil === 'intl') {
    requete.set('situation', situation);
    if (exonere) requete.set('exonere', 'oui');
  }
  const postes = useApi(`/postes-rentree?${requete}`, { garderAnciennes: true });
  const parametres = useApi('/parametres?annee=en_cours');
  const aides = useApi('/aides?miseEnAvant=true&categorie=logement');

  const frais = useMemo(
    () =>
      parametres.data
        ? Object.fromEntries(
            PROFILS.map((p) => [
              p.code,
              fraisProfil(parametres.data.parametres, p.code, niveau, p.code === 'intl' && exonere),
            ]),
          )
        : null,
    [parametres.data, niveau, exonere],
  );
  const heuresMax = useMemo(() => {
    try {
      return trouverParametre(parametres.data.parametres, 'heures_travail_max', { profil: 'intl' });
    } catch {
      return null;
    }
  }, [parametres.data]);

  const ressourcesVisa = useMemo(() => {
    const p = parametres.data?.parametres.find((x) => x.cle === 'ressources_mensuelles_visa');
    return p ?? null;
  }, [parametres.data]);

  const montant = (n) => (n === null || n === undefined ? '—' : formaterEuro(n));
  const erreur = postes.erreur || parametres.erreur;
  // Tout ce qui dépend des données n'apparaît qu'une fois prêt : la zone réserve sa place pendant le chargement.
  const pret = Boolean(erreur) || Boolean(postes.data && parametres.data);
  const recharger = () => {
    postes.recharger();
    parametres.recharger();
    aides.recharger();
  };

  const maxPoste = postes.data ? Math.max(...postes.data.postes.map((p) => p.montant), 1) : 1;
  const fp = frais?.[profil];

  return (
    <>
      <header className="page-titre">
        <h1>Préparez votre budget avec les bons repères</h1>
        <p>
          Ce qu’il faut prévoir pour une année d’études, et les aides qui peuvent alléger chaque
          dépense.
        </p>
      </header>

      <div className="pastilles" role="group" aria-label="Je suis">
        <span>Je suis :</span>
        {PROFILS.map((p) => (
          <button
            key={p.code}
            type="button"
            className={`pastille${profil === p.code ? ' pastille-active' : ''}`}
            aria-pressed={profil === p.code}
            // Changer de profil efface les choix propres à l'ancien (exonération, situation) : rien ne reste coché en cachette.
            onClick={() => choisir({ profil: p.code, exonere: null, situation: null })}
          >
            {p.libelle}
          </button>
        ))}
      </div>
      <div className="pastilles" role="group" aria-label="Niveau d’études">
        <span>Niveau d’études :</span>
        {NIVEAUX.map((n) => (
          <button
            key={n.code}
            type="button"
            className={`pastille${niveau === n.code ? ' pastille-active' : ''}`}
            aria-pressed={niveau === n.code}
            onClick={() => choisir({ niveau: n.code })}
          >
            {n.libelle}
          </button>
        ))}
      </div>
      {profil === 'intl' && (
        <div className="pastilles" role="group" aria-label="Ma situation">
          <span>Ma situation :</span>
          {SITUATIONS.map((s) => (
            <button
              key={s.code}
              type="button"
              className={`pastille${situation === s.code ? ' pastille-active' : ''}`}
              aria-pressed={situation === s.code}
              onClick={() => choisir({ situation: s.code })}
            >
              {s.libelle}
            </button>
          ))}
          <label className="case">
            <input
              autoComplete="off"
              type="checkbox"
              checked={exonere}
              onChange={(e) => choisir({ exonere: e.target.checked ? 'oui' : null })}
            />
            Je suis exonéré des droits différenciés
          </label>
        </div>
      )}

      <div
        className="zone-donnees"
        style={pret ? undefined : { minHeight: '70vh' }}
        aria-busy={!pret}
      >
        {!pret && (
          <p className="message" role="status">
            Chargement des repères…
          </p>
        )}
        {erreur && <MessageErreur erreur={erreur} surReessayer={recharger} />}

        {pret && postes.data && (
          <>
            <ul className="grille grille-3 indicateurs">
              <li className="carte">
                <p className="indicateur-nom">Budget de rentrée à prévoir</p>
                <p className="indicateur-valeur">{montant(postes.data.total)}</p>
                <p className="fraicheur">
                  {`frais ponctuels pour le profil «\u00a0${PROFILS.find((p) => p.code === profil).libelle}${
                    profil === 'intl'
                      ? `, ${minusculeInitiale(SITUATIONS.find((s) => s.code === situation).libelle)}`
                      : ''
                  }\u00a0», année ${postes.data.annee}`}
                </p>
              </li>
              <li className="carte">
                <p className="indicateur-nom">Droits d’inscription</p>
                <p className="indicateur-valeur">{montant(fp?.droits)}</p>
                <p className="fraicheur">
                  en {niveau}
                  {profil === 'intl' && !exonere ? ', ou exonération possible' : ''}
                  {exonere ? ' (tarif national : exonéré)' : ''}
                </p>
              </li>
              <li className="carte">
                <p className="indicateur-nom">CVEC</p>
                <p className="indicateur-valeur">{montant(fp?.cvec)}</p>
                <p className="fraicheur">par an</p>
              </li>
            </ul>

            {profil === 'intl' && ressourcesVisa && (
              <section
                className="carte"
                style={{ marginTop: 16 }}
                aria-labelledby="titre-ressources"
              >
                <h2 id="titre-ressources" className="titre-carte">
                  À justifier pour votre visa et votre titre de séjour
                </h2>
                <p className="indicateur-valeur">
                  {formaterEuroCentimes(ressourcesVisa.valeur)} <small>par mois</small>
                </p>
                <p>
                  Soit {formaterEuroCentimes(ressourcesVisa.valeur * 12)} sur une année. C’est le
                  montant minimum de ressources que l’administration demande pour un visa ou un
                  titre de séjour « étudiant ». Ce montant est un repère : au renouvellement, la
                  décision revient à la préfecture, selon l’ensemble de votre dossier.
                  Renseignez-vous auprès d’elle sur la prise en compte d’un job étudiant (limité à{' '}
                  {heuresMax !== null ? `${heuresMax} heures par an` : 'un nombre d’heures annuel'}
                  ).
                </p>
                <Fraicheur
                  source={ressourcesVisa.source}
                  verifieLe={ressourcesVisa.verifieLe}
                  aVerifier={ressourcesVisa.aVerifier}
                />
              </section>
            )}

            <section className="carte" style={{ marginTop: 16 }} aria-labelledby="titre-postes">
              <h2 id="titre-postes" className="titre-carte">
                Ce qu’il faut prévoir à la rentrée, et comment l’alléger
              </h2>
              <ul className="postes">
                {postes.data.postes.map((p) => (
                  <li key={p.id} className="poste">
                    <span className="poste-nom">{p.nom}</span>
                    <span className="barre" aria-hidden="true">
                      <span style={{ width: `${(p.montant / maxPoste) * 100}%` }} />
                    </span>
                    <strong className="poste-montant">{montant(p.montant)}</strong>
                    <span className="poste-astuce">
                      {p.offert
                        ? `Offert avec votre bourse (${montant(p.montantSansBourse)} sinon)`
                        : (p.astuce ?? '—')}
                    </span>
                  </li>
                ))}
              </ul>
              {postes.data.postes[0] && (
                <Fraicheur
                  source={postes.data.postes[0].source}
                  verifieLe={postes.data.postes[0].verifieLe}
                  aVerifier={postes.data.postes.some((p) => p.aVerifier)}
                />
              )}
            </section>
          </>
        )}

        {pret && (
          <div className="budget-bas">
            <section className="carte" aria-labelledby="titre-regles">
              <h2 id="titre-regles" className="titre-carte">
                Ce qui change selon votre profil
              </h2>
              {frais && (
                <TableauAdaptatif libelle="Tableau des règles par profil" seuil={640}>
                  <table className="tableau">
                    <caption className="sr-only">Règles par profil</caption>
                    <thead>
                      <tr>
                        <th scope="col">
                          <span className="sr-only">Règle</span>
                        </th>
                        {PROFILS.map((p) => (
                          <th scope="col" key={p.code}>
                            {p.libelle}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">Droits d’inscription ({niveau})</th>
                        {PROFILS.map((p) => (
                          <td key={p.code} className={p.code === 'boursier' ? 'texte-vert' : ''}>
                            {montant(frais[p.code]?.droits)}
                            {p.code === 'intl' ? ' ou exonération' : ''}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">CVEC</th>
                        {PROFILS.map((p) => (
                          <td key={p.code} className={p.code === 'boursier' ? 'texte-vert' : ''}>
                            {montant(frais[p.code]?.cvec)}
                          </td>
                        ))}
                      </tr>
                      {(aides.data ?? []).length > 0 &&
                        aides.data.map((a) => (
                          <tr key={a.slug}>
                            <th scope="row">{a.nom}</th>
                            {PROFILS.map((p) => {
                              const e = a.eligibilites?.find((x) => x.profil === p.code);
                              return (
                                <td key={p.code}>
                                  {e
                                    ? e.statut === 'oui'
                                      ? 'Oui'
                                      : e.statut === 'non'
                                        ? 'Non'
                                        : 'Sous conditions'
                                    : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      {ressourcesVisa && (
                        <tr>
                          <th scope="row">Ressources à justifier (visa, titre de séjour)</th>
                          <td>Non concerné</td>
                          <td>Non concerné</td>
                          <td>{formaterEuroCentimes(ressourcesVisa.valeur)} / mois</td>
                        </tr>
                      )}
                      {heuresMax !== null && (
                        <tr>
                          <th scope="row">Travail salarié</th>
                          <td>Libre</td>
                          <td>Libre</td>
                          <td>{heuresMax} h / an max</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </TableauAdaptatif>
              )}
              {parametres.data && (
                <Fraicheur
                  source={parametres.data.parametres[0]?.source}
                  verifieLe={parametres.data.parametres[0]?.verifieLe}
                  aVerifier={parametres.data.parametres.some((p) => p.aVerifier)}
                />
              )}
            </section>

            <aside className="carte appel" aria-labelledby="titre-appel">
              <h2 id="titre-appel">Et vous, où en êtes-vous ?</h2>
              <p>
                Entrez vos propres revenus et dépenses pour connaître votre reste-à-vivre et les
                aides qui vous correspondent.
              </p>
              <Link to="/evaluer" className="bouton bouton-clair">
                Évaluer ma situation <span aria-hidden="true">→</span>
              </Link>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
