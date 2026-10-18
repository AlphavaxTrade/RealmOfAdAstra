#!/usr/bin/env bash
# Telegram bildirim ayarını (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) canlı (deneme) oyun sunucusunun ayar dosyasına işler ve servisi yeniden başlatır (18 Ekim 2026).
# Ayar bir DOSYADAN okunur (sohbete yapıştırılmaz, komut satırına yazılmaz, ekrana basılmaz). Dosya şöyle olmalı (depo DIŞINDA bir yerde dursun):
#   TELEGRAM_BOT_TOKEN=123456:ABC...
#   TELEGRAM_CHAT_ID=987654321
# Kullanım: bash scripts/telegram-ayarla.sh <ayar-dosyasi>
# Sunucu: /srv/realm/realm.env (izin 600); aynı anahtarlar varsa değiştirilir, diğer ayarlara dokunulmaz.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -n "${1:-}" ] && [ -f "$1" ] || { echo "kullanım: $0 <ayar-dosyasi>  (içinde TELEGRAM_BOT_TOKEN=... ve TELEGRAM_CHAT_ID=... satırları)" >&2; exit 2; }
grep -Eq '^TELEGRAM_BOT_TOKEN=[0-9]{5,12}:[A-Za-z0-9_-]{30,60}$' "$1" || { echo "Dosyada TELEGRAM_BOT_TOKEN satırı yok ya da biçimi yanlış (123456:ABC...)." >&2; exit 2; }
grep -Eq '^TELEGRAM_CHAT_ID=(-?[0-9]{1,20}|@[A-Za-z0-9_]{5,32})$' "$1" || { echo "Dosyada TELEGRAM_CHAT_ID satırı yok ya da biçimi yanlış (sayı ya da @kanaladi)." >&2; exit 2; }
HOST="${HOST:-ubuntu@54.81.201.200}"
KASA_BETIGI="${KASA_BETIGI:-../megalodon-live-deck/scripts/kasa.sh}"
[ -f "$KASA_BETIGI" ] || { echo "Kasa betiği yok: $KASA_BETIGI (KASA_BETIGI ortam değişkeniyle gösterin)" >&2; exit 1; }
. "$KASA_BETIGI"; kasa_ac
S() { ssh "${SSHK[@]}" -o ConnectTimeout=20 "$HOST" "$@"; }
# yalnız bu iki satır gönderilir (dosyadaki başka şey sunucuya gitmez)
grep -E '^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)=' "$1" | S "cat > /tmp/realm-telegram.env && chmod 600 /tmp/realm-telegram.env"
S "sudo bash -s" <<'EOF'
set -euo pipefail
cp -p /srv/realm/realm.env /srv/realm/realm.env.yedek-telegram
grep -Ev '^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)=' /srv/realm/realm.env > /tmp/realm.env.yeni
cat /tmp/realm-telegram.env >> /tmp/realm.env.yeni
cat /tmp/realm.env.yeni > /srv/realm/realm.env
rm -f /tmp/realm.env.yeni /tmp/realm-telegram.env
chmod 600 /srv/realm/realm.env
systemctl restart realm
sleep 4
systemctl is-active realm
EOF
echo "Ayar işlendi. Yönetici panelinde (admin) \"Telegram deneme mesajı\" düğmesine bas: Telegram'ına mesaj gelmeli."
