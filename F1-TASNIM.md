# F1 Assistant vocal à mémoire — Tasnim Chtila

Le module est intégré au grand micro « Parlez maintenant » de `/senior/connexion-reussie`. Les réponses prédéfinies et le mode essai ont été supprimés. Chaque demande de dialogue passe désormais par un modèle de langage.

## Exigences relues et fonctionnement

Le cahier des charges, sections 4, 6.1, 7, 9 et 10, demande de dialoguer naturellement, retenir des faits utiles, afficher et lire les réponses, valider les sorties et prévoir des fournisseurs de secours.

| Étape | Principal | Secours |
| --- | --- | --- |
| STT voix vers texte | Whisper `whisper-large-v3-turbo` via Groq | Web Speech API du navigateur |
| Dialogue LLM | Fournisseur principal de la passerelle existante | Fournisseurs suivants, dont Gemini et OpenRouter selon configuration |
| Extraction de faits autorisés | Petit modèle Groq `llama-3.1-8b-instant` | Modèle Groq de dialogue, puis autres fournisseurs disponibles |
| TTS texte vers voix | Edge TTS `fr-FR-DeniseNeural` | Synthèse vocale du navigateur |

Le navigateur enregistre la voix avec MediaRecorder. Une pause après la parole termine l’enregistrement ; un deuxième clic sur le micro peut aussi l’arrêter. L’audio est envoyé au backend, qui appelle Whisper. Le texte est ensuite transmis au LLM avec les douze derniers tours et les faits autorisés. La réponse validée est affichée puis envoyée à Edge TTS. Les fichiers audio ne sont pas conservés sur disque.

Si Whisper échoue, une nouvelle écoute est proposée avec le service du navigateur : le senior doit répéter la phrase. Si Edge TTS échoue ou si la lecture audio est bloquée, la synthèse du navigateur prend le relais. Si aucun LLM n’est disponible, une erreur explicite est affichée ; aucune réponse prédéfinie ne remplace un dialogue IA.

## Configuration nécessaire

1. Vérifier que MongoDB est démarré et que `backend/.env` contient `MONGODB_URI` et un vrai `JWT_SECRET`.
2. Renseigner `GROQ_API_KEY` dans `backend/.env`, sans publier cette clé ni la mettre dans le frontend.
3. Pour le secours LLM, configurer au moins `GEMINI_API_KEY` ou `OPENROUTER_API_KEY` et activer le fournisseur correspondant dans l’administration.
4. Redémarrer le backend après modification des variables, avec `npm run dev:back`, ou relancer `npm run dev` depuis AIProject.
5. Ouvrir `http://localhost:3000/senior/connexion-reussie`.

Le modèle du dialogue est celui déjà configuré dans l’administration. Le cahier cite Llama 3.3 70B ; le dépôt existant utilise un autre modèle par défaut et migre certains identifiants au démarrage. `ASSISTANT_GROQ_MODEL` permet de choisir explicitement un modèle pour F1, par exemple `llama-3.3-70b-versatile` si le compte Groq y a accès. `GROQ_FACT_MODEL` configure le petit modèle d’extraction. L’accès aux modèles et aux quotas gratuits doit être vérifié avec le compte réellement utilisé. Le programme ne souscrit à aucune offre ni n’ajoute de moyen de paiement.

Edge TTS est installé dans le backend via la dépendance `msedge-tts`. Il ne nécessite pas de clé Groq. Les clés IA étaient absentes lors de la vérification : les appels réels Whisper et LLM n’ont donc pas pu être exécutés.

## Connexion du senior

La première connexion se fait dans une fenêtre dédiée, ouverte au clic sur le micro ou depuis Messages. Elle est ensuite restaurée automatiquement sur cet appareil.

Utiliser les codes fournis par l’aidant. Si les données de démonstration sont déjà installées, le profil Marie utilise `MARIE7` et `1234`. Ce parcours a été vérifié dans le navigateur. Aucun seed ni effacement de base n’est nécessaire.

