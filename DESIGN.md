---
name: InfoTransport
description: Tableau de départs de proximité, lisible et configurable.
colors:
  ink: '#202a2b'
  paper: '#f6f5f1'
  surface: '#fbfaf7'
  field: '#fffefa'
  muted: '#626d6a'
  line: '#d9ded7'
  accent: '#b94c23'
  green: '#32674f'
  button-green: '#284c39'
  button-hover: '#1a3728'
  secondary-hover: '#e6e9e0'
  line-fallback: '#595b64'
  signal: '#a14d24'
  too-close: '#626e65'
  cancelled: '#aa2929'
  paused: '#8a7665'
  error-ink: '#943f36'
  error-border: '#ae5148'
  danger: '#9f4b3e'
  action-ink: '#385e43'
  add-ink: '#3f6247'
  tag-ink: '#42624b'
  demo-ink: '#4a583f'
  placeholder: '#737d70'
  control-ink: '#26392e'
  control-border: '#bbc8bb'
  field-ink: '#24352a'
  field-border: '#cbd2c7'
  field-label: '#465448'
  selection-paper: '#e9c7a9'
  selection-ink: '#182925'
  budget-passages-ink: '#3f3974'
  budget-passages-track: '#dcd7ed'
  budget-passages-muted: '#615b7a'
  budget-messages-ink: '#275e70'
  budget-messages-track: '#c6dce2'
  budget-messages-muted: '#446570'
  budget-warning: '#8b4c13'
  budget-critical: '#a13f31'
  layout-warning-paper: '#f8f0e3'
  layout-warning-border: '#dfc9a9'
  layout-warning-ink: '#674b2c'
  minimal-paper: '#fff'
  minimal-ink: '#000'
  minimal-rule: '#111'
  minimal-muted: '#737373'
typography:
  headline:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: 'clamp(27px, 3vw, 39px)'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: '-0.03em'
  headline-compact:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '28px'
    fontWeight: 700
    letterSpacing: '-0.8px'
  wordmark:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '19px'
    fontWeight: 800
    letterSpacing: '-0.5px'
  clock:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '24px'
    fontFeature: 'tnum'
  settings-heading:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '19px'
  title:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '20px'
    fontWeight: 750
    letterSpacing: '-0.5px'
  section:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '16px'
    fontWeight: 700
    letterSpacing: '-0.3px'
  empty-title:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '15px'
    lineHeight: 1.5
  line-letter:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '17px'
    fontWeight: 750
    lineHeight: 1
  body:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '12px'
  label:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '11px'
  wait:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '22px'
    fontWeight: 700
  wait-compact:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '19px'
    fontWeight: 700
  interface-base:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '14px'
  navigation:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '13px'
  group-title:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '14px'
    fontWeight: 700
  budget:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '38px'
    fontWeight: 650
    lineHeight: 1.2
  budget-limit:
    fontFamily: 'Manrope Variable, sans-serif'
    fontSize: '18px'
    fontWeight: 400
  minimal-body:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '16px'
  minimal-station:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '1.45em'
    fontWeight: 700
  minimal-wait:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '2.7em'
    fontWeight: 700
    lineHeight: 1.15
rounded:
  detail: '3px'
  small: '4px'
  control: '5px'
  panel: '8px'
spacing:
  compact: '8px'
  related: '12px'
  field: '20px'
  panel: '24px'
  column: '40px'
