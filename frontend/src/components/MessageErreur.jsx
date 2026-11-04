/** Erreur compréhensible, avec un bouton pour réessayer (jamais de page blanche). */
export default function MessageErreur({ erreur, surReessayer }) {
  return (
    <div className="message message-erreur" role="alert">
      <p>{erreur?.message ?? 'Une erreur est survenue.'}</p>
      {surReessayer && (
        <button type="button" className="bouton bouton-secondaire" onClick={surReessayer}>
          Réessayer
        </button>
      )}
    </div>
  );
}
