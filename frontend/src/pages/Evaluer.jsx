import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Jauge from '../components/Jauge.jsx';
import MessageErreur from '../components/MessageErreur.jsx';
import Fraicheur from '../components/Fraicheur.jsx';
import EstimationAide from '../components/EstimationAide.jsx';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { calculerResteAVivre, trouverParametre, LIBELLES_TARIF } from '../lib/simulation.js';
import { choisirRecommandations } from '../lib/recommandations.js';
import { telechargerBilan } from '../lib/bilan.js';
import { formaterEuro, formaterEuroCentimes } from '../lib/format.js';

const REVENUS = [
  ['job', 'Job étudiant (net)'],
  ['famille', 'Aide de la famille'],
  ['bourse', 'Bourse'],
  ['aideLogement', 'Aide au logement (APL)'],
];
const DEPENSES = [
  ['loyer', 'Loyer charges comprises'],
  ['alimentation', 'Alimentation'],
  ['transport', 'Transport'],
  ['telephone', 'Téléphone et internet'],
  ['sante', 'Santé et mutuelle'],
  ['autres', 'Autres dépenses'],
];

const MESSAGES_NIVEAU = {
  en_difficulte: 'Budget en difficulté : des aides existent',
  fragile: 'Budget fragile : des aides peuvent vous soulager',
  equilibre: 'Budget équilibré : gardez le cap',
};
const CLASSE_NIVEAU = { en_difficulte: 'rouge', fragile: 'orange', equilibre: 'vert' };

function ChampMontant({ id, libelle, valeur, surChangement }) {
  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={valeur}
        onChange={(e) => surChangement(e.target.value)}
      />
    </div>
  );
}

function Choix({ nom, valeur, courant, libelle, surChoix }) {
  return (
    <label className={`choix${courant === valeur ? ' choix-actif' : ''}`}>
      <input
        type="radio"
        name={nom}
        value={valeur}
        checked={courant === valeur}
        onChange={() => surChoix(valeur)}
      />
      <span>{libelle}</span>
    </label>
  );
}

