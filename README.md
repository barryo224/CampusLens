# CampusLens

Plateforme web gratuite et anonyme qui aide les étudiants en France à **comprendre leurs droits et découvrir les aides** (avec les villes, les loyers, les transports et les démarches utiles) et à **évaluer leur budget**. Les données viennent de sources officielles et se mettent à jour automatiquement.

- Spécification et maquette : [`documents/`](documents/)
- Pile : React + Vite · Node.js + Express · PostgreSQL + Prisma · Zod · Vitest · Playwright

## Démarrage rapide (développement)

Prérequis : Node.js ≥ 22.18 et PostgreSQL 17 (`brew install postgresql@17 && brew services start postgresql@17`).

```bash
npm install
createdb campuslens && createdb campuslens_test          # bases de développement et de test
cp backend/.env.example backend/.env                      # puis adapter DATABASE_URL / TEST_DATABASE_URL
npm run db:deploy -w backend && npm run db:generate       # tables + client Prisma
npm run db:seed -w backend                                # données de départ
npm run sync -w backend -- all                            # première synchronisation des sources (réseau)

npm run dev:back     # terminal 1 → API   http://localhost:3001
npm run dev:front    # terminal 2 → site  http://localhost:5173
```

## Vérifier le projet

| Commande                       | Ce qu'elle contrôle                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                | ESLint, Prettier, tests unitaires, de composants et d'API                                                                                                                        |
| `npm run test:coverage`        | idem + **seuils de couverture** (robots ≥ 90 %, API ≥ 80 %, calcul du reste-à-vivre ≥ 90 %)                                                                                      |
| `npm run test:e2e`             | bout en bout dans un vrai navigateur (Chrome, Firefox, Safari/WebKit, Android et iPhone), dont l'accessibilité (axe-core, contrastes réels) et la navigation **au clavier seul** |
| `npm run test:e2e:prod`        | les mêmes tests contre le site **construit** et servi avec ses en-têtes de sécurité de production (CSP stricte, HSTS…) : vérifie que rien n'est bloqué                           |
| `npm run lighthouse`           | Lighthouse mobile sur toutes les pages : performance ≥ 90, accessibilité ≥ 95 (actuellement 98-99 et 100)                                                                        |
| `npm run verifier:secrets`     | aucun secret dans les fichiers **ni dans l'historique Git**                                                                                                                      |
| `npm audit --audit-level=high` | aucune faille haute ou critique dans les dépendances                                                                                                                             |

La CI GitHub Actions lance tout cela à chaque envoi. Navigateurs : `npx playwright install chromium firefox webkit`, puis
`npx playwright test --project=firefox` (ou `webkit`, `mobile-safari`) depuis un terminal ordinaire. Sur Mac, Safari ne s'arrête
pas sur les liens avec Tab (réglage du navigateur) : les tests de clavier y utilisent Option+Tab.

### Sécurité du site (production)

- En-têtes dans `frontend/vercel.json` : politique de sécurité du contenu (CSP) sans script ni style intégré, anti-iframe,
  HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. `scripts/servir-prod.mjs` les reproduit pour les tests.
- L'API relayée par Vercel (`/api/*` → serveur de l'API, voir `vercel.json`) garde un seul domaine : le cookie de
  l'administration reste `HttpOnly` et `SameSite=Strict`.