La session Senior est conservée pendant 30 jours dans un cookie HttpOnly et restaurée au rechargement ou lors de la navigation. Une première connexion reste nécessaire pour identifier le senior. Le PIN et le jeton ne sont pas stockés dans le localStorage. Le bouton Se déconnecter ferme la session sur cet appareil ; renouveler le code invalide les anciennes sessions. Le bandeau affiche le profil authentifié.

## Mémoire et confidentialité

La conversation récente contient au maximum douze tours et expire après 24 heures. Elle permet les questions de suivi, par exemple « Et pourquoi ? ». Son utilisation est distincte de l’enregistrement durable des faits.

La case d’autorisation contrôle les faits durables. Le LLM d’extraction accepte seulement cinq catégories : médecin, nom préféré, loisir, proche et langue préférée. Chaque valeur est validée : catégorie autorisée, longueur limitée et citation exacte présente dans la phrase. Les questions, hypothèses et négations doivent être ignorées par l’extracteur. Cette validation réduit les inventions mais ne garantit pas l’exactitude sémantique de chaque extraction.

Les faits sont séparés par identifiant Senior. Les noms connus, les valeurs de mémoire et les téléphones sont remplacés par des jetons via l’anonymiseur existant avant les appels LLM. L’anonymisation de noms inconnus dans le texte libre reste limitée. Aucun aperçu de prompt F1 ni texte d’erreur fournisseur brut n’est stocké dans les journaux F1. Les appels STT, LLM et TTS sont journalisés avec fournisseur, état et latence, sans enregistrement audio. Le consentement IA du profil est vérifié côté serveur.

« Effacer ma mémoire » supprime les faits ET la conversation récente. Aucune suppression de profil, de traitement ou d’agenda n’est effectuée.

## Scénario de démonstration

1. Connecter un profil autorisant l’IA.
2. Cliquer sur le micro et demander « Pourquoi le ciel est bleu ? » : transcription, réponse LLM et lecture vocale.
3. Demander « Et pourquoi devient-il rouge le soir ? » : le contexte est repris.
4. Cocher l’autorisation de mémoire et dire « Mon médecin s’appelle Nadia ».
5. Demander « Comment s’appelle mon médecin ? » : réponse fondée sur le fait enregistré.
6. Recharger, reconnecter le même senior et reposer la question : le fait reste disponible.
7. Connecter un autre senior : il ne voit pas la mémoire du premier.
8. Sans autorisation de mémoire, confier un fait et vérifier qu’il n’est pas enregistré durablement.
9. Effacer la mémoire, puis vérifier son absence.
10. Simuler une panne du fournisseur principal dans l’administration et vérifier la bascule.

Les demandes d’agenda, de rappel et de SOS nécessitent les outils des modules F2 et F5. Le dialogue F1 ne prétend pas exécuter ces actions.

## Code et API

- `frontend/src/app/senior/connexion-reussie/VoiceAssistant.tsx` : interface existante et conversation.
- `frontend/src/app/senior/connexion-reussie/useVoiceAssistant.ts` : capture, arrêt sur silence, STT, dialogue, TTS et secours navigateur.
- `backend/src/routes/assistant.js` : routes et orchestration authentifiées.
- `backend/src/services/assistantSpeech.js` : appel Whisper et synthèse Edge TTS.
- `backend/src/services/assistant.js` : construction du contexte et validation des faits.
- `backend/src/services/ai/gateway.js` : anonymisation, modèles, secours, validation et journaux.
- `backend/src/models/AssistantMemory.js` : faits durables.
- `backend/src/models/AssistantConversation.js` : contexte court avec expiration.

`POST /api/senior/pair` reçoit `{code, pin}`. Les routes suivantes exigent le JWT Senior :

