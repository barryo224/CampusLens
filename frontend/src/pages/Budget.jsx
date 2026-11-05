import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MessageErreur from '../components/MessageErreur.jsx';
import ZoneDefilante from '../components/ZoneDefilante.jsx';
import Fraicheur from '../components/Fraicheur.jsx';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { trouverParametre } from '../lib/simulation.js';
import { formaterEuro } from '../lib/format.js';

const PROFILS = [
  { code: 'fr_ue', libelle: 'Étudiant français ou UE' },
  { code: 'boursier', libelle: 'Boursier' },
  { code: 'intl', libelle: 'International hors UE' },
];

/** Droits d'inscription et CVEC (licence) d'un profil, d'après les paramètres de la base. */
function fraisProfil(parametres, code) {
  try {
    if (code === 'boursier') return { droits: 0, cvec: 0 };
    const droits = trouverParametre(parametres, 'droits_inscription', {
      niveau: 'licence',
      profil: code === 'intl' ? 'intl' : null,
    });
    return { droits, cvec: trouverParametre(parametres, 'cvec') };
  } catch {
    return null; // donnée absente : on affiche « — », jamais un montant deviné
  }
}

export default function Budget() {
  usePageTitre('Préparer mon budget');
  const [params, setParams] = useSearchParams();
  const profil = PROFILS.some((p) => p.code === params.get('profil'))
    ? params.get('profil')
    : 'fr_ue';
  const postes = useApi(`/postes-rentree?profil=${profil}`, { garderAnciennes: true });
  const parametres = useApi('/parametres?annee=en_cours');
  const aides = useApi('/aides?miseEnAvant=true&categorie=logement');

  const frais = useMemo(
    () =>
      parametres.data
        ? Object.fromEntries(
            PROFILS.map((p) => [p.code, fraisProfil(parametres.data.parametres, p.code)]),
          )
        : null,
    [parametres.data],
  );
  const heuresMax = useMemo(() => {
    try {
      return trouverParametre(parametres.data.parametres, 'heures_travail_max', { profil: 'intl' });
    } catch {
      return null;
    }
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
  const plusGros = postes.data?.postes[0];
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
            onClick={() => setParams({ profil: p.code }, { replace: true })}
          >
            {p.libelle}
          </button>
        ))}
      </div>

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
            <ul className="grille grille-4 indicateurs">
              <li className="carte">
                <p className="indicateur-nom">Budget de rentrée à prévoir</p>
                <p className="indicateur-valeur">{montant(postes.data.total)}</p>
                <p className="fraicheur">total des frais ponctuels, année {postes.data.annee}</p>
              </li>
              <li className="carte">
                <p className="indicateur-nom">Plus gros poste</p>
                <p className="indicateur-valeur">{montant(plusGros?.montant)}</p>
                <p className="fraicheur">{plusGros?.nom ?? '—'}</p>
              </li>
              <li className="carte">
                <p className="indicateur-nom">Droits d’inscription</p>
                <p className="indicateur-valeur">{montant(fp?.droits)}</p>
                <p className="fraicheur">
                  en licence{profil === 'intl' ? ', ou exonération possible' : ''}
                </p>
              </li>
              <li className="carte">
                <p className="indicateur-nom">CVEC</p>
                <p className="indicateur-valeur">{montant(fp?.cvec)}</p>
                <p className="fraicheur">par an</p>
              </li>
            </ul>

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
                    <span className="poste-astuce">{p.astuce ?? '—'}</span>
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
                <ZoneDefilante libelle="Tableau des règles par profil">
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
                        <th scope="row">Droits d’inscription (licence)</th>
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
                </ZoneDefilante>
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
