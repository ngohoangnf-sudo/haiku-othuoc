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

## Production deployment

This project is currently deployed with three subdomains:

- `haiku.othuoc.space` for the frontend SPA
- `media.othuoc.space` for uploaded and migrated media
- `api.othuoc.space` for the backend API

Recommended production shape:

- frontend static build on S3
- CloudFront in front of the frontend bucket
- media bucket on S3
- CloudFront in front of the media bucket
- Node API on a Lightsail Ubuntu instance
- PostgreSQL self-hosted on the same Lightsail instance

### DNS and TLS

The current DNS provider can stay on Namecheap. There is no need to move DNS to Route 53 just to deploy.

Recommended certificate strategy:

- request one ACM certificate in `us-east-1`
- include both:
  - `othuoc.space`
  - `*.othuoc.space`

That certificate can then be attached to CloudFront distributions that serve:

- `haiku.othuoc.space`
- `media.othuoc.space`

Notes:

- `*.othuoc.space` covers `haiku.othuoc.space`, `media.othuoc.space`, and `api.othuoc.space`
- it does not cover deeper names such as `www.haiku.othuoc.space`
- with ACM DNS validation, `othuoc.space` and `*.othuoc.space` may share the same CNAME validation record; that is expected

In Namecheap, CloudFront subdomains should normally be created as `CNAME` records:

- `haiku` -> `dxxxxxxxxxxxx.cloudfront.net`
- `media` -> `dyyyyyyyyyyyy.cloudfront.net`

The API subdomain should point to the Lightsail static IP:

- `api` -> `A record` -> Lightsail static IP

### S3 and CloudFront

Recommended buckets:

- one bucket for the frontend build
- one bucket for media

Recommended distributions:

- one CloudFront distribution for the frontend bucket
- one CloudFront distribution for the media bucket

This split is not strictly required, but it keeps frontend deploys and media caching separate:

- frontend files need frequent invalidation and careful handling of `index.html`
- media files can usually be cached for much longer

#### Frontend distribution

Set:

- alternate domain name: `haiku.othuoc.space`
- custom SSL certificate: the ACM certificate created in `us-east-1`
- default root object: `index.html`

Because this app uses Vue Router history mode, configure custom error responses:

- `403` -> `/index.html` with response code `200`
- `404` -> `/index.html` with response code `200`

This is required so routes such as `/authors/basho` or `/essays?kind=research` still load after a refresh.

#### Media distribution

Set:

- alternate domain name: `media.othuoc.space`
- custom SSL certificate: the same ACM certificate

### Frontend build

