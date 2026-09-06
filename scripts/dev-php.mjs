#!/usr/bin/env node
/**
 * Local dev with PHP API (same as ParsPack production) + Next.js.
 * Use this when testing multi-tenant slugs (/buzz/, /buzz/admin/) before deploy.
 */
import { spawn, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const frontend = path.join(root, "frontend");
const apiPort =
  process.env.MIIZIITO_API_PORT || process.env.LUMIERE_API_PORT || "8787";

const kids = [];

function portListeners(port) {
  const r = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.status !== 0 || !r.stdout?.length) return "";
  return r.stdout.toString().trim();
}

function ensurePortFree(port, label) {
  const busy = portListeners(port);
  if (!busy) return;
  console.error(`[dev:php] Port ${port} is in use (${label}).`);
  console.error(busy);
  console.error(`[dev:php] Stop it: lsof -tiTCP:${port} -sTCP:LISTEN | xargs kill`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd || root,
    env: { ...process.env, MIIZIITO_API_PORT: apiPort },
    stdio: "inherit",
    shell: false,
  });
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) shutdown(code);
  });
  kids.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const c of kids) {
    try {
      c.kill("SIGTERM");
    } catch (_) {}
  }
  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const php = spawnSync("php", ["-v"], { stdio: "ignore" });
if (php.status !== 0) {
  console.error("[dev:php] PHP not found. Install PHP 8.1+ or use: npm run dev");
  process.exit(1);
}

ensurePortFree(apiPort, "PHP API");
ensurePortFree("3000", "Next.js");

console.log(`[dev:php] PHP API (production parity) → http://127.0.0.1:${apiPort}`);
console.log("[dev:php] Do NOT set data/db.local.php for JSON mode locally.");
run("php", ["-S", `127.0.0.1:${apiPort}`, "-t", root], { name: "php-api" });

setTimeout(() => {
  console.log("[dev:php] Next.js → http://127.0.0.1:3000");
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:next", "--", "--hostname", "127.0.0.1"], {
    cwd: frontend,
    name: "next",
  });
}, 300);
