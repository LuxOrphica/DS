const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { normalizeBrand, normalizeCategory, normalizeProtocolValue, normalizeMetricValue } = require("../db/normalization");

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
      // keep polling while the server boots
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
    port,
    baseUrl: `http://127.0.0.1:${port}`
  };
}

test("normalization helpers normalize common catalog values", () => {
  assert.equal(normalizeBrand("wiren board"), "Wiren Board");
  assert.equal(normalizeCategory("Безопасность"), "Безопасность и доступ");
  assert.equal(normalizeCategory("audio / multiroom"), "Аудио и мультимедиа");
  assert.equal(normalizeProtocolValue("modbus; rs 485;Wi fi"), "Modbus, RS-485, Wi-Fi");
  assert.equal(normalizeMetricValue("power", "120 вт"), "120 W");
});

test("server health endpoint responds with ok", async (t) => {
  const { baseUrl } = await startServer(t, { DISABLE_ADMIN_AUTH: "1" });
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.ok(String(res.headers.get("x-request-id") || "").length > 0);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("admin routes require bearer token by default", async (t) => {
  const token = "test-admin-token";
  const { baseUrl } = await startServer(t, { ADMIN_TOKEN: token });

  const unauthorized = await fetch(`${baseUrl}/api/admin/brands`);
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${baseUrl}/api/admin/brands`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(authorized.status, 200);
});

test("public orders lookup returns masked PII only", async (t) => {
  const { baseUrl } = await startServer(t, { DISABLE_ADMIN_AUTH: "1" });
  const query = "ORD-";
  const res = await fetch(`${baseUrl}/api/orders/lookup?query=${encodeURIComponent(query)}&limit=5`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  const row = Array.isArray(json.rows) && json.rows.length > 0 ? json.rows[0] : null;
  if (!row) return;

  assert.equal(typeof row.customerPhoneMasked, "string");
  assert.equal(typeof row.customerEmailMasked, "string");
  assert.equal(typeof row.customerAddressMasked, "string");
  assert.equal("customerPhone" in row, false);
  assert.equal("customerEmail" in row, false);
  assert.equal("customerAddress" in row, false);
});

test("public orders lookup finds order by normalized phone formats", async (t) => {
  const { baseUrl } = await startServer(t, { DISABLE_ADMIN_AUTH: "1" });

  const createRes = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customer: {
        name: "Phone Lookup Test",
        phone: "+7 (999) 123-45-67",
        address: "Test Street 1",
        email: "lookup-test@example.com"
      },
      items: [{ id: "prd-test", name: "Test Item", article: "T-1", qty: 1, price: 1000, image: "" }],
      total: 1000,
      paymentMethod: "sbp",
      deliveryComment: ""
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.ok, true);
  assert.equal(typeof created.orderId, "string");
  assert.ok(created.orderId.startsWith("ORD-"));

  const lookupRes = await fetch(
    `${baseUrl}/api/orders/lookup?query=${encodeURIComponent("89991234567")}&limit=20`
  );
  assert.equal(lookupRes.status, 200);
  const lookup = await lookupRes.json();
  assert.equal(lookup.ok, true);
  assert.ok(Array.isArray(lookup.rows));
  assert.ok(lookup.rows.some((row) => row && row.id === created.orderId));
});

test("public orders endpoint rejects invalid payloads before database write", async (t) => {
  const { baseUrl } = await startServer(t, { DISABLE_ADMIN_AUTH: "1" });

  const missingCustomerRes = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customer: { name: "", phone: "+7 999", address: "Test Street 1" },
      items: [{ id: "prd-invalid", name: "Invalid Item", qty: 1, price: 100 }],
      total: 100
    })
  });
  assert.equal(missingCustomerRes.status, 400);
  const missingCustomerJson = await missingCustomerRes.json();
  assert.equal(missingCustomerJson.ok, false);
  assert.match(String(missingCustomerJson.error || ""), /customer\.name/i);

  const badQtyRes = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customer: {
        name: "Bad Qty Test",
        phone: "+7 (999) 123-45-67",
        address: "Test Street 1"
      },
      items: [{ id: "prd-invalid", name: "Invalid Item", qty: 0, price: 100 }],
      total: 100
    })
  });
  assert.equal(badQtyRes.status, 400);
  const badQtyJson = await badQtyRes.json();
  assert.equal(badQtyJson.ok, false);
  assert.match(String(badQtyJson.error || ""), /items\.0\.qty/i);
});

test("public personal cabinet endpoint returns orders by stored ids", async (t) => {
  const { baseUrl } = await startServer(t, { DISABLE_ADMIN_AUTH: "1" });

  const createRes = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customer: {
        name: "Cabinet Test",
        phone: "+7 (901) 111-22-33",
        address: "Cabinet Street 1",
        email: "cabinet-test@example.com"
      },
      items: [{ id: "prd-cabinet", name: "Cabinet Item", article: "C-1", qty: 1, price: 777, image: "" }],
      total: 777,
      paymentMethod: "sbp",
      deliveryComment: ""
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.ok, true);
  assert.ok(String(created.orderId || "").startsWith("ORD-"));

  const mineRes = await fetch(
    `${baseUrl}/api/orders/mine?ids=${encodeURIComponent(created.orderId)}&limit=20`
  );
  assert.equal(mineRes.status, 200);
  const mine = await mineRes.json();
  assert.equal(mine.ok, true);
  assert.ok(Array.isArray(mine.rows));
  assert.ok(mine.rows.some((row) => row && row.id === created.orderId));
});

test("cors blocks disallowed origins in production mode", async (t) => {
  const { baseUrl } = await startServer(t, {
    NODE_ENV: "production",
    CORS_ALLOWED_ORIGINS: "https://allowed.example",
    DISABLE_ADMIN_AUTH: "1"
  });

  const denied = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: "https://blocked.example" }
  });
  assert.equal(denied.status, 403);

  const allowed = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: "https://allowed.example" }
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://allowed.example");
});