Frontend runtime base URLs come from [src/utils/runtime.js](/Users/nguoididay/Projects/Personal%20projects/haiku/src/utils/runtime.js#L1).

For production, use:

```bash
VITE_API_BASE=https://api.othuoc.space/api
VITE_MEDIA_BASE=https://media.othuoc.space
```

An example production file:

```bash
# .env.production
VITE_API_BASE=https://api.othuoc.space/api
VITE_MEDIA_BASE=https://media.othuoc.space
```

Build:

```bash
npm run build
```

Output is written to:

```bash
dist/spa
```

To upload the frontend build:

```bash
aws s3 sync dist/spa s3://haiku-othuoc --delete
```

Then invalidate CloudFront:

```bash
aws cloudfront create-invalidation \
  --distribution-id EP23DSG9TP2CV \
  --paths "/*"
```

`create-invalidation` is required because CloudFront may still serve cached copies of `index.html` and old bundles even after S3 has the new build.

### Lightsail instance

Recommended instance:

- Ubuntu `24.04 LTS`
- `2 GB RAM / 2 vCPU / 60 GB SSD`

Attach a static IP and open ports:

- `22`
- `80`
- `443`

Do not expose PostgreSQL publicly.

### Automated database backup

If you want daily PostgreSQL backups from the production server into the same S3 bucket that serves the frontend, do not upload into the bucket root. Use a separate prefix such as:

```bash
ops/db-backups/
```

This repo now includes:

- [scripts/backup_prod_db_to_s3.sh](/Users/nguoididay/Projects/Personal%20projects/haiku/scripts/backup_prod_db_to_s3.sh)
- [scripts/install_prod_db_backup_cron.sh](/Users/nguoididay/Projects/Personal%20projects/haiku/scripts/install_prod_db_backup_cron.sh)

Required environment variables on the production server:

```bash
DB_BACKUP_S3_BUCKET=YOUR_FRONTEND_BUCKET
DB_BACKUP_S3_PREFIX=ops/db-backups
DB_BACKUP_LOCAL_DIR=/tmp/haiku-db-backups
DB_BACKUP_KEEP_LOCAL=false
DB_BACKUP_CRON_TZ=Asia/Ho_Chi_Minh
```

The backup script:

- loads env from `.env` by default
- creates a `pg_dump -Fc` backup
- uploads it to `s3://$DB_BACKUP_S3_BUCKET/$DB_BACKUP_S3_PREFIX/YYYY/MM/...`
- removes the local dump after upload unless `DB_BACKUP_KEEP_LOCAL=true`

To install the daily `00:00 Asia/Ho_Chi_Minh` cron job on the server:

```bash
chmod +x scripts/backup_prod_db_to_s3.sh scripts/install_prod_db_backup_cron.sh
./scripts/install_prod_db_backup_cron.sh
```

The installer writes this kind of cron entry:

```bash
0 0 * * * TZ=Asia/Ho_Chi_Minh ENV_FILE="/path/to/app/.env" /usr/bin/env bash "/path/to/app/scripts/backup_prod_db_to_s3.sh" >> "/path/to/app/logs/db-backup.log" 2>&1
```

You can test the backup manually before trusting cron:

```bash
ENV_FILE=/path/to/app/.env ./scripts/backup_prod_db_to_s3.sh
```

### SSH

Typical SSH command:

```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-1.pem ubuntu@YOUR_LIGHTSAIL_STATIC_IP
```

If SSH reports `UNPROTECTED PRIVATE KEY FILE`, tighten the key permissions first:

```bash
chmod 600 ~/.ssh/LightsailDefaultKey-ap-southeast-1.pem
```

### Base packages

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git unzip build-essential
```

### Node.js

Use Node `22.x` in production.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### PM2

Install PM2 globally:

```bash
sudo npm install -g pm2
```

Run the API:

```bash
cd /var/www/haiku-othuoc
pm2 start server/index.js --name haiku-api
pm2 save
pm2 startup
```

After `pm2 startup`, PM2 prints one more `sudo ...` command. Run that command once so the process restarts with the server.

Useful PM2 commands:

```bash
pm2 list
pm2 logs haiku-api --lines 100
pm2 restart haiku-api
pm2 restart haiku-api --update-env
pm2 stop haiku-api
pm2 delete haiku-api
```

### PostgreSQL

Install PostgreSQL:

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl status postgresql
```

Create a production role and database:

```bash
sudo -u postgres psql
```

Then in `psql`:

```sql
CREATE ROLE haiku_app LOGIN PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE haiku OWNER haiku_app;
\q
```

### Caddy reverse proxy

Install Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Recommended `/etc/caddy/Caddyfile`:

```caddy
api.othuoc.space {
  encode zstd gzip

  reverse_proxy 127.0.0.1:4000

  header {
    X-Content-Type-Options nosniff
    X-Frame-Options SAMEORIGIN
    Referrer-Policy strict-origin-when-cross-origin
  }

  log {
    output file /var/log/caddy/api.othuoc.space.log
    format console
  }
}
```

Format, validate, and reload:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

If `api.othuoc.space` already points to the instance, Caddy will automatically request and renew the TLS certificate.

### Backend environment

Create a production environment file on the server, for example `.env` in the app directory:

```bash
NODE_ENV=production
PORT=4000

DATABASE_URL=postgresql://haiku_app:STRONG_PASSWORD@127.0.0.1:5432/haiku
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=haiku
PGUSER=haiku_app
PGPASSWORD=STRONG_PASSWORD

CORS_ORIGIN=https://haiku.othuoc.space
S3_UPLOAD_BUCKET=haiku-media-prod
S3_UPLOAD_REGION=ap-southeast-1
S3_UPLOAD_PREFIX=haiku-image
MEDIA_PUBLIC_BASE=https://media.othuoc.space
MEDIA_UPLOAD_MAX_MB=5
ENABLE_CONTENT_SEED=false

BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=VERY_STRONG_PASSWORD
BOOTSTRAP_ADMIN_DISPLAY_NAME=Administrator

LEGACY_CONTENT_USERNAME=ngohoang
MEDIA_ROUTE_PREFIX=/media
```

The server will log a warning if `BOOTSTRAP_ADMIN_PASSWORD` is still a weak placeholder. Change it before public launch.

### Direct S3 uploads for new media

New cover images and inline essay images can now upload directly to S3 through a presigned upload flow.

Backend route:

- `POST /api/media/presign`

Required backend environment:

- `S3_UPLOAD_BUCKET`
- `S3_UPLOAD_REGION`
- `S3_UPLOAD_PREFIX`
- `MEDIA_PUBLIC_BASE`

This flow requires CORS on the media bucket, because the browser uploads directly to the presigned S3 URL.

Example bucket CORS:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["https://haiku.othuoc.space"],
    "ExposeHeaders": ["ETag"]
  }
]
```

If bucket CORS is missing or too strict, frontend uploads will fail even though presigned URLs are generated correctly.

### Backend health check

When the Node API is running directly:

```bash
curl http://127.0.0.1:4000/api/health
```

Expected response:

```json
{"status":"ok"}
```

After Caddy and DNS are working:

```bash
curl https://api.othuoc.space/api/health
```

### Database migration

The current local setup uses PostgreSQL. A typical local dump command is:

```bash
pg_dump -Fc -d "postgresql://postgres:postgres@127.0.0.1:5433/haiku" -f haiku.dump
```

Restore on the Lightsail instance:

```bash
pg_restore --clean --if-exists --no-owner \
  -h 127.0.0.1 \
  -U haiku_app \
  -d haiku \
  haiku.dump
