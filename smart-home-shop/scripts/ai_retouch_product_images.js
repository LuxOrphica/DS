const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const { initSchema, listProductsForImageRetouch, updateProductImagesBatch } = require("../db/database");

function parseArgs(argv) {
  const args = {
    limit: 40,
    offset: 0,
    dryRun: false,
    overwrite: false,
    all: false,
    quality: "medium",
    size: "1024x1024",
    onlyRemote: true
  };

  for (const raw of argv) {
    if (!raw) continue;
    if (/^\d+$/.test(raw)) args.limit = Number(raw);
    else if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--overwrite") args.overwrite = true;
    else if (raw === "--all") args.all = true;
    else if (raw === "--include-local") args.onlyRemote = false;
    else if (raw.startsWith("--offset=")) args.offset = Number(raw.split("=")[1] || 0);
    else if (raw.startsWith("--quality=")) args.quality = String(raw.split("=")[1] || "medium");
    else if (raw.startsWith("--size=")) args.size = String(raw.split("=")[1] || "1024x1024");
  }

  if (args.all) args.limit = 100000;
  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 40;
  if (!Number.isFinite(args.offset) || args.offset < 0) args.offset = 0;
  return args;
}

function sanitizeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || `product-${Date.now()}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getSkillCliPath() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  return path.join(codexHome, "skills", "imagegen", "scripts", "image_gen.py");
}

function detectExt(contentType = "", url = "") {
  const ct = String(contentType).toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  const lowerUrl = String(url).toLowerCase();
  if (lowerUrl.includes(".png")) return "png";
  if (lowerUrl.includes(".webp")) return "webp";
  if (lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg")) return "jpg";
  return "png";
}

async function downloadImage(url, targetPath) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "smart-home-shop/1.0 (+local import script)"
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(targetPath, buffer);
  return response.headers.get("content-type") || "";
}

function runRetouch({ pythonBin, cliPath, inputPath, outputPath, dryRun, quality, size, overwrite }) {
  const prompt =
    "Retouch this product photo for e-commerce catalog. Keep product shape, proportions, labels and colors unchanged. Replace background with clean neutral studio background (#f8fafc to #eef2ff), centered product and soft natural shadow. Remove compression artifacts and improve clarity. No extra objects, no extra text, no watermark.";

  const args = [
    cliPath,
    "edit",
    "--image",
    inputPath,
    "--out",
    outputPath,
    "--output-format",
    "png",
    "--quality",
    quality,
    "--size",
    size,
    "--input-fidelity",
    "high",
    "--prompt",
    prompt,
    "--constraints",
    "change only visual quality and background; keep product identity and geometry unchanged",
    "--negative",
    "no altered labels, no new logos, no heavy glow, no oversharpening, no extra objects",
    "--force"
  ];

  if (dryRun) args.push("--dry-run");
  if (!overwrite) {
    // keep --force because CLI may treat existing output as conflict; we gate by file presence before run
  }

  const result = spawnSync(pythonBin, args, {
    stdio: "pipe",
    encoding: "utf8"
  });

  return {
    ok: result.status === 0,
    code: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim()
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const pythonBin = process.env.PYTHON_BIN || "python";
  const cliPath = getSkillCliPath();
  const projectRoot = path.join(__dirname, "..");
  const rawDir = path.join(projectRoot, "tmp", "imagegen", "raw");
  const outDir = path.join(projectRoot, "public", "media", "products", "ai");
  const manifestPath = path.join(projectRoot, "data", "import", "ai-retouch-report.json");

  initSchema();
  ensureDir(rawDir);
  ensureDir(outDir);
  ensureDir(path.dirname(manifestPath));

  if (!fs.existsSync(cliPath)) {
    throw new Error(`image_gen.py not found: ${cliPath}`);
  }

  if (!args.dryRun && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Run with --dry-run or set API key.");
  }

  const rows = listProductsForImageRetouch({
    limit: args.limit,
    offset: args.offset,
    onlyRemote: args.onlyRemote
  });
  if (!rows.length) {
    console.log("No products for processing.");
    return;
  }

  console.log(`Retouch queue: ${rows.length} items`);

  const updates = [];
  const report = [];
  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const row of rows) {
    const safeId = sanitizeId(row.id);
    const outputName = `${safeId}.png`;
    const outputPath = path.join(outDir, outputName);
    const publicImagePath = `/media/products/ai/${outputName}`;

    if (!args.overwrite && fs.existsSync(outputPath)) {
      updates.push({ id: row.id, image: publicImagePath });
      report.push({ id: row.id, status: "skipped-existing", output: publicImagePath });
      skipCount += 1;
      continue;
    }

    try {
      const ext = detectExt("", row.image);
      const inputPath = path.join(rawDir, `${safeId}.${ext}`);
      const contentType = await downloadImage(row.image, inputPath);
      const stableInputPath = path.join(rawDir, `${safeId}.${detectExt(contentType, row.image)}`);
      if (stableInputPath !== inputPath) {
        fs.renameSync(inputPath, stableInputPath);
      }

      const result = runRetouch({
        pythonBin,
        cliPath,
        inputPath: stableInputPath,
        outputPath,
        dryRun: args.dryRun,
        quality: args.quality,
        size: args.size,
        overwrite: args.overwrite
      });

      if (!result.ok) {
        failCount += 1;
        report.push({
          id: row.id,
          status: "failed",
          error: result.stderr || result.stdout || `exit ${result.code}`
        });
        console.error(`[FAIL] ${row.id}: ${result.stderr || result.stdout || `exit ${result.code}`}`);
        continue;
      }

      if (!args.dryRun && !fs.existsSync(outputPath)) {
        failCount += 1;
        report.push({ id: row.id, status: "failed", error: "output image missing after retouch" });
        console.error(`[FAIL] ${row.id}: output image missing`);
        continue;
      }

      okCount += 1;
      report.push({ id: row.id, status: args.dryRun ? "dry-run-ok" : "ok", output: publicImagePath });
      if (!args.dryRun) {
        updates.push({ id: row.id, image: publicImagePath });
      }
      console.log(`[OK] ${row.id} -> ${publicImagePath}`);
    } catch (err) {
      failCount += 1;
      const error = err && err.message ? err.message : String(err);
      report.push({ id: row.id, status: "failed", error });
      console.error(`[FAIL] ${row.id}: ${error}`);
    }
  }

  if (!args.dryRun && updates.length > 0) {
    updateProductImagesBatch(updates);
  }

  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        settings: args,
        totals: {
          queued: rows.length,
          ok: okCount,
          skipped: skipCount,
          failed: failCount,
          dbUpdated: args.dryRun ? 0 : updates.length
        },
        items: report
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `Done: queued=${rows.length}, ok=${okCount}, skipped=${skipCount}, failed=${failCount}, dbUpdated=${
      args.dryRun ? 0 : updates.length
    }`
  );
  console.log(`Report: ${manifestPath}`);
}

run().catch((err) => {
  console.error("Retouch pipeline failed:", err.message || err);
  process.exit(1);
});
