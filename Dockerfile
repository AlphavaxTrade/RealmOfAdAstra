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
