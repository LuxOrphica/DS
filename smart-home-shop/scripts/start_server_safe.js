const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
require("dotenv").config({ quiet: true });

const port = Number(process.env.PORT || 3030);

function checkHealth(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port,
        path: "/api/health",
        timeout: timeoutMs
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve(false);
          try {
            const json = JSON.parse(data || "{}");
            resolve(Boolean(json && json.ok));
          } catch {
            resolve(false);
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function isPortInUse() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
    socket.connect(port, "127.0.0.1");
  });
}

(async () => {
  const healthy = await checkHealth();
  if (healthy) {
    console.log(`Smart Home Shop already running on http://localhost:${port}`);
    process.exit(0);
  }

  const occupied = await isPortInUse();
  if (occupied) {
    console.error(
      `Port ${port} is busy by another process. Stop it or run with PORT=<other_port>, for example: PORT=3031 npm run start`
    );
    process.exit(1);
  }

  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    stdio: "inherit",
    env: process.env
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code || 0);
  });
})();
