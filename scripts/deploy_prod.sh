#!/usr/bin/env bash

set -Eeuo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-${APP_ROOT}/.env.deploy}"

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf 'Deploy failed: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_env() {
  local var_name="$1"
  [[ -n "${!var_name:-}" ]] || fail "Missing required variable in ${DEPLOY_ENV_FILE}: ${var_name}"
}

is_true() {
  [[ "${1:-}" == "true" ]]
}

validate_safe_token() {
  local name="$1"
  local value="$2"
  [[ "$value" =~ ^[a-zA-Z0-9._/-]+$ ]] || fail "${name} contains unsupported characters"
}

validate_boolean() {
  local name="$1"
  local value="$2"
  [[ "$value" == "true" || "$value" == "false" ]] || fail "${name} must be true or false"
}

trap 'printf "Deploy failed near line %s.\n" "$LINENO" >&2' ERR

[[ -f "$DEPLOY_ENV_FILE" ]] || fail "Missing ${DEPLOY_ENV_FILE}. Copy .env.deploy.example first."

set -a
# shellcheck disable=SC1090
source "$DEPLOY_ENV_FILE"
set +a

DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_BACKEND="${DEPLOY_BACKEND:-true}"
DEPLOY_FRONTEND="${DEPLOY_FRONTEND:-true}"
DEPLOY_DB_BACKUP="${DEPLOY_DB_BACKUP:-true}"
DEPLOY_SSH_USER="${DEPLOY_SSH_USER:-ubuntu}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_REMOTE_APP_DIR="${DEPLOY_REMOTE_APP_DIR:-/var/www/haiku-othuoc}"
DEPLOY_PM2_APP_NAME="${DEPLOY_PM2_APP_NAME:-haiku-api}"
DEPLOY_REMOTE_HEALTH_URL="${DEPLOY_REMOTE_HEALTH_URL:-http://127.0.0.1:4000/api/health}"
FRONTEND_S3_PROTECTED_PREFIXES="${FRONTEND_S3_PROTECTED_PREFIXES:-ops}"
CLOUDFRONT_WAIT="${CLOUDFRONT_WAIT:-true}"

validate_boolean DEPLOY_BACKEND "$DEPLOY_BACKEND"
validate_boolean DEPLOY_FRONTEND "$DEPLOY_FRONTEND"
validate_boolean DEPLOY_DB_BACKUP "$DEPLOY_DB_BACKUP"
validate_boolean CLOUDFRONT_WAIT "$CLOUDFRONT_WAIT"
if ! is_true "$DEPLOY_BACKEND" && ! is_true "$DEPLOY_FRONTEND"; then
  fail "At least one of DEPLOY_BACKEND or DEPLOY_FRONTEND must be true"
fi

require_command git
require_command npm
require_command curl

if is_true "$DEPLOY_BACKEND"; then
  require_command ssh
  require_env DEPLOY_SSH_HOST
  require_env DEPLOY_SSH_KEY
  [[ -f "$DEPLOY_SSH_KEY" ]] || fail "SSH key not found: ${DEPLOY_SSH_KEY}"
fi

if is_true "$DEPLOY_FRONTEND"; then
  require_command aws
  require_env FRONTEND_S3_BUCKET
  require_env CLOUDFRONT_DISTRIBUTION_ID
fi

validate_safe_token DEPLOY_REMOTE "$DEPLOY_REMOTE"
validate_safe_token DEPLOY_BRANCH "$DEPLOY_BRANCH"

cd "$APP_ROOT"

