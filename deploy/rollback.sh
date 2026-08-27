#!/usr/bin/env bash
# Reverte o Ponto Residentes para o commit anterior ao ultimo deploy.
#
#   ./deploy/rollback.sh            # volta para deploy/.state/previous-commit
#   ./deploy/rollback.sh <commit>   # volta para um commit especifico
#
# Escopo: mexe apenas no projeto compose "ponto-residentes".
set -euo pipefail

PROJECT="ponto-residentes"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$REPO_DIR/deploy/.state"

cd "$REPO_DIR"

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  [ -f "$STATE_DIR/previous-commit" ] || {
    echo "ERRO: $STATE_DIR/previous-commit nao existe. Informe o commit:" >&2
    echo "  ./deploy/rollback.sh <commit>" >&2
    exit 1
  }
  TARGET="$(cat "$STATE_DIR/previous-commit")"
fi

SHORT="${TARGET:0:7}"
echo "==> Revertendo para $SHORT"

git fetch --all --prune
git checkout --force "$TARGET"

# Se ja existe imagem marcada com esse commit, reaproveita (rollback rapido).
if docker image inspect "ponto-residentes-web:$SHORT" >/dev/null 2>&1; then
  echo "==> Reutilizando imagem ponto-residentes-web:$SHORT (sem rebuild)"
  docker tag "ponto-residentes-web:$SHORT" ponto-residentes-web:latest
  docker compose -p "$PROJECT" up -d --no-build
else
  echo "==> Imagem do commit nao encontrada; refazendo o build"
  docker compose -p "$PROJECT" build
  docker tag ponto-residentes-web:latest "ponto-residentes-web:$SHORT"
  docker compose -p "$PROJECT" up -d
fi

echo "$TARGET" > "$STATE_DIR/current-commit"
docker compose -p "$PROJECT" ps
echo
echo "==> Revertido para $SHORT"
echo "==> Para voltar ao topo da main: ./deploy/deploy.sh"
