# Sécurité de CampusLens

## Ce qui protège le site

- Validation stricte des entrées (Zod), requêtes SQL paramétrées (Prisma), en-têtes Helmet, CSP stricte (`frontend/vercel.json`).
- Limites de débit (global, contact, avis, connexion admin), CORS en liste blanche, **contrôle d’Origine** sur toute écriture.
- Administration : bcrypt (coût 12), verrou du compte après 10 échecs (15 min), session limitée à 12 h, cookie `__Host-` en production, **double authentification TOTP** + 8 codes de secours.
- Données personnelles (messages de contact, e-mails, commentaires d’avis) **chiffrées en base** (AES-256-GCM).
- Les robots de lecture refusent les adresses internes (protection SSRF).

## Variables obligatoires en production

| Variable          | Rôle                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`  | signature des sessions (`openssl rand -base64 48`)                                                                                    |
| `CLE_CHIFFREMENT` | clé de chiffrement des données personnelles (`openssl rand -base64 32`). **À sauvegarder** : sans elle, les messages sont illisibles. |
| `CORS_ORIGIN`     | adresse exacte du site (ex. `https://campuslens.vercel.app`)                                                                          |
| `TRUST_PROXY`     | `2` derrière Vercel puis Render (nombre de proxys)                                                                                    |
| `NODE_ENV`        | `production`                                                                                                                          |

## Opérations

- Chiffrer les données déjà présentes : `npm run donnees:chiffrer -w backend`
- Admin sans téléphone ni codes de secours : `npm run admin:desactiver-2fa -w backend -- email@exemple.fr`
- Sauvegardes : exclure les tables `message_contact` et `avis`, ou les conserver chiffrées avec la clé séparée.

## Signaler une faille

Voir `/.well-known/security.txt`.
