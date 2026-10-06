#!/usr/bin/env bash
# Oyun sunucusunu alphavaxtrade.com'un AWS sunucusuna (54.81.201.200) kurar / günceller (kullanıcı kararı 6 Ekim 2026).
# ----------------------------------------------------------------------------------------------------------------
#  • Trade sitesinden AYRI: kullanıcı "realm", klasör /srv/realm, servis realm.service, kapı 127.0.0.1:8090.
#  • Güvenli adres: https://54-81-201-200.sslip.io (Caddy kendi sertifikasını alır). Oyun dosyaları
#    realmofadastra.vercel.app'te; aynı dosyalar yedek olarak bu adreste de açılır.
#  • DENEME MODU (TEST_MODE=1, zincir kapalı): sahte ADA, gerçek para yok. Gerçek moda geçiş ayrı iş.
#  • Ayarlar sunucuda /srv/realm/realm.env (izin 600); ilk kurulumda yönetici şifresi üretilir ve
#    data/sunucu-admin-token.txt dosyasına (GitHub'a gitmez) kaydedilir.
#  • SSH anahtarı megalodon-live-deck'teki kasadan (scripts/kasa.sh) açılır; içeriği yazdırılmaz.
# Kullanım: bash scripts/sunucuya-yukle.sh
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=ubuntu@54.81.201.200
ADDR=54-81-201-200.sslip.io
SITE=https://realmofadastra.vercel.app
. ../megalodon-live-deck/scripts/kasa.sh
kasa_ac
S() { ssh "${SSHK[@]}" -o ConnectTimeout=20 "$HOST" "$@"; }

echo "🔨 Derleniyor (sunucu adresi https://$ADDR)"
VITE_API_URL="https://$ADDR" npm run build >/dev/null
SURUM=$(node -e "import('./js/config.js').then(m=>console.log(m.GAME_CONFIG.GAME_VERSION))")
PKT=$(mktemp -d)/realm-$SURUM.tgz
tar czf "$PKT" --exclude='server/.env' server js dist package.json package-lock.json
scp "${SSHK[@]}" -q "$PKT" "$HOST:/tmp/realm.tgz"

# Yönetici şifresi: yerelde saklı olanı kullan, yoksa üret (yalnız ilk kurulum)
TOKF=data/sunucu-admin-token.txt
mkdir -p data
[ -s "$TOKF" ] || node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))" > "$TOKF"

S "sudo bash -s" <<EOF
set -euo pipefail
id realm >/dev/null 2>&1 || useradd --system --home /srv/realm --shell /usr/sbin/nologin realm
mkdir -p /srv/realm/app /srv/realm/data /srv/realm/releases
if [ ! -f /srv/realm/realm.env ]; then
  cat > /srv/realm/realm.env <<ENV
PORT=8090
HOST=127.0.0.1
DB_FILE=/srv/realm/data/realm.db
DIST_DIR=/srv/realm/app/dist
TEST_MODE=1
CHAIN_ENABLED=0
TRUST_PROXY=1
PUBLIC_URL=$SITE
CORS_ORIGINS=$SITE,https://$ADDR
ADMIN_TOKEN=$(cat "$TOKF")
ENV
fi
chmod 600 /srv/realm/realm.env
cp /tmp/realm.tgz /srv/realm/releases/realm-$SURUM.tgz
ls -1t /srv/realm/releases/*.tgz | tail -n +11 | xargs -r rm -f
rm -rf /srv/realm/app.new && mkdir /srv/realm/app.new && tar xzf /tmp/realm.tgz -C /srv/realm/app.new && rm -f /tmp/realm.tgz
cd /srv/realm/app.new && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null
rm -rf /srv/realm/app.old && { [ -d /srv/realm/app ] && mv /srv/realm/app /srv/realm/app.old || true; } && mv /srv/realm/app.new /srv/realm/app
chown -R realm:realm /srv/realm
cat > /etc/systemd/system/realm.service <<UNIT
[Unit]
Description=Realm of AdAstra oyun sunucusu (deneme modu)
After=network.target

[Service]
User=realm
WorkingDirectory=/srv/realm/app
EnvironmentFile=/srv/realm/realm.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
MemoryMax=700M
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/realm/data
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable realm >/dev/null 2>&1
systemctl restart realm
# Caddy: oyunun bloğu yoksa ekle; önce denetle, sorun varsa eski ayar kalır (trade sitesi etkilenmez)
if ! grep -q "$ADDR" /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.yedek-\$(date +%Y%m%d%H%M%S)
  printf '\n%s {\n\tencode gzip\n\treverse_proxy 127.0.0.1:8090\n}\n' "$ADDR" > /tmp/realm.caddy
  cat /etc/caddy/Caddyfile /tmp/realm.caddy > /tmp/Caddyfile.yeni
  caddy validate --config /tmp/Caddyfile.yeni --adapter caddyfile >/dev/null 2>&1 && cp /tmp/Caddyfile.yeni /etc/caddy/Caddyfile && systemctl reload caddy && echo "Caddy: oyun adresi eklendi"
fi
EOF

for i in $(seq 1 30); do
  if curl -s -m 5 "https://$ADDR/api/health" | grep -q '"ok":true'; then echo "✅ Oyun sunucusu: https://$ADDR (sürüm $SURUM)"; break; fi
  sleep 3
done
curl -s -m 5 "https://$ADDR/api/health" | grep -q '"ok":true' || { echo "❌ Sunucu yanıt vermiyor: sudo journalctl -u realm -n 50"; exit 1; }
