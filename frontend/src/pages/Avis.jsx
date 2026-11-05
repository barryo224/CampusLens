import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { post } from '../lib/api.js';
import { usePageTitre } from '../lib/usePageTitre.js';

const NOTES = [
  [1, 'Décevant'],
  [2, 'Moyen'],
  [3, 'Correct'],
  [4, 'Bien'],
  [5, 'Excellent'],
];
const PROFILS = [
  ['', 'Je préfère ne pas le dire'],
  ['fr_ue', 'Étudiant français ou UE'],
  ['boursier', 'Étudiant boursier'],
  ['intl', 'Étudiant international hors UE'],
];
// Pages d'où l'on peut venir (lien « donner mon avis » placé sur ces pages).
const PAGES = ['accueil', 'evaluer', 'aides', 'budget', 'ressources', 'a_propos'];

export default function Avis() {
  usePageTitre('Donner mon avis');
  const [params] = useSearchParams();
  const page = PAGES.includes(params.get('page')) ? params.get('page') : 'autre';
  const [champs, setChamps] = useState({ note: 0, commentaire: '', profil: '', siteWeb: '' });
  const [etat, setEtat] = useState({ envoi: false, succes: false, erreur: null });

  async function envoyer(e) {
    e.preventDefault();
    // Un avis vide n'a aucun sens : on le refuse avec un message clair et on place le curseur sur le champ à remplir.
    if (champs.note === 0) {
      setEtat({ envoi: false, succes: false, erreur: 'Choisissez une note de 1 à 5.' });
      document.querySelector('input[name="note"]')?.focus();
      return;
    }
    if (champs.commentaire.trim().length < 5) {
      setEtat({
        envoi: false,
        succes: false,
        erreur: 'Racontez votre expérience en quelques mots avant d’envoyer votre avis.',
      });
      document.getElementById('avis-commentaire')?.focus();
      return;
    }
    setEtat({ envoi: true, succes: false, erreur: null });
    try {
      await post(
        '/avis',
        {
          note: champs.note,
          commentaire: champs.commentaire.trim(),
          page,
          ...(champs.profil && { profil: champs.profil }),
          siteWeb: champs.siteWeb,
        },
        { message429: 'Trop d’avis envoyés. Réessayez dans quelques minutes.' },
      );
      setChamps({ note: 0, commentaire: '', profil: '', siteWeb: '' });
      setEtat({ envoi: false, succes: true, erreur: null });
    } catch (err) {
      setEtat({ envoi: false, succes: false, erreur: err.message });
    }
  }

  return (
    <>
      <header className="page-titre">
        <h1>Donnez votre avis sur CampusLens</h1>
        <p>
          Vous avez utilisé le site ? Dites-nous ce qui vous a aidé, ce qui manque ou ce qui n’est
          pas clair. Cela nous aide à l’améliorer pour les prochains étudiants.
        </p>
      </header>

      <section className="carte" style={{ maxWidth: 640 }} aria-labelledby="titre-avis">
        <h2 id="titre-avis" className="titre-carte">
          Votre expérience
        </h2>
        {etat.succes && (
          <p className="message message-succes" role="status">
            Merci pour votre avis ! Il a bien été transmis.
          </p>
        )}
        {etat.erreur && (
          <p className="message message-erreur" role="alert">
            {etat.erreur}
          </p>
        )}
        {/* noValidate : les messages de validation sont les nôtres (clairs, en français, avec le curseur sur le champ). */}
        <form onSubmit={envoyer} noValidate>
          <fieldset className="groupe">
            <legend>Votre note</legend>
            <div className="notes">
              {NOTES.map(([valeur, libelle]) => (
                <label
                  key={valeur}
                  className={`choix note${champs.note === valeur ? ' choix-actif' : ''}`}
                >
                  <input
                    type="radio"
                    name="note"
                    value={valeur}
                    checked={champs.note === valeur}
                    onChange={() => setChamps((c) => ({ ...c, note: valeur }))}
                  />
                  <span className="note-chiffre" aria-hidden="true">
                    {valeur} ★
                  </span>
                  <span className="note-libelle">
                    <span className="sr-only">{valeur} sur 5 : </span>
                    {libelle}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="champ">
            <label htmlFor="avis-commentaire">Racontez votre expérience</label>
            <textarea
              id="avis-commentaire"
              rows={6}
              required
              maxLength={1500}
              value={champs.commentaire}
              onChange={(e) => setChamps((c) => ({ ...c, commentaire: e.target.value }))}
              aria-describedby="avis-aide"
            />
            <p className="fraicheur" id="avis-aide">
              {champs.commentaire.length} / 1 500 caractères. N’indiquez pas de renseignements
              personnels (nom, adresse, numéro de téléphone) : ils ne sont pas nécessaires.
            </p>
          </div>

          <div className="champ">
            <label htmlFor="avis-profil">Vous êtes (facultatif)</label>
            <select
              id="avis-profil"
              value={champs.profil}
              onChange={(e) => setChamps((c) => ({ ...c, profil: e.target.value }))}
            >
              {PROFILS.map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </select>
          </div>

          {/* Champ piège anti-robot : invisible et ignoré des humains et des lecteurs d'écran. */}
          <div className="piege" aria-hidden="true">
            <label htmlFor="avis-site">Ne pas remplir</label>
            <input
              id="avis-site"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={champs.siteWeb}
              onChange={(e) => setChamps((c) => ({ ...c, siteWeb: e.target.value }))}
            />
          </div>

          <p className="fraicheur" style={{ marginBottom: 14 }}>
            Votre avis est <strong>anonyme</strong> : nous n’enregistrons ni votre nom, ni votre
            adresse e-mail, ni votre adresse IP. Il est supprimé automatiquement au bout de 12 mois.
            Voir <Link to="/mentions-legales">Mentions légales et confidentialité</Link>. Pour
            recevoir une réponse, utilisez plutôt la page <Link to="/contact">Contact</Link>.
          </p>
          <button type="submit" className="bouton" disabled={etat.envoi}>
            {etat.envoi ? 'Envoi…' : 'Envoyer mon avis'}
          </button>
        </form>
      </section>
    </>
  );
}
