# Contribuer

Merci de votre intérêt ! Ce projet est développé en équipe lors d'un hackathon ; ces règles gardent le dépôt propre.

## Mise en place

```bash
pnpm install
pnpm dev
```

## Workflow

1. Créer une branche depuis `main` : `feat/...`, `fix/...`, `docs/...`, `chore/...`.
2. Faire de petits commits clairs, en anglais, au format [Conventional Commits](https://www.conventionalcommits.org/) (`feat: add scout agent loop`).
3. Avant de pousser : `pnpm typecheck && pnpm lint`.
4. Ouvrir une Pull Request décrivant le **quoi** et le **pourquoi**. Une relecture est requise avant fusion.

## Conventions

- Code, commits et noms en **anglais** ; interface et textes du jeu en **français**.
- TypeScript strict, pas de `any` sans justification.
- Un comportement ajouté = un test. Aucun appel réseau dans les tests.
- Ne pas commiter de secrets (`.env` est ignoré). Utiliser `.env.example`.
- Rester dans son périmètre de fichiers ; pas de refactor hors sujet.

## Règles du projet

Les décisions d'architecture et règles non négociables sont dans `CLAUDE.md`.

## Code de conduite

Soyez respectueux et constructif.
