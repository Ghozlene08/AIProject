# Mon App

Projet web composé de :

- **Frontend** : Next.js (React, TypeScript, Tailwind CSS)
- **Backend** : Node.js + Express
- **Base de données** : MongoDB (connexion via Mongoose)

Ce dépôt est un **environnement de départ** : le frontend affiche une page d'accueil et le backend se connecte à MongoDB. Aucune route d'API n'est encore créée.

---

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Installation](#2-installation)
3. [Configuration (fichier .env)](#3-configuration-fichier-env)
4. [Vérifier la connexion à MongoDB](#4-vérifier-la-connexion-à-mongodb)
5. [Lancer le projet](#5-lancer-le-projet)
6. [Architecture du projet](#6-architecture-du-projet)
7. [Commandes disponibles](#7-commandes-disponibles)
8. [Travailler en équipe avec Git](#8-travailler-en-équipe-avec-git)
9. [Problèmes fréquents](#9-problèmes-fréquents)

---

## 1. Prérequis

Installez ces outils avant de commencer :

| Outil | Version conseillée | Vérifier avec |
|---|---|---|
| Node.js | 22 (LTS) | `node -v` |
| npm | fourni avec Node.js | `npm -v` |
| Git | récent | `git --version` |
| MongoDB Community Server | 7 ou 8 | `mongod --version` |
| MongoDB Compass | optionnel, pour visualiser la base | — |

Sous Windows, MongoDB tourne comme un **service**. Pour vérifier qu'il est démarré :

```bash
sc query MongoDB
```

Vous devez voir `STATE : 4 RUNNING`. Sinon, dans un terminal ouvert **en tant qu'administrateur** :

```bash
net start MongoDB
```

---

## 2. Installation

```bash
git clone https://github.com/<votre-compte>/mon-app-ia.git
cd mon-app-ia
npm run setup
```

La commande `npm run setup` :

1. installe les dépendances de la racine, du backend et du frontend (dossiers `node_modules`) ;
2. crée le fichier `backend/.env` à partir du modèle `backend/.env.example`.

---

## 3. Configuration (fichier .env)

Le fichier `backend/.env` contient les réglages du backend :

```env
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/mon-app-ia
```

| Variable | Rôle |
|---|---|
| `PORT` | port sur lequel démarre le backend |
| `CLIENT_URL` | adresse du frontend, autorisée à appeler le backend |
| `MONGODB_URI` | adresse de la base MongoDB (`localhost` = votre PC, `27017` = port par défaut, `mon-app-ia` = nom de la base) |

Avec MongoDB installé en local, **aucune modification n'est nécessaire**.

> ⚠️ `backend/.env` est propre à chaque machine et peut contenir des informations sensibles (mots de passe, clés). Il est ignoré par Git (voir `.gitignore`) et ne doit **jamais** être envoyé sur GitHub. Seul le modèle `backend/.env.example`, sans secrets, est partagé.

---

## 4. Vérifier la connexion à MongoDB

```bash
npm run db:check
```

Résultat attendu :

```
✅ MongoDB connecté (mongodb://localhost:27017/mon-app-ia)
   Version du serveur : 8.0.x
   Base : mon-app-ia
   Collections : (aucune pour l'instant)
```

Dans **MongoDB Compass**, connectez-vous à `mongodb://localhost:27017`. La base `mon-app-ia` apparaîtra dès que la première donnée y sera enregistrée.

---

## 5. Lancer le projet

```bash
npm run dev
```

Cette commande lance le backend et le frontend en même temps :

| Partie | Adresse | Message attendu dans le terminal |
|---|---|---|
| Frontend | http://localhost:3000 | `Ready` |
| Backend | http://localhost:5000 | `✅ MongoDB connecté` puis `🚀 Serveur démarré` |

Pour les lancer séparément, dans deux terminaux : `npm run dev:back` et `npm run dev:front`.

Arrêter : `Ctrl + C` dans le terminal.

---

## 6. Architecture du projet

```
mon-app-ia/
├── frontend/                  Application Next.js (interface utilisateur)
│   ├── public/                Fichiers statiques (images, icônes)
│   ├── src/
│   │   └── app/               Pages et mise en page (App Router)
│   │       ├── layout.tsx     Structure commune à toutes les pages
│   │       ├── page.tsx       Page d'accueil ( / )
│   │       └── globals.css    Styles globaux (Tailwind)
│   ├── next.config.ts         Configuration de Next.js
│   ├── tsconfig.json          Configuration de TypeScript
│   ├── eslint.config.mjs      Règles de qualité du code
│   └── package.json           Dépendances et commandes du frontend
│
├── backend/                   Serveur Node.js / Express
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js          Connexion à MongoDB
│   │   ├── models/            Schémas des données MongoDB (à venir)
│   │   ├── routes/            Définition des routes (à venir)
│   │   ├── controllers/       Logique exécutée par chaque route (à venir)
│   │   ├── middlewares/       Traitements communs : authentification, erreurs… (à venir)
│   │   ├── app.js             Configuration d'Express
│   │   └── server.js          Point d'entrée : connexion à la base puis démarrage
│   ├── scripts/
│   │   └── check-db.js        Test de connexion à MongoDB
│   ├── .env.example           Modèle de configuration (partagé)
│   ├── .env                   Configuration locale (non partagée, créée par npm run setup)
│   └── package.json           Dépendances et commandes du backend
│
├── scripts/
│   └── setup-env.js           Crée backend/.env lors de l'installation
├── .editorconfig              Mise en forme commune (indentation, encodage)
├── .gitattributes             Fins de ligne identiques sous Windows, macOS et Linux
├── .gitignore                 Fichiers que Git ne doit pas envoyer (node_modules, .env…)
├── .nvmrc                     Version de Node.js du projet (22)
├── package.json               Commandes globales (setup, dev, db:check)
└── README.md                  Ce fichier
```

### Rôle de chaque partie

**`frontend/`** : tout ce que l'utilisateur voit dans son navigateur. Dans Next.js (App Router), chaque dossier de `src/app/` correspond à une page : par exemple, `src/app/contact/page.tsx` crée la page `/contact`.

**`backend/`** : le serveur, invisible pour l'utilisateur. Il est le seul à communiquer avec la base de données. Son code est organisé en couches :

| Dossier | Rôle | Exemple futur |
|---|---|---|
| `config/` | Configuration technique (connexion à la base…) | `db.js` |
| `models/` | Forme des données stockées dans MongoDB | `User.js` : nom, email, mot de passe |
| `routes/` | Adresses accessibles du serveur | `GET /users` |
| `controllers/` | Ce que fait le serveur quand une route est appelée | lire les utilisateurs dans la base |
| `middlewares/` | Code exécuté avant les routes | vérifier qu'un utilisateur est connecté |

Le chemin d'une future requête sera :

```
Navigateur (frontend) → route → middleware → controller → model → MongoDB
```

Les dossiers `models/`, `routes/`, `controllers/` et `middlewares/` sont vides pour l'instant. Le fichier `.gitkeep` qu'ils contiennent sert seulement à ce que Git les conserve.

---

## 7. Commandes disponibles

À lancer depuis la racine du projet :

| Commande | Rôle |
|---|---|
| `npm run setup` | Installation complète + création de `backend/.env` |
| `npm run dev` | Lance le backend et le frontend |
| `npm run dev:back` | Lance uniquement le backend |
| `npm run dev:front` | Lance uniquement le frontend |
| `npm run db:check` | Teste la connexion à MongoDB |
| `npm run lint` | Vérifie la qualité du code du frontend |

---

## 8. Travailler en équipe avec Git

- `main` est la branche stable : on n'y travaille pas directement.
- Chaque tâche se fait sur sa propre branche : `feature/nom-court` ou `fix/nom-court`.

```bash
git checkout main
git pull
git checkout -b feature/page-connexion
# ... modifications ...
git add .
git commit -m "Ajoute la page de connexion"
git push -u origin feature/page-connexion
```

Ouvrez ensuite une **Pull Request** sur GitHub vers `main` pour que l'équipe relise le code.

Avant chaque commit, vérifiez avec `git status` qu'aucun fichier `.env` n'apparaît.

---

## 9. Problèmes fréquents

| Symptôme | Solution |
|---|---|
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB n'est pas démarré : `net start MongoDB` (terminal administrateur) |
| `MONGODB_URI est absent de backend/.env` | Relancez `npm run setup` ou copiez `backend/.env.example` en `backend/.env` |
| `'npm' n'est pas reconnu…` | Node.js n'est pas installé ou le terminal a été ouvert avant l'installation : rouvrez-le |
| Port déjà utilisé (`EADDRINUSE`) | Un autre programme utilise le port : changez `PORT` dans `backend/.env` |
| Message « vulnerabilities » après l'installation | Concerne des outils de développement ; n'utilisez pas `npm audit fix --force`, qui peut casser le projet |