components:
  button-primary:
    backgroundColor: '{colors.button-green}'
    textColor: '#fff'
    rounded: '{rounded.control}'
    padding: '11px 16px'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.control-ink}'
    rounded: '{rounded.control}'
    padding: '11px 16px'
  button-primary-hover:
    backgroundColor: '{colors.button-hover}'
  button-secondary-hover:
    backgroundColor: '{colors.secondary-hover}'
  field:
    backgroundColor: '{colors.field}'
    textColor: '{colors.field-ink}'
    rounded: '{rounded.small}'
    padding: '11px 12px'
  editor-card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.panel}'
    padding: '24px'
  navigation:
    textColor: '{colors.muted}'
  line-badge:
    backgroundColor: '{colors.line-fallback}'
    textColor: '#fff'
    typography: '{typography.line-letter}'
    rounded: '{rounded.control}'
    padding: '0 7px'
    height: '30px'
  button-text:
    textColor: '{colors.action-ink}'
    typography: '{typography.label}'
    padding: '10px 8px'
  error-box:
    textColor: '{colors.error-ink}'
    padding: '24px'
  api-budget:
    textColor: '{colors.budget-passages-ink}'
    typography: '{typography.budget}'
  api-budget-messages:
    textColor: '{colors.budget-messages-ink}'
    typography: '{typography.budget}'
  budget-meter:
    backgroundColor: '{colors.budget-passages-track}'
    rounded: '0px'
    height: '6px'
    width: '100%'
  minimal-departure:
    backgroundColor: '{colors.minimal-paper}'
    textColor: '{colors.minimal-ink}'
    typography: '{typography.minimal-body}'
    padding: '9px 0'
---

# Design System: InfoTransport

## Overview

**Creative North Star: "Tableau de départs de proximité"**

InfoTransport emprunte au carnet d’exploitation : papier clair, encre sombre, filets horizontaux et chiffres précis. La vue riche et l’administration partagent des surfaces calmes ; les couleurs de ligne et de signalement servent la lecture.

La vue épurée est un support distinct, monochrome et passif. Sa police système fixe préserve la compatibilité des navigateurs anciens ; la lisibilité prime sur la quantité. Les dimensions réelles de l’écran restent à confirmer sur le matériel cible.

**Key Characteristics:**

- Papier clair et encre vert sombre pour les interfaces interactives.
- Blocs autonomes avec ligne, gare, direction et horaires.
- Filets et espacements pour structurer ; ombre réservée aux suggestions flottantes.
- Vue épurée indépendante, monochrome et sans interaction.

## Colors

Le papier chaud et l’encre sombre accueillent un accent rouille et des verts fonctionnels. Les tokens du frontmatter sont normatifs.

### Primary

- **Vert de service** (`green`) : témoin de suivi et indication de trafic disponible ; le vert bouton porte les actions principales.
- **Rouille de repérage** (`accent`) : ponctuation du titre, focus clavier, survol des liens et curseur de saisie.

### Secondary

- **Couleurs officielles des lignes** : chaque badge reprend la couleur et la couleur de texte publiées par IDFM pour la ligne (`resources/line-colors.json`, transmises par `lineAppearance`). Sans couleur connue, le badge prend l’**ardoise de repli** (`line-fallback`) et une lettre blanche.
- **Rouille de signalement** (`signal`, variable CSS `--signal`) : triangle de perturbation sur les blocs et dans l’encart « Infos trafic », et retard annoncé (« +2 min »). Plus sombre que la rouille de repérage, elle signale un état plutôt qu’une interaction.
- **Rouge de suppression** (`cancelled`) : mention explicite « Supprimé ».
- **Rouge d’erreur** (`error-ink`, `error-border`) : texte et contour des encarts d’erreur riches ; **rouge d’action destructive** (`danger`) pour les commandes de suppression de l’administration.
- **Ambre de débordement** (`layout-warning-paper`, `layout-warning-border`, `layout-warning-ink`) : fond, contour et texte de l’avertissement de disposition dans l’administration ; son titre reprend l’ambre du budget.

### Neutral

- **Papier** (`paper`), **surface** (`surface`) et **fond de champ** (`field`) : page, blocs et saisie.
- **Encre** (`ink`), **texte secondaire** (`muted`) et **filet** (`line`) : hiérarchie et séparation.
- **Sélection de texte** (`selection-paper`, `selection-ink`) : fond rouille pâle et encre sombre, distincts du focus clavier.
- **Contrôles et budget** (`control-*`, `field-*`, `budget-*`) : bordures de saisie, texte fonctionnel et piste de jauge ; ces nuances prolongent les neutres existants.
- **Départ proche** (`too-close`) : atténuation des horaires et indications associées dans la vue riche.
- **Encres vertes fonctionnelles** (`action-ink`, `add-ink`, `tag-ink`, `demo-ink`) : actions textuelles, bouton pointillé d’ajout de bloc, étiquette « Local » et bandeau de démonstration. Elles prolongent le vert de service à des contrastes adaptés à leur fond.
- **Texte indicatif** (`placeholder`) : contenu d’exemple des champs, distinct du texte saisi.
- **Pause** (`paused`) : témoin de suivi brun-gris hors des plages actives, accompagné de son libellé.
- **Blanc, noir et gris épurés** (`minimal-*`) : système monochrome indépendant ; le gris signale les départs masqués et le trafic inconnu.

