# Brief d'interface

## Usage

Mode Operate : consulter rapidement les départs utiles, sans interaction sur l’écran cible. Paramétrage sur ordinateur. Configuration initiale vide : l'utilisateur ajoute les blocs depuis /admin. En mode démonstration, deux blocs sont fournis : La Défense, L vers Paris Saint-Lazare et U vers La Verrière, trois départs chacun.

Deux vues de consultation, avec administration séparée. Composants React/TSX et modèle de données partagés entre les vues et leurs prévisualisations. HTML de la vue épurée rendu côté Node.js/Express ; vue riche et administration interactives React pour navigateur classique. Assets compilés avec Vite, sans imposer le runtime React au navigateur cible pour afficher les horaires.

TanStack Query gère les requêtes HTTP de la vue riche et les requêtes/mutations de l'administration vers le serveur Express, avec états de chargement/erreur et invalidation du cache navigateur après modification de la configuration. Les données PRIM restent collectées et mises en cache côté serveur.

## Vue riche `/`

Consultation sur navigateur classique, mise en page adaptée à l'espace disponible, défilement autorisé. Même configuration des tuples et même cache que la vue épurée. Afficher davantage de départs, avec un nombre réglable distinct des trois départs de la vue épurée. Conserver la priorité à gare, ligne, direction et horaires.

Un encart « Infos trafic » apparaît à côté des départs sur grand écran et avant les tableaux sur écran étroit, pour rester immédiatement repérable. L’encart conserve une hauteur compacte : une information à la fois dans un carrousel horizontal à défilement magnétisé, avec flèches et compteur si plusieurs messages sont présents. Aucun défilement automatique. Les textes longs se lisent par défilement vertical à l’intérieur du message. Afficher les informations complètes disponibles sur les incidents en cours qui concernent les lignes/arrêts suivis : titre et texte intégral, périmètre et période d'application, recommandations et lien source lorsque PRIM les fournit. Dédupliquer les incidents partagés entre plusieurs blocs et indiquer les blocs concernés. Ne pas inventer les champs manquants. Les diagnostics techniques et l'édition des réglages restent dans l'administration.

## Vue épurée `/minimal`

Sur l'écran cible en paysage : deux blocs pleine largeur empilés par défaut. Chaque tuple est autonome et porte ses quatre informations : gare, ligne, direction, horaires. La gare est répétée dans chaque bloc, même si les blocs partagent La Défense. Trois départs par bloc. Les départs trop proches pour être attrapés (sous le seuil de trajet du bloc) sont masqués : seuls les départs atteignables sont affichés, et un petit triangle gris muet devant le premier horaire signale qu'il y en a de masqués.

Aucun titre commun, date de dernière mise à jour, pied de page ni texte inutile. Icône de perturbation près de la ligne lorsque nécessaire. Pas de navigation d'administration occupant l'espace principal, pas de défilement ni d'animation. Texte et formes restent compréhensibles en monochrome. L'administration permet de modifier l'ordre et la largeur des blocs dans une grille, dont une disposition en colonnes si souhaitée.

Exigence absolue : tous les blocs de l'écran et leurs trois départs doivent être lisibles simultanément, sans défilement vertical ou horizontal ni interaction. Aucune pagination, carrousel ou consultation de détail obligatoire. Ne pas couper les blocs hors écran pour simuler le respect de cette contrainte. L'administration prévisualise la capacité et empêche une disposition qui ne tient pas lisiblement dans les dimensions utiles du profil de l’écran cible.

## États de la vue épurée

- Fonctionnement normal : trois départs par bloc lorsque disponibles.
- Trop proche : masqué dans la vue épurée, signalé par un triangle gris sans texte ; atténuation lisible dans la vue détaillée, sans changer l'ordre.
- Perturbation connue : icône près de la ligne ; pas de message long en V1.
- État trafic inconnu : signe distinct d'un état normal.
- Train supprimé annoncé par la source : mention explicite, jamais seulement grisée.
- Données anciennes : horaires remplacés par des tirets ou indicateur minimal ; aucun compte à rebours laissant croire que les données sont fraîches. Diagnostic et horodatages uniquement dans l'administration.
- Aucun départ annoncé : tirets dans les emplacements horaires, sans en déduire une fin de service.
- Hors plage : identités des blocs conservées, horaires masqués ; pas de message d'heure de reprise. Pause commune par défaut de 22 h à 5 h, heure de Paris.

## Administration `/admin`

Formulaire simple : blocs ordonnables et placement modifiable ; recherche de gare, ligne et direction. Chaque bloc possède des réglages indépendants (seuil de trajet, nombre de départs, plages actives et collecte), hérités par défaut des réglages globaux. Afficher la valeur effective et si elle est héritée ou personnalisée ; permettre de rétablir l'héritage. Modifier un défaut met à jour tous ses héritiers, sans écraser les personnalisations. Pause par défaut 22 h–5 h tous les jours. Rafraîchissement complet de la page global, distinct de la collecte par bloc. Afficher l'estimation d'appels et l'intervalle minimal compatible avec le budget.

Prévisualisation distincte des deux vues, avec le même rendu que sur l’écran cible pour le profil épuré et validation de sa capacité d'affichage. Statut : connexion PRIM, dernière collecte, appels consommés et prochaine collecte/reprise. Sauvegarder une configuration valide atomiquement, sans message de confirmation ni statut permanent de sauvegarde, avec erreurs près des champs.

Les réglages communs sont regroupés par effet : horaires et trajet, récupération des données, puis horaires de fonctionnement. Chaque champ expose son unité, son effet et une aide associée au contrôle. Distinguer les libellés affichés des identifiants qui filtrent réellement PRIM ; conserver la saisie technique dans un volet séparé des personnalisations. « Utiliser le réglage commun » supprime une exception. La sauvegarde suit le formulaire et ne masque aucun champ.

Autocomplétion dans les choix de gare, de ligne et de sens, ainsi que dans les champs techniques. Les noms, communes, modes et codes distinguent les suggestions. Gare et ligne se résolvent localement ; les sens viennent de PRIM ou de la démonstration. Un seul lien vers la vue épurée reste dans la navigation, sans bouton redondant dans l’introduction de l’admin.

## Vérification matérielle

Mesurer la zone réellement disponible en paysage, y compris les éventuelles barres du navigateur. Confirmer la lisibilité des trois départs, des noms de direction et du repère de départs masqués ; tester rafraîchissement et reprise après une nuit. L'alimentation permanente ne prouve pas que la veille ou la coupure Wi-Fi sont désactivées.

## Décisions restantes

Voir la liste unique tenue dans [PRODUCT.md](PRODUCT.md#open-decisions).
