#!/usr/bin/env bash
# Deploy do Ponto Residentes no servidor (Docker + Traefik).
#
#   ./deploy/deploy.sh
#
# Escopo: mexe apenas no projeto compose "ponto-residentes". Nao altera
# Traefik, nem outros containers/dominios do servidor.
set -euo pipefail

DOMAIN="${PONTO_DOMAIN:-formacao.plataformaativa.cloud}"
PROJECT="ponto-residentes"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$REPO_DIR/deploy/.state"

cd "$REPO_DIR"
mkdir -p "$STATE_DIR"

echo "==> Repositorio: $REPO_DIR"
echo "==> Dominio:     $DOMAIN"

# --- 1. Guarda o estado atual ANTES de mudar (base do rollback) -------------
PREV_COMMIT="$(git rev-parse HEAD)"
echo "$PREV_COMMIT" > "$STATE_DIR/previous-commit"
echo "==> Commit atual (rollback aponta para ele): ${PREV_COMMIT:0:7}"

# --- 2. Atualiza o codigo ---------------------------------------------------
git fetch --all --prune
git checkout main
git pull --ff-only origin main
NEW_COMMIT="$(git rev-parse HEAD)"
SHORT="${NEW_COMMIT:0:7}"
echo "==> Commit implantado: $SHORT"

# --- 3. Confere pre-requisitos sem alterar nada de terceiros ----------------
if ! docker network inspect traefik-public >/dev/null 2>&1; then
  echo "ERRO: a rede externa 'traefik-public' nao existe. Deploy abortado para" >&2
  echo "      nao alterar a infraestrutura existente. Verifique o Traefik." >&2
  exit 1
fi

if [ ! -f "$REPO_DIR/.env" ]; then
  echo "ERRO: .env ausente em $REPO_DIR. Crie com:" >&2
  echo "  PONTO_DOMAIN=$DOMAIN" >&2
  echo "  NEXT_PUBLIC_SUPABASE_URL=https://uwwcrulhfrleqlmgmbcm.supabase.co" >&2
  echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>" >&2
  exit 1
fi

grep -q "^PONTO_DOMAIN=$DOMAIN$" "$REPO_DIR/.env" || {
  echo "AVISO: PONTO_DOMAIN no .env difere de $DOMAIN — usando o valor do .env."
}

# --- 4. Build e subida, marcando a imagem com o commit ----------------------
# A tag por commit permite reverter sem rebuild.
docker compose -p "$PROJECT" build
docker tag ponto-residentes-web:latest "ponto-residentes-web:$SHORT"
docker compose -p "$PROJECT" up -d

echo "$NEW_COMMIT" > "$STATE_DIR/current-commit"

# --- 5. Verificacao ---------------------------------------------------------
echo "==> Aguardando o container responder..."
for i in $(seq 1 30); do
  if docker compose -p "$PROJECT" exec -T ponto-web wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1; then
    echo "==> OK: aplicacao respondendo na porta 3000."
    break
  fi
  [ "$i" = 30 ] && { echo "AVISO: sem resposta em 60s. Veja os logs abaixo."; }
  sleep 2
done

docker compose -p "$PROJECT" ps

# Lembrete: a rota vive num arquivo do Traefik, nao nos labels.
if ! ssh_marker=1 test -f /opt/pilates/traefik/dynamic/ponto-residentes.yml 2>/dev/null; then
  echo
  echo "AVISO: /opt/pilates/traefik/dynamic/ponto-residentes.yml nao encontrado."
  echo "       Sem ele o dominio responde 404: este Traefik usa provider de"
  echo "       arquivo e ignora os labels do Docker. Copie de deploy/traefik/."
fi
echo
echo "==> Commit implantado: $SHORT ($NEW_COMMIT)"
echo "==> Reverter:          ./deploy/rollback.sh"
echo "==> Logs:              docker compose -p $PROJECT logs -f ponto-web"
echo "==> URL:               https://$DOMAIN"
