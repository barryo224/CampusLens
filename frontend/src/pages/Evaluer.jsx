import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Jauge from '../components/Jauge.jsx';
import Fraicheur from '../components/Fraicheur.jsx';
import MessageErreur from '../components/MessageErreur.jsx';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import {
  analyserMontant,
  calculerResteAVivre,
  trouverParametre,
  LIBELLES_TARIF,
} from '../lib/simulation.js';
import { choisirRecommandations } from '../lib/recommandations.js';
import { telechargerBilan } from '../lib/bilan.js';
import { defilerSousLesBarres } from '../lib/defilerVersResultats.js';
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
  // Un texte collé qui n'est pas un montant (lettres, négatif…) compterait 0 € sans rien dire : on le signale.
  const { reconnu, ecrit } = analyserMontant(valeur ?? '');
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
        aria-invalid={reconnu ? undefined : true}
        aria-describedby={reconnu ? undefined : `${id}-aide`}
        onChange={(e) => surChangement(e.target.value)}
        // En quittant le champ, un montant compris s'écrit à la française (« 1.9 » → « 1,9 », « 600 € » → « 600 ») : ce que
        // l'on voit est ce que le bilan affichera.
        onBlur={() => {
          if (reconnu && ecrit && ecrit !== valeur) surChangement(ecrit);
        }}
      />
      {!reconnu && (
        <p id={`${id}-aide`} className="aide-montant">
          Montant invalide. Utilisez uniquement des chiffres (ex. : 450 ou 450,50).
        </p>
      )}
    </div>
  );
}

