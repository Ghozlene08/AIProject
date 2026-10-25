# F1 Assistant vocal à mémoire — Tasnim Chtila

## Résultat

F1 est réintégré au projet après le git pull. Le grand micro de `/senior/connexion-reussie` déclenche la chaîne vocale. La rubrique Messages du menu latéral et mobile ouvre `/senior/messages`, avec chatbot écrit, dictée vocale, historique récent et préférences de mémoire. Le formulaire écrit n’apparaît pas sur l’accueil.

## Exigences et choix techniques

Le cahier des charges demande STT + LLM + TTS, des faits utiles mémorisés, des réponses validées, un consentement et des secours par fournisseur.

| Capacité | Implémentation | Secours |
| --- | --- | --- |
| STT | Enregistrement MediaRecorder, envoi au backend, Whisper Groq `whisper-large-v3-turbo` | Web Speech API, avec nouvelle dictée |
| Dialogue | Passerelle IA existante, contexte des douze derniers tours, faits du senior | Fournisseurs suivants configurés dans F7 |
| Extraction | LLM Groq `llama-3.1-8b-instant`, sortie JSON contrôlée | Modèle de dialogue puis autres fournisseurs |
| TTS | Edge TTS `fr-FR-DeniseNeural`, bibliothèque serveur `msedge-tts` | Synthèse vocale du navigateur |
| Mémoire | MongoDB : faits par senior et contexte récent expirant après 24 heures | Aucune mémoire globale entre utilisateurs |

Vérification du compte Groq effectuée le 26 octobre 2026 : Whisper et `openai/gpt-oss-120b` sont disponibles ; les deux modèles Llama cités dans le cahier ne figurent pas dans la liste retournée par ce compte. Le dialogue utilise donc le modèle du fournisseur configuré dans l’administration, actuellement GPT-OSS par défaut dans le dépôt. Le petit modèle d’extraction non accessible est suivi d’un essai avec le modèle de dialogue. Les modèles restent configurables et leur accès gratuit doit être confirmé avant soutenance.

`ASSISTANT_GROQ_MODEL` permet de choisir le modèle Groq de dialogue F1. `GROQ_FACT_MODEL` permet de choisir le modèle d’extraction. Le choix des fournisseurs, leur activation et les pannes simulées sont repris de F7.

## Connexion et intégration avec les autres modules

F1 utilise le JWT Senior déjà délivré par `/auth/senior/face-login`. Il ne se fie jamais à un `seniorId` envoyé par le navigateur pour charger la mémoire. Le rôle et le profil sont vérifiés à chaque appel par `requireSeniorAuth`.

Aucune seconde connexion par PIN n’est ajoutée. Le jeton facial existant est conservé selon le fonctionnement du projet, avec une expiration déterminée par `JWT_EXPIRES_IN`. Le gestionnaire de comptes Aidant ne tente plus de vérifier ce jeton dans `/auth/me`, ce qui évite de l’effacer au rechargement. La connexion Senior reste accessible lorsque l’aidant utilise déjà le même navigateur.

Les documents, appels et SOS existants sont conservés dans l’accueil. Le micro et la lecture F1 sont mis en pause pendant un appel ou une alerte de sécurité. Le LLM classe maintenant les demandes en dialogue, navigation ou météo. Le serveur vérifie le JSON et les destinations autorisées avant de renvoyer une action. Le navigateur ouvre la rubrique après la lecture vocale ; un bouton permet de l’ouvrir immédiatement. Une action n’est jamais rejouée en rechargeant l’historique.

## Demandes et actions

| Exemple de demande écrite ou vocale | Résultat |
| --- | --- |
| « Rappelle-moi de prendre mes médicaments » | Ouvre `/senior/medicaments` avec les traitements actifs et horaires réellement renseignés par l’aidant |
| « À quelle heure dois-je prendre mes médicaments ? » | Même rubrique ; aucune dose ni heure n’est inventée par le LLM |
| « Quels sont mes rendez-vous ? » | Ouvre `/senior/agenda`, avec les événements à venir du senior connecté |
| « Ouvre mes documents » | Ouvre la rubrique Documents existante |
| « Ouvre mes contacts » | Ouvre les numéros renseignés dans le profil et l’option d’appel CareAI existante ; aucun appel automatique |
| « Ouvre mes messages » | Ouvre le chatbot dans Messages |
| « Quel temps fait-il à Tunis ? » | Géocodage puis prévisions réelles Open-Meteo, réponse écrite et vocale, lien source et date |
| « Et demain ? » après la météo | Prévisions du lendemain pour la ville de l’échange |
| « La météo ? » sans ville | Utilise la ville du profil ; si absente, demande la ville |
| Demande explicite de SOS | Ouvre la confirmation existante ; l’alerte nécessite toujours la confirmation du senior |

