#!/usr/bin/env bash
# Publica en npm todos los paquetes del workspace, en orden de dependencias.
#  - Omite las versiones que ya existen (re-ejecutable sin riesgo).
#  - Usa `pnpm pack` para resolver `workspace:*` y `npm publish <tgz>` para soportar
#    "trusted publishing" (OIDC) y provenance.
# Variables: NPM_FLAGS (por defecto "--access public --provenance"), DRY_RUN=1 para simular.
set -euo pipefail

TGZ_DIR="${RUNNER_TEMP:-$(mktemp -d)}/tgz"
mkdir -p "$TGZ_DIR"
export TGZ_DIR
export NPM_FLAGS="${NPM_FLAGS:---access public --provenance}"
[ "${DRY_RUN:-}" = "1" ] && NPM_FLAGS="$NPM_FLAGS --dry-run"

pnpm -r --workspace-concurrency=1 exec sh -c '
  name=$(node -p "require(\"./package.json\").name")
  ver=$(node -p "require(\"./package.json\").version")
  f=$(pnpm pack --pack-destination "$TGZ_DIR" | tail -1)  # también en simulación: valida el empaquetado
  if npm view "$name@$ver" version >/dev/null 2>&1; then
    echo "• $name@$ver ya está publicado: se omite"; exit 0
  fi
  echo "→ publicando $name@$ver ($f)"
  npm publish "$f" $NPM_FLAGS
'
