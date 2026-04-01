#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_SCRIPT="${APP_ROOT}/scripts/backup_prod_db_to_s3.sh"
ENV_FILE="${ENV_FILE:-${APP_ROOT}/.env}"
LOG_DIR="${DB_BACKUP_LOG_DIR:-${APP_ROOT}/logs}"
LOG_FILE="${DB_BACKUP_LOG_FILE:-${LOG_DIR}/db-backup.log}"
CRON_TZ_VALUE="${DB_BACKUP_CRON_TZ:-Asia/Ho_Chi_Minh}"
CRON_MARKER="# haiku-db-backup"
CRON_LINE="0 0 * * * TZ=${CRON_TZ_VALUE} ENV_FILE=\"${ENV_FILE}\" /usr/bin/env bash \"${BACKUP_SCRIPT}\" >> \"${LOG_FILE}\" 2>&1 ${CRON_MARKER}"

mkdir -p "$LOG_DIR"

current_crontab="$(crontab -l 2>/dev/null || true)"
filtered_crontab="$(printf '%s\n' "$current_crontab" | grep -vF "$CRON_MARKER" || true)"

{
  printf '%s\n' "$filtered_crontab" | sed '/^[[:space:]]*$/d'
  printf '%s\n' "$CRON_LINE"
} | crontab -

echo "Installed cron job:"
echo "$CRON_LINE"

