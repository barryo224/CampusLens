import { usePageTitre } from '../lib/usePageTitre.js';
import { EMAIL_CONTACT } from '../lib/config.js';

// ⚠ Il reste une mention entre crochets (l'hébergeur) à COMPLÉTER avant la mise en ligne (voir le README).
export default function MentionsLegales() {
  usePageTitre('Mentions légales et confidentialité');
  return (
    <>
      <header className="page-titre">
        <h1>Mentions légales et confidentialité</h1>
      </header>
      <article className="carte texte-long">
        <h2>Éditeur du site</h2>
        <p>
          CampusLens est un service gratuit d’information destiné aux étudiants en France.
          Responsable de la publication : Ousmane Barry. Contact :{' '}
          <a href={`mailto:${EMAIL_CONTACT}`}>{EMAIL_CONTACT}</a> ou la{' '}
          <a href="/contact">page Contact</a>.
        </p>
        <h2>Hébergement</h2>
        <p>[Hébergeur du site et de l’API : à compléter lors de la mise en ligne.]</p>

        <h2>Vos données personnelles</h2>
        <p>
          <strong>Le simulateur ne transmet rien.</strong> Les revenus, dépenses et choix de profil
          que vous saisissez restent dans votre navigateur : ils ne sont ni envoyés, ni enregistrés,
          ni partagés. Il n’y a ni compte, ni cookie de suivi, ni outil de mesure d’audience.
        </p>
        <p>
          <strong>Estimation de l’aide au logement (facultative).</strong> Si, et seulement si, vous
          cliquez sur « Estimer mon aide au logement », votre âge, votre ville, votre loyer, votre
          type de logement et votre revenu du mois sont envoyés à notre serveur, qui interroge le
          moteur de calcul public OpenFisca (api.fr.openfisca.org) pour estimer l’aide. Ces
          informations ne sont ni enregistrées, ni conservées, ni mises en cache, et ne sont
          associées à aucune identité. Si vous ne cliquez pas, rien n’est envoyé.
        </p>
        <p>
          <strong>Formulaire de contact.</strong> Si vous nous écrivez, nous conservons votre objet,
          votre message et votre adresse e-mail pour vous répondre. Ces informations sont supprimées
          automatiquement 6 mois après l’envoi. Base légale : votre consentement (vous envoyez le
          message volontairement).
        </p>
        <p>
          <strong>Avis sur le site.</strong> Si vous donnez votre avis, nous conservons votre note,
          votre commentaire facultatif, la page d’où vous venez et, si vous l’indiquez, votre profil
          (français, boursier, international). Cet avis est anonyme : nous n’enregistrons ni votre
          nom, ni votre adresse e-mail, ni votre adresse IP. Il est supprimé automatiquement 12 mois
          après l’envoi. N’y indiquez pas de renseignements personnels. Base légale : votre
          consentement.
        </p>
        <p>
          <strong>Vos droits.</strong> Vous pouvez demander l’accès, la rectification ou la
          suppression de votre message à tout moment via la page Contact. Vous pouvez aussi saisir
          la CNIL (cnil.fr).
        </p>

        <h2>Sources et licences</h2>
        <p>
          Les données affichées proviennent de sources officielles (data.gouv.fr, Service-Public.fr,
          CNOUS, ministère de l’Enseignement supérieur, CAF…). Chaque donnée indique sa source et sa
          date de vérification. Les jeux de données ouverts sont réutilisés sous Licence Ouverte
          2.0.
        </p>

        <h2>Limites</h2>
        <p>
          Les résultats sont indicatifs. Ils ne remplacent ni le CROUS, ni la CAF, ni un service
          social. Une information issue d’une page web ou d’un document sans API peut avoir quelques
          jours de décalage avant d’être validée.
        </p>
      </article>
    </>
  );
}