| Méthode | Route | Données |
| --- | --- | --- |
| GET | `/api/senior/status` | Disponibilité de configuration et consentement, sans clé secrète |
| POST | `/api/senior/stt` | Audio binaire webm, mp4, ogg, wav ou mp3 ; maximum 8 Mo |
| POST | `/api/senior/chat` | `{message, remember, channel}` |
| POST | `/api/senior/tts` | `{text}` ; réponse audio MP3 |
| POST | `/api/senior/speech-fallback` | État du secours navigateur sans contenu personnel |
| GET | `/api/senior/memory` | Faits du senior connecté |
| DELETE | `/api/senior/memory` | Suppression des faits et du contexte court |

## Vérifications réalisées

48 tests backend passent, y compris un parcours HTTP avec MongoDB et fournisseurs simulés : question libre, contexte, médecin traité par le LLM, consentement, effacement et séparation des seniors. Les services vocaux sont testés avec réponses et flux simulés, formats invalides, erreurs, sortie vide et échappement SSML. La passerelle est testée sur l’anonymisation et la panne du principal.

La vérification TypeScript et ESLint passe sur les fichiers F1. Le navigateur affiche la page, connecte le profil de démonstration et signale correctement l’absence de clé. Aucun enregistrement vocal du microphone de l’utilisateur n’a été réalisé par l’agent. Edge TTS a été appelé en réel avec une phrase neutre : 22 320 octets MP3 reçus.

Les objectifs de latence P95 inférieur à quatre secondes et de compatibilité Chrome/Edge/Safari restent à mesurer avec les clés et équipements de soutenance. La couverture mesurée des seuls services F1 et de la passerelle est supérieure à 60 % ; elle ne représente pas toute l’application. Les tests HTTP locaux doivent pouvoir ouvrir un port temporaire.

Commandes : `npm test --prefix backend`, puis depuis frontend `npx tsc --noEmit` et `npx eslint src/app/senior/connexion-reussie/VoiceAssistant.tsx src/app/senior/connexion-reussie/useVoiceAssistant.ts`.

Références techniques consultées : https://console.groq.com/docs/speech-to-text et https://github.com/Migushthe2nd/MsEdgeTTS.

## Affichage et session persistante

L’accueil garde uniquement le micro pour F1. Le lien Messages du menu latéral ouvre `/senior/messages`, avec la conversation en bulles, la saisie écrite, la dictée vocale, la relecture et les préférences de mémoire. Le menu mobile propose également Messages. Les derniers échanges sont rechargés depuis le serveur, dans la limite des 24 heures de conservation.

Le cookie de session est HttpOnly et SameSite Lax, avec Secure en production. Les mutations refusent les origines étrangères. Seule la préférence de mémorisation est conservée dans le localStorage, par identifiant Senior ; aucun PIN, jeton ou message personnel ne l’est.

Nouvelles routes : GET `/api/senior/session`, POST `/api/senior/logout` et GET `/api/senior/conversation`. La session expire après 30 jours, un changement de code ou une suppression des cookies. Une déconnexion explicite efface le cookie sur l’appareil.

## Passage Aidant vers connexion Senior

Après création ou renouvellement des codes, la carte affichant le code et le PIN propose « Connecter le senior ». Ce lien ouvre `/senior/connexion`. L’entrée `/senior` affiche également ce formulaire. Le senior saisit ses deux codes, puis est redirigé vers `/senior/connexion-reussie` seulement après validation par l’API. Le PIN ne passe jamais dans une URL. Une ancienne session peut être conservée ou remplacée en saisissant les nouveaux codes.

L’ancienne animation « Visage reconnu » a été retirée de cet accueil, car elle ne correspondait pas à une vérification réelle. Le parcours formulaire → API → accueil a été vérifié avec le profil de démonstration, avec 48 tests backend, TypeScript et ESLint réussis. Le parcours complet avec création d’un nouvel aidant n’a pas été rejoué dans la base utilisateur pendant cette correction.
