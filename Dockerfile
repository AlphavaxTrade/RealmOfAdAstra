# Realm of AdAstra — oyun + sunucu tek imaj (kurumsal A6.5). Kurulum: docs/DEPLOY.md · Ortam: docs/kurumsal/ORTAM.md
# Üç aşama: (1) oyunu DERLE (vite, phaser, three yalnız burada), (2) YALNIZ üretim bağımlılıklarını kur, (3) küçük ÇALIŞMA imajı.
# Çalışma imajında derleme araçları, test, belge, kaynak resimler yok; kök olmayan kullanıcı; sağlık denetimi var.
# Node sürümü .nvmrc ile aynı olmalı (tests/test_docker_dosyalari.mjs denetler).
ARG NODE_VERSION=24

# ── 1) Derle ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS derle
WORKDIR /uygulama
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY vite.config.js index.html ./
COPY css ./css
COPY js ./js
COPY public ./public
# tarayıcı kodu (js/net/online.js) sunucuyla AYNI işlem beyaz listesini içe alır: yalnız bu tek dosya gerekir
COPY server/actions.js ./server/actions.js
COPY scripts/sikistir.mjs ./scripts/sikistir.mjs
# Gerçek ağ derlemesi (denetim raporu H1): oyun tarayıcıda cüzdana "bu sözleşmeye ASTRA izni ver" dedirtir. Sözleşme ve token adresi
# derlemeye SABİTLENMEZSE sunucu ele geçirildiğinde oyuncunun cüzdanı yabancı bir adrese açılabilir. Bu yüzden gerçek ağ imajında
# REALM_GERCEK_AG=1 verilir ve iki adres de zorunludur (yoksa derleme HATA verir: vite.config.js). Hiçbiri verilmezse imaj deneme
# (TEST_MODE) imajıdır ve eskisi gibi derlenir; CI'daki `docker build .` bu yüzden değişmez.
#   docker build --build-arg REALM_GERCEK_AG=1 --build-arg VITE_PAYMENTS_CONTRACT=0x... --build-arg VITE_TOKEN_ADDRESS=0x... .
# ARG değerleri RUN adımında ortam değişkeni olarak görünür (ayrıca ENV yazılmaz: derleme aşaması imaja girmez, adresler zaten herkese açıktır).
ARG REALM_GERCEK_AG=0
ARG VITE_PAYMENTS_CONTRACT=
ARG VITE_TOKEN_ADDRESS=
RUN npm run build

# ── 2) Üretim bağımlılıkları (ethers, nodemailer, qrcode) ────────────────────
FROM node:${NODE_VERSION}-slim AS bagimlilik
WORKDIR /uygulama
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── 3) Çalışma ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS calisma
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 DB_FILE=/data/realm.db
WORKDIR /uygulama
# Güvenlik (ilk CI Trivy taraması: 7 Debian + 7 npm içi paket açığı): (1) taban imajın düzeltmesi yayınlanmış paketleri güncellenir,
# (2) çalışma zamanında GEREKSİZ paket yöneticileri (npm, yarn, corepack) kaldırılır: sunucu yalnız `node` çalıştırır, bağımlılıklar bir önceki
# aşamada kuruldu. Hem içlerindeki açıklar hem saldırı yüzeyi (kabuğa düşen biri paket kuramaz) ortadan kalkar.
RUN apt-get update && apt-get -y upgrade && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
# Sunucu oyun kuralları için js/ klasörünü de çalıştırır (server/engine.js); dist/ tarayıcıya sunulur
COPY --from=bagimlilik --chown=node:node /uygulama/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node js ./js
COPY --from=derle --chown=node:node /uygulama/dist ./dist
# Kalıcı veri klasörü (bir hacim bağlanır); kök olmayan kullanıcı yazabilsin
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
# Sunucu ayakta ve /api/health 200 veriyor mu
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
# PID 1 olarak sinyalleri doğru ileten ve zombi süreçleri toplayan init: docker run --init / compose "init: true" ile sağlanır
CMD ["node", "server/index.js"]
