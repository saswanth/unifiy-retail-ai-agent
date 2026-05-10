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

const dailyOrders = [
  { day: "Mon", online: 1842, instore: 1123 },
  { day: "Tue", online: 2103, instore: 987 },
  { day: "Wed", online: 1967, instore: 1201 },
  { day: "Thu", online: 2341, instore: 1089 },
  { day: "Fri", online: 2876, instore: 1432 },
  { day: "Sat", online: 3102, instore: 2341 },
  { day: "Sun", online: 2489, instore: 1998 }
];

const revenueByChannel = { online: 487200, instore: 312800, pickup: 98400 };

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

app.get("/api/analytics/charts", (req, res) => {
  const inventoryChart = stores.map((store) => ({
    store: store.name,
    storeId: store.id,
    quantities: products.map((p) => inventoryByStore[store.id][p.sku])
  }));

  const demandForecast = products.map((p) => ({
    name: p.name,
    sku: p.sku,
    signal: analyticsSummary.demandSignal[p.sku],
    forecastDelta: p.sku === "SKU-ULTRA-001" ? 12 : p.sku === "SKU-COZY-002" ? 7 : 19,
    totalStock: Object.values(inventoryByStore).reduce((sum, s) => sum + (s[p.sku] || 0), 0)
  }));

  res.json({
    dailyOrders,
    revenueByChannel,
    products: products.map((p) => p.name),
    inventoryChart,
    demandForecast,
    stockoutRisk: analyticsSummary.stockoutRiskSkus.map((sku) => ({
      sku,
      name: getProduct(sku)?.name,
      totalStock: Object.values(inventoryByStore).reduce((sum, s) => sum + (s[sku] || 0), 0)
    }))
  });
});

app.post("/api/chat", (req, res) => {
  const { message = "", history = [] } = req.body || {};
  const intent = parseIntent(message);
  const lc = message.toLowerCase();

  let reply = "";
  let suggestions = [];

  if (lc.match(/^h(i|ello|ey)/)) {
    reply = "Hello! I'm the Unify Retail AI Agent. I can help with inventory, pricing parity, demand forecasts, and analytics across online and in-store channels. What would you like to explore?";
    suggestions = ["Check inventory levels", "Show pricing parity", "Demand forecast", "Order analytics"];
  } else if (intent === "inventory") {
    const rows = stores.map((store) => {
      const lines = products.map((p) => `  • ${p.name}: ${inventoryByStore[store.id][p.sku]} units`).join("\n");
      return `${store.name}:\n${lines}`;
    }).join("\n\n");
    reply = `Current inventory snapshot across all stores:\n\n${rows}\n\nStockout risk flagged for: ${analyticsSummary.stockoutRiskSkus.map((s) => getProduct(s)?.name).join(", ")}.`;
    suggestions = ["Which store has lowest stock?", "Show demand forecast", "Check pricing parity"];
  } else if (intent === "pricing") {
    const rows = products.map((p) => {
      const on = pricingByChannel.online[p.sku];
      const ins = pricingByChannel.instore[p.sku];
      const gap = Math.abs(on.promo - ins.promo);
      return `${p.name}\n  Online: $${on.promo} (${on.promoLabel})\n  In-Store: $${ins.promo} (${ins.promoLabel})\n  Gap: $${gap}`;
    }).join("\n\n");
    reply = `Pricing parity check across channels:\n\n${rows}\n\nRecommendation: Unify promo rules through a single Apigee-managed pricing API to eliminate gaps.`;
    suggestions = ["How do I fix price gaps?", "Check inventory levels", "Show order analytics"];
  } else if (intent === "forecast") {
    const rows = products.map((p) => {
      const total = Object.values(inventoryByStore).reduce((sum, s) => sum + (s[p.sku] || 0), 0);
      return `${p.name}: ${analyticsSummary.demandSignal[p.sku]}, total stock ${total} units`;
    }).join("\n");
    reply = `Demand forecast from BigQuery model:\n\n${rows}\n\nUrgent: Smart Aroma Diffuser shows +19% demand — consider pre-positioning stock from NYC to SFO.`;
    suggestions = ["Which SKU needs urgent replenishment?", "Show inventory by store", "Pricing check"];
  } else if (lc.includes("analytic") || lc.includes("order") || lc.includes("revenue") || lc.includes("sales")) {
    const totalRevenue = Object.values(revenueByChannel).reduce((a, b) => a + b, 0);
    reply = `Today's unified commerce summary:\n\n• Total orders: ${analyticsSummary.todayOrders.toLocaleString()}\n• Online share: ${analyticsSummary.onlineOrdersPct}%\n• Same-day pickup: ${analyticsSummary.sameDayPickupPct}%\n• Total revenue: $${totalRevenue.toLocaleString()}\n• Stockout risk SKUs: ${analyticsSummary.stockoutRiskSkus.length}\n\nAll transactions stream into BigQuery via Pub/Sub for real-time supply chain analytics.`;
    suggestions = ["Show inventory", "Check pricing", "Demand forecast"];
  } else if (lc.includes("store") || lc.includes("location")) {
    const storeList = stores.map((s) => `• ${s.name} (${s.city})`).join("\n");
    reply = `Active retail locations:\n\n${storeList}\n\nAll stores share a unified inventory pool through Cloud Spanner, queried via Apigee.`;
    suggestions = ["Check inventory by store", "Compare store performance", "Show forecasts"];
  } else if (lc.includes("recommend") || lc.includes("suggest") || lc.includes("what should")) {
    reply = `Top AI recommendations right now:\n\n1. Pre-position Smart Aroma Diffuser stock — +19% demand spike expected.\n2. Align online/in-store promo metadata through a single Apigee pricing API.\n3. Reserve in-store pickup inventory in Cloud Spanner to avoid overselling.\n4. Scale GKE order microservice ahead of Friday–Saturday peak traffic.\n5. Retrain BigQuery demand model with this week's transaction data.`;
    suggestions = ["Show full inventory", "View pricing gaps", "See analytics dashboard"];
  } else {
    const prevTopics = history.slice(-3).map((h) => h.content).join(" ").toLowerCase();
    if (prevTopics.includes("inventory")) {
      reply = "Would you like to drill into a specific store or SKU? I can break down stock levels, flag low inventory, or show demand signals for any product.";
      suggestions = ["Show NYC inventory", "Check SKU-HOME-003 levels", "Show demand forecast"];
    } else {
      reply = "I can help you with:\n\n• **Inventory** — real-time stock by store and SKU\n• **Pricing** — channel parity and promo alignment\n• **Forecasting** — demand signals and replenishment urgency\n• **Analytics** — orders, revenue, and supply chain KPIs\n• **Recommendations** — AI-driven action items\n\nWhat would you like to explore?";
      suggestions = ["Check inventory", "Show pricing parity", "Demand forecast", "Order analytics"];
    }
  }

  res.json({ reply, suggestions, intent, timestamp: new Date().toISOString() });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Unify Retail AI Agent running on http://localhost:${PORT}`);
});