**The Information Color Rule.** La couleur accompagne une identité ou un état ; les libellés et les formes portent aussi l’information.

## Typography

**Display Font:** Manrope Variable, sans-serif, auto-hébergée par les assets Vite.
**Body Font:** même famille dans les interfaces riches ; Arial, Helvetica, sans-serif dans la vue épurée.

**Character:** des chiffres nettement hiérarchisés dans une interface compacte. Les horaires, le compte à rebours, l’horloge et le budget emploient des chiffres tabulaires dans la vue riche.

### Hierarchy

- **Headline** : titre principal fluide, avec approche relative de −0.03em et composition équilibrée (`text-wrap: balance`) ; sur écran de 800px ou moins, il passe au **headline-compact**.
- **Wordmark** : nom « InfoTransport » de l’en-tête, la graisse la plus forte du système.
- **Clock** : horloge de l’introduction, à chiffres tabulaires.
- **Title** : gare ; descend à 18px sur petit écran.
- **Section** : titres latéraux, rubriques et éditeurs ; les titres de sections de réglages utilisent **settings-heading**.
- **Empty title** : titre d’un état vide, comme « Aucune perturbation signalée ».
- **Body** : lignes de tableau et texte d’incident ; les paragraphes du carrousel d’incident utilisent une hauteur de ligne de 1.8 et une largeur maximale de 70ch. Les descriptions d’administration utilisent 1.8 et une largeur maximale de 65ch, après application de la dernière règle de la feuille de style.
- **Label** : aides contextuelles et métadonnées à 11px ; les libellés des champs utilisent le corps de 12px / 1.5 ; les aides des champs, groupes de réglages et exceptions utilisent une hauteur de ligne de 1.7 ; les métadonnées secondaires et détails de suggestions utilisent également 11px dans les interfaces riches.
- **Wait** : attente riche ; passe au **wait-compact** sur petit écran. L’heure de départ est de 16px puis 14px.
- **Budget** : consommation à 38px / 1.2, graisse 650 et chiffres tabulaires ; plafond à 18px, graisse 400. Le titre de chaque API reste à 13px / 1.6.
- **Minimal** : station à 1.45em, direction à 1.2em / 1.3, attente à 2.7em / 1.15, heure à 1.15em ; unité minute à 0.34em de l’attente.

**The Fixed Minimal Type Rule.** La vue épurée conserve sa base Arial de 16px ; augmenter la hauteur du profil ne grossit pas la police.

## Layout

Les interfaces riches ont un conteneur maximal de 1560px, des marges latérales de 4.5% et un retrait supérieur de 50px. Départs et incidents occupent deux colonnes, dont 300px pour les incidents, séparées de 40px ; l’administration réserve 280px au diagnostic. À 1100px ou moins, les colonnes latérales passent à 250px et 230px avec un écart de 24px. L’encart « Infos trafic » reprend la surface claire et le filet supérieur des départs, avec 20px de retrait à toutes les largeurs. Il affiche un incident à la fois dans un carrousel horizontal ; le détail dispose de sa propre zone de lecture verticale de 150px, et la source reste sous le carrousel. À 800px ou moins, il passe avant les tableaux avec 20px de retrait ; tout passe sur une colonne, la navigation prend une ligne entière et les marges deviennent 5%. À partir de 1700px, le conteneur supprime ses retraits latéraux. Les détails riches peuvent défiler et le tableau possède son propre débordement horizontal. Sur mobile, le tableau conserve un corps de 12px et des états de 11px ; l’introduction empile titre et suivi, puis place l’horloge à droite sur une ligne de suivi pleine largeur. L’en-tête a 17px de retrait vertical sur ordinateur ; sur mobile, il a 20px en haut et 8px en bas.

