#!/usr/bin/env bash
# Met un Node >= 22 dans le PATH du shell courant, SANS modifier package.json ni le pnpm-lock.yaml.
# Pourquoi : vitest 5 / jsdom 31 exigent Node 22+, alors que .nvmrc et la machine ont Node 20 (undici plante au chargement).
# Usage (depuis la racine du dépôt ou d'un worktree) :   source tools/node22.sh && pnpm test
# Idempotent. Ne touche à rien hors du dossier du worktree (node_modules/.pnpm).

_node22_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

if [ "$(_node22_major)" -ge 22 ]; then
  echo "node $(node -v) déjà suffisant"
else
  root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  bin="$(ls -d "$root"/node_modules/.pnpm/node@runtime+22*/node_modules/node/bin 2>/dev/null | head -1)"
  if [ -z "$bin" ]; then
    (cd "$root" \
      && pnpm install --frozen-lockfile >/dev/null 2>&1 \
      && pnpm runtime set node 22 >/dev/null 2>&1 \
      && git checkout -- package.json pnpm-lock.yaml) || echo "échec de l'installation de Node 22" >&2
    bin="$(ls -d "$root"/node_modules/.pnpm/node@runtime+22*/node_modules/node/bin 2>/dev/null | head -1)"
  fi
  if [ -n "$bin" ]; then
    export PATH="$bin:$PATH"
    echo "node $(node -v) (runtime local du worktree)"
  fi
fi
unset -f _node22_major
