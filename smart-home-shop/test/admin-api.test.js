const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = Number(addr && addr.port);
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

async function waitForHealth(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // keep polling while server starts
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Health check timeout for ${url}`);
}

async function startServer(t, env = {}) {
  const port = await getFreePort();
  const projectRoot = path.join(__dirname, "..");
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: { ...process.env, TURSO_URL: "", TURSO_AUTH_TOKEN: "", PORT: String(port), ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  t.after(() => {
    child.kill("SIGTERM");
  });

  const health = await waitForHealth(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.ok, true, `health payload: ${JSON.stringify(health)}\n${stderr}`);

  return {
    baseUrl: `http://127.0.0.1:${port}`
  };
}

test("admin products endpoint returns list shape for authorized requests", async (t) => {
  const token = "admin-products-token";
  const { baseUrl } = await startServer(t, { ADMIN_TOKEN: token });

  const res = await fetch(`${baseUrl}/api/admin/products?limit=5&offset=0`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.products) || Array.isArray(json.rows));
  assert.equal(typeof json.total, "number");
  assert.equal(typeof json.pagination, "object");
});

test("admin filters endpoint returns linked category->group structure", async (t) => {
  const token = "admin-filters-token";
  const { baseUrl } = await startServer(t, { ADMIN_TOKEN: token });

  const res = await fetch(`${baseUrl}/api/admin/filters`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.categories));
  assert.ok(Array.isArray(json.groups));
  assert.ok(Array.isArray(json.categoryGroups));
  if (json.categoryGroups.length > 0) {
    const first = json.categoryGroups[0];
    assert.equal(typeof first.category, "string");
    assert.ok(Array.isArray(first.groups));
  }
});

test("admin session login sets cookie and authorizes admin API", async (t) => {
  const token = "admin-session-token";
  const { baseUrl } = await startServer(t, { ADMIN_TOKEN: token });

  const loginRes = await fetch(`${baseUrl}/api/admin/session/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token })
  });
  assert.equal(loginRes.status, 200);
  const setCookie = String(loginRes.headers.get("set-cookie") || "");
  assert.match(setCookie, /admin_session=/);
  const cookie = setCookie.split(";")[0];
  const loginJson = await loginRes.json();
  assert.equal(loginJson.ok, true);
  assert.equal(loginJson.authenticated, true);

  const statusRes = await fetch(`${baseUrl}/api/admin/session/status`, {
    headers: { Cookie: cookie }
  });
  assert.equal(statusRes.status, 200);
  const statusJson = await statusRes.json();
  assert.equal(statusJson.authenticated, true);

  const dataRes = await fetch(`${baseUrl}/api/admin/filters`, {
    headers: { Cookie: cookie }
  });
  assert.equal(dataRes.status, 200);

  const logoutRes = await fetch(`${baseUrl}/api/admin/session/logout`, {
    method: "POST",
    headers: { Cookie: cookie }
  });
  assert.equal(logoutRes.status, 200);

  const afterRes = await fetch(`${baseUrl}/api/admin/filters`, {
    headers: { Cookie: cookie }
  });
  assert.equal(afterRes.status, 401);
});

test("admin products filter labels keep readable text (no question-mark placeholders)", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "admin-new.html"), "utf8");
  assert.match(html, /id="variantConflictFilter"/);
  assert.doesNotMatch(html, /<option value="">\?\?\? \?\?\?\?\?\?><\/option>/);
  // Photo/document filters stay; variant/Extra service filters were removed as unused.
  assert.match(html, /value="ph_1"/);
  assert.match(html, /value="ph_0"/);
  assert.match(html, /value="docs_1"/);
  assert.match(html, /value="docs_0"/);
  assert.doesNotMatch(html, /value="var_1"/);
  assert.doesNotMatch(html, /value="hv_1"/);
  assert.doesNotMatch(html, /value="extra_1"/);
  assert.doesNotMatch(html, /РўРѕР»СЊРєРѕ Extra/);
  assert.doesNotMatch(html, /id="hasVariantsFilter"/);
  assert.doesNotMatch(html, /id="hasPhotosFilter"/);
  assert.doesNotMatch(html, /id="docsFilter"/);
  assert.doesNotMatch(html, /id="statusFilter"/);
  assert.doesNotMatch(html, /id="minPriceFilter"/);
  assert.doesNotMatch(html, /id="maxPriceFilter"/);
  assert.match(html, /class="head-filter-btn" data-filter-key="price"/);
  assert.match(html, /id="hfPriceBadge"/);
});

test("admin panel avoids inline event handlers blocked by CSP", () => {
  const root = path.join(__dirname, "..", "public");
  const html = fs.readFileSync(path.join(root, "admin-new.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "admin-new.js"), "utf8");
  const source = `${html}\n${js}`;

  assert.doesNotMatch(source, /\son(?:click|change|input|submit|keydown|keyup)=/i);
  assert.doesNotMatch(source, /javascript:/i);
});

test("admin orders endpoint supports get and patch flow", async (t) => {
  const token = "admin-orders-token";
  const { baseUrl } = await startServer(t, { ADMIN_TOKEN: token });

  const createRes = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customer: {
        name: "Admin Order Test",
        phone: "+7 (999) 555-44-33",
        address: "Admin Test Street 1",
        email: "admin-order-test@example.com"
      },
      items: [{ id: "prd-admin", name: "Admin Item", article: "A-1", qty: 1, price: 3210, image: "" }],
      total: 3210,
      paymentMethod: "sbp",
      deliveryComment: ""
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  const orderId = String(created.orderId || "");
  assert.ok(orderId.startsWith("ORD-"));

  const listRes = await fetch(
    `${baseUrl}/api/admin/orders?search=${encodeURIComponent(orderId)}&limit=20&offset=0`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(listRes.status, 200);
  const listJson = await listRes.json();
  assert.ok(Array.isArray(listJson.rows));
  assert.ok(listJson.rows.some((row) => String(row?.id || "") === orderId));

  const detailRes = await fetch(`${baseUrl}/api/admin/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(detailRes.status, 200);
  const detailJson = await detailRes.json();
  assert.equal(detailJson.success, true);
  assert.equal(detailJson.order.id, orderId);

  const patchRes = await fetch(`${baseUrl}/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      status: "processing",
      paymentStatus: "paid",
      manager: "QA manager"
    })
  });
  assert.equal(patchRes.status, 200);
  const patchJson = await patchRes.json();
  assert.equal(patchJson.success, true);

  const afterRes = await fetch(`${baseUrl}/api/admin/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(afterRes.status, 200);
  const afterJson = await afterRes.json();
  assert.equal(afterJson.order.status, "processing");
  assert.equal(afterJson.order.paymentStatus, "paid");
  assert.equal(afterJson.order.manager, "QA manager");
  assert.ok(Array.isArray(afterJson.order.statusHistory));
  assert.ok(
    afterJson.order.statusHistory.some(
      (entry) => entry && entry.status === "processing" && entry.paymentStatus === "paid"
    )
  );
});