- Limites : `API_LIMITE_PAR_MINUTE` (par défaut 600 en production : un réseau d'université partage souvent une IP),
  5 messages de contact par 10 min, 5 échecs de connexion par 15 min.

## Les données et les robots

Aucun chiffre n'est écrit dans le code : tout vient de la base, avec sa **source** et sa **date de vérification**.

| Niveau | Source                                | Robot (`backend/src/sync/robots/`) | Comportement                                                    |
| ------ | ------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| 1      | Carte des loyers (data.gouv.fr)       | `loyers.js`                        | mise à jour automatique, édition la plus récente détectée seule |
| 1      | Logements CROUS (CNOUS)               | `logementsCrous.js`                | mise à jour automatique                                         |
| 1      | Liens de la page Ressources           | `liensRessources.js`               | statut « ok / déplacé / cassé »                                 |
| 3      | Droits d'inscription (Service-Public) | `pagesOfficielles.js`              | changement détecté → **validation d'un admin**                  |
| 3      | CVEC (cvec.etudiant.gouv.fr)          | `pagesOfficielles.js`              | idem                                                            |

Lancer un robot à la main : `npm run sync -w backend -- loyers` (ou `all`).
En production, mettre `SYNC_ENABLED=true` : node-cron lance les robots selon la fréquence de chaque source,
et une maintenance quotidienne (préparation de l'année universitaire suivante, année en cours, sources périmées, suppression RGPD des messages).

**Changement d'année.** À partir de 4 mois avant la fin de l'année en cours (début mai), la maintenance crée l'année suivante
(ex. 2027-2028) et y recopie les paramètres et les postes de rentrée, tous marqués « non vérifiés ». Le 1er septembre, le site
bascule seul : les anciens montants s'affichent avec « vérification en cours », les robots proposent les nouveaux dans
« À valider » (droits, CVEC) et vous corrigez/validez le reste dans « Données à vérifier ».

## Estimation de l'aide au logement (OpenFisca) : retirée de l'interface

Le bouton « Estimer mon aide au logement » a été retiré de la page « Évaluer ma situation » le 8 novembre 2026 : il
était lent (jusqu'à 30 secondes quand le moteur public tarde) et c'était la seule fonction qui envoyait des
informations hors du navigateur. **Plus aucune donnée saisie ne quitte l'appareil.** La route
`POST /api/simulation/aides-estimees`, son client et son robot de veille existent encore côté serveur, sans être
appelés par le site : à retirer avec la source « OpenFisca » de la base (décision à prendre).

## Vérification des données

Le site affiche « vérification en cours » à côté de toute donnée qui n'a pas été confirmée par sa source. Pour la
faire disparaître **honnêtement** :

- données gérées par un robot (loyers, résidences, liens) : automatique ; droits d'inscription et CVEC : onglet
  **À valider** de l'administration ;
- données saisies à la main (aides, postes de rentrée, associations, 964 h…) : onglet **Données à vérifier** — ouvrir
  la source officielle indiquée, comparer, puis « J'ai vérifié ». Les pages officielles correspondantes sont surveillées chaque jour par un robot (« veille ») : la vérification reste valable tant que la page ne change pas ; si elle change, la mention « vérification en cours » revient et une alerte apparaît dans « À valider ». Dans tous les cas, une vérification expire au bout de 180 jours ;
- réglages propres à CampusLens (seuils, surface d'un studio) : validés d'office, ce sont des choix éditoriaux.

## Montée en charge

`npm run test:charge -- http://localhost:3101 10 10,50,100,200,500` simule des visiteurs qui enchaînent des requêtes sans pause
(lecture seule, aucune écriture en base). Lancer l'API d'essai avec `NODE_ENV=production SYNC_ENABLED=false
API_LIMITE_PAR_MINUTE=100000000 PORT=3101` (robots coupés, limite de débit relevée pour mesurer la capacité réelle).
Mesures du 5 novembre 2026 (un seul processus Node, base locale, ordinateur portable) :

- **≈ 1 200 requêtes par seconde** et aucune erreur de 10 à 1 000 visiteurs simultanés qui n'arrêtent jamais d'interroger
  l'API (bien plus dur que des visiteurs réels, qui font une requête toutes les quelques secondes). Le temps de réponse monte
  de façon linéaire (médiane 8 ms à 10 visiteurs, 240 ms à 300, 760 ms à 1 000), sans erreur ni blocage.
- **Mémoire stable** : 126 Mo au repos, 360 à 390 Mo après plusieurs charges successives (pas de fuite).
- **Compression** : la liste des villes passe de 202 Ko à 16 Ko. **Cache** : les données publiques portent
  `s-maxage=120` (un CDN les sert sans solliciter l'API), le navigateur revérifie toujours (`max-age=0, must-revalidate` + ETag, jamais de donnée périmée) ; erreurs et
  administration ne sont jamais mises en cache.
- **Limite de débit** : au-delà de 600 requêtes par minute et par adresse IP, réponse 429 avec le délai d'attente
  (`API_LIMITE_PAR_MINUTE` pour l'ajuster ; `/api/health` n'est pas limité).
- Sur un Mac, plus de ~250 connexions ouvertes **au même instant** peuvent être refusées (file d'attente du système à 128) :
  limite de l'ordinateur d'essai, pas de l'application (`RAMPE_MS=5` fait arriver les visiteurs progressivement).

## Abonnements de transport

Les prix sont relevés sur la page officielle de chaque réseau (fichier `backend/src/seed/donnees.js`, une ligne par ville ou
par réseau). Pour 25 réseaux dont la page affiche lisiblement les prix, un robot relit la page **chaque jour** : si l'un des prix
que nous avons enregistrés disparaît (le réseau a changé son tarif), les tarifs du réseau repassent en « vérification en cours »
et une alerte apparaît dans « À valider ». Les autres réseaux (page bloquée aux robots ou chargée par script) se revérifient à
la main tous les 90 jours. Les prix changent à des dates variables (juillet, août, septembre, janvier…), d'où la veille quotidienne.

## Avis des visiteurs

La page `/avis` (lien « Donner mon avis » dans le pied de page et sous le résultat de l'évaluation) permet de noter le site de
1 à 5 et de raconter son expérience (note **et** commentaire obligatoires : un avis vide est refusé). Les avis sont **anonymes** (ni nom, ni e-mail, ni adresse IP : la limite de 5 avis par
10 minutes se fait en mémoire), protégés par un champ piège anti-robot, et **supprimés automatiquement après 12 mois**
(`AVIS_RETENTION_MONTHS`). Ils arrivent dans l'onglet **Avis** de l'administration (rôle `admin` seulement) : moyenne,
répartition des notes, pastille des avis non lus, suppression à la demande. Ils ne sont jamais affichés au public : n'importe qui
peut en envoyer, ce n'est pas une mesure fiable.

## Espace administration

Page non publique : `/admin`. Créer un compte :

```bash
ADMIN_EMAIL=vous@exemple.fr ADMIN_PASSWORD='un mot de passe de 12+ caractères' npm run admin:creer -w backend
```

Il permet de valider ou rejeter les changements détectés sur les pages web, de suivre l'état des sources, de lancer
un robot et d'annuler une modification (rôle `admin`).

### Savoir qu'on vous a écrit

- **Pastille « non lus »** sur « Messages » dans l'administration, visible sur toutes ses pages, et nombre dans le titre
  de l'onglet : « (2) Espace administration ». Les messages ont un état lu / non lu.
- **E-mail de prévenance (facultatif)** : renseigner `SMTP_URL`, `NOTIFICATION_EMAIL` (et `SITE_URL`) dans `backend/.env`
  (exemple Gmail dans `.env.example` : il faut un « mot de passe d'application »). Pour vérifier la configuration :
  `npm run notif:tester -w backend`. Le courriel ne contient **jamais** le message ni l'expéditeur, seulement le nombre
  de messages non lus et un lien ; au plus un courriel toutes les 10 minutes (les messages sont regroupés).

## Sécurité et vie privée

- Le simulateur calcule dans le navigateur : aucun montant n'est envoyé.
- Pas de compte public, pas de cookie de suivi. Le formulaire de contact conserve l'e-mail 6 mois puis le supprime.
- API publique en lecture seule, requêtes via Prisma uniquement, entrées validées avec Zod, en-têtes Helmet, limites de débit.
- Secrets dans `backend/.env` (jamais publié).

## À compléter avant la mise en ligne

- Mise en ligne : suivre `DEPLOIEMENT.md` (Neon + Render + Vercel, gratuit).
- Source « Indicateur du coût de la rentrée » (FAGE) : indiquer l'adresse du dossier de presse annuel pour activer sa veille.
- Photo du bandeau d'accueil (illustration provisoire).
