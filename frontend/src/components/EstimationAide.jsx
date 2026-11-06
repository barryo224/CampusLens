import { useState } from 'react';
import { get, post } from '../lib/api.js';
import { nombreSaisi } from '../lib/simulation.js';
import { formaterEuro, formaterDate } from '../lib/format.js';
import LienExterne from './LienExterne.jsx';

const TYPES_LOGEMENT = [
  { code: 'vide', libelle: 'Location non meublée' },
  { code: 'meuble', libelle: 'Location meublée' },
  { code: 'foyer', libelle: 'Résidence universitaire ou foyer' },
];

/**
 * Estimation FACULTATIVE de l'aide au logement avec le moteur OpenFisca.
 * C'est la seule fonction du simulateur qui envoie des informations au serveur : elle est donc
 * repliée par défaut, rien ne part avant un clic explicite, et le texte dit exactement ce qui est envoyé.
 */
export default function EstimationAide({ saisie, resteAVivre }) {
  const [ouvert, setOuvert] = useState(false);
  const [villes, setVilles] = useState(null); // chargées à l'ouverture (données publiques, rien de personnel)
  const [erreurVilles, setErreurVilles] = useState(null);
  const [champs, setChamps] = useState({ ville: '', age: '', typeLogement: 'vide' });
  const [etat, setEtat] = useState({ calcul: false, erreur: null, resultat: null });

  const loyer = nombreSaisi(saisie.loyer);
  const revenu = nombreSaisi(saisie.job);
  const age = Number(champs.age);
  const ageValide = Number.isInteger(age) && age >= 15 && age <= 99;
  const pret = Boolean(champs.ville) && ageValide && loyer > 0 && !etat.calcul;

  function basculer(e) {
    setOuvert(e.currentTarget.open);
    if (e.currentTarget.open && villes === null && !erreurVilles) {
      get('/villes')
        .then((liste) => setVilles(liste.map((v) => ({ codeInsee: v.codeInsee, nom: v.nom }))))
        .catch((err) => setErreurVilles(err.message));
    }
  }

  async function estimer(e) {
    e.preventDefault();
    setEtat({ calcul: true, erreur: null, resultat: null });
    try {
      // EXACTEMENT ces cinq informations, et rien d'autre.
      const resultat = await post(
        '/simulation/aides-estimees',
        { age, ville: champs.ville, loyer, typeLogement: champs.typeLogement, revenu },
        { message429: 'Trop de demandes d’estimation. Réessayez dans une minute.' },
      );
      setEtat({ calcul: false, erreur: null, resultat });
    } catch (err) {
      setEtat({ calcul: false, erreur: err.message, resultat: null });
    }
  }

  const aide = etat.resultat?.aides?.[0];
  const aideSaisie = nombreSaisi(saisie.aideLogement);
  const resteAvecAide = aide ? resteAVivre - aideSaisie + aide.montantMensuel : null;
  const nomAide = aide ? (aide.details.apl > 0 ? 'APL' : 'ALS') : '';

  return (
    <details className="carte estimation" onToggle={basculer} style={{ marginTop: 16 }}>
      <summary>
        <strong>Estimer mon aide au logement</strong>{' '}
        <span className="badge badge-gris">facultatif</span>
      </summary>

      {ouvert && (
        <form onSubmit={estimer} aria-label="Estimation de l’aide au logement">
          <p className="rappel" role="note">
            <strong>Ce qui est envoyé, uniquement si vous cliquez sur « Estimer » :</strong> votre
            âge, votre ville, votre loyer, votre type de logement et votre revenu du mois. Ils sont
            transmis à notre serveur, qui interroge le moteur public OpenFisca, puis{' '}
            <strong>rien n’est enregistré</strong>. Le reste de la simulation reste sur votre
            appareil.
          </p>

          {erreurVilles && (
            <p className="message message-erreur" role="alert">
              {erreurVilles}
            </p>
          )}
          <div className="grille grille-3">
            <div className="champ">
              <label htmlFor="est-ville">Ville où vous étudiez</label>
              <select
                autoComplete="off"
                id="est-ville"
                value={champs.ville}
                onChange={(e) => setChamps({ ...champs, ville: e.target.value })}
                required
              >
                <option value="">{villes === null ? 'Chargement…' : 'Choisir une ville'}</option>
                {(villes ?? []).map((v) => (
                  <option key={v.codeInsee} value={v.codeInsee}>
                    {v.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="est-age">Votre âge</label>
              <input
                id="est-age"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="20"
                value={champs.age}
                onChange={(e) => setChamps({ ...champs, age: e.target.value })}
                required
              />
            </div>
            <div className="champ">
              <label htmlFor="est-logement">Type de logement</label>
              <select
                autoComplete="off"
                id="est-logement"
                value={champs.typeLogement}
                onChange={(e) => setChamps({ ...champs, typeLogement: e.target.value })}
              >
                {TYPES_LOGEMENT.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.libelle}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="fraicheur" style={{ marginBottom: 12 }}>
            Repris de votre simulation : loyer {formaterEuro(loyer)} · revenu du job{' '}
            {formaterEuro(revenu)}.
            {loyer <= 0 && ' Renseignez votre loyer plus haut pour pouvoir estimer l’aide.'}
          </p>

          <button type="submit" className="bouton" disabled={!pret}>
            {etat.calcul ? 'Calcul en cours…' : 'Estimer mon aide au logement'}
          </button>
          {etat.calcul && (
            <p className="fraicheur" role="status" style={{ marginTop: 8 }}>
              Le calcul prend quelques secondes.
            </p>
          )}

          {etat.erreur && (
            <p className="message message-erreur" role="alert" style={{ marginTop: 12 }}>
              {etat.erreur}
            </p>
          )}

          {etat.resultat && !etat.erreur && (
            <div className="estimation-resultat" role="status">
              {aide && aide.montantMensuel > 0 ? (
                <>
                  <p className="estimation-montant">
                    ≈ {formaterEuro(aide.montantMensuel)} par mois
                  </p>
                  <p>
                    Aide au logement estimée ({nomAide}). Avec cette aide, votre reste-à-vivre
                    serait d’environ <strong>{formaterEuro(resteAvecAide)}</strong>
                    {aideSaisie > 0 && ' (en remplaçant l’aide au logement que vous avez saisie)'}.
                  </p>
                </>
              ) : (
                <p>
                  <strong>Avec ces informations, aucune aide au logement n’est estimée.</strong>{' '}
                  Cela peut changer selon votre situation : vérifiez auprès de la CAF.
                </p>
              )}
              <p className="fraicheur">
                Source : {etat.resultat.moteur.nom}
                {etat.resultat.moteur.version && ` ${etat.resultat.moteur.version}`} · calculé le{' '}
                {formaterDate(etat.resultat.verifieLe)}
              </p>
              <p className="fraicheur">{etat.resultat.avertissement}</p>
              <p>
                <LienExterne href="https://www.caf.fr">
                  Faire la simulation officielle sur caf.fr
                </LienExterne>
              </p>
            </div>
          )}
        </form>
      )}
    </details>
  );
}
