const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { spawn } = require("node:child_process");
const path = require("node:path");

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = Number(srv.address().port);
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
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Health check timeout for ${url}`);
}

async function startServer(t, env = {}) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, TURSO_URL: "", TURSO_AUTH_TOKEN: "", PORT: String(port), ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForHealth(`http://127.0.0.1:${port}/api/health`);
  return { baseUrl: `http://127.0.0.1:${port}` };
}

test("public /api/pages lists seeded menu pages", async (t) => {
  const { baseUrl } = await startServer(t);
  const res = await fetch(`${baseUrl}/api/pages`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.pages));
  const slugs = json.pages.map((p) => p.slug);
  for (const expected of ["offer", "privacy", "contacts", "requisites", "design"]) {
    assert.ok(slugs.includes(expected), `menu should include ${expected}`);
  }
  const design = json.pages.find((p) => p.slug === "design");
  assert.equal(design.menuGroup, "main");
});

test("public /api/pages/:slug returns content and 404s for unknown", async (t) => {
  const { baseUrl } = await startServer(t);
  const ok = await fetch(`${baseUrl}/api/pages/offer`);
  assert.equal(ok.status, 200);
  const page = await ok.json();
  assert.equal(page.slug, "offer");
  assert.ok(page.bodyHtml.includes("оферта") || page.bodyHtml.includes("Оферт") || page.bodyHtml.length > 0);

  const missing = await fetch(`${baseUrl}/api/pages/no-such-page-xyz`);
  assert.equal(missing.status, 404);
});

test("seeded design page has clean Cyrillic (no mojibake)", async (t) => {
  const { baseUrl } = await startServer(t);
  const page = await (await fetch(`${baseUrl}/api/pages/design`)).json();
  assert.doesNotMatch(page.bodyHtml, /И\?/, "design body must not contain mojibake");
  assert.match(page.bodyHtml, /Проектируем/);
});

test("admin can create, update and delete a page", async (t) => {
  const token = "pages-admin-token";
  const { baseUrl } = await startServer(t, { ADMIN_TOKEN: token });
  const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

  // create
  const createRes = await fetch(`${baseUrl}/api/admin/pages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ title: "Test Page", slug: "test-page-xyz", bodyHtml: "<p>hi</p>", menuGroup: "aux", sortOrder: 99 })
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()).page;
  assert.equal(created.slug, "test-page-xyz");

  // it shows up in the public menu
  const menu = await (await fetch(`${baseUrl}/api/pages`)).json();
  assert.ok(menu.pages.some((p) => p.slug === "test-page-xyz"));

  // update (hide it)
  const patchRes = await fetch(`${baseUrl}/api/admin/pages/${created.id}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ isVisible: false })
  });
  assert.equal(patchRes.status, 200);
  const afterHide = await (await fetch(`${baseUrl}/api/pages`)).json();
  assert.ok(!afterHide.pages.some((p) => p.slug === "test-page-xyz"), "hidden page must leave the menu");

  // delete (cleanup)
  const delRes = await fetch(`${baseUrl}/api/admin/pages/${created.id}`, { method: "DELETE", headers: auth });
  assert.equal(delRes.status, 200);
});

test("admin pages endpoints require a token", async (t) => {
  const { baseUrl } = await startServer(t, { ADMIN_TOKEN: "secret-xyz" });
  const res = await fetch(`${baseUrl}/api/admin/pages`);
  assert.equal(res.status, 401);
});
