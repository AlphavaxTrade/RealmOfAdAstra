# Realm of Astra — oyun + sunucu tek paket
# Kurulum: docs/SUNUCU_KURULUM.md
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=8080 DB_FILE=/data/realm.db
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "server/index.js"]
