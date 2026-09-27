#!/bin/sh
# One-time Google Cloud setup for ORQ8 on Cloud Run.
# Run AFTER `gcloud auth login` + `gcloud config set project PROJECT_ID`.
# Creates the Artifact Registry, the build service account grants, and the
# empty Secret Manager entries (values are filled in with the commands printed
# at the end). Idempotent: safe to re-run.
set -e

PROJECT_ID="$(gcloud config get-value project 2>/dev/null)"
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
  echo "No project set. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

read -r -p "Region [europe-west1]: " REGION
REGION="${REGION:-europe-west1}"

echo "== 1. Enable APIs =="
gcloud services enable cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

echo "== 2. Artifact Registry repo =="
gcloud artifacts repositories create orq8 \
  --repository-format=docker --location="$REGION" 2>/dev/null \
  && echo "created" || echo "already exists"

echo "== 3. Cloud Build service account grants =="
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" --role="roles/run.admin" --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" --role="roles/iam.serviceAccountUser" --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" --role="roles/artifactregistry.writer" --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor" --quiet >/dev/null
echo "grants done"

echo "== 4. Secret Manager entries (empty; fill values next) =="
for s in orq8-database-url orq8-session-secret orq8-encryption-key orq8-encryption-key-kid orq8-internal-token orq8-resend-api-key; do
  if gcloud secrets describe "$s" >/dev/null 2>&1; then
    echo "  $s: exists"
  else
    printf '' | gcloud secrets create "$s" --data-file=- >/dev/null && echo "  $s: created"
  fi
done

cat <<EOF

== Next: fill the secret values ==
gcloud secrets versions add orq8-database-url    --data-file=<(printf '%s' 'postgres://USER:PASSWORD@HOST:5432/orq8')
gcloud secrets versions add orq8-session-secret  --data-file=<(printf '%s' '$(openssl rand -base64 32)')
gcloud secrets versions add orq8-encryption-key  --data-file=<(printf '%s' '$(openssl rand -base64 32)')
gcloud secrets versions add orq8-encryption-key-kid --data-file=<(printf '%s' 'v1')
gcloud secrets versions add orq8-internal-token  --data-file=<(printf '%s' '$(openssl rand -base64 32)')

Then deploy:
  gcloud builds submit --config infra/cloudrun/api.cloudbuild.yaml
  # note the API URL it prints, then:
  gcloud builds submit --config infra/cloudrun/web.cloudbuild.yaml
EOF