```

### Seed behavior

The backend contains hardcoded seed content in [server/index.js](/Users/nguoididay/Projects/Personal%20projects/haiku/server/index.js).

Seed execution is now controlled by `ENABLE_CONTENT_SEED`:

- local/dev default: `true`
- production default: `false`

When `ENABLE_CONTENT_SEED=true`, startup runs:

- `seedIfEmpty(seededPosts)`
- `seedPostsIfMissing(supplementalJapaneseSeedPosts)`
- `seedEssaysIfEmpty(SEED_ESSAYS)`

Recommended production setting:

```bash
ENABLE_CONTENT_SEED=false
```

With that setting, restarting the production API will not insert seed poems or essays into the database.

### Media migration

The app currently supports three kinds of media references:

- local paths
- absolute `http/https` URLs
- `data:` URLs

Frontend handling is in [src/utils/runtime.js](/Users/nguoididay/Projects/Personal%20projects/haiku/src/utils/runtime.js#L1). Absolute URLs already work without additional code changes.

Recommended production migration:

1. upload existing local media files to the media S3 bucket
2. keep a stable key structure
3. update `media_assets.source` to point at `https://media.othuoc.space/...`

After that, the frontend will load migrated media directly from the media CDN.

Note: newly inserted images in the editor are still not uploaded to S3 automatically. Inline essay images currently use `data:` URLs in [src/components/RichEssayEditor.vue](/Users/nguoididay/Projects/Personal%20projects/haiku/src/components/RichEssayEditor.vue#L1). A later improvement should replace this with an S3 upload flow using presigned URLs.

### Deployment checklist

1. Request ACM certificate in `us-east-1`
2. Add DNS validation records in Namecheap
3. Create S3 buckets
4. Create CloudFront distributions
5. Point `haiku.othuoc.space` and `media.othuoc.space` to CloudFront
6. Build and upload frontend
7. Create Lightsail instance and static IP
8. Point `api.othuoc.space` to Lightsail
9. Install Node, PostgreSQL, PM2, and Caddy
10. Deploy backend code and environment
11. Restore PostgreSQL dump
12. Migrate local media to S3
13. Validate:
    - frontend loads
    - SPA refresh works
    - login works
    - API health works
    - media loads from `media.othuoc.space`

## Data model
The longer-term content schema is documented in [docs/data-model.md](/Users/nguoididay/Projects/Personal%20projects/haiku/docs/data-model.md#L1).

### Customize the configuration
See [Configuring quasar.config file](https://quasar.dev/quasar-cli-vite/quasar-config-js).
