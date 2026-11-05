import { Link } from 'react-router-dom';
import { useState } from 'react';
import { post } from '../lib/api.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { EMAIL_CONTACT } from '../lib/config.js';

export default function Contact() {
  usePageTitre('Contact');
  const [champs, setChamps] = useState({ objet: '', email: '', message: '', siteWeb: '' });
  const [etat, setEtat] = useState({ envoi: false, succes: false, erreur: null });
  const maj = (cle) => (e) => setChamps((c) => ({ ...c, [cle]: e.target.value }));

  async function envoyer(e) {
    e.preventDefault();
    // Des espaces seuls passent la vérification du navigateur : on les refuse ici, avec un message clair.
    const vide = ['objet', 'message'].find((cle) => champs[cle].trim() === '');
    if (vide) {
      setEtat({
        envoi: false,
        succes: false,
        erreur: `Renseignez ${vide === 'objet' ? 'l’objet' : 'le message'} avant d’envoyer.`,
      });
      document.getElementById(`contact-${vide}`)?.focus();
      return;
    }
    setEtat({ envoi: true, succes: false, erreur: null });
    try {
      await post('/contact', champs, {
        message429: 'Trop de messages envoyés. Réessayez dans quelques minutes.',
      });
      setChamps({ objet: '', email: '', message: '', siteWeb: '' });
      setEtat({ envoi: false, succes: true, erreur: null });
    } catch (err) {
      setEtat({ envoi: false, succes: false, erreur: err.message });
    }
  }

  return (
    <>
      <header className="page-titre">
        <h1>Nous contacter</h1>
        <p>
          Une question, une erreur à signaler ? Écrivez-nous. Votre adresse e-mail sert uniquement à
          vous répondre.
        </p>
      </header>

      <section className="carte" style={{ maxWidth: 640 }}>
        <p className="contact-direct">
          Vous préférez écrire directement ? Envoyez un e-mail à{' '}
          <a href={`mailto:${EMAIL_CONTACT}`}>{EMAIL_CONTACT}</a>.
        </p>
        {etat.succes && (
          <p className="message message-succes" role="status">
            Message envoyé. Merci, nous vous répondrons dès que possible.
          </p>
        )}
        {etat.erreur && (
          <p className="message message-erreur" role="alert">
            {etat.erreur}
          </p>
        )}
        <form onSubmit={envoyer} noValidate={false}>
          <div className="champ">
            <label htmlFor="contact-objet">Objet</label>
            <input
              id="contact-objet"
              type="text"
              required
              maxLength={150}
              value={champs.objet}
              onChange={maj('objet')}
            />
          </div>
          <div className="champ">
            <label htmlFor="contact-email">Votre adresse e-mail</label>
            <input
              id="contact-email"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              value={champs.email}
              onChange={maj('email')}
            />
          </div>
          <div className="champ">
            <label htmlFor="contact-message">Message</label>
            <textarea
              id="contact-message"
              required
              rows={6}
              maxLength={5000}
              value={champs.message}
              onChange={maj('message')}
            />
          </div>
          {/* Champ piège anti-robot : invisible et ignoré des humains et des lecteurs d'écran. */}
          <div className="piege" aria-hidden="true">
            <label htmlFor="contact-site">Ne pas remplir</label>
            <input
              id="contact-site"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={champs.siteWeb}
              onChange={maj('siteWeb')}
            />
          </div>
          <p className="fraicheur" style={{ marginBottom: 14 }}>
            Votre message est supprimé automatiquement au bout de 6 mois. Voir{' '}
            <Link to="/mentions-legales">Mentions légales et confidentialité</Link>.
          </p>
          <button type="submit" className="bouton" disabled={etat.envoi}>
            {etat.envoi ? 'Envoi…' : 'Envoyer'}
          </button>
        </form>
      </section>
    </>
  );
}
