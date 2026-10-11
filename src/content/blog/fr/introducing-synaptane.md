---
title: Voici Synaptane
description: Un second cerveau d’équipe stocké dans Git, le Markdown d’abord et tous vos fichiers. Vos assistants IA le consultent et l’alimentent, un agent le range chaque nuit, et tout reste dans un dépôt qui vous appartient.
date: 2026-10-10
author: René Cotton
lang: fr
draft: true
---

Chaque jour, avec mon équipe, nous expliquons des choses à des assistants IA : comment tel
serveur est configuré, pourquoi tel projet est réglé de cette façon, ce que nous avons décidé
la semaine dernière et pour quelle raison. L’assistant nous aide, la conversation se termine,
et tout cela disparaît. La personne suivante, ou la même un mois plus tard, repart de zéro.

La réponse habituelle, c’est le wiki. Mais un wiki ne vaut que s’il est tenu à jour, et dans
la plupart des équipes, personne ne s’en charge. Les pages vieillissent, les doublons
s’accumulent, les liens cassent. On finit par ne plus s’y fier, donc par ne plus y écrire.

Des outils promettent de régler le problème avec l’IA. La plupart veulent pour cela le savoir
de votre équipe dans leur nuage, dans leur format, derrière leur interface. Pour quelque chose
d’aussi central que la mémoire d’une équipe, je ne le voulais pas. Je voulais que ce savoir
reste le nôtre, lisible sans outil particulier, et facile à emporter ailleurs.

Synaptane est ma réponse. Sa première version publique, `v1.0.0-rc.1`, est un logiciel libre
sous licence Apache 2.0.

## Ce que fait Synaptane

Synaptane est un second cerveau d’équipe auto-hébergé, stocké dans Git. Vos assistants IA y
cherchent et y déposent ce qu’ils apprennent, dans une inbox. Chaque nuit, un agent IA range
ces notes dans le wiki et commite le résultat.

### Git fait foi

Chaque espace est un dépôt Git, sur GitHub, GitLab, Gitea ou tout autre hébergeur. Son dossier
`content/` est le wiki : des pages Markdown et les fichiers qui les accompagnent, que vous
pouvez lire, parcourir avec grep et cloner sans Synaptane. Chaque modification est un commit, signé du nom de la personne qui l’a faite.

La synchronisation fonctionne dans les deux sens. Si quelqu’un modifie une page directement
chez l’hébergeur Git, Synaptane récupère la modification. En cas de conflit, c’est une personne
qui tranche, fichier par fichier : Synaptane ne force jamais un push et ne confie jamais un
conflit à une IA. Hors comptes, droits, secrets et journaux, la base de données ne contient
rien qu’on ne puisse reconstruire à partir des dépôts.

### Le Markdown d’abord, et tous vos fichiers

Les pages sont en Markdown : ce sont elles qui ont des liens, des rétroliens, un sommaire et
une date de vérification, et l’agent de la nuit écrit en Markdown. Mais le savoir d’une équipe
vit aussi dans des contrats, des bons de livraison scannés, des présentations, des tableurs,
des schémas et des rapports exportés. Un espace les accueille tous, versionnés dans Git comme
les pages. Les PDF s’ouvrent dans un lecteur intégré, les fichiers Word, PowerPoint et Excel
affichent leur texte extrait, les images s’affichent, les pages HTML sont rendues dans un cadre
isolé. Leur texte est extrait, par OCR pour les scans et les images, pour que la recherche et
vos assistants trouvent ce qu’ils contiennent. Les fichiers arrivent par l’interface web, en
pièces jointes d’une note déposée par un assistant, ou par un `git push`.

### Pensé pour les assistants IA

Synaptane est un serveur MCP. Claude.ai, Claude Desktop, Claude Code et ChatGPT s’y connectent
par OAuth ou avec un jeton personnel, et disposent de 20 outils et 3 prompts : lister les
espaces, chercher, lire une page ou une seule section, suivre l’historique, déposer des notes,
écrire des pages. Une connexion peut être limitée à la lecture, ou à certains espaces. Chaque
outil d’écriture est déclaré destructif : l’assistant vous demande confirmation avant de s’en
servir.

### Déposer d’abord, ranger ensuite

Quand vous apprenez quelque chose au fil d’une conversation, vous demandez à votre assistant
de le garder. Il dépose une note dans l’inbox du bon espace, et Synaptane lui signale les
pages et les notes qui traitent déjà du sujet. Les notes peuvent aussi venir de l’interface
web ou de l’API REST, et les pages modifiées directement apparaissent elles aussi dans
l’inbox.

Chaque nuit, un agent IA passe l’inbox en revue. Il lit la vocation de l’espace, une courte
page où l’équipe dit à quoi sert l’espace et comment il est organisé. Il cherche dans le wiki,
complète les pages existantes plutôt que d’en créer des doublons, en crée de nouvelles quand
il le faut, répare les liens, et enregistre tout le passage en un seul commit. Si un passage
tourne mal, vous l’annulez en un clic. Des garde-fous l’encadrent : 10 suppressions au plus
par passage, un plafond de coût par passage et, si vous le souhaitez, un budget mensuel.

