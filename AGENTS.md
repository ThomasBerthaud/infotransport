# Consignes pour les agents

Les consignes propres à l'environnement local (suivi des tickets, instances privées)
se trouvent dans `CLAUDE.local.md`, fichier non versionné.

## Vérifier sans gaspiller

Règles communes :

- Pendant le travail, lancer seulement les vérifications ciblées sur ce qui change (un fichier de test, un paquet, les fichiers modifiés).
- Lancer la vérification complète une seule fois, à la fin ; la relancer seulement après avoir corrigé un échec.
- Ne pas relancer une commande dont le résultat ne peut pas avoir changé.
- Préférer les sorties concises (reporters courts, filtrage des erreurs) sans masquer le code de sortie, le résumé ni les erreurs.

Commandes ciblées :

| Besoin                                         | Commande                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| Un fichier de test                             | `NODE_ENV=test node --import tsx --test --test-reporter=dot tests/<fichier>.test.ts` |
| Un test par son nom                            | même commande avec `--test-name-pattern="<nom>"`                                     |
| Lint et format des fichiers modifiés           | `npx oxlint <fichiers>` puis `npx oxfmt --check <fichiers>`                          |
| Types, si des signatures ou des types changent | `npm run typecheck`                                                                  |

Vérification complète, à la fin, comme la CI : `npm run lint`, `npm run fmt:check`, `npm test` et `npm run build`.