dirty_paths=""
while IFS= read -r status_line; do
  path="${status_line:3}"
  case "$path" in
    .claude/worktrees/*) ;;
    *) dirty_paths+="${status_line}"$'\n' ;;
  esac
done < <(git status --porcelain --untracked-files=all)

if [[ -n "$dirty_paths" ]]; then
  printf '%s' "$dirty_paths" >&2
  fail "Working tree is not clean. Commit and push these changes before deploying."
fi

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$DEPLOY_BRANCH" ]] || fail "Current branch is ${current_branch}, expected ${DEPLOY_BRANCH}"

log "Checking pushed revision"
git fetch --quiet "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"
local_revision="$(git rev-parse HEAD)"
remote_revision="$(git rev-parse "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}")"
[[ "$local_revision" == "$remote_revision" ]] || fail "Local HEAD has not been pushed to ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
printf 'Deploying %s (%s)\n' "$DEPLOY_BRANCH" "${local_revision:0:12}"

log "Installing dependencies and verifying build"
npm ci
npm run lint
npm run build

if is_true "$DEPLOY_BACKEND"; then
  validate_safe_token DEPLOY_SSH_USER "$DEPLOY_SSH_USER"
  validate_safe_token DEPLOY_REMOTE_APP_DIR "$DEPLOY_REMOTE_APP_DIR"
  validate_safe_token DEPLOY_PM2_APP_NAME "$DEPLOY_PM2_APP_NAME"
  [[ "$DEPLOY_REMOTE_APP_DIR" == /* ]] || fail "DEPLOY_REMOTE_APP_DIR must be an absolute path"
  [[ "$DEPLOY_SSH_PORT" =~ ^[0-9]+$ ]] || fail "DEPLOY_SSH_PORT must be numeric"
  [[ "$DEPLOY_REMOTE_HEALTH_URL" =~ ^https?://[a-zA-Z0-9.:/_-]+$ ]] || fail "Invalid DEPLOY_REMOTE_HEALTH_URL"

  ssh_args=(
    -i "$DEPLOY_SSH_KEY"
    -p "$DEPLOY_SSH_PORT"
    -o BatchMode=yes
    -o ConnectTimeout=15
    -o StrictHostKeyChecking=accept-new
  )

  log "Deploying backend"
  ssh "${ssh_args[@]}" "${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}" \
    "bash -s -- ${DEPLOY_REMOTE_APP_DIR} ${DEPLOY_REMOTE} ${DEPLOY_BRANCH} ${DEPLOY_PM2_APP_NAME} ${DEPLOY_DB_BACKUP} ${DEPLOY_REMOTE_HEALTH_URL}" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

app_dir="$1"
git_remote="$2"
git_branch="$3"
pm2_app_name="$4"
backup_database="$5"
health_url="$6"

cd "$app_dir"

if [[ "$backup_database" == "true" ]]; then
  [[ -x scripts/backup_prod_db_to_s3.sh ]] || {
    echo "Database backup script is missing or not executable." >&2
    exit 1
  }
  ENV_FILE="${app_dir}/.env" scripts/backup_prod_db_to_s3.sh
fi

git fetch "$git_remote" "$git_branch"
git checkout "$git_branch"
git merge --ff-only "${git_remote}/${git_branch}"
npm ci --omit=dev

pm2 describe "$pm2_app_name" >/dev/null
pm2 restart "$pm2_app_name" --update-env

for attempt in {1..20}; do
  if curl --fail --silent --show-error "$health_url" >/dev/null; then
    echo "Backend health check passed."
    exit 0
  fi
  sleep 1
done

echo "Backend health check failed after restart." >&2
pm2 logs "$pm2_app_name" --nostream --lines 40 >&2 || true
exit 1
REMOTE_SCRIPT
fi

if is_true "$DEPLOY_FRONTEND"; then
  aws_command=(aws)
  if [[ -n "${AWS_PROFILE:-}" ]]; then
    aws_command+=(--profile "$AWS_PROFILE")
  else
    unset AWS_PROFILE
  fi
  [[ -n "${AWS_REGION:-}" ]] && aws_command+=(--region "$AWS_REGION")

  s3_excludes=()
  for protected_prefix in $FRONTEND_S3_PROTECTED_PREFIXES; do
    protected_prefix="${protected_prefix#/}"
    protected_prefix="${protected_prefix%/}"
    [[ -z "$protected_prefix" ]] && continue
    validate_safe_token FRONTEND_S3_PROTECTED_PREFIXES "$protected_prefix"
    s3_excludes+=(--exclude "${protected_prefix}/*")
  done

  log "Uploading frontend to S3"
  "${aws_command[@]}" s3 sync dist/spa "s3://${FRONTEND_S3_BUCKET}" \
    --delete \
    --only-show-errors \
    "${s3_excludes[@]}"

  log "Invalidating CloudFront"
  invalidation_id="$(
    "${aws_command[@]}" cloudfront create-invalidation \
      --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
      --paths '/*' \
      --query 'Invalidation.Id' \
      --output text
  )"
  printf 'CloudFront invalidation: %s\n' "$invalidation_id"

  if is_true "$CLOUDFRONT_WAIT"; then
    "${aws_command[@]}" cloudfront wait invalidation-completed \
      --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
      --id "$invalidation_id"
  fi

  if [[ -n "${FRONTEND_HEALTH_URL:-}" ]]; then
    curl --fail --silent --show-error --head "$FRONTEND_HEALTH_URL" >/dev/null
  fi
fi

log "Production deploy completed"
