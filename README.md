# Senior Assistant

**F1 — Tasnim Chtila** : assistant vocal à mémoire réintégré au micro Senior et au menu **Messages** (`/senior/messages`). Chaîne Whisper Groq → LLM avec contexte et mémoire autorisée → Edge TTS, avec secours navigateur. Configuration, fichiers et essais : [guide F1](F1-TASNIM.md).

L’assistant comprend aussi les demandes d’ouverture des médicaments, de l’agenda et des autres rubriques disponibles. Il consulte la météo d’aujourd’hui ou de demain via Open-Meteo, avec ville précisée ou issue du profil, source et date affichées. La demande d’un rappel de médicament ouvre les horaires existants ; leur création/modification reste assurée par l’aidant.

Application web d'assistance vocale intelligente pour l'autonomie des personnes âgées — ESPRIT, atelier mini-projet « IA for Software Engineering » (groupe CareAI).

- **Frontend** : Next.js 16 (React 19, TypeScript, Tailwind CSS 4)
- **Backend** : Node.js + Express 5 (API REST, JWT, planificateur de rappels)
- **Base de données** : MongoDB via Mongoose
- **Module IA** : passerelle avec anonymisation, fournisseurs de secours (Groq → Gemini → OpenRouter → générateur local) et validation des sorties

Modules livrés dans cette version : **page d'accueil**, **Espace Aidant**, **Espace Administration** (l'interface vocale Senior est un module séparé).

**F1 — Tasnim** : l'assistant vocal est maintenant intégré au micro de `/senior/connexion-reussie` : Whisper Groq → LLM avec contexte et faits autorisés → Edge TTS, avec secours navigateur. Voir [le guide F1](F1-TASNIM.md) pour la connexion du profil, les clés IA nécessaires et les limites vérifiées.

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
| Senior | reconnaissance faciale | photo du visage enregistrée par l'aidant |

> ⚠️ `npm run seed` **vide** les collections avant de les remplir.
> 🛡️ Par sécurité, il **refuse de s'exécuter si la base contient déjà des données** (souvenirs, photos et comptes sont conservés). Pour tout effacer volontairement : `npm run seed -- --force`.

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

**Administration** (`/admin`) — centre de pilotage centré sur l'usage, l'utilité des fonctionnalités et la qualité de service
- **Tableau de bord** : 4 KPI vedettes (une par famille), détail des 4 familles d'indicateurs, évolution de l'usage, répartition par module, qualité IA, répartition des utilisateurs, **insights & recommandations**, alertes en attente, activités récentes, actions rapides
- **Analytique & tendances** : comparaison avec la période précédente, adoption de la voix, réussite par fonctionnalité, entonnoir des actions vocales, intentions et causes d'échec, carte thermique jour × heure, récurrence
- **Utilisateurs** : seniors actifs, nouveaux profils, activation, rétention à 7 jours, comptes inactifs (noms abrégés, aucune donnée médicale, petites villes regroupées)
- **Services IA** : disponibilité, latence P50/P95 vs objectif de 4 s, bascule et récupération, erreurs et quotas par fournisseur, test de la passerelle
- **Journaux & rapports** : journaux techniques filtrables, rapport périodique imprimable, exports CSV, toutes les recommandations
- **Configuration** : comptes et rôles, fournisseurs principaux et de secours (dont **panne simulée**, critère n° 8), seuils d'alerte, confidentialité (conservation des journaux, aperçu des prompts, abréviation des noms)

Les quatre familles d'indicateurs (adoption, utilité, qualité IA, valeur pour les aidants) sont calculées uniquement à partir des données enregistrées : collection `UsageEvent` (une ligne par action, avec son résultat et, pour la voix, l'étape atteinte), `AiCall`, `Alert` (créée → délivrée → traitée), `Intake` et `WeeklySummary`. Chaque KPI affiche sa définition, sa période et sa source. Les recommandations sont rédigées par un **LLM gratuit** à partir de ces seuls indicateurs, calculés par des règles déterministes (`services/insights.js`). La réponse du LLM est validée (JSON, champs autorisés, aucun chiffre absent des données) ; sans LLM disponible, les règles servent de repli. Le résultat est mis en cache une heure pour économiser le quota gratuit.