L’administration utilise des champs en deux colonnes ; à petite largeur la recherche revient à la ligne. Les groupes de réglages passent à une colonne à 500px ou moins ; les choix de gare, ligne et direction occupent alors toute la largeur de leur grille. Les trois groupes — horaires affichés et trajet, récupération des données, horaires de fonctionnement — sont séparés par un filet, un retrait supérieur de 26px et une marge de 30px ; leurs titres font 14px, graisse 700. Les exceptions par bloc placent le libellé et son aide sur toute la largeur, puis la valeur, son unité et l’action de retour au défaut sur une grille. La barre de sauvegarde suit le formulaire dans le flux normal, sans recouvrir les champs. À 500px ou moins, les actions de chaque éditeur occupent une ligne propre alignée à droite ; le bouton de sauvegarde prend toute la largeur avec une hauteur minimale de 44px. Les cartes ont généralement 24px de retrait, ramené à 18px sur petit écran.

La vue épurée emploie un placement absolu en pourcentages, calculé sur une grille configurable en lignes et colonnes. Chaque bloc choisit son nombre de colonnes ; les lignes configurées partagent la hauteur. Les cellules ont 10px de retrait vertical et 18px horizontal. Aucun redimensionnement typographique ne dépend du profil. L’avertissement non bloquant de l’administration mesure les textes et les icônes réellement rendus dans l’aperçu, aux dimensions configurées, pour détecter leur débordement hors des blocs. La mesure reste active dans les autres onglets de réglages ; les erreurs de nombre de lignes ou de colonnes sont également signalées. Les estimations de capacité partagées restent disponibles sans navigateur. La grille conserve les dimensions configurées, indépendamment du contenu. Le contenu déborde librement des cellules ; le document interdit le défilement et coupe uniquement ce qui dépasse de l’écran. La sauvegarde reste autorisée.

## Elevation & Depth

Les surfaces de page restent sans ombre. Le contraste entre papier, surfaces de blocs et fonds de champs, les séparateurs fins et le filet supérieur sombre de chaque bloc riche créent la profondeur. La barre de sauvegarde est séparée du formulaire par un filet et conserve le fond papier, sans superposition.

**The Flat Paper Rule.** Les surfaces de page sont séparées par des filets et des variations de fond ; l’ombre est réservée au menu flottant de suggestions.

### Shadow Vocabulary

- **Suggestions flottantes** (`box-shadow: 0 8px 20px rgb(32 42 43 / 10%)`) : sépare la liste superposée des champs sous-jacents, sans étendre cet effet aux cartes ou panneaux.

## Shapes

Le tableau de départs riche conserve des angles droits. Les panneaux d’édition ont des angles adoucis ; champs et petits contrôles emploient le petit rayon, boutons et badges de ligne le rayon de contrôle. Les voies ont un rayon local de 3px. Le témoin de suivi est un cercle de 7px. Les badges épurés sont rectangulaires, avec un contour de 2px ; les blocs épurés se terminent par un filet de 1px.

## Components

### Buttons

Actions sobres et compactes. Le bouton principal est vert sombre avec texte blanc ; son survol assombrit le fond. Le secondaire est transparent, bordé, et prend un fond vert très pâle au survol. Tous deux utilisent une taille de 12px et une graisse de 650. Les boutons désactivés ont une opacité de 0.45. Les boutons d’icône font 40px de côté ; les actions textuelles ont une hauteur minimale de 40px et se soulignent au survol ; l’ajout de bloc utilise une bordure pointillée.

### Cards / Containers

Les blocs de départs ont un filet supérieur sombre de 2px, un en-tête espacé et des lignes de tableau séparées. Les cartes d’édition et panneaux de réglages ont une bordure fine. Les incidents sont des diapositives sans bordure intérieure, réunies dans un encart clair à filet supérieur sombre, sans carte flottante.

### Inputs / Fields

Fond de champ clair, bordure gris-vert et hauteur minimale de 40px. Les libellés sont au-dessus ; aide et erreur restent près du champ. Chaque aide explique l’effet du réglage et est associée au contrôle par `aria-describedby`. Les noms affichés sont distingués des filtres PRIM. Les identifiants techniques et les exceptions de bloc sont dans des sections repliables distinctes ; l’action « Utiliser le réglage commun » explicite le retour à l’héritage. Les indications de dimensions décrivent la zone utile du navigateur ; les aides distinguent le rafraîchissement de page de l’intervalle entre appels PRIM. Le focus partagé est une bordure externe rouille de 3px, décalée de 4px. Les cases à cocher utilisent un accent vert.

