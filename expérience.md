# Notre expérience avec Axis et Superflip

## Axis : explorer l'IA au service du projet

Nous avons travaillé sur Prospect Tycoon avec l'ambition d'intégrer des agents capables d'aider un joueur à gérer son entreprise. Dans ce cadre, Axis représente une piste pour accéder à des modèles et construire des échanges avec eux. Notre expérience a commencé par une exploration concrète : le fichier `index.mjs` montre un essai isolé du SDK Axis, avec la création d'un client, l'envoi d'un message et la récupération éventuelle de fichiers produits. Cet exemple nous a permis d'aborder le principe d'une conversation et des résultats générés.

Nous avons ensuite structuré l'application autour d'un adaptateur de modèles côté API. Il existe un fournisseur simulé et un adaptateur réel conçu pour dialoguer avec un relais compatible. L'interface commune transmet notamment le rôle de l'agent, son contexte et une limite de sortie ; elle permet aussi de représenter la réponse, son état et la consommation de tokens lorsque celle-ci est disponible. Cette séparation est utile : elle rend les tests reproductibles sans dépendre du réseau et prépare l'intégration d'un service réel sans disperser sa configuration dans tout le projet.

Nous retenons également une limite importante : l'essai SDK est indépendant de l'application et le dépôt ne démontre pas un appel réel réussi depuis l'adaptateur. Les tests documentés de cet adaptateur utilisent un transport simulé. Le plan V2 prévoit un branchement des agents à Axis, mais cette intention ne doit pas être confondue avec une intégration de bout en bout déjà validée. La prochaine étape est donc de vérifier un appel réel avec une configuration adaptée, sans exposer les clés, puis de mesurer les résultats et les tokens réellement consommés.

## Superflip : organiser le travail collectif

Nous avons particulièrement apprécié Superflip pour organiser la réalisation de la V2. Le plan du dépôt indique que le projet « Prospect Tycoon V2 » y est orchestré : l'idée générale est découpée en tickets, avec des responsabilités et des dépendances. Cette organisation rend un projet large plus facile à suivre et permet de faire avancer plusieurs sujets, comme la ville, les bots, l'interface ou les contrats, sans perdre de vue leur objectif commun.

Son intérêt ne se limite pas à distribuer des tâches. Les règles de travail demandent des branches distinctes, des modifications ciblées, des vérifications annoncées et une revue avant intégration. L'historique du dépôt montre notamment des travaux associés aux tickets de la ville 3D et de l'immeuble. Pour nous, ce cadre facilite la coordination entre les contributions et aide à comprendre ce qui a été fait, ce qui doit encore être vérifié et ce qui bloque.

Cette expérience nous a montré la complémentarité des deux outils : Axis nous aide à explorer l'utilisation de modèles dans le produit ; Superflip nous aide à structurer le travail nécessaire pour le construire. Dans les deux cas, l'équipe garde la responsabilité des choix, de la sécurité et de la validation finale.
