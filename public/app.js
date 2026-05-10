/* ── DOM refs ────────────────────────────────────────────────── */
const storeSelect    = document.getElementById("storeSelect");
const skuSelect      = document.getElementById("skuSelect");
const channelSelect  = document.getElementById("channelSelect");
const promptInput    = document.getElementById("promptInput");
const runAgentBtn    = document.getElementById("runAgentBtn");
const checkOpsBtn    = document.getElementById("checkOpsBtn");
const metricsEl      = document.getElementById("metrics");
const agentMessageEl = document.getElementById("agentMessage");
const recommendationsEl = document.getElementById("recommendations");
const traceEl        = document.getElementById("trace");
const analyticsCardsEl = document.getElementById("analyticsCards");

/* ── Shared fetch helper ─────────────────────────────────────── */
async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || "Request failed");
  }
  return res.json();
}

function optionNode(value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

/* ── Tab switching ───────────────────────────────────────────── */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "analytics") loadAnalytics();
  });
});

/* ── Agent playground ────────────────────────────────────────── */
function renderMetricCards(data) {
  const items = [
    { label: "Inventory", value: `${data.inventory.quantity} units`, status: data.inventory.status },
    { label: "Promo Price", value: `$${data.pricing?.promo ?? "n/a"}`, status: data.channel },
    { label: "Channel", value: data.channel, status: "live" },
    { label: "Store", value: data.store.city, status: data.store.id.replace("store-", "") }
  ];
  metricsEl.innerHTML = "";
  items.forEach((m) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `<span class="metric-label">${m.label}</span><div class="metric-value">${m.value}</div><div class="status ${m.status}">${m.status}</div>`;
    metricsEl.appendChild(card);
  });
}

