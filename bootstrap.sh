#!/usr/bin/env bash
# bootstrap.sh — One-command setup for local dev and GKE deployment
# Usage:
#   Local:  ./bootstrap.sh local
#   GKE:    ./bootstrap.sh gke
set -euo pipefail

MODE="${1:-local}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[bootstrap]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }

#───────────────────────────────────────────────────────────────────────────────
# LOCAL MODE
#───────────────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "local" ]]; then
  log "Installing Node.js dependencies..."
  npm ci

  if lsof -i :3000 -t &>/dev/null 2>&1; then
    warn "Port 3000 already in use. Killing existing process..."
    kill -9 "$(lsof -i :3000 -t)" 2>/dev/null || true
    sleep 1
  fi

  log "Starting server on http://localhost:3000 ..."
  NODE_ENV=development node server.js &

  sleep 2
  if curl -sf http://localhost:3000/healthz >/dev/null; then
    ok "Server is up at http://localhost:3000"
  else
    echo "Server did not start. Check server.js for errors."
    exit 1
  fi

  ok "Done. Open http://localhost:3000 in your browser."
  wait
fi

#───────────────────────────────────────────────────────────────────────────────
# GKE MODE
#───────────────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "gke" ]]; then
  #--- required env vars ---
  : "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
  : "${GAR_LOCATION:?Set GAR_LOCATION (e.g. us-central1)}"
  : "${GAR_REPOSITORY:?Set GAR_REPOSITORY}"
  : "${GKE_CLUSTER:?Set GKE_CLUSTER}"
  : "${GKE_LOCATION:?Set GKE_LOCATION}"

  IMAGE_URI="$GAR_LOCATION-docker.pkg.dev/$GCP_PROJECT_ID/$GAR_REPOSITORY/unify-retail-agent"
  SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
  FULL_IMAGE="$IMAGE_URI:$SHA"

  log "Building Docker image → $FULL_IMAGE"
  docker build -t "$FULL_IMAGE" -t "$IMAGE_URI:latest" .

  log "Pushing image to Artifact Registry..."
  docker push --all-tags "$IMAGE_URI"

  log "Fetching GKE credentials..."
  gcloud container clusters get-credentials "$GKE_CLUSTER" \
    --location "$GKE_LOCATION" --project "$GCP_PROJECT_ID"

  log "Applying Kubernetes manifests..."
  kubectl apply -f k8s/namespace.yaml
  kubectl apply -n unify-retail -f k8s/serviceaccount.yaml
  kubectl apply -n unify-retail -f k8s/configmap.yaml
  kubectl apply -n unify-retail -f k8s/service.yaml
  kubectl apply -n unify-retail -f k8s/hpa.yaml
  kubectl apply -n unify-retail -f k8s/pdb.yaml
  kubectl apply -n unify-retail -f k8s/networkpolicy.yaml
  kubectl apply -n unify-retail -f k8s/ingress.yaml
  kubectl apply -n unify-retail -f k8s/deployment.yaml

  log "Setting image to $FULL_IMAGE ..."
  kubectl set image deployment/unify-retail-agent app="$FULL_IMAGE" -n unify-retail

  log "Waiting for rollout..."
  kubectl rollout status deployment/unify-retail-agent -n unify-retail --timeout=180s

  log "Current resources in namespace 'unify-retail':"
  kubectl get deploy,svc,hpa,pdb,ingress -n unify-retail

  ok "Deployed successfully. Check the ingress IP above."
fi