export default function Evaluer() {
  usePageTitre('Évaluer ma situation');
  const { data, erreur, chargement, recharger } = useApi('/parametres?annee=en_cours');
  const [profil, setProfil] = useState({
    statut: 'fr_ue',
    niveau: 'licence',
    boursier: false,
    exonere: false,
  });
  const [saisie, setSaisie] = useState({});
  // Facultatif. Reste dans le navigateur : sert uniquement à personnaliser le PDF (jamais envoyé, jamais mémorisé).
  const [identite, setIdentite] = useState({ prenom: '', nom: '' });
  const [erreurPdf, setErreurPdf] = useState(null);

  const parametres = data?.parametres;
  const maj = (champ) => (valeur) => {
    setErreurPdf(null); // l'étudiant corrige : le message d'erreur disparaît
    setSaisie((s) => ({ ...s, [champ]: valeur }));
  };

  // Calcul dans le navigateur : rien n'est envoyé (aucune requête ne part avec ces montants).
  const calcul = useMemo(() => {
    if (!parametres) return null;
    try {
      const resultat = calculerResteAVivre(profil, saisie, parametres);
      return { resultat, seuil: trouverParametre(parametres, 'seuil_fragile') };
    } catch (e) {
      return { erreur: e };
    }
  }, [parametres, profil, saisie]);

  const heuresMax = useMemo(() => {
    if (!parametres) return null;
    try {
      return trouverParametre(parametres, 'heures_travail_max', { profil: 'intl' });
    } catch {
      return null;
    }
  }, [parametres]);

  const resultat = calcul?.resultat;
  const recommandations = useMemo(
    () => (resultat ? choisirRecommandations({ profil, resultat, parametres }) : []),
    [resultat, profil, parametres],
  );
  const codeProfilAides = profil.boursier ? 'boursier' : profil.statut;

  async function telecharger() {
    setErreurPdf(null);
    // Un bilan sans aucun montant n'aurait aucun sens : on le refuse avec un message clair
    // et on place le curseur dans le premier champ à remplir.
    if (resultat.totalRevenus === 0 && resultat.totalDepenses === 0) {
      setErreurPdf('Renseignez au moins un revenu ou une dépense pour générer votre bilan.');
      document.getElementById('rev-job')?.focus();
      return;
    }
    try {
      // Une ligne par organisme (Service-Public.fr n'apparaît qu'une fois).
      const parOrganisme = new Map();
      for (const p of parametres) {
        if (p.source && !parOrganisme.has(p.source.organisme)) {
          parOrganisme.set(p.source.organisme, {
            organisme: p.source.organisme,
            verifieLe: p.verifieLe,
          });
        }
      }
      const sources = [...parOrganisme.values()];
      await telechargerBilan({ profil, saisie, resultat, recommandations, sources, identite });
    } catch {
      setErreurPdf('Le bilan n’a pas pu être généré. Réessayez.');
    }
  }

  return (
    <>
      <header className="page-titre">
        <h1>Évaluez votre situation en 2 minutes</h1>
        <p>
          Renseignez vos montants du mois : vous saurez où vous en êtes et quelles aides demander.
        </p>
      </header>

      {/* La zone réserve sa place pendant le chargement : le pied de page ne « saute » pas quand le formulaire apparaît. */}
      <div style={parametres || erreur ? undefined : { minHeight: '70vh' }} aria-busy={chargement}>
        {erreur && <MessageErreur erreur={erreur} surReessayer={recharger} />}
        {chargement && (
          <p className="message" role="status">
            Chargement des montants de référence…
          </p>
        )}

        {parametres && (
          <>
            <div className="grille grille-3 simulateur">
              <section className="carte" aria-labelledby="titre-profil">
                <h2 id="titre-profil" className="titre-carte">
                  Votre profil
                </h2>
                <fieldset className="groupe">
                  <legend>Statut</legend>
                  <Choix
                    nom="statut"
                    valeur="fr_ue"
                    courant={profil.statut}
                    libelle="Étudiant français ou UE"
                    // « Exonéré des droits différenciés » n'existe que pour un étudiant étranger : on l'efface.
                    surChoix={(v) => setProfil((p) => ({ ...p, statut: v, exonere: false }))}
                  />
                  <Choix
                    nom="statut"
                    valeur="intl"
                    courant={profil.statut}
                    libelle="Étudiant international hors UE"
                    surChoix={(v) => setProfil((p) => ({ ...p, statut: v }))}
                  />
                </fieldset>
                <fieldset className="groupe groupe-ligne">
                  <legend>Niveau d’études</legend>
                  <Choix
                    nom="niveau"
                    valeur="licence"
                    courant={profil.niveau}
                    libelle="Licence"
                    surChoix={(v) => setProfil((p) => ({ ...p, niveau: v }))}
                  />
                  <Choix
                    nom="niveau"
                    valeur="master"
                    courant={profil.niveau}
                    libelle="Master"
                    surChoix={(v) => setProfil((p) => ({ ...p, niveau: v }))}
                  />
                </fieldset>
                <div className="champ">
                  <label htmlFor="identite-prenom">Prénom (facultatif)</label>
                  <input
                    id="identite-prenom"
                    type="text"
                    autoComplete="given-name"
                    maxLength={60}
                    value={identite.prenom}
                    onChange={(e) => setIdentite({ ...identite, prenom: e.target.value })}
                  />
                </div>
                <div className="champ">
                  <label htmlFor="identite-nom">Nom (facultatif)</label>
                  <input
                    id="identite-nom"
                    type="text"
                    autoComplete="family-name"
                    maxLength={60}
                    value={identite.nom}
                    onChange={(e) => setIdentite({ ...identite, nom: e.target.value })}
                  />
                </div>
                <p className="fraicheur" style={{ marginBottom: 14 }}>
                  Votre nom n’est pas envoyé : il apparaît seulement sur le PDF que vous
                  téléchargez.
                </p>
                {profil.statut === 'fr_ue' && (
                  <label className="case">
                    <input
                      type="checkbox"
                      checked={profil.boursier}
                      onChange={(e) => setProfil((p) => ({ ...p, boursier: e.target.checked }))}
                    />
                    Je suis boursier CROUS
                  </label>
                )}
                {profil.statut === 'intl' && (
                  <>
                    {/* Un seul choix : être boursier ou exonéré règle déjà la question des droits d'inscription. */}
                    <fieldset className="groupe">
                      <legend>Droits d’inscription</legend>
                      <Choix
                        nom="aide-droits"
                        valeur="aucun"
                        courant={
                          profil.boursier ? 'boursier' : profil.exonere ? 'exonere' : 'aucun'
                        }
                        libelle="Ni boursier ni exonéré"
                        surChoix={() =>
                          setProfil((p) => ({ ...p, boursier: false, exonere: false }))
                        }
                      />
                      <Choix
                        nom="aide-droits"
                        valeur="boursier"
                        courant={
                          profil.boursier ? 'boursier' : profil.exonere ? 'exonere' : 'aucun'
                        }
                        libelle="Je suis boursier CROUS"
                        surChoix={() =>
                          setProfil((p) => ({ ...p, boursier: true, exonere: false }))
                        }
                      />
                      <Choix
                        nom="aide-droits"
                        valeur="exonere"
                        courant={
                          profil.boursier ? 'boursier' : profil.exonere ? 'exonere' : 'aucun'
                        }
                        libelle="Je suis exonéré des droits différenciés"
                        surChoix={() =>
                          setProfil((p) => ({ ...p, boursier: false, exonere: true }))
                        }
                      />
                    </fieldset>
                    {profil.boursier && (
                      <p className="rappel" role="note">
                        Boursier : droits d’inscription et CVEC offerts, comme pour un étudiant
                        français. Si vous perdez la bourse, le tarif d’étudiant international
                        s’applique de nouveau.
                      </p>
                    )}
                    {heuresMax !== null && (
                      <p className="rappel" role="note">
                        Étudiant international : le travail salarié est limité à {heuresMax} heures
                        par an.
                      </p>
                    )}
                  </>
                )}
              </section>

              <section className="carte" aria-labelledby="titre-revenus">
                <h2 id="titre-revenus" className="titre-carte">
                  Vos revenus mensuels
                </h2>
                {REVENUS.map(([cle, libelle]) => (
                  <ChampMontant
                    key={cle}
                    id={`rev-${cle}`}
                    libelle={libelle}
                    valeur={saisie[cle] ?? ''}
                    surChangement={maj(cle)}
                  />
                ))}
                <p className="total">
                  <span>Total revenus</span>
                  <strong data-testid="total-revenus">
                    {resultat ? formaterEuro(resultat.totalRevenus) : '—'}
                  </strong>
                </p>
              </section>

              <section className="carte" aria-labelledby="titre-depenses">
                <h2 id="titre-depenses" className="titre-carte">
                  Vos dépenses mensuelles
                </h2>
                {DEPENSES.map(([cle, libelle]) => (
                  <ChampMontant
                    key={cle}
                    id={`dep-${cle}`}
                    libelle={libelle}
                    valeur={saisie[cle] ?? ''}
                    surChangement={maj(cle)}
                  />
                ))}
                <p className="ligne-frais">
                  <span>Inscription + CVEC (÷ 12)</span>
                  <span>{resultat ? formaterEuro(resultat.fraisMensuels) : '—'}</span>
                </p>
                <p className="total">
                  <span>Total dépenses</span>
                  <strong data-testid="total-depenses">
                    {resultat ? formaterEuro(resultat.totalDepenses + resultat.fraisMensuels) : '—'}
                  </strong>
                </p>
              </section>
            </div>

            <section className="carte resultat" aria-labelledby="titre-resultat" aria-live="polite">
              <h2 id="titre-resultat" className="titre-carte">
                Votre résultat
              </h2>
              {calcul?.erreur && (
                <MessageErreur
                  erreur={{
                    message:
                      'Le calcul est indisponible : des montants de référence manquent. Réessayez plus tard.',
                  }}
                />
              )}
              {resultat && (
                <>
                  <p className="resultat-etiquette">Reste-à-vivre mensuel</p>
                  <Jauge
                    resteAVivre={resultat.resteAVivre}
                    seuilFragile={calcul.seuil}
                    libelle={`Reste-à-vivre : ${formaterEuroCentimes(resultat.resteAVivre)}, situation ${resultat.libelleNiveau}`}
                  />
                  <p
                    className={`resultat-montant texte-${CLASSE_NIVEAU[resultat.niveau]}`}
                    data-testid="reste"
                  >
                    {formaterEuro(resultat.resteAVivre).replace('-', '− ')}
                  </p>
                  <p className={`resultat-niveau texte-${CLASSE_NIVEAU[resultat.niveau]}`}>
                    {MESSAGES_NIVEAU[resultat.niveau]}
                  </p>
                  <div className="explication-tarif" data-testid="explication-tarif">
                    <p>
                      <strong>{LIBELLES_TARIF[resultat.tarif]}</strong>
                      {resultat.tarif === 'boursier' ? (
                        ' (0 €).'
                      ) : (
                        <>
                          {' '}
                          ({profil.niveau === 'master' ? 'master' : 'licence'}) : droits
                          d’inscription de {formaterEuro(resultat.droitsInscription)} et CVEC de{' '}
                          {formaterEuro(resultat.cvec)}, lissés sur 12 mois, soit{' '}
                          {formaterEuro(resultat.fraisMensuels)} par mois inclus dans vos dépenses.
                        </>
                      )}
                    </p>
                    {resultat.ressourcesVisa && (
                      <p data-testid="ressources-visa">
                        <strong>Visa et titre de séjour.</strong> L’administration demande{' '}
                        {formaterEuroCentimes(resultat.ressourcesVisa.exigees)} de ressources par
                        mois. Vous déclarez{' '}
                        {formaterEuroCentimes(resultat.ressourcesVisa.declarees)} (job, famille et
                        bourse, hors aide au logement) :{' '}
                        {resultat.ressourcesVisa.suffisantes
                          ? 'ce montant atteint le seuil.'
                          : 'ce montant est en dessous du seuil.'}{' '}
                        Indicatif : la préfecture apprécie votre situation. À l’arrivée s’ajoute une
                        taxe de validation du visa : voir{' '}
                        <Link to="/budget?profil=intl">le budget de rentrée</Link>.
                      </p>
                    )}
                    {resultat.tarif === 'international' && (
                      <p>
                        Une exonération des droits différenciés est possible : demandez-la à votre
                        université, puis cochez « exonéré » ci-dessus pour voir la différence.
                      </p>
                    )}
                  </div>
                  <div className="resultat-actions">
                    <Link to={`/aides?profil=${codeProfilAides}`} className="bouton">
                      Voir les aides pour moi <span aria-hidden="true">→</span>
                    </Link>
                    <button
                      type="button"
                      className="bouton bouton-secondaire"
                      onClick={telecharger}
                    >
                      Télécharger mon bilan (PDF)
                    </button>
                  </div>
                  {erreurPdf && (
                    <p role="alert" className="message message-erreur" style={{ marginTop: 12 }}>
                      {erreurPdf}
                    </p>
                  )}
                </>
              )}
            </section>

            {resultat && <EstimationAide saisie={saisie} resteAVivre={resultat.resteAVivre} />}

            {recommandations.length > 0 && (
              <section className="carte" style={{ marginTop: 16 }} aria-labelledby="titre-reco">
                <h2 id="titre-reco" className="titre-carte">
                  Les aides et astuces pour vous
                </h2>
                <p className="fraicheur">Sélectionnées selon votre profil et votre résultat.</p>
                <ul className="grille grille-4 reco-liste">
                  {recommandations.map((r) => (
                    <li key={r.id} className="carte reco">
                      <h3>{r.titre}</h3>
                      <p>{r.texte}</p>
                      <Link to={r.lien.vers}>
                        {r.lien.libelle} <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Fraicheur
                  source={data.parametres.find((p) => p.cle === 'droits_inscription')?.source}
                  verifieLe={data.parametres.find((p) => p.cle === 'droits_inscription')?.verifieLe}
                  aVerifier={data.parametres.some((p) => p.aVerifier)}
                />
                <p className="fraicheur">
                  Simulation indicative : elle ne remplace ni le CROUS, ni la CAF, ni un service
                  social.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
