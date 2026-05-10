# Apigee Onboarding Notes

Use [openapi.yaml](openapi.yaml) as the API contract for Apigee proxy creation.

Starter proxy bundle scaffold is available in [apiproxy](apiproxy). Update [apiproxy/targets/default.xml](apiproxy/targets/default.xml) with your GKE ingress host before importing.

## Import Steps

1. Zip the `apiproxy` folder.
2. Import as an API proxy bundle in Apigee.
3. Attach products and developer apps.
4. Deploy to your desired environment.

## Recommended Policies

- API key verification for partner channels
- Spike arrest on high-frequency read APIs:
  - /api/inventory
  - /api/pricing
- Quota policy for consumer apps
- OAuth2 or JWT verification for write/agent APIs
- Response cache for read-mostly metadata endpoints

## Suggested Proxy Design

- Base path: /retail-agent/v1
- Target endpoint: GKE ingress public endpoint
- Separate products by channel type:
  - ecommerce-web
  - instore-pos
  - internal-analytics

## Security and Observability

- Enforce TLS everywhere
- Strip untrusted headers at ingress
- Capture latency and error rates by endpoint
- Export Apigee analytics to BigQuery for trend analysis