### Autocomplete

Les choix de gare, ligne et direction et les références PRIM manuelles (MonitoringRef, LineRef, DirectionRef, DestinationRef) partagent une saisie modifiable avec suggestions. Le champ conserve les couleurs, dimensions et focus existants. La liste apparaît 4px sous le champ, occupe sa largeur et se superpose avec une profondeur de 5 ; son fond de champ, sa bordure gris-vert et son rayon de contrôle restent ceux de la palette existante. Sa hauteur maximale est de 280px, avec défilement vertical. Chaque option a 10px de retrait vertical et 12px horizontal, un rayon local de 3px, un libellé de 12px à graisse 650 et un détail de 11px / 1.6. L’option active reprend le fond vert pâle de sélection. Les libellés longs reviennent à la ligne. L’ombre fonctionnelle est définie dans Elevation & Depth.

Le champ expose les rôles combobox, listbox et option, l’ouverture et la suggestion active. Les flèches haut/bas parcourent les suggestions, Entrée choisit et Échap ferme ; la perte de focus ferme aussi la liste. La suggestion active revient dans la zone visible. La liste présente au plus 20 résultats avec états de chargement et d’absence de suggestion. La saisie reste possible pour renseigner une référence manuellement. Ces contrôles appartiennent à l’administration ; ils n’ajoutent aucune interaction à la vue épurée.

### Navigation

Liens de 13px avec hauteur minimale de 44px et texte secondaire au repos, encre et graisse 800 pour la page courante, rouille au survol. Les onglets d’administration portent un filet inférieur de 2px pour la sélection et une hauteur minimale de 44px. Leur navigation clavier utilise les flèches gauche/droite, Home et End, avec un seul onglet dans l’ordre de tabulation et un panneau associé. Le focus reste visible au clavier. L’accès à la vue épurée reste dans la navigation partagée ; le haut de l’administration ne répète pas cette action.

### Line badges

Lettre dans un rectangle compact aux couleurs officielles de la ligne, hauteur de 30px et lettre **line-letter** ; variante de 23px dans les incidents. La couleur du texte suit celle publiée par IDFM, par exemple une lettre noire sur le mauve clair de la ligne L. La vue épurée remplace le fond coloré par un contour monochrome et garde la lettre.

### Traffic carousel

L’encart « Infos trafic » montre une seule information par position de défilement horizontal. Le défilement natif utilise un ancrage obligatoire sur chaque diapositive et ne change jamais automatiquement de message. L’indicateur SVG et les badges de lignes partagent leur rangée avec l’échéance, alignée à droite en 11px, graisse 650 et chiffres tabulaires : « Jusqu’à 23:00 », « Jusqu’à demain 02:13 », « Jusqu’au ven. 27 nov., 03:00 », « Jusqu’à nouvel ordre » ou « En cours ». Elle reste visible sans défilement et revient à la ligne si la colonne est étroite. Le titre omet le préfixe de ligne déjà porté par le badge et sépare les gares par un tiret demi-cadratin. Une zone de détail haute de 150px, défilable verticalement, contient le titre complet, le texte et le lien source. L’en-tête compte les perturbations « en cours ». Le titre fait 14px avec une hauteur de ligne de 1.5 ; le texte conserve le corps de 12px, avec une hauteur de ligne de 1.8. Les libellés longs reviennent à la ligne.

Avec plusieurs messages, deux boutons carrés de 44px, de petit rayon, bordés et transparents permettent de reculer ou avancer. Ils reprennent le survol vert pâle et l’opacité de désactivation existants ; les chevrons sont en SVG. Un compteur de 11px à chiffres tabulaires annonce la position courante. Ces commandes disparaissent pour un seul message. Les diapositives non affichées sont inertes pour ne pas exposer leurs liens au parcours clavier. La région et ses détails sont nommés et accessibles au clavier : flèches gauche/droite pour changer de message, défilement vertical pour lire le détail. Les focus de ces régions sont décalés vers l’intérieur de 3px. La source demeure hors de la zone défilante.

