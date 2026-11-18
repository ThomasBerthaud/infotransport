# Architecture

## Déploiement

Un service Node.js + Express en TypeScript, une instance, un volume `/data`, sur un serveur du réseau local. Docker Compose compatible Portainer : image applicative versionnée, redémarrage automatique et contrôle de santé local sans appel PRIM. Construire l'image avant déploiement ; ne pas supposer qu'un éditeur de stack Portainer dispose du code source à côté du Compose.

Clé PRIM fournie par `PRIM_API_KEY` côté serveur, jamais envoyée au navigateur. Sans clé, les API locales servent automatiquement des données fictives et ne contactent pas PRIM. Une clé invalide reste une erreur en mode réel. Pas d'authentification applicative, conformément au besoin local.

## Serveur et interfaces

- Serveur HTTP : Node.js + Express, TypeScript, composants React et rendu HTML serveur via `react-dom/server`, CSS local, pas de dépendance à un CDN.
- `/` : vue riche React pour navigateur classique ; TanStack Query lit les données du serveur Express. Davantage de départs par bloc (nombre réglable distinct de la vue épurée), informations complètes disponibles sur les incidents en cours pertinents pour les lignes/arrêts suivis, défilement autorisé. Elle partage les tuples et le cache PRIM avec la vue épurée, sans collectes supplémentaires induites par sa consultation.
- `/minimal` : vue épurée construite avec des composants React rendus en HTML côté Node.js/Express, sans hydratation React nécessaire sur l’écran cible. Tous les blocs et leurs horaires tiennent simultanément dans l'écran, sans scroll ni interaction. Rafraîchissement complet simple, à vérifier sur l'appareil. Les éventuels scripts de rafraîchissement doivent rester compatibles avec le navigateur cible ; pas de dépendance aux modules JavaScript modernes pour lire les départs.
- `/admin` : interface React interactive sur ordinateur pour les blocs autonomes (gare, ligne, direction), leur disposition, les valeurs par défaut et les surcharges par bloc. Recherche et prévisualisation utilisent le même client PRIM et le même budget que la collecte.
- `/health` : état du processus. L'administration montre séparément l'état PRIM, la fraîcheur des données et le budget.
- `/metrics` : métriques Prometheus ; `/mcp` : accès MCP en lecture seule (voir README).
- Un ordonnanceur dans le processus collecte les données, indépendamment des consultations de pages. Replanification après modification des réglages.

## Organisation du code

- `src/server/index.ts` : point d'entrée ; crée le service, l'application et écoute le port.
- `src/server/app.ts` : `createApp(service, options)` construit l'application Express (routes, en-têtes, contrôle d'origine, gestion d'erreurs) sans effet de bord, ce qui permet de la tester sur un port éphémère.
- `src/server/service.ts` : configuration, cache, ordonnanceur et vues ; `demo.ts` contient les données fictives du mode démonstration.
- `src/server/prim.ts` : client et analyse SIRI ; `storage.ts` : fichiers persistants et budget ; `catalog.ts` : référentiel local.
- `src/server/errors.ts` : erreurs typées et correspondance avec les statuts HTTP ; `log.ts` : journal à niveaux.
- `src/client/admin.tsx` assemble l'administration à partir de `src/client/admin/` : champs communs, éditeur de bloc, recherche (`useBlockLookup`), aperçu, réglages d'écran et barre latérale. Les fonctions pures de l'éditeur sont dans `admin/blocks.tsx` et testées sans DOM.

## Erreurs et journaux

Les réponses d'erreur de l'API distinguent les causes : `400` pour une entrée invalide (Zod, règle de configuration), `403` pour une origine refusée, `502` ou `504` quand PRIM échoue ou ne répond pas, `503` quand une règle locale empêche l'appel (budget atteint, pause nocturne, attente après HTTP 429), `500` pour une erreur inattendue. Un `500` renvoie un message générique ; le détail et la pile restent dans les journaux.

