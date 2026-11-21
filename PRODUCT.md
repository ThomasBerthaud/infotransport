# InfoTransport

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Node.js avec Express et utilitaires de collecte/cache PRIM. Docker Compose pour déploiement sur un serveur domestique, par exemple via Portainer. Configuration et cache dans un volume Docker, sous forme de fichiers ; aucune base de données.

Tout le code source applicatif est en TypeScript : serveur, intégration PRIM, cache, ordonnanceur, types partagés, frontend et tests. Composants React en TSX, configuration des outils en TypeScript lorsque prise en charge ; fichiers de données et de déploiement dans leurs formats natifs (JSON, YAML, Dockerfile).

TypeScript et composants React pour les deux vues de consultation et l'administration. Vite pour le build des assets. Oxlint pour le lint et Oxfmt (nom du paquet du formateur Oxc demandé comme « oxformat ») pour le formatage. L'affichage épuré conserve un HTML initial rendu côté serveur afin de ne pas dépendre de la compatibilité du navigateur avec React côté client.

TanStack Query (`@tanstack/react-query`) pour gérer les appels HTTP côté frontend interactif : requêtes vers le serveur Express, cache navigateur, états de chargement/erreur et mutations. Les appels PRIM et le cache persistant restent exclusivement côté serveur. La clé est fournie uniquement via `PRIM_API_KEY` dans l’environnement Docker ; son absence active automatiquement des données fictives, sans requête PRIM.

## Users

Usage personnel : consulter les prochains départs depuis un écran de consultation et configurer les informations depuis un ordinateur.

## Product Purpose

Afficher les temps d'attente et signaler les perturbations des transports sélectionnés, sur un écran unique et facilement lisible.

## Operating Context

- Site accessible sur le réseau local, sans exposition publique ni authentification applicative.
- Vue épurée utilisable sur tout écran cible, notamment un petit écran à encre électronique. Premier contexte de validation prévu : paysage et alimentation permanente. Comportement du navigateur, du Wi-Fi et de la veille à vérifier sur l'appareil.
- Administration sur ordinateur ; hébergement sur un serveur du réseau local.
- Source des données : PRIM, Île-de-France Mobilités.

## Capabilities and Constraints

- Deux vues de consultation : une version riche pour navigateur classique et une version épurée pour écran à affichage épuré. L'administration demeure une interface séparée de paramétrage.
- Chaque tuple (gare, ligne, direction) constitue un bloc autonome, configuré depuis l'administration.
- Disposition modifiable dans l'administration : blocs pleine largeur, empilés verticalement par défaut ; ordre et occupation de la grille modifiables.
- Réglages indépendants par bloc, hérités de valeurs par défaut globales sauf surcharge explicite. Modifier une valeur par défaut affecte les blocs qui en héritent ; une action permet de rétablir l'héritage.
- Seuil de trajet configurable en minutes : dans la vue détaillée, conserver les trains trop proches en les atténuant ; dans la vue épurée, les masquer pour n'afficher que les trains atteignables.
- Sur la vue épurée, signaler les perturbations par une icône. Sur la vue normale, afficher les informations complètes disponibles sur les incidents en cours pertinents pour les blocs suivis.
- Rafraîchissement automatique de la page configurable.
- Pause de rafraîchissement et des appels PRIM de 22 h à 5 h, heure de Paris, tous les jours par défaut. Plages modifiables dans l'administration. Mécanisme de reprise à tester sur l’écran cible.
- Configuration initiale vide : l'utilisateur ajoute les blocs depuis `/admin`. En mode démonstration, deux blocs sont fournis par défaut : La Défense, ligne L vers Paris Saint-Lazare et ligne U vers La Verrière.
- Afficher trois prochains départs par bloc sur la vue épurée ; davantage de départs sur la vue normale, avec un nombre réglable distinct.
- Permettre à terme trois blocs gare + ligne + direction ou davantage ; capacité maximale à déterminer sur le matériel avant de garantir leur affichage simultané.
- Budget déclaré par l'utilisateur : 1 000 appels PRIM par jour pour chacune des deux API utilisées (passages unitaires et messages des écrans), avec des quotas indépendants. La stratégie doit compter les appels et tenir compte du nombre de ressources suivies.
- Version épurée : grille configurable en lignes et colonnes, avec largeur de chaque bloc en colonnes. Si les blocs ne tiennent pas lisiblement, avertir dans l’administration sans bloquer la sauvegarde. Laisser le contenu déborder des cellules et de l’écran, sans défilement horizontal ou vertical ; la partie hors écran reste inaccessible. Ne pas réduire automatiquement les polices ni ajouter de pagination ou de carrousel.
- Vue épurée minimale : gare, ligne, direction, horaires, et icône de perturbation si nécessaire. Pas de titre de gare mutualisé entre blocs, de date de dernière mise à jour ni de texte superflu.
- Vue riche : interface de consultation pour navigateur classique, avec davantage d'horaires et les informations complètes disponibles sur les incidents en cours. Elle partage les données, les réglages des tuples et le budget PRIM avec la version épurée. Le défilement est permis sur cette vue pour consulter les détails.
- Profils de stations : les blocs sont regroupés en profils (1 à 8, par exemple « Maison » et « Travail »), chacun avec sa grille épurée. Un profil est désigné par défaut et s’affiche toujours sur la vue épurée. Un profil peut être associé à une position et un rayon : sur la vue détaillée, l’appareil affiche le profil le plus proche dans son rayon, sinon le profil par défaut ; un choix manuel prime jusqu’au retour à « Automatique ». Le choix automatique demande HTTPS ; sans HTTPS, sur refus ou sans position, le profil par défaut s’affiche sans blocage. La position de l’appareil reste dans le navigateur, sans appel PRIM ni fournisseur géographique supplémentaire. Les blocs de tous les profils sont collectés et comptés dans le budget.
- Vue riche installable (PWA) sur téléphone et ordinateur, utilisable sans serveur : derniers départs temps réel reçus, marqués « Mémorisé » et ignorés 2 h après leur réception, puis horaires théoriques importés à la main depuis le GTFS IDFM, marqués « Théorique ». Une donnée mémorisée ou théorique n'est jamais présentée comme du temps réel. La vue épurée et l'administration restent en ligne uniquement.
- Décisions ouvertes : capacité maximale de l'écran, valeurs initiales des seuils de trajet et compatibilité réelle du navigateur cible.

