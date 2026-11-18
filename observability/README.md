# Observabilité InfoTransport

Cette configuration repose sur une stack de collecte séparée,
une image Prometheus avec sa configuration embarquée et un dashboard à importer dans
le **Grafana standalone existant**. Aucun conteneur Grafana supplémentaire.

## Données du dashboard

- Disponibilité de `/metrics` et temps de fonctionnement du processus.
- CPU Node.js (100 % = un cœur), RAM résidente, heap utilisé/alloué et retard de la boucle événementielle.
- Requêtes HTTP par seconde et par route, statuts, erreurs 4xx/5xx, requêtes en cours et latences p50/p95/p99.
- Quotas PRIM par API (`stop-monitoring`, `line-reports`) : appels utilisés,
  pourcentage consommé, limites et appels restants, avec budget automatique distinct.

CPU et RAM concernent le processus applicatif, pas toute la machine ni les autres
conteneurs. La latence couvre la réponse HTTP locale, pas le rendu navigateur.
Les requêtes `/metrics` sont exclues du trafic ; les chemins inconnus et fichiers
statiques sont regroupés sous `other`, sans paramètres de requête dans les labels.
Une connexion HTTP interrompue est comptée comme 499.

Les quotas sont les **réservations locales persistées sur 24 heures glissantes**,
échecs inclus : 1 000 appels au total par API et 900 appels automatiques.
Ils ne connaissent pas les appels d’autres applications utilisant la même clé.
En démonstration, aucun nouvel appel PRIM n’est consommé. Une collecte Prometheus
ne contacte jamais PRIM. Les compteurs de quota survivent aux redémarrages via
`budget.json` ; les compteurs HTTP repartent à zéro, ce que `rate()` prend en compte.

## Déploiement Compose

Depuis la racine du dépôt :

```sh
docker compose up -d --build
docker compose --env-file .env -p infotransport-observability -f observability/docker-compose.yml up -d --build
```

Sans fichier `../.env`, omettre `--env-file .env`. S’il existe, le même fichier doit être
fourni aux deux stacks, notamment lorsque `PORT` diffère de 3000.
La stack applicative crée le réseau nommé `infotransport_default` ; la collecte le
rejoint et utilise le DNS Docker `infotransport`. Démarrer l’application avant la collecte.
`PROMETHEUS_PORT` permet de changer le port LAN de Prometheus (9092 par défaut,
pour ne pas entrer en conflit avec un Prometheus existant sur le port 9090). Rétention : 15 jours ou 2 Go.

Dans Portainer, utiliser **Git repository**, puis le chemin Compose
`docker-compose.yml`, dans le même environnement Docker que
l’application. Le contexte Git est nécessaire pour construire l’image ; le Web
editor seul ne contient pas le Dockerfile. Si le port applicatif a changé, renseigner
le même `PORT` dans cette stack. Aucun montage de fichiers de configuration depuis
l’hôte et aucun accès au socket Docker ne sont nécessaires.

Les endpoints applicatifs et Prometheus sont destinés au réseau local de confiance,
sans authentification intégrée. Le port 9092 doit être accessible par Grafana.

## Connexion au Grafana existant

1. Dans **Connections → Data sources**, ajouter une source **Prometheus**, par exemple
   `InfoTransport`, avec l’URL `http://<adresse-LAN-du-serveur>:9092`, puis **Save & test**.
   Si Grafana tourne sur la même machine, utiliser son adresse LAN ; `localhost` depuis
   le conteneur Grafana désignerait Grafana lui-même.
2. Dans **Dashboards → New → Import**, charger
   [`grafana/dashboards/infotransport.json`](grafana/dashboards/infotransport.json).
3. Choisir cette source pour **Prometheus InfoTransport**, puis importer.
4. Attendre deux collectes (environ 30 secondes) pour les taux et les latences.

Pour mettre à jour le dashboard, réimporter le JSON en conservant son UID
`infotransport` et la source choisie. Les personnalisations locales peuvent être écrasées.

Pour utiliser un Prometheus déjà installé, ajouter à sa configuration le job contenu
dans `prometheus/prometheus.yml`, remplacer `APP_PORT` par le port réel et lui donner
accès au réseau `infotransport_default` (ou remplacer la cible par l’adresse LAN et le
port publié de l’application). Il n’est alors pas nécessaire de déployer cette stack.
Choisir cette source existante lors de l’import du dashboard.

## Vérification

Sur `http://<serveur>:<PORT>/metrics`, vérifier la présence de
`infotransport_http_requests_total` après une requête applicative et des quatre
métriques `infotransport_prim_quota_*`, chacune avec les deux labels API.
Dans Prometheus, `up{job="infotransport"}` doit valoir 1. Les quotas sont visibles
dès le premier scrape ; les latences nécessitent du trafic et deux scrapes.