function renderTrace(trace) {
  traceEl.innerHTML = "";
  trace.forEach((step, i) => {
    const node = document.createElement("article");
    node.className = "trace-step";
    node.style.animationDelay = `${i * 120}ms`;
    node.innerHTML = `<strong>${step.layer}</strong> — ${step.event} (${step.latencyMs}ms)`;
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

function renderAnalyticsCards(summary) {
  const cards = [
    { label: "Today Orders", value: summary.todayOrders.toLocaleString() },
    { label: "Online Orders", value: `${summary.onlineOrdersPct}%` },
    { label: "Same-Day Pickup", value: `${summary.sameDayPickupPct}%` },
    { label: "Stockout Risk SKUs", value: summary.stockoutRiskSkus.length }
  ];
  analyticsCardsEl.innerHTML = "";
  cards.forEach((c) => {
    const node = document.createElement("div");
    node.className = "analytics-card";
    node.innerHTML = `<span class="analytics-label">${c.label}</span><div class="analytics-value">${c.value}</div>`;
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
  runAgentBtn.textContent = "Thinking…";
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
  } catch (err) {
    agentMessageEl.textContent = err.message;
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
    agentMessageEl.textContent = `${inventory.product.name}: ${inventory.quantity} units in ${inventory.store.name}. ${channel} promo $${pricing.pricing.promo}.`;
    renderMetricCards({ inventory, pricing: pricing.pricing, channel, store: inventory.store });
  } catch (err) {
    agentMessageEl.textContent = err.message;
  }
}

runAgentBtn.addEventListener("click", runAgent);
checkOpsBtn.addEventListener("click", quickOpsCheck);

/* ── Analytics Dashboard ─────────────────────────────────────── */
const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

let analyticsLoaded = false;

async function loadAnalytics() {
  if (analyticsLoaded) return;
  analyticsLoaded = true;
  try {
    const [summary, charts] = await Promise.all([
      fetchJson("/api/analytics/summary"),
      fetchJson("/api/analytics/charts")
    ]);
    renderKpis(summary, charts);
    renderOrdersChart(charts.dailyOrders);
    renderRevenueChart(charts.revenueByChannel);
    renderInventoryChart(charts);
    renderForecastChart(charts.demandForecast);
    renderStockoutTable(charts.stockoutRisk);
  } catch (err) {
    document.getElementById("kpiRow").textContent = `Error loading analytics: ${err.message}`;
  }
}

function renderKpis(summary, charts) {
  const total = Object.values(charts.revenueByChannel).reduce((a, b) => a + b, 0);
  const kpis = [
    { label: "Today's Orders", value: summary.todayOrders.toLocaleString(), sub: "All channels" },
    { label: "Total Revenue", value: `$${(total / 1000).toFixed(0)}K`, sub: "Online + In-Store + Pickup" },
    { label: "Online Share", value: `${summary.onlineOrdersPct}%`, sub: "of total orders" },
    { label: "Same-Day Pickup", value: `${summary.sameDayPickupPct}%`, sub: "of in-store orders" },
    { label: "Stockout Risk", value: summary.stockoutRiskSkus.length, sub: "SKUs flagged by BigQuery" }
  ];
  const row = document.getElementById("kpiRow");
  row.innerHTML = "";
  kpis.forEach((k) => {
    const card = document.createElement("div");
    card.className = "kpi-card";
    card.innerHTML = `<div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub">${k.sub}</div>`;
    row.appendChild(card);
  });
}

function renderOrdersChart(dailyOrders) {
  destroyChart("ordersChart");
  chartInstances.ordersChart = new Chart(document.getElementById("ordersChart"), {
    type: "line",
    data: {
      labels: dailyOrders.map((d) => d.day),
      datasets: [
        {
          label: "Online",
          data: dailyOrders.map((d) => d.online),
          borderColor: "#007a78",
          backgroundColor: "rgba(0,122,120,0.12)",
          tension: 0.4,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: "#007a78"
        },
        {
          label: "In-Store",
          data: dailyOrders.map((d) => d.instore),
          borderColor: "#f26b3a",
          backgroundColor: "rgba(242,107,58,0.1)",
          tension: 0.4,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: "#f26b3a"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderRevenueChart(revenueByChannel) {
  destroyChart("revenueChart");
  chartInstances.revenueChart = new Chart(document.getElementById("revenueChart"), {
    type: "doughnut",
    data: {
      labels: ["Online", "In-Store", "Pickup"],
      datasets: [{
        data: [revenueByChannel.online, revenueByChannel.instore, revenueByChannel.pickup],
        backgroundColor: ["#007a78", "#f26b3a", "#c6f16f"],
        borderColor: ["#005856", "#c04820", "#8abf30"],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => ` $${ctx.raw.toLocaleString()}`
          }
        }
      }
    }
  });
}

function renderInventoryChart(charts) {
  destroyChart("inventoryChart");
  const STORE_COLORS = ["#007a78", "#f26b3a", "#c6f16f"];
  chartInstances.inventoryChart = new Chart(document.getElementById("inventoryChart"), {
    type: "bar",
    data: {
      labels: charts.products,
      datasets: charts.inventoryChart.map((storeData, i) => ({
        label: storeData.store,
        data: storeData.quantities,
        backgroundColor: STORE_COLORS[i] + "cc",
        borderColor: STORE_COLORS[i],
        borderWidth: 2,
        borderRadius: 6
      }))
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "Units" } } }
    }
  });
}

function renderForecastChart(demandForecast) {
  destroyChart("forecastChart");
  chartInstances.forecastChart = new Chart(document.getElementById("forecastChart"), {
    type: "bar",
    data: {
      labels: demandForecast.map((d) => d.name),
      datasets: [{
        label: "Forecast Delta (%)",
        data: demandForecast.map((d) => d.forecastDelta),
        backgroundColor: demandForecast.map((d) =>
          d.forecastDelta >= 15 ? "#b11f34cc" : d.forecastDelta >= 10 ? "#c7721bcc" : "#007a78cc"
        ),
        borderRadius: 8,
        borderWidth: 2,
        borderColor: "#2d4f46"
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, title: { display: true, text: "% demand increase next 7 days" } } }
    }
  });
}

function renderStockoutTable(stockoutRisk) {
  const el = document.getElementById("stockoutTable");
  if (!stockoutRisk.length) {
    el.innerHTML = "<p>No stockout risks flagged.</p>";
    return;
  }
  el.innerHTML = stockoutRisk.map((r) => `
    <div class="stockout-row">
      <span class="sku-name">${r.name}</span>
      <span class="sku-stock">${r.totalStock} units total</span>
    </div>
  `).join("");
}

/* ── Chatbot ─────────────────────────────────────────────────── */
const chatFab      = document.getElementById("chatFab");
const chatPanel    = document.getElementById("chatPanel");
const chatClose    = document.getElementById("chatClose");
const chatMessages = document.getElementById("chatMessages");
const chatForm     = document.getElementById("chatForm");
const chatInput    = document.getElementById("chatInput");
const chatTyping   = document.getElementById("chatTyping");
const chatModeBadge = document.getElementById("chatModeBadge");

let chatHistory = [];

function setChatModeBadge(source) {
  const mode = source === "llm" ? "llm" : source === "fallback" ? "fallback" : "unknown";
  chatModeBadge.textContent = mode;
  chatModeBadge.className = `chat-mode-badge ${mode}`;
}

function toggleChat() {
  const open = chatPanel.classList.toggle("open");
  chatPanel.setAttribute("aria-hidden", String(!open));
  if (open) chatInput.focus();
}

chatFab.addEventListener("click", toggleChat);
chatClose.addEventListener("click", toggleChat);

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function appendMessage(role, text, ts, suggestions) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-msg ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrapper.appendChild(bubble);

  if (ts) {
    const time = document.createElement("div");
    time.className = "chat-ts";
    time.textContent = formatTime(ts);
    wrapper.appendChild(time);
  }

  if (suggestions && suggestions.length) {
    const row = document.createElement("div");
    row.className = "chat-suggestions";
    suggestions.forEach((s) => {
      const btn = document.createElement("button");
      btn.className = "suggestion";
      btn.textContent = s;
      btn.addEventListener("click", () => sendChatMessage(s));
      row.appendChild(btn);
    });
    wrapper.appendChild(row);
  }

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChatMessage(text) {
  const msg = (text || chatInput.value).trim();
  if (!msg) return;
  chatInput.value = "";

  appendMessage("user", msg, new Date().toISOString());
  chatHistory.push({ role: "user", content: msg });

  chatTyping.style.display = "flex";
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const data = await fetchJson("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, history: chatHistory.slice(-6) })
    });
    chatTyping.style.display = "none";
    setChatModeBadge(data.source);
    appendMessage("agent", data.reply, data.timestamp, data.suggestions);
    chatHistory.push({ role: "agent", content: data.reply });
  } catch (err) {
    chatTyping.style.display = "none";
    setChatModeBadge("unknown");
    appendMessage("agent", `Error: ${err.message}`, new Date().toISOString());
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendChatMessage();
});

// Wire initial suggestion buttons
document.querySelectorAll("#initSuggestions .suggestion").forEach((btn) => {
  btn.addEventListener("click", () => sendChatMessage(btn.textContent));
});

/* ── Bootstrap ───────────────────────────────────────────────── */
async function bootstrap() {
  try {
    const [storesRes, productsRes, analytics] = await Promise.all([
      fetchJson("/api/stores"),
      fetchJson("/api/products"),
      fetchJson("/api/analytics/summary")
    ]);
      storeSelect.innerHTML = "";
      skuSelect.innerHTML = "";
      storesRes.stores.forEach((s) =>
      storeSelect.appendChild(optionNode(s.id, `${s.name} (${s.city})`))
    );
    productsRes.products.forEach((p) =>
      skuSelect.appendChild(optionNode(p.sku, `${p.name} — ${p.sku}`))
    );
    renderAnalyticsCards(analytics);
    await runAgent();
  } catch (err) {
    agentMessageEl.textContent = `Bootstrap error: ${err.message}`;
  }
}

bootstrap();
setChatModeBadge("fallback");