function Choix({ nom, valeur, courant, libelle, surChoix }) {
  return (
    <label className={`choix${courant === valeur ? ' choix-actif' : ''}`}>
      <input
        autoComplete="off"
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

/**
 * Téléphone : le résultat se trouve tout en bas, bien après les champs que l'on remplit. Cette barre, collée sous la barre
 * verte, montre le reste-à-vivre en direct pendant la saisie (elle reste visible même clavier ouvert) et mène au détail.
 * Elle s'efface quand la carte du résultat est déjà à l'écran. Masquée sur grand écran (CSS).
 */
function BarreResultat({ montant, classe, niveau }) {
  const [vu, setVu] = useState(false);
  useEffect(() => {
    const cible = document.getElementById('resultat-detail');
    if (!cible || !('IntersectionObserver' in window)) return undefined;
    const observateur = new IntersectionObserver(([e]) => setVu(e.isIntersecting), {
      threshold: 0.25,
    });
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, []);
  return (
    <div className={`barre-resultat${vu ? ' barre-resultat-cachee' : ''}`}>
      <span aria-hidden="true" className="barre-resultat-texte">
        <span className="barre-resultat-etiquette">Votre reste-à-vivre</span>
        <b className={`texte-${classe}`}>{montant}</b>
        <span className="barre-resultat-niveau">{niveau}</span>
      </span>
      <button
        type="button"
        className="bouton bouton-secondaire"
        aria-label={`Aller au détail du résultat : reste-à-vivre ${montant}, situation ${niveau}`}
        onClick={() => defilerSousLesBarres(document.getElementById('resultat-detail'))}
      >
        Détail ↓
      </button>
    </div>
  );
}

const PROFIL_DE_DEPART = { statut: 'fr_ue', niveau: 'licence', boursier: false, exonere: false };

export default function Evaluer() {
  usePageTitre('Évaluer ma situation');
  const { data, erreur, chargement, recharger } = useApi('/parametres?annee=en_cours');
  const [profil, setProfil] = useState(PROFIL_DE_DEPART);
  const [saisie, setSaisie] = useState({});
  // Facultatif. Reste dans le navigateur : sert uniquement à personnaliser le PDF (jamais envoyé, jamais mémorisé).
  const [identite, setIdentite] = useState({ prenom: '', nom: '' });
  const [erreurPdf, setErreurPdf] = useState(null);
  const [confirmationPdf, setConfirmationPdf] = useState(false);

  const parametres = data?.parametres;
  const maj = (champ) => (valeur) => {
    setConfirmationPdf(false);
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
  // Seuil de pauvreté (Insee) : repris de la base, donc mis à jour avec la source (robot + validation). Absent : on n'invente rien.
  const seuilPauvrete = useMemo(
    () => parametres?.find((p) => p.cle === 'seuil_pauvrete') ?? null,
    [parametres],
  );
  // Rien de saisi : aucune conclusion (ni « en difficulté », ni conseils d'urgence) tant que l'on n'a rien renseigné.
  const rienSaisi =
    Boolean(resultat) && resultat.totalRevenus === 0 && resultat.totalDepenses === 0;
  // Champs dont le texte n'est pas un montant (lettres, symboles…) : encadrés en rouge, et le bilan n'est pas créé.
  const champsInvalides = [
    ...REVENUS.map(([cle, libelle]) => ({ id: `rev-${cle}`, cle, libelle })),
    ...DEPENSES.map(([cle, libelle]) => ({ id: `dep-${cle}`, cle, libelle })),
  ].filter(({ cle }) => !analyserMontant(saisie[cle] ?? '').reconnu);

  const recommandations = useMemo(
    () =>
      resultat && !rienSaisi && champsInvalides.length === 0
        ? choisirRecommandations({ profil, resultat, parametres })
        : [],
    [resultat, rienSaisi, champsInvalides.length, profil, parametres],
  );
  const codeProfilAides = profil.boursier ? 'boursier' : profil.statut;

  /**
   * « Aller saisir mes montants » (ou, si un montant est faux, « Aller au champ à corriger ») : on donne le premier champ à remplir, sans perdre le contexte.
   *  - ordinateur : la page est courte entre le haut et la saisie, on remonte tout en haut (le champ reste à l'écran) ;
   *  - téléphone : remonter tout en haut ferait sortir le champ de l'écran ; on amène donc le début du bloc « Vos revenus
   *    mensuels » (titre + premier champ) juste sous les barres.
   * Le défilement est calculé et immédiat : `scrollIntoView` doux est interrompu par Safari avec les barres collées.
   */
  function allerSaisir() {
    const champ = document.getElementById(champsInvalides[0]?.id ?? 'rev-job');
    const telephone = window.matchMedia?.('(max-width: 900px)').matches;
    if (telephone)
      defilerSousLesBarres(champ?.closest('section') ?? document.getElementById('bloc-revenus'));
    else window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    champ?.focus({ preventScroll: true });
  }

  async function telecharger() {
    setErreurPdf(null);
    setConfirmationPdf(false);
    // Un montant qui n'en est pas un (« abc », « environ 12 »…) fausserait tout le bilan : on ne le crée pas.
    if (champsInvalides.length > 0) {
      const n = champsInvalides.length;
      setErreurPdf(
        `Votre bilan n’a pas été créé : ${n === 1 ? 'un montant n’est pas valide' : `${n} montants ne sont pas valides`} ` +
          `(${champsInvalides.map((c) => c.libelle).join(', ')} : ${n === 1 ? 'champ encadré' : 'champs encadrés'} en rouge). ` +
          `Corrigez-${n === 1 ? 'le' : 'les'}, puis téléchargez de nouveau.`,
      );
      return;
    }
    // Un bilan sans aucun montant n'aurait aucun sens : on le refuse avec un message clair. La page ne bouge pas : la
    // personne lit le message, puis choisit d'aller saisir (bouton dans le message).
    if (resultat.totalRevenus === 0 && resultat.totalDepenses === 0) {
      setErreurPdf('Renseignez au moins un revenu ou une dépense pour générer votre bilan.');
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
      // Bilan téléchargé : le formulaire repart à son état de départ (montants, nom ET choix du profil : statut,
      // niveau, boursier). Rien n'est gardé. Au refus du bilan (aucun montant), les choix restent en place.
      setProfil(PROFIL_DE_DEPART);
      setSaisie({});
      setIdentite({ prenom: '', nom: '' });
      setConfirmationPdf(true);
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
            {resultat && (
              <BarreResultat
                montant={
                  champsInvalides.length > 0
                    ? '—'
                    : formaterEuro(resultat.resteAVivre).replace('-', '− ')
                }
                classe={
                  rienSaisi || champsInvalides.length > 0
                    ? 'neutre'
                    : CLASSE_NIVEAU[resultat.niveau]
                }
                niveau={
                  champsInvalides.length > 0
                    ? 'montant à corriger'
                    : rienSaisi
                      ? 'montant de départ'
                      : resultat.libelleNiveau
                }
              />
            )}
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
                    surChoix={(v) =>
                      setProfil((p) => ({ ...p, statut: v, boursier: false, exonere: false }))
                    }
                  />
                  <Choix
                    nom="statut"
                    valeur="intl"
                    courant={profil.statut}
                    libelle="Étudiant international hors UE"
                    surChoix={(v) =>
                      setProfil((p) => ({ ...p, statut: v, boursier: false, exonere: false }))
                    }
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
                    autoComplete="off"
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
                    autoComplete="off"
                    maxLength={60}
                    value={identite.nom}
                    onChange={(e) => setIdentite({ ...identite, nom: e.target.value })}
                  />
                </div>
                <p className="fraicheur" style={{ marginBottom: 14 }}>
                  Votre nom n’est pas envoyé : il apparaît seulement sur le PDF que vous
                  téléchargez.
                </p>
                {/* Mêmes cases pour les deux statuts. Boursier et exonéré s'excluent : l'un remplace l'autre. */}
                <label className="case">
                  <input
                    autoComplete="off"
                    type="checkbox"
                    checked={profil.boursier}
                    onChange={(e) =>
                      setProfil((p) => ({
                        ...p,
                        boursier: e.target.checked,
                        exonere: e.target.checked ? false : p.exonere,
                      }))
                    }
                  />
                  Je suis boursier CROUS
                </label>
                {profil.statut === 'intl' && (
                  <>
                    <label className="case">
                      <input
                        autoComplete="off"
                        type="checkbox"
                        checked={profil.exonere}
                        onChange={(e) =>
                          setProfil((p) => ({
                            ...p,
                            exonere: e.target.checked,
                            boursier: e.target.checked ? false : p.boursier,
                          }))
                        }
                      />
                      Je suis exonéré des droits différenciés
                    </label>
                    {heuresMax !== null && (
                      <p className="rappel" role="note">
                        Étudiant international : le travail salarié est limité à {heuresMax} heures
                        par an.
                      </p>
                    )}
                  </>
                )}
              </section>

              <section className="carte" id="bloc-revenus" aria-labelledby="titre-revenus">
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

            <section
              id="resultat-detail"
              className="carte resultat"
              aria-labelledby="titre-resultat"
              aria-live="polite"
            >
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
                  {champsInvalides.length > 0 ? (
                    // Un montant faux : aucun verdict ni conseil (ils seraient calculés avec un 0 qui n'est pas le vrai montant).
                    <p className="message message-avertissement" data-testid="montant-invalide">
                      {champsInvalides.length === 1
                        ? 'Un montant saisi est incorrect.'
                        : `${champsInvalides.length} montants saisis sont incorrects.`}{' '}
                      Corrigez-{champsInvalides.length === 1 ? 'le' : 'les'} (en rouge) pour voir
                      votre résultat.
                    </p>
                  ) : (
                    <>
                      {/* Dès l'ouverture, le cadran montre le montant de base : droits d'inscription et CVEC, lissés sur 12 mois,
                      sont dus dès la rentrée. Tant que rien n'est saisi, aucun verdict n'est donné. */}
                      <Jauge
                        resteAVivre={resultat.resteAVivre}
                        seuilFragile={calcul.seuil}
                        libelle={
                          rienSaisi
                            ? `Reste-à-vivre : ${formaterEuroCentimes(resultat.resteAVivre)}, montant de départ (rien n’est encore saisi)`
                            : `Reste-à-vivre : ${formaterEuroCentimes(resultat.resteAVivre)}, situation ${resultat.libelleNiveau}`
                        }
                      />
                      <p
                        className={`resultat-montant${rienSaisi ? '' : ` texte-${CLASSE_NIVEAU[resultat.niveau]}`}`}
                        data-testid="reste"
                      >
                        {formaterEuro(resultat.resteAVivre).replace('-', '− ')}
                      </p>
                      {rienSaisi ? (
                        <p className="depart" data-testid="reste-vide">
                          {resultat.fraisMensuels > 0 ? (
                            <span className="depart-info">
                              <strong>Déjà {formaterEuro(resultat.fraisMensuels)} par mois</strong>{' '}
                              : droits d’inscription et CVEC, étalés sur l’année.
                            </span>
                          ) : (
                            <span className="depart-info">
                              <strong>Boursier : 0 € de départ</strong>, droits d’inscription et
                              CVEC offerts.
                            </span>
                          )}
                          <span className="depart-aide">
                            Ajoutez vos montants pour voir où vous en êtes.
                          </span>
                        </p>
                      ) : (
                        <p className={`resultat-niveau texte-${CLASSE_NIVEAU[resultat.niveau]}`}>
                          {MESSAGES_NIVEAU[resultat.niveau]}
                        </p>
                      )}
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
                              {formaterEuro(resultat.fraisMensuels)} par mois inclus dans vos
                              dépenses.
                            </>
                          )}
                        </p>
                        {resultat.ressourcesVisa && (
                          <p data-testid="ressources-visa">
                            <strong>Visa et titre de séjour.</strong> L’administration demande{' '}
                            {formaterEuroCentimes(resultat.ressourcesVisa.exigees)} de ressources
                            par mois. Vous déclarez{' '}
                            {formaterEuroCentimes(resultat.ressourcesVisa.declarees)} (job, famille
                            et bourse, hors aide au logement) :{' '}
                            {resultat.ressourcesVisa.suffisantes
                              ? 'ce montant atteint le seuil.'
                              : 'ce montant est en dessous du seuil.'}{' '}
                            Ce seuil est un repère. La décision revient à la préfecture, selon
                            l’ensemble de votre dossier. À l’arrivée s’ajoute une taxe de validation
                            du visa : voir{' '}
                            <Link to="/budget?profil=intl">le budget de rentrée</Link>.
                          </p>
                        )}
                        {resultat.tarif === 'international' && (
                          <p>
                            Une exonération des droits différenciés est possible : demandez-la à
                            votre université, puis cochez « exonéré » ci-dessus pour voir la
                            différence.
                          </p>
                        )}
                      </div>
                      <div className="seuils" data-testid="seuil-precarite">
                        <p>
                          <strong>Pour vous repérer.</strong>{' '}
                          {seuilPauvrete && (
                            <>
                              Le seuil de pauvreté en France est de{' '}
                              <strong>{formaterEuro(Number(seuilPauvrete.valeur))} par mois</strong>{' '}
                              pour une personne seule : c’est un revenu à comparer à l’ensemble de
                              vos ressources.{' '}
                            </>
                          )}
                          Votre reste-à-vivre, lui, se calcule après vos dépenses : CampusLens parle
                          de situation fragile en dessous de{' '}
                          <strong>{formaterEuro(calcul.seuil)}</strong> par mois.
                        </p>
                        {seuilPauvrete && (
                          <Fraicheur
                            source={seuilPauvrete.source}
                            verifieLe={seuilPauvrete.verifieLe}
                            aVerifier={seuilPauvrete.aVerifier}
                          />
                        )}
                      </div>
                    </>
                  )}
                  <p className="fraicheur" style={{ marginBottom: 12 }}>
                    Ce résultat vous a aidé ?{' '}
                    <Link to="/avis?page=evaluer">Donnez votre avis sur le site</Link>.
                  </p>
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
                  {confirmationPdf && (
                    <p role="status" className="message" style={{ marginTop: 12 }}>
                      Votre bilan est téléchargé. Le formulaire a été vidé : rien n’est conservé.
                    </p>
                  )}
                  {erreurPdf && (
                    <div role="alert" className="message message-erreur" style={{ marginTop: 12 }}>
                      <p style={{ margin: 0 }}>{erreurPdf}</p>
                      <button
                        type="button"
                        className="lien-action"
                        style={{ marginTop: 8 }}
                        onClick={allerSaisir}
                      >
                        {champsInvalides.length > 0
                          ? 'Aller au champ à corriger'
                          : 'Aller saisir mes montants'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

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
