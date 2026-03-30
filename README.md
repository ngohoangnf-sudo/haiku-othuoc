# haiku o thuoc (haiku)

website of haiku o thuoc

## Node.js version
This repo now targets Node.js `22+` and should use Node.js `24.x` by default.
Quasar CLI with Vite currently declares official support for Node `22` and `24`, not `25`.

## Database
The app now uses **PostgreSQL** instead of SQLite.

For local development, either:

```bash
docker compose up -d postgres
```

or run your own Postgres instance and point the app at it with `DATABASE_URL`.

You can copy [.env.example](/Users/nguoididay/Projects/Personal%20projects/haiku/.env.example#L1) to `.env` and adjust values as needed.

## Install the dependencies
```bash
brew install node@24

# if needed, make node@24 the active version in your shell
brew link --overwrite --force node@24

npm install
```

If you prefer `nvm`, install and use Node `24` before running `npm install`.

### Start the app in development mode (hot-code reloading, error reporting, etc.)
```bash
npm run dev
```

### Start the API server
```bash
npm run dev:server
```

By default the backend expects Postgres at:

```bash
postgresql://postgres:postgres@localhost:5432/haiku
```

Override with `DATABASE_URL` or the individual `PG*` variables in `.env`.

In local development, Quasar dev server now proxies `/api` requests to `http://localhost:4000` by default.
It also proxies `/media/*` to the same backend so local image paths behave like production.
If your backend runs elsewhere, set `API_PROXY_TARGET` (and optionally `MEDIA_PROXY_TARGET`) before `npm run dev`.

### Lint the files
```bash
yarn lint
# or
npm run lint
```


### Format the files
```bash
yarn format
# or
npm run format
```



### Build the app for production
```bash
npm run build
```

### Run full stack with Docker
```bash
docker compose up --build
```

This starts:
- the Node app on `http://localhost:4000`
- PostgreSQL with a persistent Docker volume

The app serves both `/api/*` and the built SPA from the same service.

## S3 + CloudFront + Lightsail
This repo is now prepared for the deployment shape:

- frontend static build on S3
- CloudFront in front of the site
- `/api/*` forwarded by CloudFront to the Node app on Lightsail
- `/media/*` optionally forwarded to the same Node app while local seeded assets still exist

Recommended runtime settings:

```bash
VITE_API_BASE=/api
VITE_MEDIA_BASE=/media/local
MEDIA_ROUTE_PREFIX=/media
```

Recommended CloudFront behaviors:

- `Default (*)` -> S3 origin
- `/api/*` -> Lightsail origin
- `/media/*` -> Lightsail origin while local fallback media is still served by Express

For CloudFront-backed media, point `VITE_MEDIA_BASE` directly at the CDN origin, for example `https://dxxxxxxxx.cloudfront.net`, and keep seeded local fallback only for development.

This keeps the browser on a single origin such as `https://haiku.othuoc.com` when desired, while still allowing media to move to a CDN later without changing frontend code.

## Data model
The longer-term content schema is documented in [docs/data-model.md](/Users/nguoididay/Projects/Personal%20projects/haiku/docs/data-model.md#L1).

### Customize the configuration
See [Configuring quasar.config file](https://quasar.dev/quasar-cli-vite/quasar-config-js).



aws cloudfront create-invalidation \
  --distribution-id EP23DSG9TP2CV \                
  --paths "/*"
