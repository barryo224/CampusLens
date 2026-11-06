import { useEffect, useId, useRef, useState } from 'react';

/**
 * Champ de recherche avec suggestions pendant la frappe (liste déroulante accessible : combobox + listbox), commun aux
 * villes et aux ressources. Pensé pour le téléphone : à la sélection du champ, la page le remonte sous la barre verte ;
 * la liste est courte (6 propositions) et tient au-dessus du clavier ; dès qu'on touche une suggestion, le clavier se
 * ferme et la page descend sur le résultat.
 *
 * `suggestions` : [{ cle, titre, detail, brut }] (déjà classées) ; `surChoix(brut)` reçoit l'élément choisi.
 */
export default function ChampSuggestions({
  libelle,
  placeholder,
  aide,
  libelleListe,
  suggestions: propositions,
  valeur,
  surChangement,
  surChoix,
  idResultats,
}) {
  const id = useId();
  const champ = useRef(null);
  const bloc = useRef(null); // étiquette + champ : c'est lui qu'on remonte, sous la barre collante
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const suggestions = valeur.trim() ? propositions : [];
  const affichees = ouvert && suggestions.length > 0;

  // Hauteur réellement visible (clavier exclu) : la liste ne dépasse jamais l'espace au-dessus du clavier.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const maj = () => {
      document.documentElement.style.setProperty('--hauteur-visible', `${Math.round(vv.height)}px`);
      // Le clavier vient de s'ouvrir (ou de se fermer) : si le champ est en cours de saisie, on le remet en haut.
      if (document.activeElement === champ.current)
        bloc.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    };
    maj();
    vv.addEventListener('resize', maj);
    return () => {
      vv.removeEventListener('resize', maj);
      document.documentElement.style.removeProperty('--hauteur-visible');
    };
  }, []);

  const descendreSurResultats = () => {
    champ.current?.blur(); // ferme le clavier : le résultat n'est plus caché dessous
    window.setTimeout(
      () => document.getElementById(idResultats)?.scrollIntoView?.({ block: 'start' }),
      60,
    );
  };
  const choisir = (s) => {
    surChoix(s.brut);
    setOuvert(false);
    setActif(-1);
    descendreSurResultats();
  };

  return (
    <div className="champ champ-suggestions" ref={bloc}>
      <label htmlFor={`${id}-champ`}>{libelle}</label>
      <input
        ref={champ}
        id={`${id}-champ`}
        type="search"
        role="combobox"
        aria-expanded={affichees}
        aria-controls={`${id}-liste`}
        aria-autocomplete="list"
        aria-activedescendant={affichees && actif >= 0 ? `${id}-option-${actif}` : undefined}
        aria-describedby={`${id}-aide`}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        value={valeur}
        onFocus={() => {
          setOuvert(true);
          // Sur téléphone, on remonte le champ en haut de l'écran avant que le clavier ne s'ouvre.
          bloc.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
        }}
        onBlur={() => setOuvert(false)}
        onChange={(e) => {
          surChangement(e.target.value);
          setOuvert(true);
          setActif(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && suggestions.length) {
            e.preventDefault();
            setOuvert(true);
            setActif((a) => (a + 1) % suggestions.length);
          } else if (e.key === 'ArrowUp' && suggestions.length) {
            e.preventDefault();
            setActif((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (affichees && actif >= 0) choisir(suggestions[actif]);
            else {
              setOuvert(false);
              descendreSurResultats();
            }
          } else if (e.key === 'Escape') {
            setOuvert(false);
          }
        }}
      />
      <p className="fraicheur" id={`${id}-aide`}>
        {aide}
      </p>
      {affichees && (
        <ul className="suggestions" id={`${id}-liste`} role="listbox" aria-label={libelleListe}>
          {suggestions.map((s, i) => (
            <li
              key={s.cle}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === actif}
              className={i === actif ? 'suggestion suggestion-active' : 'suggestion'}
              // mousedown : la sélection a lieu avant que le champ ne perde le focus (sinon la liste disparaîtrait).
              onMouseDown={(e) => {
                e.preventDefault();
                choisir(s);
              }}
              onTouchStart={() => setActif(i)}
            >
              <strong>{s.titre}</strong>
              {s.detail && <span>{s.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
