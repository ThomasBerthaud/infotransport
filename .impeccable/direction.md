# Direction de construction

Construction directement en code, conformément au choix utilisateur enregistré. Le brief utilisateur fixe la topologie des blocs ; aucune direction issue d'un tirage ne peut remplacer ces contraintes.

Monde : tableau de départs de proximité, typographie précise et surfaces calmes de carnet d'exploitation. Vue riche : papier clair, encre vert sombre, filets horizontaux, touches de couleur pour identifier les lignes et signaler les incidents. Administration : mêmes surfaces, formulaires explicites et diagnostics latéraux. Vue épurée : monochrome, typographie système compatible avec les navigateurs anciens, sans animation ni commande.

Premier écran : les tuples gare/ligne/direction et leurs horaires sont le contenu principal. Les incidents complets occupent une colonne dédiée sur ordinateur, puis précèdent les tableaux de départs sur petit navigateur. La vue épurée garde tous ses blocs visibles simultanément et sans contenu d'habillage. Les blocs restent pleine largeur et empilés par défaut.

Interaction principale : configurer les tuples, leur ordre/largeur et les exceptions aux valeurs héritées ; prévisualiser le rendu à la taille du profil puis enregistrer. Pas d'interaction exigée sur `/minimal`.

Contraintes : React/TypeScript, Vite, TanStack Query pour les interfaces interactives ; HTML serveur sur `/minimal`. Budget contrôlé côté serveur, pause 22 h–5 h. Police Manrope auto-hébergée pour l'interface riche ; Arial/Helvetica volontairement utilisées sur la vue épurée pour compatibilité et absence de téléchargement de police. L'avertissement mécanique `overused-font` à cet endroit est assumé pour cette raison fonctionnelle.
