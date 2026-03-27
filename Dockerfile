ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS build

WORKDIR /app

# Toolchain để build better-sqlite3 và deps native
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Giữ lại node_modules đã compile và prune dev deps
RUN npm prune --omit=dev

FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/quasar.config.cjs ./quasar.config.cjs

EXPOSE 4000

CMD ["node", "server/index.js"]
