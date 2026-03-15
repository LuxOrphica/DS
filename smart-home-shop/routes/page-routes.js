const fs = require("fs");
const path = require("path");

function registerPageRoutes(app, rootDir) {
  app.get("/admin", (req, res) => {
    const newAdminPath = path.join(rootDir, "public", "admin-new.html");
    if (fs.existsSync(newAdminPath)) return res.sendFile(newAdminPath);
    return res.sendFile(path.join(rootDir, "public", "admin.html"));
  });

  app.get("/admin-legacy", (req, res) => {
    res.sendFile(path.join(rootDir, "public", "admin.html"));
  });

  app.get("*", (req, res) => {
    res.sendFile(path.join(rootDir, "public", "index.html"));
  });
}

module.exports = { registerPageRoutes };