Le journal écrit une ligne horodatée par événement sur la sortie standard, filtrée par `LOG_LEVEL` (`debug`, `info` par défaut, `warn`, `error`, `silent`). Les requêtes HTTP et le détail des collectes sont au niveau `debug` ; `/health` et `/metrics` ne sont jamais journalisés. Les tests utilisent le niveau `error`.

## Frontend et outillage

- TypeScript strict pour tout le code source : serveur Express, services PRIM/cache/planification, contrats HTTP partagés, frontend et tests ; composants React en `.tsx`. Configuration Vite en TypeScript, fichiers JSON/YAML pour les outils qui les attendent. Ne pas ajouter de source applicative JavaScript manuelle.
- Développement serveur avec `node --import tsx --watch`, compilation serveur avec TypeScript pour la production et exécution du JavaScript généré avec Node.js. Le build Vite compile les assets frontend ; une vérification des types distincte couvre serveur et frontend. Express expose les routes HTTP et les assets statiques, avec gestion centralisée des erreurs et validation des entrées à l'exécution.
- React/TSX pour les composants d'affichage et d'administration ; composant de bloc partagé avec la prévisualisation pour conserver le même rendu.
- TanStack Query (`@tanstack/react-query`) dans la vue riche et l'administration pour les requêtes HTTP vers le serveur Express et les mutations : départs, configuration, recherche de gares/lignes/directions, prévisualisation et diagnostics. Fonctions de requête basées sur `fetch`, vérification des statuts HTTP et prise en compte du signal d'annulation. Invalidation ciblée des données après sauvegarde ; erreurs et chargements gérés dans l'interface.
- Le cache TanStack Query est un cache navigateur, distinct du cache PRIM persistant dans le volume Docker. Aucun appel direct à PRIM ni clé API dans le frontend. Les répétitions automatiques ou rechargements au retour sur l'onglet ne doivent pas contourner la planification, la pause nocturne ou le garde de budget serveur ; borner les nouvelles tentatives et désactiver leur automatisme pour les recherches susceptibles de consommer du quota. L'affichage épuré rendu côté serveur ne requiert pas TanStack Query dans son navigateur.
- Vite avec plugin React pour le développement frontend et le build des assets. Entrées distinctes pour le CSS de la vue épurée, la vue riche et l'application admin : ne pas charger les bundles interactifs sur l’écran cible.
- Build de production avec manifeste Vite pour que le serveur Express référence les fichiers CSS/JS versionnés. Express sert les assets compilés ; aucun serveur Vite dans le conteneur de production.
- CSS de l'affichage épuré volontairement compatible avec le navigateur cible. Vite ne garantit pas la compatibilité des fonctionnalités CSS : vérifier la mise en page sur appareil et prévoir une disposition de repli pleine largeur.
- Oxlint (`oxlint`) pour le lint, Oxfmt (`oxfmt`) pour le formatage. TypeScript pour la vérification des types, distincte du build Vite et du lint.
- Scripts disponibles : `dev`, `build`, `start`, `lint`, `fmt`, `fmt:check`, `typecheck`, `test`. Versions verrouillées et installation reproductible avec npm et `npm ci` à partir du lockfile.
- Construction Docker en plusieurs étapes : build des assets et vérifications avant livraison du serveur et des assets compilés dans l'image finale.

## Fichiers persistants

- `/data/config.json` : configuration validée et versionnée.
- `/data/cache.json` : derniers résultats utilisables, horodatages de collecte et horodatages source lorsqu'ils sont disponibles.
- `/data/budget.json` : compteurs persistants par journée et par API, dernier appel et attentes éventuelles.

Configuration : `defaults` contient les réglages héritables (seuil de trajet, nombre de départs, plages actives et intervalle de collecte) ; chaque entrée de `blocks` contient un identifiant stable, le tuple, son placement et ses `overrides`. Une propriété absente dans `overrides` hérite dynamiquement de la valeur globale : ne pas recopier les valeurs par défaut à la création. Résoudre et valider les réglages effectifs avant planification. Le rafraîchissement complet de la page reste un réglage global de l'écran ; les intervalles de collecte peuvent varier par bloc dans la limite du budget commun. La configuration initiale ne contient aucun bloc ; en mode démonstration, deux blocs sont fournis pour illustrer l'interface.