L’assistant ouvre les horaires de médicaments existants. La création ou modification d’un traitement/rappel reste dans l’espace Aidant. Il ne prétend pas avoir enregistré un nouveau rappel. Les pages Médicaments et Agenda exigent le JWT Senior et filtrent les données avec le profil authentifié, jamais un identifiant fourni par le client. L’ancien exemple statique de prochaine prise sur l’accueil a été retiré ; les coordonnées téléphoniques fictives ont été remplacées par les contacts du profil.

La météo couvre aujourd’hui et demain. Une autre date provoque une demande de choisir parmi ces deux jours. Les villes doivent venir des messages du senior ou du profil. Les appels vont uniquement aux deux domaines fixes Open-Meteo. Si le service est indisponible ou renvoie des données invalides, l’assistant le signale au lieu d’inventer une température. La consultation publique ne nécessite pas de nouvelle clé pour cette démonstration ; vérifier les conditions du fournisseur avant une utilisation commerciale.

La reconnaissance faciale nécessite toujours une instance CompreFace correctement configurée. La correction F1 ne remplace pas cette authentification.

## Mémoire et confidentialité

La conversation récente contient au maximum douze tours, soit six échanges, avec expiration après 24 heures. Elle est rechargée dans Messages à chaque navigation.

Les faits durables ne sont enregistrés que si la case d’autorisation est cochée. La préférence est conservée par senior sur l’appareil. Les catégories admises sont : nom du médecin, nom préféré, loisir, proche et langue préférée. Les valeurs extraites doivent être courtes et présentes littéralement dans la demande. Ce contrôle réduit les inventions sans prouver à lui seul l’exactitude sémantique de chaque extraction.

Les valeurs de mémoire et les noms connus sont anonymisés avant les appels LLM. Les aperçus des prompts F1 sont désactivés même si l’administration autorise ceux d’autres modules. Les erreurs fournisseur brutes ne sont pas enregistrées pour F1. L’anonymiseur ne garantit pas la détection de tout nom inconnu introduit librement par l’utilisateur.

Les fichiers audio circulent en mémoire pendant les requêtes et ne sont pas enregistrés sur disque. STT et TTS utilisent des services en ligne ; les journaux contiennent leur fournisseur, leur état et leur latence, sans contenu audio.

L’effacement depuis Messages supprime les faits F1 et les échanges récents. Les informations du profil renseignées par l’aidant, dont le médecin, restent intactes et peuvent encore servir de contexte.

## Fichiers principaux

- `backend/src/models/AssistantMemory.js` et `AssistantConversation.js`
- `backend/src/services/assistant/dialogue.js`, `speech.js`, `actions.js` et `weather.js`
- `backend/src/routes/assistant.routes.js`
- `backend/src/services/ai/gateway.js` : options F1, comportement des autres appels conservé
- `frontend/src/lib/assistant/useSeniorAssistant.ts`
- `frontend/src/components/assistant/AssistantMicro.tsx` et `MessagesPanel.tsx`
- `frontend/src/app/senior/messages/page.tsx`
- `frontend/src/components/assistant/SeniorRecords.tsx` et `AssistantAction.tsx`
- `frontend/src/app/senior/medicaments/page.tsx` et `agenda/page.tsx`
- `frontend/src/app/senior/connexion-reussie/ConnexionReussie.tsx` : branchement au micro et au menu
- `frontend/src/lib/auth.tsx` : préservation du jeton facial Senior

## API