La navigation commandée défile en douceur, sans durée personnalisée ; elle devient instantanée avec réduction de mouvement. Un changement de largeur recale immédiatement la diapositive sélectionnée. Cette interaction appartient uniquement à la vue riche.

### Icons and feedback

Les interfaces riches partagent des icônes SVG pour les liens externes, le déplacement des blocs et les commandes du carrousel. Leur trait de 1.8, leurs terminaisons et jointures arrondies et leur couleur héritée restent cohérents ; leur taille par défaut est de 18px. Les commandes gardent un nom accessible distinct de l’icône décorative. La vue épurée conserve son rendu indépendant.

Les sections techniques et exceptions repliables offrent 12px de retrait vertical sur leur résumé ; les aides facultatives plus compactes utilisent 8px. Les erreurs riches associent un titre de 14px, une explication de 12px / 1.7 et une action de nouvelle tentative de style secondaire ; les longs messages reviennent à la ligne. En cas d’échec de rafraîchissement, l’alerte précède le tableau conservé à l’écran plutôt que de remplacer les informations déjà reçues.

### Budget PRIM

Chaque API dispose de son groupe sur le fond neutre de la page, sans aplat coloré : lavande pour les chiffres et repères des prochains passages, bleu pétrole pour ceux des messages info trafic. Le titre, la consommation et le filet supérieur de 2px reprennent l’encre de la catégorie ; les libellés secondaires restent teintés dans la même famille. Les groupes ont 20px de marge supérieure, 18px de retrait en haut et 4px en bas, sans retrait latéral ni angles arrondis. Les budgets conservent l’aspect épuré du site ; la couleur se limite aux textes, filets et jauges. Aucun effet d’ombre n’est ajouté.

La consommation et son plafond précèdent une jauge native `meter` de 6px de haut, sans rayon ni bordure. Le pourcentage utilisé et le nombre d’appels restants sont indiqués en texte, puis un filet sépare l’estimation et la limite automatique. La jauge et son libellé passent à l’ambre à partir de 80 % (« Consommation élevée »), puis au rouge à partir de 90 % (« Quota presque atteint ») et jusqu’à épuisement (« Quota atteint »). Les couleurs de catégorie restent sur les titres et les compteurs ; la couleur d’alerte désigne la consommation. Les indications peuvent revenir à la ligne sur petit écran.

La jauge dispose d’un nom accessible ; les nombres et libellés rendent la consommation compréhensible sans couleur. Un compteur indisponible affiche un tiret et « Consommation inconnue ». Le suivi local sur 24 heures glissantes est annoncé avant les compteurs. L’explication de l’estimation reste repliable ; les appels effectués ailleurs avec le même compte ne sont pas présentés comme connus. Cette présentation appartient à l’administration.

### Clarté des réglages

Les aides restent courtes, près des champs ; les détails du budget et des avertissements sont repliables. L’affichage distingue disposition, dimensions de l’écran et actualisation des deux vues. La barre de sauvegarde affiche uniquement le bouton, son état en cours et les erreurs éventuelles : aucun texte de confirmation, de configuration à jour ou de modifications en attente. Le bouton désactivé indique qu’il n’y a rien à enregistrer. Un avertissement de débordement garde un titre, une conséquence et ses détails facultatifs ; il ne bloque pas l’enregistrement et utilise un flux de texte vertical indépendant de l’alignement du bouton.

L’avertissement de débordement de l’administration utilise un fond ambre pâle, une bordure de 1px et un rayon de 8px, avec 16px de retrait. Un pictogramme SVG de cadre débordé précède le texte avec 12px d’écart. Le titre de 14px et la commande de détail reprennent l’ambre du budget ; le corps de 12px utilise l’encre brune dédiée. La commande native `details` conserve le clavier et le focus visible, avec une cible haute d’au moins 44px et un chevron orienté selon l’ouverture. Un filet sépare la liste ouverte, dont les éléments sont espacés de 8px.

### Mesure des dimensions de l’écran

