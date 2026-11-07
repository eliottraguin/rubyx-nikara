# Politique de sécurité

## Signaler une vulnérabilité

Merci de **ne pas ouvrir d'issue publique** pour une faille de sécurité.

Utilisez le signalement privé de GitHub (*Security → Report a vulnerability*) ou contactez les mainteneurs directement. Indiquez :

- une description de la faille et son impact,
- les étapes pour la reproduire,
- la version ou le commit concerné.

Nous accusons réception sous 72 h et corrigeons dès que possible.

## Bonnes pratiques du projet

- Aucun secret dans le dépôt : clés dans `.env` (ignoré par git).
- Aucun envoi réel (mail, message, formulaire) : la boîte d'envoi est simulée.
- Le contenu web traité par les agents est une donnée non fiable (risque d'injection de prompt).
