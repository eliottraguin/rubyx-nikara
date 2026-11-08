# Maîtrise de l'intelligence artificielle

## Une idée conçue par l'équipe

Prospect Tycoon est né d'une idée que nous avons développée nous-mêmes : créer un jeu de gestion d'entreprise permettant d'apprendre à travailler avec des agents d'intelligence artificielle. Nous avons défini à la main le concept, le public visé, les mécaniques de jeu et les parcours avant de les transmettre à l'IA. Notre objectif n'était pas de lui demander de trouver un projet à notre place, mais de lui fournir une vision suffisamment précise pour qu'elle nous aide à la concrétiser.

Le joueur dirige une entreprise dans une ville et utilise des agents pour réaliser des tâches liées à la prospection, à la relation client et à la publicité. Dans la vision de la V2, il apprend à formuler des consignes et à donner du contexte : un orchestrateur répartit les demandes, tandis qu'un évaluateur doit fournir des retours pédagogiques. Nous avons choisi ces rôles et leurs interactions pour rendre l'apprentissage concret, plutôt que de limiter l'expérience à une simple conversation avec un modèle.

## Les tokens comme ressource de développement et de jeu

Nous avons utilisé des tokens d'IA pour accompagner la réalisation de l'application et préparer le fonctionnement de ses bots. Un token est une unité de texte traitée par un modèle ; les instructions, le contexte fourni et la réponse produite contribuent donc à la consommation. Cette ressource a une valeur : une demande trop vague peut entraîner des allers-retours, tandis qu'une demande précise, accompagnée des bons fichiers et contraintes, aide à obtenir un résultat exploitable.

La maîtrise ne consiste donc pas seulement à disposer d'un grand nombre de tokens. Elle consiste à découper le travail, transmettre le contexte pertinent, contrôler les propositions et corriger les écarts. Pour les agents du jeu, nous avons également prévu des limites de génération et des plafonds de consommation afin d'éviter qu'une fonctionnalité ne dépende d'appels illimités. L'application distingue le fournisseur simulé, utilisé par défaut et pour les tests, d'un adaptateur pour un fournisseur réel. Les chiffres simulés sont des estimations, pas des mesures de consommation réelle.

## Garder la décision et la vérification

L'IA a accéléré la production, mais l'équipe reste responsable du résultat : elle fixe les règles, arbitre les changements de direction et vérifie que l'implémentation répond à l'idée initiale. Les décisions, contrats et tests du dépôt servent de référence commune, notamment lorsque plusieurs agents travaillent en parallèle. Les réponses des modèles sont traitées comme des données non fiables : les récompenses et les règles importantes restent sous le contrôle du serveur.

Cette approche nous a permis d'utiliser l'IA comme un outil de réalisation, sans lui déléguer la propriété du projet. Les fonctionnalités V2 et leur branchement réel restent à développer ou à valider selon leur état ; l'existence d'un adaptateur ne prouve pas à elle seule qu'un appel réel a réussi. Notre maîtrise se mesure ainsi autant à la clarté de nos choix qu'à notre capacité à reconnaître ce qui reste à vérifier.
