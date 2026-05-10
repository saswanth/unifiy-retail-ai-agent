const storeSelect = document.getElementById("storeSelect");
const skuSelect = document.getElementById("skuSelect");
const channelSelect = document.getElementById("channelSelect");
const promptInput = document.getElementById("promptInput");
const runAgentBtn = document.getElementById("runAgentBtn");
const checkOpsBtn = document.getElementById("checkOpsBtn");

const metricsEl = document.getElementById("metrics");
const agentMessageEl = document.getElementById("agentMessage");
const recommendationsEl = document.getElementById("recommendations");
const traceEl = document.getElementById("trace");
const analyticsCardsEl = document.getElementById("analyticsCards");

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Request failed");
  }
  return response.json();
}

function optionNode(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function renderMetricCards(data) {
  const metrics = [
    { label: "Inventory", value: `${data.inventory.quantity} units`, status: data.inventory.status },
    {
      label: "Promo Price",
      value: `$${data.pricing?.promo ?? "n/a"}`,
      status: data.channel
    },
    { label: "Channel", value: data.channel, status: "live" },
    {
      label: "Store",
      value: data.store.city,
      status: data.store.id.replace("store-", "")
    }
  ];

  metricsEl.innerHTML = "";
  metrics.forEach((metric) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `
      <span class="metric-label">${metric.label}</span>
      <div class="metric-value">${metric.value}</div>
      <div class="status ${metric.status}">${metric.status}</div>
    `;
    metricsEl.appendChild(card);
  });
}

function renderTrace(trace) {
  traceEl.innerHTML = "";
  trace.forEach((step, index) => {
    const node = document.createElement("article");
    node.className = "trace-step";
    node.style.animationDelay = `${index * 120}ms`;
    node.innerHTML = `<strong>${step.layer}</strong> - ${step.event} (${step.latencyMs}ms)`;
    traceEl.appendChild(node);
  });
}

function renderRecommendations(items) {
  recommendationsEl.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    recommendationsEl.appendChild(li);
  });
}

function renderAnalytics(summary) {
  const cards = [
    { label: "Today Orders", value: summary.todayOrders.toLocaleString() },
    { label: "Online Orders", value: `${summary.onlineOrdersPct}%` },
    { label: "Same-Day Pickup", value: `${summary.sameDayPickupPct}%` },
    { label: "Stockout Risk SKUs", value: summary.stockoutRiskSkus.length }
  ];

  analyticsCardsEl.innerHTML = "";
  cards.forEach((card) => {
    const node = document.createElement("div");
    node.className = "analytics-card";
    node.innerHTML = `
      <span class="analytics-label">${card.label}</span>
      <div class="analytics-value">${card.value}</div>
    `;
    analyticsCardsEl.appendChild(node);
  });
}

async function runAgent() {
  const payload = {
    prompt: promptInput.value.trim() || "Give me a unified commerce overview",
    storeId: storeSelect.value,
    sku: skuSelect.value,
    channel: channelSelect.value
  };

  runAgentBtn.disabled = true;
  runAgentBtn.textContent = "Thinking...";

  try {
    const data = await fetchJson("/api/agent/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    agentMessageEl.textContent = data.message;
    renderRecommendations(data.recommendations || []);
    renderTrace(data.architectureTrace || []);
    renderMetricCards(data.context);
  } catch (error) {
    agentMessageEl.textContent = error.message;
  } finally {
    runAgentBtn.disabled = false;
    runAgentBtn.textContent = "Run AI Agent";
  }
}

async function quickOpsCheck() {
  const storeId = storeSelect.value;
  const sku = skuSelect.value;
  const channel = channelSelect.value;

  try {
    const [inventory, pricing] = await Promise.all([
      fetchJson(`/api/inventory?storeId=${encodeURIComponent(storeId)}&sku=${encodeURIComponent(sku)}`),
      fetchJson(`/api/pricing?channel=${encodeURIComponent(channel)}&sku=${encodeURIComponent(sku)}`)
    ]);

    const msg = `${inventory.product.name}: ${inventory.quantity} units in ${inventory.store.name}. ${channel} promo $${pricing.pricing.promo}.`;
    agentMessageEl.textContent = msg;
    renderMetricCards({
      inventory,
      pricing: pricing.pricing,
      channel,
      store: inventory.store
    });
  } catch (error) {
    agentMessageEl.textContent = error.message;
  }
}

async function bootstrap() {
  try {
    const [storesRes, productsRes, analytics] = await Promise.all([
      fetchJson("/api/stores"),
      fetchJson("/api/products"),
      fetchJson("/api/analytics/summary")
    ]);

    storesRes.stores.forEach((store) => {
      storeSelect.appendChild(optionNode(store.id, `${store.name} (${store.city})`));
    });

    productsRes.products.forEach((product) => {
      skuSelect.appendChild(optionNode(product.sku, `${product.name} - ${product.sku}`));
    });

    renderAnalytics(analytics);
    await runAgent();
  } catch (error) {
    agentMessageEl.textContent = `Bootstrap error: ${error.message}`;
  }
}

runAgentBtn.addEventListener("click", runAgent);
checkOpsBtn.addEventListener("click", quickOpsCheck);

bootstrap();
