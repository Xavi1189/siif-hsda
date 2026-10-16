#!/usr/bin/env bash
# Respaldo lógico de SIIF. Uso: DATABASE_URL_DIRECTA="postgresql://..." ./scripts/respaldo.sh
# Usa la cadena DIRECTA de Neon (sin -pooler). Ver docs/RESPALDOS.md
set -euo pipefail
: "${DATABASE_URL_DIRECTA:?Define DATABASE_URL_DIRECTA con la cadena de conexión directa de Neon}"
mkdir -p respaldos
archivo="respaldos/siif-$(TZ=America/Hermosillo date +%F_%H%M).dump"
pg_dump --format=custom --no-owner --no-privileges --dbname "$DATABASE_URL_DIRECTA" --file "$archivo"
sha256sum "$archivo" > "$archivo.sha256"
echo "Respaldo creado: $archivo ($(du -h "$archivo" | cut -f1))"