### Des routines

Vous pouvez aussi programmer des routines d’agent sur un espace. Deux sont prêtes à l’emploi :
un contrôle de cohérence, qui cherche les contradictions, les informations périmées et les
doublons, et un résumé hebdomadaire de ce que l’équipe a appris et décidé. Une routine n’écrit
que dans ses sorties (une page de rapport, des éléments d’inbox, un e-mail ou un webhook) :
les vraies corrections passent toujours par l’inbox et le rangement de la nuit.

### Une recherche qui trouve

La recherche plein texte fonctionne sans réglage, insensible aux accents, avec une
racinisation légère en français et en anglais. Elle couvre les pages et le texte de vos
documents{N}: PDF (scans compris), fichiers Office et images, lus par OCR. Avec un modèle d’embeddings, elle devient hybride : par les
mots et par le sens. Chaque page affiche aussi les pages proches.

### Un savoir digne de confiance

Une page peut avoir un propriétaire, une date de vérification et un rythme de relecture ; les
assistants savent si elle est vérifiée ou à revoir. Un onglet Santé liste les liens cassés,
les pages orphelines et celles que personne n’a touchées depuis des mois. Les secrets
probables, comme un mot de passe ou une clé d’API, sont refusés avant tout commit.

Vous choisissez votre fournisseur d’IA : Anthropic, OpenAI, Mistral, Ollama ou tout service
compatible avec l’API d’OpenAI. Sans fournisseur, le wiki, la recherche, le serveur MCP et
l’inbox fonctionnent ; seuls le rangement, les routines et la recherche par le sens ont besoin
d’un modèle.

## L’essayer

Vous pouvez parcourir [la démo en ligne](/fr/demo/) sans rien installer. Pour faire tourner
Synaptane chez vous, il vous faut Linux (ou WSL2 sous Windows) et Docker avec Docker Compose.
L’instance de démonstration démarre en deux minutes environ :

```sh
git clone https://github.com/synaptane/synaptane.git && cd synaptane
printf 'PUBLIC_URL=http://localhost:8000\nPOSTGRES_PASSWORD=%s\nSYNAPTANE_VERSION=1.0.0-rc.1\n' \
  "$(openssl rand -hex 24)" > .env
echo 'COMPOSE_FILE=compose.yaml:examples/compose.demo.yaml' >> .env   # démo seulement
docker compose up -d
docker compose exec app synaptane demo
```

Elle charge le wiki d’une équipe informatique fictive : 50 pages, dont des pages vérifiées et
une à revoir, quelques documents (un contrat, un bon de livraison scanné, une présentation, un
tableur) et six notes qui attendent dans l’inbox. Pour les ranger, il faut un fournisseur
d’IA. Pour une vraie installation, suivez le
[guide d’installation](/fr/docs/admin/installation/), puis
[connectez votre assistant IA](/fr/docs/guide/mcp/).

## Où en est le projet

Synaptane est un logiciel alpha. Il est fourni tel quel et maintenu au mieux par une seule
personne : moi. L’API REST, les outils MCP et la configuration peuvent encore changer ; chaque
changement figure dans les [notes de version](/fr/releases/), et je vous conseille de faire
une sauvegarde avant chaque mise à jour.

Certaines fonctions sont récentes (routines, pages proches, vérification des pages) et
garderont quelques aspérités. D’autres manquent encore : l’authentification à deux facteurs,
la restauration d’une version de page depuis l’interface (l’historique Git, lui, est là), un
point d’accès `/metrics`. macOS n’est pas testé.

## Et ensuite

Les prochains chantiers : la sécurité des comptes (double authentification, sessions qui
expirent), une exploitation plus simple (supervision, image arm64, sauvegardes encore plus
simples), davantage de fournisseurs d’IA avec estimation automatique des coûts, et la
restauration d’une version de page en un clic. Une offre hébergée est à l’étude, sans plus
pour l’instant. La [feuille de route](/fr/roadmap/) donne le détail.

## Participer

Ce qui m’aide le plus aujourd’hui, ce sont les retours de celles et ceux qui l’essaient. Vos
questions, idées et cas d’usage sont les bienvenus dans les
[Discussions GitHub](https://github.com/synaptane/synaptane/discussions), en français comme
en anglais ; les bogues, dans les [issues](https://github.com/synaptane/synaptane/issues).
Pour contribuer au code, à la documentation ou aux traductions, lisez d’abord
[CONTRIBUTING.fr.md](https://github.com/synaptane/synaptane/blob/main/CONTRIBUTING.fr.md) :
les commits sont certifiés selon le Developer Certificate of Origin. Les failles de sécurité
se signalent en privé, comme l’explique
[SECURITY.md](https://github.com/synaptane/synaptane/blob/main/SECURITY.md).

Un mot sur la fabrication : Synaptane est développé avec l’aide d’assistants de programmation
IA (Claude), et je relis chaque modification.

Si votre équipe, elle aussi, perd ce qu’elle explique à ses assistants, j’aimerais savoir si
Synaptane l’aide.
