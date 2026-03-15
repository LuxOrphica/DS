const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");

function parseArgs(argv) {
  const args = {
    limit: 100,
    offset: 0,
    dryRun: false,
    overwrite: false,
    quality: "medium",
    size: "1024x1024",
    pythonBin: process.env.PYTHON_BIN || "python"
  };

  for (const raw of argv) {
    if (!raw) continue;
    if (/^\d+$/.test(raw)) args.limit = Number(raw);
    else if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--overwrite") args.overwrite = true;
    else if (raw.startsWith("--limit=")) args.limit = Number(raw.split("=")[1] || args.limit);
    else if (raw.startsWith("--offset=")) args.offset = Number(raw.split("=")[1] || args.offset);
    else if (raw.startsWith("--quality=")) args.quality = String(raw.split("=")[1] || args.quality);
    else if (raw.startsWith("--size=")) args.size = String(raw.split("=")[1] || args.size);
    else if (raw.startsWith("--python=")) args.pythonBin = String(raw.split("=")[1] || args.pythonBin);
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 100;
  if (!Number.isFinite(args.offset) || args.offset < 0) args.offset = 0;
  return args;
}

function getImageCliPath() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  return path.join(codexHome, "skills", "imagegen", "scripts", "image_gen.py");
}

function safeId(id) {
  return String(id || "")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || `id-${Date.now()}`;
}

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

function runRetouch({
  pythonBin,
  cliPath,
  inputPath,
  outputPath,
  dryRun,
  quality,
  size
}) {
  const prompt =
    "Use case: precise-object-edit. Cleanly enhance this product photo for e-commerce catalog. Keep exact object geometry, materials, labels and colors unchanged. Remove blur/compression artifacts, improve edge clarity, preserve true proportions. Keep neutral background and subtle realistic shadow only. No new objects, no text changes, no watermark.";

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
    "change only image quality and background cleanup; keep product identity and label details unchanged",
    "--negative",
    "no new logos, no shape changes, no style transfer, no extra objects, no watermark",
    "--force"
  ];

  if (dryRun) args.push("--dry-run");

  const run = spawnSync(pythonBin, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe"
  });

  return {
    ok: run.status === 0,
    code: run.status,
    stdout: String(run.stdout || "").trim(),
    stderr: String(run.stderr || "").trim()
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cliPath = getImageCliPath();
  const outDir = path.join(ROOT, "public", "media", "products", "ai", "larnitech");
  const reportPath = path.join(ROOT, "data", "import", "larnitech-ai-retouch-report.json");

  if (!fs.existsSync(cliPath)) {
    throw new Error(`image_gen.py not found: ${cliPath}`);
  }
  if (!args.dryRun && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Use --dry-run or set key.");
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const db = new Database(DB_PATH);
  const rows = db
    .prepare(`
      SELECT id, name, image, gallery_json
      FROM products
      WHERE brand='Larnitech'
        AND image LIKE '/images/larnitech_pdf/%'
      ORDER BY name COLLATE NOCASE ASC
      LIMIT @limit OFFSET @offset
    `)
    .all({ limit: args.limit, offset: args.offset });

  const update = db.prepare(`
    UPDATE products
    SET image=@image, gallery_json=@galleryJson, updated_at=@updatedAt
    WHERE id=@id
  `);

  const report = [];
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const id = safeId(row.id);
    const srcRel = String(row.image || "").trim();
    const srcAbs = path.join(ROOT, "public", srcRel.replace(/^\/+/, ""));
    const outName = `${id}.png`;
    const outAbs = path.join(outDir, outName);
    const outRel = `/media/products/ai/larnitech/${outName}`;

    if (!fs.existsSync(srcAbs)) {
      failed += 1;
      report.push({ id: row.id, status: "failed", error: `source_not_found: ${srcAbs}` });
      continue;
    }

    if (!args.overwrite && fs.existsSync(outAbs)) {
      skipped += 1;
      report.push({ id: row.id, status: "skipped_existing", output: outRel });
      if (!args.dryRun) {
        const gallery = parseJsonArray(row.gallery_json);
        const nextGallery = [outRel].concat(gallery.filter((x) => String(x || "").trim() && String(x || "").trim() !== outRel));
        update.run({
          id: row.id,
          image: outRel,
          galleryJson: JSON.stringify(nextGallery),
          updatedAt: new Date().toISOString()
        });
      }
      continue;
    }

    const res = runRetouch({
      pythonBin: args.pythonBin,
      cliPath,
      inputPath: srcAbs,
      outputPath: outAbs,
      dryRun: args.dryRun,
      quality: args.quality,
      size: args.size
    });

    if (!res.ok) {
      failed += 1;
      report.push({ id: row.id, status: "failed", error: res.stderr || res.stdout || `exit_${res.code}` });
      continue;
    }

    ok += 1;
    report.push({ id: row.id, status: args.dryRun ? "dry_run_ok" : "ok", output: outRel });

    if (!args.dryRun) {
      const gallery = parseJsonArray(row.gallery_json);
      const nextGallery = [outRel].concat(gallery.filter((x) => String(x || "").trim() && String(x || "").trim() !== outRel));
      update.run({
        id: row.id,
        image: outRel,
        galleryJson: JSON.stringify(nextGallery),
        updatedAt: new Date().toISOString()
      });
    }
  }

  db.close();

  const summary = {
    ok: true,
    createdAt: new Date().toISOString(),
    settings: args,
    totals: {
      queued: rows.length,
      ok,
      skipped,
      failed,
      dbUpdated: args.dryRun ? 0 : ok + skipped
    },
    items: report
  };

  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main();
