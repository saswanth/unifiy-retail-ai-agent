# bootstrap.ps1 — One-command setup for local dev and GKE deployment
# Usage:
#   Local:  .\bootstrap.ps1 local
#   GKE:    .\bootstrap.ps1 gke
param(
    [ValidateSet("local","gke")]
    [string]$Mode = "local"
)

$ErrorActionPreference = "Stop"

function Log  { Write-Host "[bootstrap] $args" -ForegroundColor Cyan }
function Ok   { Write-Host "[ok] $args"        -ForegroundColor Green }
function Warn { Write-Host "[warn] $args"      -ForegroundColor Yellow }

# ─── LOCAL MODE ──────────────────────────────────────────────────────────────
if ($Mode -eq "local") {
    Log "Installing Node.js dependencies..."
    npm ci

    $occupied = netstat -ano | Select-String ":3000 " | Select-String "LISTENING"
    if ($occupied) {
        Warn "Port 3000 is in use. Attempting to free it..."
        $pid = ($occupied -split "\s+")[-1]
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }

    Log "Starting server on http://localhost:3000 ..."
    $env:NODE_ENV = "development"
    Start-Process node -ArgumentList "server.js" -NoNewWindow

    Start-Sleep -Seconds 2

    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/healthz" -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Ok "Server is up at http://localhost:3000"
            Start-Process "http://localhost:3000"
        }
    } catch {
        Write-Host "Server did not start. Check server.js for errors." -ForegroundColor Red
        exit 1
    }
}

# ─── GKE MODE ────────────────────────────────────────────────────────────────
if ($Mode -eq "gke") {
    # Required — set these before running or they will prompt
    if (-not $env:GCP_PROJECT_ID)  { $env:GCP_PROJECT_ID  = Read-Host "Enter GCP_PROJECT_ID" }
    if (-not $env:GAR_LOCATION)    { $env:GAR_LOCATION    = Read-Host "Enter GAR_LOCATION (e.g. us-central1)" }
    if (-not $env:GAR_REPOSITORY)  { $env:GAR_REPOSITORY  = Read-Host "Enter GAR_REPOSITORY" }
    if (-not $env:GKE_CLUSTER)     { $env:GKE_CLUSTER     = Read-Host "Enter GKE_CLUSTER" }
    if (-not $env:GKE_LOCATION)    { $env:GKE_LOCATION    = Read-Host "Enter GKE_LOCATION" }

    $SHA = (git rev-parse --short HEAD 2>$null) ?? "latest"
    $IMAGE_BASE = "$($env:GAR_LOCATION)-docker.pkg.dev/$($env:GCP_PROJECT_ID)/$($env:GAR_REPOSITORY)/unify-retail-agent"
    $FULL_IMAGE = "${IMAGE_BASE}:${SHA}"

    Log "Building Docker image → $FULL_IMAGE"
    docker build -t $FULL_IMAGE -t "${IMAGE_BASE}:latest" .

    Log "Pushing image to Artifact Registry..."
    docker push $FULL_IMAGE
    docker push "${IMAGE_BASE}:latest"

    Log "Fetching GKE credentials..."
    gcloud container clusters get-credentials $env:GKE_CLUSTER `
        --location $env:GKE_LOCATION --project $env:GCP_PROJECT_ID

    Log "Applying Kubernetes manifests..."
    kubectl apply -f k8s/namespace.yaml
    kubectl apply -n unify-retail -f k8s/serviceaccount.yaml
    kubectl apply -n unify-retail -f k8s/configmap.yaml
    kubectl apply -n unify-retail -f k8s/service.yaml
    kubectl apply -n unify-retail -f k8s/hpa.yaml
    kubectl apply -n unify-retail -f k8s/pdb.yaml
    kubectl apply -n unify-retail -f k8s/networkpolicy.yaml
    kubectl apply -n unify-retail -f k8s/ingress.yaml
    kubectl apply -n unify-retail -f k8s/deployment.yaml

    Log "Setting image to $FULL_IMAGE ..."
    kubectl set image deployment/unify-retail-agent app=$FULL_IMAGE -n unify-retail

    Log "Waiting for rollout..."
    kubectl rollout status deployment/unify-retail-agent -n unify-retail --timeout=180s

    Log "Resources in namespace 'unify-retail':"
    kubectl get deploy,svc,hpa,pdb,ingress -n unify-retail

    Ok "Deployed successfully."
}
