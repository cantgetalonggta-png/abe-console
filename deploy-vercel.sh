#!/usr/bin/env bash
set -euo pipefail

# Deploy abe-console to Vercel (Echo scope).
# Usage:
#   VERCEL_TOKEN=your-token ./deploy-vercel.sh
# If VERCEL_TOKEN is unset, falls back to interactive `vercel login`.

if ! command -v vercel >/dev/null 2>&1; then
  echo "Error: Vercel CLI is not installed or not on PATH." >&2
  echo "Install: npm install --global vercel" >&2
  exit 1
fi

if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  vercel_args=(--token "$VERCEL_TOKEN")
else
  vercel login
  vercel_args=()
fi

SCOPE="${VERCEL_SCOPE:-echo-ec69}"
PROJECT="${VERCEL_PROJECT:-abe-console}"

echo "Linking project=$PROJECT scope=$SCOPE"
vercel "${vercel_args[@]}" --scope "$SCOPE" link --yes --project "$PROJECT" \
  || vercel "${vercel_args[@]}" --scope "$SCOPE" link --yes

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  if [[ -f package.json ]]; then
    npm ci
    npm run build
  fi
fi

echo "Deploying production (prebuilt if .vercel/output exists)"
if [[ -d .vercel/output ]]; then
  vercel "${vercel_args[@]}" --scope "$SCOPE" deploy --prebuilt --prod --yes
else
  vercel "${vercel_args[@]}" --scope "$SCOPE" deploy --prod --yes
fi