Écritures sérialisées et remplacement atomique via fichier temporaire dans le même volume. Le serveur recharge ces fichiers au démarrage. Si le compteur est corrompu, le démarrage échoue plutôt que de repartir artificiellement à zéro. Une configuration illisible ou devenue invalide (règle de quota resserrée, modification manuelle) est renommée en `config.json.invalid-<date>` et remplacée par la configuration initiale ; l'administration affiche l'erreur jusqu'au prochain enregistrement. Le cache ne conserve que les arrêts et lignes des blocs configurés, plus les découvertes de directions de moins de trois minutes. Les réservations d'appels sont persistées avant émission, y compris pour les erreurs et les nouvelles tentatives. Une seule instance peut écrire le volume.

## PRIM et budget

Référentiel local `resources/catalog.json`, importé par `scripts/import-catalog.ts` depuis le fichier d’arrêts/lignes fourni, chargé une seule fois côté serveur. Recherche par nom, commune ou code, sans appel PRIM ; `/api/lines` limite les lignes à l’arrêt sélectionné. Le frontend reçoit seulement les suggestions, pas le fichier complet. Les sens sont découverts dans les prochains passages, jamais inventés depuis le référentiel ; les filtres de démonstration sont refusés en collecte réelle.

Adaptateur dédié : résolution des identifiants, collecte, normalisation des départs et perturbations, filtrage gare/ligne/sens. Vérifier sur une gare réelle les identifiants d'arrêt et la couverture avant de figer les endpoints.

Le cache conserve les départs disponibles jusqu'au maximum demandé par les deux vues ; chaque rendu applique ensuite sa limite. Ne pas garantir un nombre de départs supérieur à ce que PRIM fournit. Si obtenir plus de départs exige d'autres appels ou endpoints, intégrer ce coût au plan de collecte avant activation. Conserver le texte complet des perturbations et les champs disponibles (titre, période, lignes/arrêts concernés, recommandations et lien source le cas échéant), filtrer les incidents en cours et les dédupliquer. La vue riche restitue les détails, la vue épurée en dérive seulement l'icône. Un détail consulté dans la vue riche lit le cache ; il ne déclenche pas un appel PRIM individuel. Restituer tout contenu externe comme texte ou HTML assaini.

Dédupliquer les ressources partagées par plusieurs blocs. Une direction supplémentaire ne signifie donc pas nécessairement un appel supplémentaire. Éviter une collecte globale volumineuse par défaut. Mettre en cache les référentiels, dont les quotas peuvent différer des API temps réel.

Budget conservateur implémenté : deux quotas indépendants de 1 000 appels sur 24 heures glissantes, chacun limité à 900 appels automatiques : `stop-monitoring` (prochains passages, requête unitaire) et `general-message` (messages affichés sur les écrans). Compteurs persistants, estimations et validation sont séparés par API ; un quota épuisé ou une réponse HTTP 429 ne bloque pas l’autre API. Les appels d’autres applications avec le même compte PRIM ne sont pas connus localement. Jour fonctionnel et plages d'affichage en `Europe/Paris` ; ne pas inventer le fuseau de remise à zéro PRIM.

Estimation : somme, pour chaque ressource, du nombre de collectes sur les plages actives, plus perturbations, recherches et nouvelles tentatives prévues. Les compteurs réels priment toujours sur l'estimation. Délais réseau bornés, pas de collectes simultanées d'une même ressource, attente progressive après erreurs, respect des réponses de limitation. Tous les appels passent par le même garde de budget.

Exemple indicatif pour une configuration avec deux blocs : 17 h actives (5 h–22 h), deux ressources de départs toutes les trois minutes = 680 appels ; une requête de perturbations toutes les quinze minutes = 68 ; total 748. La configuration initiale ne contient aucun bloc, donc zéro appel jusqu'à ce que l'utilisateur en ajoute.

