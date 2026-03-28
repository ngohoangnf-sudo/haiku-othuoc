ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm prune --omit=dev

FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/assets ./src/assets
COPY --from=build /app/quasar.config.cjs ./quasar.config.cjs

EXPOSE 4000

CMD ["node", "server/index.js"]
