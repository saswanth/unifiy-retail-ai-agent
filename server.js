const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/readyz", (req, res) => {
  res.status(200).json({ status: "ready" });
});

const stores = [
  { id: "store-nyc", name: "New York Flagship", city: "New York" },
  { id: "store-sfo", name: "San Francisco Market", city: "San Francisco" },
  { id: "store-aus", name: "Austin Downtown", city: "Austin" }
];

const products = [
  { sku: "SKU-ULTRA-001", name: "Ultra Running Shoes", category: "Footwear" },
  { sku: "SKU-COZY-002", name: "Cozy Knit Hoodie", category: "Apparel" },
  { sku: "SKU-HOME-003", name: "Smart Aroma Diffuser", category: "Home" }
];

const inventoryByStore = {
  "store-nyc": {
    "SKU-ULTRA-001": 46,
    "SKU-COZY-002": 12,
    "SKU-HOME-003": 31
  },
  "store-sfo": {
    "SKU-ULTRA-001": 18,
    "SKU-COZY-002": 37,
    "SKU-HOME-003": 8
  },
  "store-aus": {
    "SKU-ULTRA-001": 24,
    "SKU-COZY-002": 29,
    "SKU-HOME-003": 16
  }
};

const pricingByChannel = {
  online: {
    "SKU-ULTRA-001": { list: 129, promo: 109, promoLabel: "Online Flash -15%" },
    "SKU-COZY-002": { list: 89, promo: 79, promoLabel: "Spring Bundle" },
    "SKU-HOME-003": { list: 119, promo: 99, promoLabel: "Weekend Sale" }
  },
  instore: {
    "SKU-ULTRA-001": { list: 129, promo: 115, promoLabel: "Store Loyalty Offer" },
    "SKU-COZY-002": { list: 89, promo: 81, promoLabel: "In-Store Member Price" },
    "SKU-HOME-003": { list: 119, promo: 102, promoLabel: "Store Pickup Special" }
  }
};

const analyticsSummary = {
  todayOrders: 12493,
  onlineOrdersPct: 62,
  sameDayPickupPct: 28,
  stockoutRiskSkus: ["SKU-HOME-003", "SKU-COZY-002"],
  demandSignal: {
    "SKU-ULTRA-001": "+12% next 7 days",
    "SKU-COZY-002": "+7% next 7 days",
    "SKU-HOME-003": "+19% next 7 days"
  }
};

function getProduct(sku) {
  return products.find((p) => p.sku === sku);
}

function inventoryLookup(storeId, sku) {
  const storeInventory = inventoryByStore[storeId] || {};
  const quantity = storeInventory[sku] ?? 0;
  const status = quantity > 20 ? "healthy" : quantity > 8 ? "watch" : "critical";

  return { quantity, status };
}

function pricingLookup(channel, sku) {
  const key = channel === "instore" ? "instore" : "online";
  return pricingByChannel[key][sku] || null;
}

function buildArchitectureTrace(intent) {
  const base = [
    {
      layer: "Cloud CDN",
      event: "Static storefront assets served from edge cache",
      latencyMs: 22
    },
    {
      layer: "GKE",
      event: "Autoscaled ecommerce microservice handles request",
      latencyMs: 36
    },
    {
      layer: "Apigee",
      event: "Secured API policy checks and routing",
      latencyMs: 18
    },
    {
      layer: "Cloud Spanner",
      event: "Store-level operational data read/write",
      latencyMs: 41
    },
    {
      layer: "BigQuery",
      event: "Transaction stream lands for analytics and forecasting",
      latencyMs: 55
    }
  ];

  if (intent === "forecast") {
    return base.map((step) => {
      if (step.layer === "BigQuery") {
        return {
          ...step,
          event: "Demand model scores SKU trend and replenishment urgency",
          latencyMs: 62
        };
      }
      return step;
    });
  }

  return base;
}

