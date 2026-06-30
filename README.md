# Bornes Factory — Web

Frontend de l'app **Bornes Factory** : l'atelier numérique de Selfizee
(assemblage, réparation, démontage, reconditionnement des bornes
Konitys).

Le backend est dans le repo séparé `konitys-api-factory`.

## Stack

- React + Vite + TypeScript + Tailwind CSS
- TanStack Query pour les fetchs
- React Router v6
- Keycloak SSO (même realm que Stock — single sign-on entre les apps)

## Pré-requis

- Node 20+
- Le backend Factory en route (par défaut `http://localhost:3201`)

## Démarrage

```bash
cp .env.example .env       # ajuster VITE_API_URL si besoin
npm install
npm run dev                # http://localhost:5273
```

## Variables d'environnement

Toutes les variables Vite sont **inlinées au build** (pas au runtime),
donc tu dois les passer en `--build-arg` quand tu build l'image Docker
(voir section Coolify).

```
VITE_API_URL=http://localhost:3201/api
VITE_KEYCLOAK_URL=https://keycloak.orkessi.com
VITE_KEYCLOAK_REALM=konitys
VITE_KEYCLOAK_CLIENT_ID=stock-management
```

## Docker

Build local avec ses build args :

```bash
docker build \
  --build-arg VITE_API_URL=http://localhost:3201/api \
  --build-arg VITE_KEYCLOAK_URL=https://keycloak.orkessi.com \
  --build-arg VITE_KEYCLOAK_REALM=konitys \
  --build-arg VITE_KEYCLOAK_CLIENT_ID=stock-management \
  -t bornes-factory-client .

docker run --rm -p 5273:80 bornes-factory-client
```

Ou via compose (lis les valeurs de l'env du shell) :

```bash
docker compose up --build
```

## Déploiement Coolify

- Service Docker depuis ce Dockerfile à la racine
- **Build Arguments** (pas Runtime Environment) à configurer dans
  Coolify : `VITE_API_URL`, `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`,
  `VITE_KEYCLOAK_CLIENT_ID`
- Port exposé : `80` (nginx sert le bundle statique)

⚠️ Les `VITE_*` doivent absolument être en **Build Arguments**, pas en
Runtime, sinon Vite inline `undefined` dans le bundle.

## Pages

- `/` — Tableau de bord (KPIs + derniers ordres)
- `/production-orders` — Liste + création des ordres de fabrication
- `/production-orders/:id` — Détail + besoins composants + planification
- `/assemblies` — Placeholder (V1.1)
