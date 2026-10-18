#!/usr/bin/env bash
# "Bu haftanın denge raporuna bak" (18 Ekim 2026): Denge İzleme raporunu canlı (deneme) sunucudan SALT OKUNUR okur. Sunucudaki server/denge-rapor.mjs'i çalıştırır.
# Veriler özet sayaçlardır (kişisel veri yok). Yönetici paneli ("Denge İzleme") aynı raporu tablolarla gösterir.
#   bash scripts/denge-rapor.sh            son 7 gün
#   bash scripts/denge-rapor.sh --ay       son 30 gün
#   bash scripts/denge-rapor.sh --json     JSON
# Yerel veritabanı için doğrudan: node server/denge-rapor.mjs [--ay] [--json]   (DB_FILE=./data/realm.db)
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${HOST:-ubuntu@54.81.201.200}"
KASA_BETIGI="${KASA_BETIGI:-../megalodon-live-deck/scripts/kasa.sh}"
[ -f "$KASA_BETIGI" ] || { echo "Kasa betiği yok: $KASA_BETIGI (KASA_BETIGI ortam değişkeniyle gösterin)" >&2; exit 1; }
. "$KASA_BETIGI"; kasa_ac || exit 1
SSHK+=(-o ServerAliveInterval=10 -o ConnectTimeout=20 -o BatchMode=yes)
ARG=""
for a in "$@"; do case "$a" in --ay|--json) ARG="$ARG $a" ;; *) echo "bilinmeyen seçenek: $a" >&2; exit 2 ;; esac; done
ssh "${SSHK[@]}" "$HOST" "sudo -u realm bash -c 'cd /srv/realm/app && DB_FILE=/srv/realm/data/realm.db node server/denge-rapor.mjs$ARG'"