function parseIntent(prompt) {
  const text = String(prompt || "").toLowerCase();

  if (text.includes("forecast") || text.includes("demand") || text.includes("replenish")) {
    return "forecast";
  }
  if (text.includes("price") || text.includes("promo") || text.includes("discount")) {
    return "pricing";
  }
  if (text.includes("inventory") || text.includes("stock") || text.includes("available")) {
    return "inventory";
  }
  return "overview";
}

app.get("/api/stores", (req, res) => {
  res.json({ stores });
});

app.get("/api/products", (req, res) => {
  res.json({ products });
});

app.get("/api/inventory", (req, res) => {
  const { storeId, sku } = req.query;
  if (!storeId || !sku) {
    return res.status(400).json({ error: "storeId and sku are required" });
  }

  const store = stores.find((s) => s.id === storeId);
  const product = getProduct(sku);

  if (!store || !product) {
    return res.status(404).json({ error: "Store or product not found" });
  }

  const result = inventoryLookup(storeId, sku);
  return res.json({ store, product, ...result });
});

app.get("/api/pricing", (req, res) => {
  const { channel = "online", sku } = req.query;
  if (!sku) {
    return res.status(400).json({ error: "sku is required" });
  }

  const product = getProduct(sku);
  const pricing = pricingLookup(channel, sku);

  if (!product || !pricing) {
    return res.status(404).json({ error: "Pricing not found" });
  }

  return res.json({
    channel,
    product,
    pricing,
    consistencyGap: Math.abs(pricingByChannel.online[sku].promo - pricingByChannel.instore[sku].promo)
  });
});

app.get("/api/analytics/summary", (req, res) => {
  res.json(analyticsSummary);
});

app.post("/api/agent/query", (req, res) => {
  const { prompt, storeId = "store-nyc", sku = "SKU-ULTRA-001", channel = "online" } = req.body || {};
  const intent = parseIntent(prompt);

  const store = stores.find((s) => s.id === storeId) || stores[0];
  const product = getProduct(sku) || products[0];
  const inventory = inventoryLookup(store.id, product.sku);
  const pricing = pricingLookup(channel, product.sku);
  const trace = buildArchitectureTrace(intent);

  let message = "Here is a cross-channel operational snapshot.";
  let recommendations = [
    "Align promo metadata in one source of truth exposed through Apigee.",
    "Use real-time Spanner inventory in both web and store POS flows.",
    "Feed all transactions to BigQuery for daily replenishment decisions."
  ];

  if (intent === "inventory") {
    message = `${product.name} has ${inventory.quantity} units at ${store.name}. Status is ${inventory.status}.`; 
    recommendations = [
      "Enable low-stock alerting when quantity drops below 10.",
      "Expose nearest alternate store inventory in checkout.",
      "Reserve in-store pickup inventory through a shared stock service."
    ];
  }

  if (intent === "pricing") {
    const online = pricingByChannel.online[product.sku].promo;
    const instore = pricingByChannel.instore[product.sku].promo;
    const gap = Math.abs(online - instore);
    message = `${product.name} pricing check: online is $${online}, in-store is $${instore}. Gap is $${gap}.`;
    recommendations = [
      "Publish promotions through one rules engine consumed by both channels.",
      "Apply Apigee policy validation for promo eligibility APIs.",
      "Add channel parity KPI to BigQuery executive dashboard."
    ];
  }

  if (intent === "forecast") {
    const signal = analyticsSummary.demandSignal[product.sku];
    message = `${product.name} demand forecast is ${signal}. Stock in ${store.name} is ${inventory.quantity}.`;
    recommendations = [
      "Trigger pre-emptive store transfer when forecast exceeds local inventory by 20%.",
      "Retrain forecast model nightly from BigQuery incremental data.",
      "Scale GKE order service ahead of projected demand spikes."
    ];
  }

  return res.json({
    prompt,
    intent,
    message,
    context: {
      store,
      product,
      channel,
      inventory,
      pricing
    },
    recommendations,
    architectureTrace: trace,
    timestamp: new Date().toISOString()
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Unify Retail AI Agent running on http://localhost:${PORT}`);
});
