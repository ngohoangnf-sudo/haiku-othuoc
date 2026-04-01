#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_ROOT/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_env() {
  local var_name="$1"
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: $var_name" >&2
    exit 1
  fi
}

require_command pg_dump
require_command aws
require_command hostname
require_command date

require_env DB_BACKUP_S3_BUCKET

DB_BACKUP_S3_PREFIX="${DB_BACKUP_S3_PREFIX:-ops/db-backups}"
DB_BACKUP_LOCAL_DIR="${DB_BACKUP_LOCAL_DIR:-/tmp/haiku-db-backups}"
DB_BACKUP_KEEP_LOCAL="${DB_BACKUP_KEEP_LOCAL:-false}"

mkdir -p "$DB_BACKUP_LOCAL_DIR"

timestamp="$(date '+%Y-%m-%dT%H-%M-%S')"
year_month="$(date '+%Y/%m')"
host_name="$(hostname -s | tr -cs '[:alnum:]._-@' '-')"
file_name="haiku-${host_name}-${timestamp}.dump"
local_file="${DB_BACKUP_LOCAL_DIR%/}/${file_name}"
s3_key="${DB_BACKUP_S3_PREFIX%/}/${year_month}/${file_name}"

echo "Creating PostgreSQL backup at ${local_file}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --file="$local_file" \
    "$DATABASE_URL"
else
  require_env PGHOST
  require_env PGPORT
  require_env PGDATABASE
  require_env PGUSER
  require_env PGPASSWORD

  PGPASSWORD="$PGPASSWORD" pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --host="$PGHOST" \
    --port="$PGPORT" \
    --username="$PGUSER" \
    --dbname="$PGDATABASE" \
    --file="$local_file"
fi

echo "Uploading backup to s3://${DB_BACKUP_S3_BUCKET}/${s3_key}"
aws s3 cp "$local_file" "s3://${DB_BACKUP_S3_BUCKET}/${s3_key}" --only-show-errors

echo "Backup uploaded successfully."

if [[ "$DB_BACKUP_KEEP_LOCAL" != "true" ]]; then
  rm -f "$local_file"
  echo "Removed local backup file."
fi

