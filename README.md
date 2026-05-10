# Unify Retail AI Agent

An interactive AI-powered demo app to unify online and in-store retail operations in one user-friendly control surface.

It models a real-world architecture where customer traffic flows through edge caching, autoscaled microservices, API management, operational data storage, and analytics.

## Business Challenge Solved

Large retailers often run stores and e-commerce in separate silos. This creates:

- Inconsistent pricing and promotions
- Mismatched inventory visibility
- Slow cross-channel decision-making

This project demonstrates how an AI agent can coordinate these domains and provide actionable recommendations in real time.

## Tech Stack (Blueprint-Aligned)

- Cloud CDN: modeled as edge caching for static storefront delivery
- GKE: modeled as autoscaled ecommerce microservices handling requests
- Apigee: modeled as API governance/policy/routing for inventory and pricing calls
- Cloud Spanner: modeled as operational store-level inventory and transaction data source
- BigQuery: modeled as analytics sink for forecasting and supply chain insights
- Node.js + Express: backend API and AI orchestration layer for this demo
- HTML/CSS/Vanilla JS: responsive interactive UI

## Solution Flow

1. Customer traffic reaches ecommerce experience
2. Cloud CDN serves cached static content quickly
3. GKE microservices process runtime business requests
4. Apigee manages secure inventory/pricing APIs
5. Cloud Spanner stores and serves store-level operational data
6. Events stream into BigQuery for analytics and demand forecasting
7. AI agent returns recommendations and architecture trace in the UI

## Features

- Interactive scenario playground:
  - Store selection
  - Product selection
  - Channel switch (online/in-store)
  - Prompt-based AI query
- AI intent handling:
  - Inventory intent
  - Pricing intent
  - Forecast intent
  - Unified overview intent
- Real-time-like operations panel:
  - Inventory health
  - Promo price visibility
  - Channel context
  - Store context
- BigQuery analytics snapshot cards
- Architecture trace timeline with latency-style steps
- Mobile-friendly responsive layout

## Project Structure

- `server.js`: API server and AI agent orchestration logic
- `public/index.html`: UI layout
- `public/styles.css`: visual design and responsive behavior
- `public/app.js`: frontend logic, API integration, rendering
- `package.json`: scripts and dependencies
- `Dockerfile`: container image definition
- `k8s/deployment.yaml`: GKE deployment with probes and resources
- `k8s/service.yaml`: internal service for the app
- `k8s/hpa.yaml`: autoscaling policy
- `k8s/ingress.yaml`: ingress routing resource
- `k8s/namespace.yaml`: dedicated namespace
- `k8s/configmap.yaml`: non-secret runtime config
- `k8s/secret.example.yaml`: secret template for sensitive values
- `k8s/pdb.yaml`: pod disruption budget
- `k8s/networkpolicy.yaml`: default network constraints
- `k8s/serviceaccount.yaml`: workload identity for pod runtime
- `apigee/openapi.yaml`: Apigee-ready OpenAPI contract
- `.github/workflows/deploy-gke.yml`: CI/CD for image build and GKE deployment

## Quick Start

### Prerequisites

- Node.js 18+ recommended

### Install

```bash
npm install
```

### Run

```bash
npm start
```

App URL:

- <http://localhost:3000>

## Docker

### Build Image

```bash
docker build -t unify-retail-agent:latest .
```

### Run Container

```bash
docker run --rm -p 3000:3000 unify-retail-agent:latest
```

## Kubernetes (GKE)

Create and customize secrets first:

```bash
cp k8s/secret.example.yaml k8s/secret.yaml
```

Then apply manifests:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -n unify-retail -f k8s/serviceaccount.yaml
kubectl apply -n unify-retail -f k8s/configmap.yaml
kubectl apply -n unify-retail -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/pdb.yaml
kubectl apply -f k8s/networkpolicy.yaml
kubectl apply -f k8s/ingress.yaml
```

Verify rollout:

```bash
kubectl get deploy,svc,hpa,pdb,ingress -n unify-retail
```

## GitHub Actions CI/CD

Workflow file: `.github/workflows/deploy-gke.yml`

Required repository secrets:

- `GCP_PROJECT_ID`
- `GAR_LOCATION` (example: `us-central1`)
- `GAR_REPOSITORY`
- `GKE_CLUSTER`
- `GKE_LOCATION`
- `WIF_PROVIDER`
- `WIF_SERVICE_ACCOUNT`

Pipeline behavior:

- Build and push container image to Artifact Registry
- Apply Kubernetes manifests to GKE
- Update deployment image to commit SHA tag
- Wait for rollout status

## Apigee

- Import `apigee/openapi.yaml` to create or bootstrap your API proxy.
- Configure the target endpoint to your GKE ingress URL.
- Add policies (API key, quota, spike arrest, JWT/OAuth) based on consumer type.
- See `apigee/README.md` for recommended policy setup.
- Optional starter proxy bundle exists under `apigee/apiproxy`.

## How to Use

1. Open the app in your browser
2. Choose a store, product, and channel
3. Enter prompts such as:
   - "Check inventory for this SKU"
   - "Are promotions aligned between channels?"
   - "What is the demand forecast and replenishment action?"
4. Click `Run AI Agent`
5. Review:
   - Agent response
   - Recommendations
   - Architecture trace
   - Ops and analytics cards

You can also click `Quick Ops Check` for fast inventory + pricing validation.

## API Endpoints

- `GET /healthz`
- `GET /readyz`
- `GET /api/stores`
- `GET /api/products`
- `GET /api/inventory?storeId=<id>&sku=<sku>`
- `GET /api/pricing?channel=online|instore&sku=<sku>`
- `GET /api/analytics/summary`
- `POST /api/agent/query`

Example request:

```json
{
  "prompt": "Need pricing parity check",
  "storeId": "store-nyc",
  "sku": "SKU-ULTRA-001",
  "channel": "online"
}
```

## Production Upgrade Path (From Demo to Real GCP)

- Replace in-memory store/product datasets with Cloud Spanner tables
- Route APIs through Apigee runtime and policies
- Deploy microservices on GKE with HPA autoscaling
- Push transaction streams into BigQuery via Dataflow/Pub/Sub
- Front static assets with Cloud CDN backed by HTTPS load balancer
- Add model-serving endpoint for advanced demand forecasting and recommendation ranking

## Notes

- This is a working simulation designed to demonstrate architecture behavior and UX.
- It is not yet wired to live GCP resources.

## License

MIT
