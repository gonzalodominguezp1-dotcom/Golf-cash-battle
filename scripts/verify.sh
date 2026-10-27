#!/usr/bin/env bash
# Puerta de verificación del proyecto (la usa la skill `verify` de rsc y la definición de terminado de la constitución).
# Se detiene al primer fallo. Uso: bash scripts/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/5 pruebas del juego"
pnpm test

echo "== 2/5 build"
pnpm run build

echo "== 3/5 Edge Functions (Deno)"
if command -v deno >/dev/null 2>&1; then
  DENO="deno"
else
  DENO="npx --yes deno@2"
fi
$DENO check --node-modules-dir=none --no-lock supabase/functions/*/*.ts

echo "== 4/5 dependencias sin CVE conocidas (producción)"
pnpm audit --prod

echo "== 5/5 autoría de los commits nuevos (constitución K3.5)"
if git rev-parse --verify -q origin/main >/dev/null; then
  autores=$(git log origin/main..HEAD --format='%h %an|%cn' | grep -v -E ' (Chakets|La Yuinta)\|(Chakets|La Yuinta)$' || true)
  trailers=$(git log origin/main..HEAD --format='%h %B' | grep -i -E 'co-authored-by:.*(claude|anthropic|gpt|gemini|copilot|cursor|openai|deepseek|mistral)|generated with' || true)
  if [ -n "$autores$trailers" ]; then
    echo "autoría: hay commits que incumplen K3.5:"
    printf '%s\n%s\n' "$autores" "$trailers" | grep -v '^$'
    exit 1
  fi
else
  echo "aviso: no existe origin/main; se omite la comprobación de autoría"
fi

echo "verify: OK"
