// Sources simulées : on reproduit le FORMAT RÉEL relevé le 5 novembre 2026 (voir README), sans réseau.

/** Fausse réponse HTTP (assez fidèle pour notre client). */
export function reponse({
  status = 200,
  texte = '',
  octets = null,
  url = '',
  redirige = false,
  entetes = {},
} = {}) {
  const corps = octets ?? new TextEncoder().encode(texte);
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    redirected: redirige,
    headers: { get: (nom) => entetes[nom.toLowerCase()] ?? null },
    text: async () => (octets ? new TextDecoder().decode(octets) : texte),
    arrayBuffer: async () =>
      corps.buffer.slice(corps.byteOffset, corps.byteOffset + corps.byteLength),
  };
}

/**
 * Faux `fetch` : `routes` associe un morceau d'adresse à une réponse (ou une fonction, ou une Error à lever).
 * Une adresse inconnue répond 404. Les appels sont mémorisés dans `.appels`.
 */
export function fausseSource(routes) {
  const f = async (url) => {
    f.appels.push(String(url));
    const cle = Object.keys(routes).find((k) => String(url).includes(k));
    if (cle === undefined) return reponse({ status: 404, url });
    const v = typeof routes[cle] === 'function' ? await routes[cle](String(url)) : routes[cle];
    if (v instanceof Error) throw v;
    return v;
  };
  f.appels = [];
  return f;
}

// ───── Carte des loyers (data.gouv.fr + CSV en Windows-1252, séparateur « ; », décimale « , ») ─────
const URL_CSV = 'https://static.data.gouv.fr/resources/carte-des-loyers/pred-app-mef-dhup.csv';

export function recherchePourLoyers({ annee = 2025 } = {}) {
  return reponse({
    texte: JSON.stringify({
      data: [
        {
          title: ' "Carte des loyers" - Indicateurs de loyers d\'annonce par commune en 2024',
          resources: [
            {
              title: 'Indicateurs de loyer appartement',
              format: 'csv',
              url: 'https://exemple.test/ancien-2024.csv',
            },
          ],
        },
        {
          title: ` "Carte des loyers" - Indicateurs de loyers d'annonce par commune en ${annee}`,
          resources: [
            { title: 'Note méthodologique', format: 'pdf', url: 'https://exemple.test/note.pdf' },
            { title: 'Indicateurs de loyer appartement', format: 'csv', url: URL_CSV },
            {
              title: 'Indicateurs de loyer maison',
              format: 'csv',
              url: 'https://exemple.test/maison.csv',
            },
          ],
        },
        { title: 'Un autre jeu de données', resources: [] },
      ],
    }),
  });
}

/** CSV au format réel. `loyers` = { '35238': ['Rennes', '14,86'], … } (valeur déjà au format français). */
export function csvLoyers(
  loyers,
  {
    entete = '"id_zone";"INSEE_C";"LIBGEO";"EPCI";"DEP";"REG";"loypredm2";"lwr.IPm2";"upr.IPm2";"TYPPRED";"nbobs_com";"nbobs_mail";"R2_adj"',
  } = {},
) {
  const lignes = [entete];
  for (const [insee, [nom, valeur]] of Object.entries(loyers)) {
    lignes.push(
      `"1";"${insee}";"${nom}";"200067445";"35";"53";${valeur};7,5;12,5;"commune";0;484;0,77`,
    );
  }
  // Windows-1252 : on écrit en latin1 (mêmes octets pour les accents français).
  return reponse({
    octets: new Uint8Array(Buffer.from(lignes.join('\r\n') + '\r\n', 'latin1')),
    url: URL_CSV,
  });
}

export function sourceLoyers(loyers, options) {
  return fausseSource({
    'data.gouv.fr/api/1/datasets': () => recherchePourLoyers(options),
    'carte-des-loyers/pred-app-mef-dhup.csv': () => csvLoyers(loyers, options),
  });
}

// ───── Logements CROUS (portail open data du ministère, export JSON) ─────
export const RESIDENCE_REELLE = {
  id: 930,
  title: 'Cité U Arc de Meyran',
  zone: 'Aix-en-Provence',
  address: '565 avenue Gaston Berger  13621 Aix-en-Provence cedex 1',
  infos:
    "329 chambres avec wc, douche, lavabo \r\n\n319 chambres rénovées de 9 m² : 269.00 €\nDépôt de garantie : 250, 00 €\n\r\n   \r\n\n8 chambres rénovées de 16 m² : 299.00 €\nDépôt de garantie : 280,00 €\n\r\n   \r\n\n2 chambres rénovées  de 20m² adaptées handicap : 342.00 €\nDépôt de garantie : 230,00 €\n Loyer mensuel TCC hors ALS (Loyer au 01/09/25) \r\n Parking (Places limitées): 5 € par mois - \r\n Comment s'y rendre ? \r\n Bus 9, 16",
};

export const residence = (id, title, zone, infos = null) => ({
  id,
  title,
  zone,
  address: '1 rue Test  75000 Ville',
  infos,
});

export const sourceCrous = (residences) =>
  fausseSource({
    'fr_crous_logement_france_entiere/exports/json': () =>
      reponse({ texte: JSON.stringify(residences) }),
  });

// ───── Pages web (niveau 3) ─────
const remplissage =
  'Ce texte de remplissage donne à la page une longueur réaliste pour un contenu officiel. '.repeat(
    8,
  );

export function pageDroits({ licence = 178, master = 255 } = {}) {
  return `<html><head><title>Coût d'une inscription | Service Public</title></head><body>
  <header>Menu du site</header><main><h1>Coût d'une inscription dans l'enseignement supérieur</h1><p>${remplissage}</p>
  <table><tr><th>Formation</th><th>Taux normal</th></tr>
  <tr><td>Licence<br> ou diplôme national délivré au cours d'études conduisant au grade de licence<br>Licence professionnelle</td><td>${licence}&nbsp;€</td><td>118&nbsp;€</td></tr>
  <tr><td>Master<br> ou diplôme national délivré au cours d'études conduisant au grade de master</td><td>${master}&nbsp;€</td><td>167&nbsp;€</td></tr>
  </table></main><footer>Pied de page</footer></body></html>`;
}

export function pageCvec({ montant = 105, annee = '2026-2027' } = {}) {
  // Reproduit un défaut réel : entités déjà encodées (&amp;eacute;).
  return `<html><body><main><h1>CVEC</h1><p>${remplissage}</p>
  <p>L'acquittement est actuellement possible pour l'ann&amp;eacute;e universitaire ${annee}. Elle est de ${montant}&nbsp;€ euros.</p></main></body></html>`;
}

export const pageHtml = (html) => reponse({ texte: html });

// ───── OpenFisca (moteur de calcul) ─────
export const ENTETES_OPENFISCA = {
  'country-package': 'openfisca-france',
  'country-package-version': '175.0.45',
};

export const variableAideLogement = (
  version = '175.0.45',
  corps = {
    id: 'aide_logement',
    entity: 'famille',
    valueType: 'Float',
    description: 'Aide au logement (tout type)',
  },
) =>
  reponse({
    texte: JSON.stringify(corps),
    entetes: { ...ENTETES_OPENFISCA, 'country-package-version': version },
  });