## Product Principles

- La lisibilité sur l’écran cible prime sur la quantité d'informations.
- La configuration quotidienne se fait sur ordinateur.
- Le budget API est une contrainte de conception.
- Garder les diagnostics détaillés dans l'administration ; ne pas présenter de données périmées comme des départs fiables.

## Brand Commitments

Interface épurée, en français. Sur l’écran cible, limiter le contenu aux informations nécessaires pour choisir un départ ; les détails de configuration et de fonctionnement appartiennent à l'administration.

## Accessibility & Inclusion

Lecture rapide sur tout écran cible, avec prise en charge des petits écrans à encre électronique. Dans la vue détaillée, les départs trop proches restent lisibles malgré leur atténuation ; dans la vue épurée, ils sont masqués et un repère gris sans texte le signale. Les informations essentielles et les perturbations doivent être compréhensibles sans couleur. Toute disposition configurable doit préserver la lisibilité et tenir dans la zone réellement disponible du navigateur cible.

## Open Decisions

- Valeur initiale du seuil de trajet par défaut, avec possibilité de surcharge par tuple.
- Présentation des horaires : minutes restantes, heures de départ ou les deux.
- Nombre de départs de la vue détaillée (8 par défaut), réglable indépendamment de la vue épurée.
- Capacité maximale de blocs sans défilement, à mesurer sur l’écran cible.
- Compatibilité matérielle : rendu, rafraîchissement, maintien du Wi-Fi et reprise à 5 h.
- Identifiants PRIM réels et couverture des deux tuples initiaux, à vérifier avant de considérer l'intégration validée.
- Profils : rayons proposés (300 m à 5 km, 1 km par défaut) et seuil de précision de la position (2 km) à confirmer à l’usage ; pas de plages d’activité propres aux profils pour l’instant.
- Mode hors ligne : durée de validité des horaires mémorisés (2 h par défaut) et fenêtre d'horaires théoriques conservée par le navigateur (48 h par défaut) ; couverture réelle du GTFS IDFM pour les blocs suivis, à vérifier sur un import complet.

## Evidence on Hand

- Application implémentée avec tests automatisés, mode démonstration sans clé et vérifications sur navigateur ; matériel cible et compte PRIM réel restant à tester.
- Documentation des quotas : https://prim.iledefrance-mobilites.fr/fr/notre-offre
