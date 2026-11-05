# CampusLens

Plateforme web gratuite et anonyme qui aide les étudiants en France à **connaître les aides auxquelles ils ont droit** et à **évaluer leur budget**. Les données viennent de sources officielles et se mettent à jour automatiquement.

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

```bash
npm run check          # ESLint + Prettier + tous les tests unitaires, composants et API
npm run test:e2e       # bout en bout (Playwright) — installer les navigateurs : npx playwright install
```

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
et une maintenance quotidienne (année universitaire en cours, sources périmées, suppression RGPD des messages).

## Espace administration

Page non publique : `/admin`. Créer un compte :

```bash
ADMIN_EMAIL=vous@exemple.fr ADMIN_PASSWORD='un mot de passe de 12+ caractères' npm run admin:creer -w backend
```

Il permet de valider ou rejeter les changements détectés sur les pages web, de suivre l'état des sources, de lancer
un robot et d'annuler une modification (rôle `admin`).

## Sécurité et vie privée

- Le simulateur calcule dans le navigateur : aucun montant n'est envoyé.
- Pas de compte public, pas de cookie de suivi. Le formulaire de contact conserve l'e-mail 6 mois puis le supprime.
- API publique en lecture seule, requêtes via Prisma uniquement, entrées validées avec Zod, en-têtes Helmet, limites de débit.
- Secrets dans `backend/.env` (jamais publié).

## À compléter avant la mise en ligne

- Mentions légales : nom du responsable et hébergeur (`frontend/src/pages/MentionsLegales.jsx`).
- Source « Indicateur du coût de la rentrée » (FAGE) : indiquer l'adresse du dossier de presse annuel pour activer sa veille.
- Photo du bandeau d'accueil (illustration provisoire).
