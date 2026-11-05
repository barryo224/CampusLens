# Mise en ligne gratuite (Neon + Render + Vercel)

Ordre : 1) base de données, 2) API, 3) site, 4) données initiales, 5) surveillance. Région partout : **Francfort**.

## 1. Neon (base PostgreSQL)

1. neon.tech → créer un compte (GitHub) → projet `campuslens`, Postgres 17, région **AWS Europe (Frankfurt)**.
2. « Connect » : décocher « Pooled connection » et copier l'adresse `postgresql://…neon.tech/neondb?sslmode=require`.
   C'est `DATABASE_URL` (connexion directe : nécessaire pour les migrations).

## 2. Render (API)

1. render.com → compte GitHub → **New → Blueprint** → dépôt `barryo224/CampusLens` (lit `render.yaml`).
2. Saisir les deux valeurs demandées :
   - `DATABASE_URL` : l'adresse Neon ci-dessus ;
   - `CLE_CHIFFREMENT` : `openssl rand -base64 32` — **gardez-en une copie** (gestionnaire de mots de passe).
3. Déployer. Adresse de l'API : `https://campuslens-etudiants-api.onrender.com` (si Render attribue un autre nom,
   corrigez-le dans `frontend/vercel.json`). Test : `/api/health` doit répondre `{"ok":true…}`.

## 3. Vercel (site)

1. vercel.com → compte GitHub → **Add New Project** → dépôt `CampusLens`.
2. **Root Directory : `frontend`** ; Framework : Vite ; nom du projet : `campuslens-etudiants`.
3. Déployer → https://campuslens-etudiants.vercel.app. Les appels `/api/…` sont relayés vers Render (`vercel.json`).

## 4. Données initiales (une seule fois, depuis votre ordinateur)

```
cd CampusLens
DATABASE_URL='<adresse Neon>' npm run db:deploy -w backend
DATABASE_URL='<adresse Neon>' npm run db:seed -w backend
DATABASE_URL='<adresse Neon>' CLE_CHIFFREMENT='<la clé>' ADMIN_EMAIL=vous@exemple.fr ADMIN_PASSWORD='mot de passe long' npm run admin:creer -w backend
```

Ne relancez **pas** `db:seed` ensuite : il pourrait écraser des valeurs validées dans l'administration.
Puis connectez-vous à `/admin` et activez la double authentification (Mon compte).

## 5. Surveillance

- UptimeRobot (gratuit) : moniteur HTTP sur `https://campuslens-etudiants-api.onrender.com/api/health` toutes les 5 min
  (garde l'API éveillée ; la route ne réveille pas la base).
- Neon conserve l'historique pour restaurer la base (restauration à un instant donné, durée limitée en gratuit).

## Contrôles après mise en ligne

- `curl -I https://campuslens-etudiants.vercel.app/api/aides` : en-tête `cache-control` avec `s-maxage=120`.
- Connexion admin OK (si 403 : `CORS_ORIGIN` doit être exactement l'adresse du site).
- `npm run test:charge` contre l'adresse du site (voir README).