> **Pour l'équipe de l'interface Senior** : chaque action du senior doit être enregistrée avec `trackEvent()` (`backend/src/services/tracking.js`), par exemple `trackEvent({ senior, actor: "senior", module: "agenda", action: "rappel_cree", channel: "voix", intent: "creer_rappel", step: 4, outcome: "reussi", latencyMs })`. Les données de démonstration de `npm run seed` (42 seniors fictifs, 45 jours d'historique) simulent ces événements en attendant.

**Interface Senior — module F2 « Agenda et rappels »** (`/senior/agenda`, page autonome à relier par l'équipe)
- Connexion du senior **uniquement par reconnaissance faciale** (`/connexion?espace=senior`) ; sans session, la page invite à se connecter avec son visage
- « Mon agenda » : prises et rendez-vous du jour, navigation entre les jours, bouton « Je l'ai pris », ajout d'un rappel à l'écran
- **Assistant vocal** : « Qu'ai-je prévu aujourd'hui ? », « Rappelle-moi de prendre mon médicament à 20 heures » → *« Je vous rappellerai de prendre votre médicament aujourd'hui à 20 heures. C'est bien cela ? »* → « Oui » → rappel créé. Sans heure, l'assistant demande « À quelle heure ? ». « J'ai pris mon médicament » confirme la prise en cours
- **Rappels proactifs** : vérification toutes les 30 s, rappel affiché en grand et lu à voix haute à l'heure prévue
- **Briefing** « Écouter mon programme » : la suite de la journée, reformulée par le LLM puis contrôlée (prénom et heures obligatoires, aucun chiffre ajouté), sinon version factuelle
- Chaîne vocale : Whisper (Groq) pour la transcription, Web Speech API du navigateur en secours, LLM gratuit pour la compréhension avec un analyseur français déterministe en garde-fou (heures et dates dites explicitement), synthèse vocale du navigateur pour les réponses. Mesuré : ~1,4 s de bout en bout (transcription 0,7 s + compréhension 0,6 s)

**Planificateur** (toutes les minutes) : crée les prises du jour, compte les rappels et passe une prise en « manquée » après 2 rappels sans confirmation (30 min) → alerte + Telegram.

## 4. Modèles d'IA gratuits utilisés

Vérifiés le 18/10/2026 directement auprès de chaque fournisseur (les modèles prévus au cahier des charges, Llama 3.3 70B et Gemini 2.0 Flash, ne sont plus disponibles gratuitement) :

| Rôle | Fournisseur | Modèle | Temps mesuré |
|---|---|---|---|
| LLM principal | Groq | `openai/gpt-oss-120b` | ~0,7 s (phrase courte), ~1,8 s (recommandations) |
| LLM secours 1 | Google Gemini | `gemini-flash-latest` (réflexion désactivée) | ~3 s |
| LLM secours 2 | OpenRouter | `google/gemma-4-31b-it:free` | souvent saturé (erreur 429) |
| Reconnaissance vocale | Groq | `whisper-large-v3-turbo` | — |

## 4 bis. API REST (préfixe `/api`)

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
| GET | `/admin/overview`, `/admin/analytics`, `/admin/users-stats`, `/admin/ai-services` | Indicateurs (paramètre `?days=7|30|90`) |
| GET | `/admin/insights`, `/admin/report` | Recommandations, rapport périodique |
| GET | `/admin/export?type=kpis|events|ai-calls` | Export CSV (sans donnée nominative) |
| GET/PUT | `/admin/settings` | Seuils d'alerte et confidentialité |
| GET | `/admin/ai-calls` | Journaux techniques |
| POST | `/auth/senior/face-login` | Connexion du senior par reconnaissance faciale |
| GET | `/senior/agenda?date=`, `/senior/briefing`, `/senior/reminders/due` | Agenda du jour, briefing, rappels à signaler |
| POST | `/senior/intakes/:id/confirm`, `/senior/events`, `/senior/events/:id/ack` · DELETE `/senior/events/:id` | Prise confirmée, rappel ajouté, rappel vu, rappel annulé |
| POST | `/senior/voice/transcribe` (audio brut), `/senior/voice/agenda`, `/senior/voice/confirm` | Transcription, compréhension, confirmation orale |
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
├── models/                      User, Senior, Contact, Medication, Intake, Event, Alert, WeeklySummary, AiProvider, AiCall, UsageEvent, PlatformSettings
├── controllers/, routes/        auth, aidant, admin
├── middlewares/                 auth (JWT + rôles + accès au senior), erreurs
└── services/
    ├── ai/                      gateway, anonymizer, validator, providers, defaults
    ├── agenda/                  frenchParser (heures, dates, intentions en français), voiceAgenda (F2)
    ├── analytics.js             Indicateurs (adoption, utilité, qualité IA, aidants)
    ├── insights.js              Insights & recommandations (règles + LLM gratuit, chiffres vérifiés)
    ├── tracking.js              Enregistrement des événements d'usage
    ├── retention.js             Purge des journaux (durée de conservation)
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
| Synthèse « Générateur local » | Normal sans clé API ; ajoutez une clé gratuite (`GROQ_API_KEY` sur console.groq.com, `GEMINI_API_KEY` sur aistudio.google.com) |
| Erreur `HTTP 404 : model … does not exist` dans les journaux | Le modèle a été retiré de l'offre gratuite : changez-le dans Configuration → Fournisseurs IA (les modèles retirés connus sont remplacés au démarrage) |
