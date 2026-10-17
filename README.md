# Senior Assistant

Application web d'assistance vocale intelligente pour l'autonomie des personnes âgées — ESPRIT, atelier mini-projet « IA for Software Engineering » (groupe CareAI).

- **Frontend** : Next.js 16 (React 19, TypeScript, Tailwind CSS 4)
- **Backend** : Node.js + Express 5 (API REST, JWT, planificateur de rappels)
- **Base de données** : MongoDB via Mongoose
- **Module IA** : passerelle avec anonymisation, fournisseurs de secours (Groq → Gemini → OpenRouter → générateur local) et validation des sorties

Modules livrés dans cette version : **page d'accueil**, **Espace Aidant**, **Espace Administration** (l'interface vocale Senior est un module séparé).

---

## 1. Démarrage rapide

Prérequis : Node.js 22, MongoDB 7 ou 8 démarré en local (`sc query MongoDB` → `RUNNING`).

```bash
npm run setup     # installe les dépendances + crée backend/.env
npm run seed      # remplit la base avec les données de démonstration
npm run dev       # lance le backend (5000) et le frontend (3000)
```

Ouvrir http://localhost:3000.

| Compte | E-mail | Mot de passe |
|---|---|---|
| Aidant | sophie.martin@exemple.com | Aidant123! |
| Administrateur | admin@senior-assistant.tn | Admin123! |
| Senior (appairage) | code `MARIE7` | PIN `1234` |

> ⚠️ `npm run seed` **vide** les collections avant de les remplir.

## 2. Configuration (`backend/.env`)

| Variable | Rôle |
|---|---|
| `PORT` | Port du backend (5000) |
| `CLIENT_URL` | Origine autorisée (CORS) du frontend |
| `MONGODB_URI` | Base MongoDB (`mongodb://localhost:27017/senior-assistant`) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Signature et durée des sessions |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | Clés gratuites des LLM (facultatives) |
| `TELEGRAM_BOT_TOKEN` | Bot Telegram pour les alertes « prise manquée » (facultatif) |

Sans clé API, la passerelle utilise le **générateur local** : l'application reste entièrement fonctionnelle à 0 €.
Le frontend lit `NEXT_PUBLIC_API_URL` (par défaut `http://localhost:5000/api`, voir `frontend/.env.example`).

## 3. Fonctionnalités

**Page d'accueil** (`/`) : présentation, choix de l'espace (Senior, Aidant, Administration), modules F1 à F6.

**Espace Aidant** (`/aidant`) — connexion ou inscription (`/inscription`)
- Tableau de bord : état du senior, prises du jour, rendez-vous, alertes, prochaines activités, synthèse
- Profil du senior : informations, médecin, contacts d'urgence, code d'appairage + PIN
- Traitements : médicaments et horaires (les prises quotidiennes sont générées automatiquement)
- Agenda : vue semaine, rendez-vous, repas, activités, prises
- Suivi des prises : jour par jour, correction manuelle, historique 7 jours
- Alertes : filtres, lu / non lu, envoi Telegram
- Synthèse hebdomadaire générée par l'IA
- Paramètres : compte, notifications (e-mail, Telegram, SMS), mot de passe

**Administration** (`/admin`)
- Supervision IA : état des fournisseurs, appels du jour, taux de succès, latence, test de la passerelle
- Journaux des appels IA : filtres, pagination, prompt anonymisé et jetons
- Fournisseurs IA : activation, priorité de bascule, **panne simulée** (critère d'acceptation n° 8)
- Utilisateurs : création, rôles, statut, suppression

**Planificateur** (toutes les minutes) : crée les prises du jour, compte les rappels et passe une prise en « manquée » après 2 rappels sans confirmation (30 min) → alerte + Telegram.

## 4. API REST (préfixe `/api`)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | Inscription aidant, connexion |
| GET/PUT | `/auth/me`, PUT `/auth/password` | Compte connecté |
| GET/POST | `/aidant/seniors` | Proches suivis |
| GET/PUT | `/aidant/seniors/:id` | Profil (+ contacts) |
| POST | `/aidant/seniors/:id/pairing` | Nouveau code d'appairage + PIN |
| GET | `/aidant/seniors/:id/dashboard` | Tableau de bord |
| CRUD | `/aidant/seniors/:id/contacts`, `/medications`, `/events` | Contacts, traitements, agenda |
| GET/PATCH | `/aidant/seniors/:id/intakes`, GET `/adherence` | Prises, observance |
| GET/PATCH | `/aidant/seniors/:id/alerts`, PATCH `/alerts/read-all` | Alertes |
| GET/POST | `/aidant/seniors/:id/summaries` | Synthèses hebdomadaires |
| GET | `/admin/overview`, `/admin/ai-calls` | Supervision, journaux |
| GET/PUT | `/admin/providers` | Fournisseurs IA |
| POST | `/admin/ai/test` | Test de la passerelle |
| CRUD | `/admin/users` | Utilisateurs |

## 5. Architecture

```
frontend/src/
├── app/
│   ├── page.tsx                 Page d'accueil
│   ├── connexion/, inscription/ Authentification
│   ├── aidant/                  Espace Aidant (layout + 8 pages)
│   └── admin/                   Administration (layout + 5 pages)
├── components/                  Kit UI, coquille, graphiques SVG, logo
└── lib/                         Client API, session (JWT), types, formats

backend/src/
├── models/                      User, Senior, Contact, Medication, Intake, Event, Alert, WeeklySummary, AiProvider, AiCall
├── controllers/, routes/        auth, aidant, admin
├── middlewares/                 auth (JWT + rôles + accès au senior), erreurs
└── services/
    ├── ai/                      gateway, anonymizer, validator, providers, defaults
    ├── scheduler.js             Rappels et prises manquées
    ├── notifier.js              Alertes + Telegram
    └── summary.js               Synthèse hebdomadaire
```

Chemin d'une requête IA : `controller → gateway (anonymisation) → fournisseur 1, 2, 3… → validation → dé-anonymisation → journal AiCall`.

## 6. Commandes

| Commande | Rôle |
|---|---|
| `npm run setup` | Installation complète + `backend/.env` |
| `npm run dev` | Backend + frontend |
| `npm run seed` | Données de démonstration |
| `npm test` | Tests unitaires du module IA |
| `npm run db:check` | Test de connexion MongoDB |
| `npm run lint` | Lint du frontend |

## 7. Problèmes fréquents

| Symptôme | Solution |
|---|---|
| `ECONNREFUSED 127.0.0.1:27017` | `net start MongoDB` (terminal administrateur) |
| « Le serveur est injoignable » dans l'interface | Le backend n'est pas démarré (`npm run dev:back`) |
| Port déjà utilisé (`EADDRINUSE`) | Changez `PORT` dans `backend/.env` (et `NEXT_PUBLIC_API_URL`) |
| Synthèse « Générateur local » | Normal sans clé API ; ajoutez `GROQ_API_KEY` pour utiliser Llama 3.3 |
