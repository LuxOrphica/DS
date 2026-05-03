const fs = require("fs");
const path = require("path");

function registerPageRoutes(app, rootDir) {
  const newAdminPath = path.join(rootDir, "public", "admin-new.html");
  const adminEntryPath = fs.existsSync(newAdminPath)
    ? newAdminPath
    : path.join(rootDir, "public", "admin.html");

  app.get("/admin", (req, res) => {
    return res.sendFile(adminEntryPath);
  });

  app.get("/admin-legacy", (req, res) => {
    res.sendFile(path.join(rootDir, "public", "admin.html"));
  });

  app.get("*", (req, res) => {
    res.sendFile(path.join(rootDir, "public", "index.html"));
  });
}

module.exports = { registerPageRoutes };