L’option « Afficher les dimensions réelles » est intégrée au groupe « Dimensions de l’écran », sous les champs largeur et hauteur, sans panneau ni titre technique supplémentaire. Elle est séparée des champs par 16px. Le libellé cliquable a une hauteur minimale de 44px, un corps de 12px et une graisse de 600 ; la case native verte mesure 16px, avec 8px d’écart au texte. L’aide liée au contrôle par `aria-describedby` s’aligne sur le texte avec un retrait de 24px et une largeur maximale de 65ch. Elle invite à relever les valeurs sur l’écran cible et précise l’application au prochain rafraîchissement après enregistrement. La commande conserve le focus partagé et l’activation native au clavier.

L’indicateur est désactivé par défaut. Lorsqu’il est activé, la vue épurée affiche « Zone utile : largeur × hauteur px » dans un encart fixe au coin inférieur droit, au-dessus de la grille. Cet encart monochrome a un fond blanc, une bordure noire de 1px, des angles droits et des retraits de 4px verticalement et 8px horizontalement ; son texte Arial de 16px utilise une hauteur de ligne de 1.4. Sa largeur est limitée à l’écran et il n’intercepte aucune interaction. Il reste superposé au contenu sans modifier la grille.

La mesure correspond à la zone utile du navigateur en pixels CSS et suit les redimensionnements ; elle ne correspond pas aux dimensions minimales configurées pour la grille. Le contenu de consultation reste rendu côté serveur ; seul le diagnostic nécessite JavaScript et affiche « JavaScript requis » si la mesure ne peut pas s’exécuter. L’aperçu de l’administration affiche les dimensions simulées, sans exécuter de script dans son iframe.

### Minimal departure block

Chaque bloc répète sa gare, sa ligne et sa direction. Les départs sont disposés en colonnes de tableau égales. Une suppression s’écrit « SUP. » ; un départ absent utilise un tiret. Les départs qui partent avant le seuil de trajet effectif du bloc (le même que pour l’atténuation de la vue riche) sont masqués : le premier départ affiché est le premier atteignable, et les colonnes restent remplies par les départs atteignables suivants. Quand au moins un départ est masqué, un repère muet le signale : triangle plein pointé vers la gauche de 0.18 × 0.32em (proportionnel aux chiffres, soit environ 8 × 14px à la taille par défaut), en gris épuré (`minimal-muted`), dessiné en bordures CSS (sans glyphe), placé en position absolue dans la marge gauche du premier horaire à 0.12em des chiffres et centré sur leur hauteur, sans texte, sans nombre et sans décaler les chiffres ni la grille. Il n’apparaît pas en pause, sans données ou lorsque le seuil vaut 0 ; si tous les départs sont masqués, il précède les tirets. Le nom accessible du bloc précise alors « départs trop proches masqués ». Les perturbations ont un triangle SVG, avec une distinction sémantique pour le trafic inconnu. Cette surface n’a ni commande ni animation.

Les transitions des contrôles riches durent 0.15s en ease pour fond, texte et bordure, uniquement lorsque la préférence de mouvement réduit ne les exclut pas.

## Do's and Don'ts

### Do:

- **Do** conserver une identité gare, ligne et direction dans chaque bloc.
- **Do** garder, dans la vue riche, les départs trop proches dans leur ordre chronologique avec une atténuation lisible ; dans la vue épurée, les masquer et le signaler par le repère gris muet.
- **Do** avertir des limites de capacité de la vue épurée sans bloquer la sauvegarde et mesurer la zone utile du navigateur cible.
- **Do** garder les détails et commandes dans les interfaces riches.

### Don't:

- **Don't** réduire automatiquement la police ou ajouter un défilement pour faire tenir la vue épurée. Le débordement hors écran reste inaccessible.
- **Don't** faire dépendre un état de la couleur seule.
- **Don't** étendre la navigation, les animations ou les surfaces colorées à la vue épurée.

Non canonisé : la flèche typographique d’orientation du bloc partagé, conservée notamment dans la vue épurée, ne constitue pas une bibliothèque d’icônes à reproduire ; les commandes et liens externes riches utilisent les SVG partagés. Ce relevé décrit l’implémentation et ne vaut pas approbation globale du produit.
