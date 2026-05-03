const fs = require("fs");

// Temporary DB upload endpoint.
// Only active when ENABLE_DB_UPLOAD=1 is set.
// Remove this file and the registration in server.js after use.
function registerDbUploadRoute(app, { dbPath, adminToken }) {
  if (String(process.env.ENABLE_DB_UPLOAD || "").trim() !== "1") return;

  const secret = String(adminToken || "").trim();

  app.put("/api/db-upload", (req, res) => {
    const auth = String(req.headers["x-upload-token"] || "").trim();
    if (!secret || auth !== secret) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const tmpPath = dbPath + ".upload.tmp";
    const out = fs.createWriteStream(tmpPath);

    req.pipe(out);

    out.on("finish", () => {
      try {
        fs.renameSync(tmpPath, dbPath);
        res.json({ ok: true, message: "DB replaced. Restart the service." });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    out.on("error", (err) => {
      res.status(500).json({ ok: false, error: err.message });
    });
  });

  console.warn("DB upload endpoint active: PUT /api/db-upload");
}

module.exports = { registerDbUploadRoute };