L'administration affiche le coût prévu et refuse une fréquence trop élevée, en proposant l'intervalle minimal compatible. `GET /api/discover` peut consommer du quota : comme les écritures, elle refuse les requêtes envoyées par un autre site (`Sec-Fetch-Site` ou `Origin` différents). Le rafraîchissement de la page ne déclenche aucun appel PRIM. Le seuil automatique et le plafond global empêchent la consommation incontrôlée ; aucune garantie de fraîcheur après épuisement du budget.

## Nuit et incidents

Plages hebdomadaires, dont plages traversant minuit ; réglage par défaut : service actif de 5 h à 22 h, pause de 22 h à 5 h, en `Europe/Paris`. Arrêt des collectes hors plage effective de chaque bloc ; aucun appel réseau PRIM pendant la pause commune, y compris depuis les consultations et prévisualisations. Si la pause commence pendant une collecte, les ressources restantes sont abandonnées et les données déjà reçues sont enregistrées. À la sortie de la plage d'écran, masquer les horaires devenus inutilisables, conserver les identités des blocs et programmer une unique navigation à la reprise, sans rechargements périodiques nocturnes et sans ajouter de texte de reprise sur l'affichage principal. Cela suppose un navigateur et un Wi-Fi actifs : le site seul ne garantit pas le réveil matériel de l’appareil cible.

Cache ancien conservé en cas de panne avec état de fraîcheur interne. Ne pas présenter un départ passé comme encore disponible. Distinguer fin de service planifiée, aucun départ annoncé, API indisponible, budget atteint et perturbations inconnues dans l'administration. Sur la vue principale, utiliser un indicateur minimal ou remplacer les horaires périmés par des tirets ; pas d'horodatage de dernière mise à jour ni de diagnostic en texte continu.

## Disposition des vues

La configuration initiale ne contient aucun bloc ; l'utilisateur les ajoute depuis `/admin`. En mode démonstration, deux blocs sont fournis : La Défense, ligne L vers Paris Saint-Lazare et ligne U vers La Verrière.

Chaque bloc répète sa gare, sa ligne, sa direction et ses horaires, sans titre mutualisé, pied de page de diagnostic ni texte décoratif. La vue épurée place les blocs sur une grille de 1 à 12 colonnes et lignes ; chaque bloc choisit sa largeur et peut être masqué de cette vue. Les cellules sont positionnées en absolu, sans dépendre de CSS Grid.

La vue épurée tient sur un seul écran, sans défilement ni pagination. L'administration prévisualise la disposition aux dimensions configurées, mesure le texte qui déborde dans l'aperçu et avertit sans bloquer l'enregistrement. Seul l'essai sur l'appareil cible garantit la capacité réelle.

Le seuil de trajet atténue les départs trop proches tout en gardant un contraste utilisable ; il est réglable par bloc avec héritage de la valeur commune. Les suppressions annoncées restent distinctes d'un départ simplement trop proche.

Les décisions produit encore ouvertes sont tenues à jour dans [PRODUCT.md](PRODUCT.md#open-decisions).

## Tests et vérification

`npm test` couvre l'héritage et les surcharges par bloc, le budget après redémarrage et erreurs, la déduplication des collectes, les plages traversant minuit et les changements d'heure, les données périmées, le filtrage des directions, l'analyse SIRI conforme aux contrats Swagger, les routes HTTP (statuts d'erreur, contrôle d'origine, vue épurée), la reprise après une configuration invalide, la purge du cache, MCP, les métriques et les fonctions de l'éditeur de blocs.

Restent manuels : l'essai réel avec une clé PRIM et l'essai sur l'écran cible (rendu, rafraîchissement, Wi-Fi, veille et reprise matinale).

## Sources techniques

- Node.js : https://nodejs.org/
- Express : https://expressjs.com/
- Quotas PRIM : https://prim.iledefrance-mobilites.fr/fr/notre-offre
- Intégration backend Vite : https://vite.dev/guide/backend-integration
- Oxfmt : https://oxc.rs/docs/guide/usage/formatter.html