Toutes les routes commencent par `/api/senior/assistant` et exigent `Authorization: Bearer <jeton Senior>`.

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/session` | Profil authentifié et disponibilité de configuration des services, sans clé secrète |
| GET | `/conversation` | Douze derniers tours non expirés |
| GET | `/medications` | Traitements actifs et horaires du senior connecté |
| GET | `/agenda` | Cinquante prochains événements prévus du senior connecté |
| GET | `/memory` | Faits du senior connecté |
| DELETE | `/memory` | Effacement des faits et de la conversation |
| POST | `/stt` | Audio binaire webm, mp4, ogg, wav ou mp3, maximum 8 Mo |
| POST | `/chat` | `{message, remember, channel}` ; dialogue, action contrôlée ou météo sourcée |
| POST | `/tts` | `{text}` ; audio MP3 |
| POST | `/speech-event` | État du secours navigateur, sans contenu personnel |

## Démarrage et démonstration

1. Démarrer MongoDB et le projet avec `npm run dev` depuis AIProject.
2. Vérifier `GROQ_API_KEY` dans `backend/.env`. Une clé Groq est déjà configurée sur cet environnement. Pour un véritable secours LLM, ajouter et configurer Gemini ou OpenRouter.
3. Se connecter comme Senior avec le parcours facial existant. Le profil doit autoriser les services IA.
4. Sur l’accueil, appuyer sur le micro et demander « Pourquoi le ciel est bleu ? ». Une pause termine la capture ; le bouton permet aussi de terminer manuellement.
5. Ouvrir Messages dans le menu. L’échange doit être visible. Demander « Et pourquoi devient-il rouge le soir ? » pour vérifier le contexte.
6. Ouvrir Mémoire et confidentialité et cocher l’autorisation. Dire ou écrire « Mon médecin s’appelle Nadia ».
7. Demander son nom, puis recharger la page et reposer la question.
8. Tester un autre profil : il ne doit pas accéder à la mémoire du premier.
9. Effacer la mémoire puis vérifier que les faits F1 ont disparu. Le médecin du profil Aidant, s’il existe, reste accessible.
10. Simuler une panne Groq dans l’administration ; un secours réellement configuré doit prendre la suite. Sans aucun LLM disponible, un message d’indisponibilité remplace la réponse : il n’y a pas de dialogue prédéfini.

## Vérifications du 26 octobre 2026

37 tests automatisés passent dans le dossier `backend/test`, dont les tests F1 et les tests existants. L’intégration HTTP utilise MongoDB et fournisseurs simulés : authentification Senior, refus Aidant, questions libres, contexte, consentement, isolation des profils, effacement, navigation vers les médicaments, accès aux traitements et à l’agenda, météo avec ville manquante puis précisée, suivi du lendemain, panne météo et secours vocaux. Les tests de passerelle couvrent la bascule Groq vers Gemini et l’absence de noms dans les journaux F1.

Avant l’ajout des actions et de la météo, la couverture mesurée des services F1 et de la passerelle était de 99,38 % des lignes. Cette ancienne mesure ne couvre pas les nouveaux services d’action/météo, toute l’application ni les composants React. TypeScript et ESLint passent pour les nouveaux fichiers F1 et les adaptations ciblées.

Les trois services externes ont été appelés avec une phrase neutre générée : Edge TTS a produit 22 608 octets MP3, Whisper a renvoyé une transcription et Groq a répondu à une question libre. Ce test a duré environ 2,2 secondes. Un second test a vérifié l’extraction puis la restitution d’un médecin entièrement fictif avec le vrai LLM.

La page Messages a été contrôlée dans le navigateur sans session Senior active. Le parcours complet depuis une nouvelle reconnaissance faciale et l’enregistrement au microphone de l’utilisateur n’ont pas été rejoués. La conformité P95 sous quatre secondes n’est pas établie par un seul test ; elle reste à mesurer avec les équipements et quotas de soutenance. Chrome, Edge et Safari restent à tester avec le microphone réel.

Les nouvelles pages Médicaments et Agenda ont également été ouvertes dans le navigateur sans session active, avec vérification de la navigation et de la demande de connexion. Le vrai LLM Groq a été testé avec quatre formulations de demande de médicaments, ainsi que l’agenda, la météo et son suivi du lendemain. Une vraie consultation Open-Meteo pour Tunis a réussi. Aucun traitement, rappel, appel ou SOS n’a été créé pendant ces vérifications.

Le script racine `backend/test-caregiver.js` attend un SOS en direct et ne se termine pas seul. Pour les tests automatisés, utiliser uniquement les fichiers `backend/test/*.test.js`.

## Préserver le travail avant le prochain git pull

Les nouveaux fichiers F1 doivent aussi être versionnés. Vérifier `git status` et faire une sauvegarde ou un commit avant de réinitialiser la branche. Aucun commit ni aucune suppression de modifications existantes n’a été effectué pendant cette réintégration.

## Références techniques

- Groq STT : https://console.groq.com/docs/speech-to-text
- Edge TTS : https://github.com/Migushthe2nd/MsEdgeTTS
- Open-Meteo prévisions et codes météo : https://open-meteo.com/en/docs
- Open-Meteo géocodage : https://open-meteo.com/en/docs/geocoding-api
