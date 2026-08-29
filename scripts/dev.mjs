#!/usr/bin/env node
/**
 * Starts PostgreSQL (Docker), migrates JSON → Postgres, local API + Next.js.
 */
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const frontend = path.join(root, "frontend");
const apiScript = path.join(root, "tools", "local_api.py");
const migrateScript = path.join(root, "scripts", "migrate-json-to-pg.py");
const apiPort =
  process.env.MIIZIITO_API_PORT || process.env.LUMIERE_API_PORT || "8787";

const kids = [];

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd || root,
    env: { ...process.env, MIIZIITO_API_PORT: apiPort },
    stdio: opts.stdio || "inherit",
    shell: false,
  });
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0 && !opts.ignoreFail) {
      console.error(`[dev] ${opts.name || cmd} exited with ${code}`);
      shutdown(code);
    }
  });
  if (!opts.noTrack) kids.push(child);
  return child;
}

function runSync(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd || root,
    env: process.env,
    stdio: opts.stdio || "inherit",
    shell: false,
  });
  if (result.status && result.status !== 0 && !opts.ignoreFail) {
    console.error(`[dev] ${opts.name || cmd} failed with ${result.status}`);
  }
  return result;
}

function hasDocker() {
  const r = spawnSync("docker", ["info"], { stdio: "ignore" });
  return r.status === 0;
}

async function waitForPostgres(maxSec = 45) {
  const url =
    process.env.MIIZIITO_DATABASE_URL ||
    process.env.LUMIERE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://lumiere:lumiere@127.0.0.1:5432/lumiere";
  process.env.MIIZIITO_DATABASE_URL = url;

  for (let i = 0; i < maxSec; i += 1) {
    const probe = spawnSync(
      "python3",
      [
        "-c",
        `import os,psycopg2; psycopg2.connect(os.environ['MIIZIITO_DATABASE_URL']).close(); print('ok')`,
      ],
      { env: process.env, stdio: "pipe" }
    );
    if (probe.status === 0 && probe.stdout?.toString().includes("ok")) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function setupDatabase() {
  loadEnvFile();

  if (!hasDocker()) {
    // Force JSON-file storage when Docker/Postgres isn't available
    delete process.env.MIIZIITO_DATABASE_URL;
    delete process.env.LUMIERE_DATABASE_URL;
    delete process.env.DATABASE_URL;
    console.warn(
      "[dev] Docker not available — using JSON files (no PostgreSQL)."
    );
    console.warn("[dev] Install Docker or set MIIZIITO_DATABASE_URL manually.");
    return;
  }

  const defaultUrl =
    "postgresql://lumiere:lumiere@127.0.0.1:5432/lumiere";
  if (
    !process.env.MIIZIITO_DATABASE_URL &&
    !process.env.LUMIERE_DATABASE_URL &&
    !process.env.DATABASE_URL
  ) {
    process.env.MIIZIITO_DATABASE_URL = defaultUrl;
  }

  console.log("[dev] starting PostgreSQL (Docker)…");
  runSync("docker", ["compose", "up", "-d", "postgres"], { stdio: "inherit" });

  console.log("[dev] ensuring Python deps (psycopg2)…");
  runSync("python3", ["-m", "pip", "install", "-q", "-r", "requirements.txt"], {
    ignoreFail: true,
    stdio: "ignore",
  });

  console.log("[dev] waiting for PostgreSQL…");
  const ready = await waitForPostgres();
  if (!ready) {
    console.warn("[dev] PostgreSQL not ready — falling back to JSON files.");
    delete process.env.MIIZIITO_DATABASE_URL;
    delete process.env.LUMIERE_DATABASE_URL;
    delete process.env.DATABASE_URL;
    return;
  }

  console.log("[dev] migrating JSON → PostgreSQL (if needed)…");
  runSync("python3", [migrateScript], { stdio: "inherit" });
  console.log("[dev] database ready:", process.env.MIIZIITO_DATABASE_URL);
}

function portListeners(port) {
  const r = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.status !== 0 || !r.stdout?.length) return "";
  return r.stdout.toString().trim();
}

function ensurePortsFree() {
  const apiBusy = portListeners(apiPort);
  const webBusy = portListeners("3000");

  if (apiBusy && webBusy) {
    console.log("[dev] Dev stack is already running:");
    console.log("  Admin → http://127.0.0.1:3000/admin");
    console.log("  Menu  → http://127.0.0.1:3000");
    console.log("[dev] To restart, stop old processes first:");
    console.log(
      `  lsof -tiTCP:${apiPort} -sTCP:LISTEN | xargs kill; lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill`
    );
    process.exit(0);
  }

  if (apiBusy) {
    console.error(`[dev] Port ${apiPort} is already in use (local API).`);
    console.error(apiBusy);
    console.error(
      `[dev] Stop it with: lsof -tiTCP:${apiPort} -sTCP:LISTEN | xargs kill`
    );
    console.error("[dev] Or use another port: MIIZIITO_API_PORT=8788 npm run dev");
    process.exit(1);
  }

  if (webBusy) {
    console.error("[dev] Port 3000 is already in use (Next.js).");
    console.error(webBusy);
    console.error(
      "[dev] Stop it with: lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill"
    );
    process.exit(1);
  }
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

await setupDatabase();

ensurePortsFree();

console.log(`[dev] starting local API on :${apiPort}`);
run("python3", [apiScript], { name: "api" });

setTimeout(() => {
  console.log("[dev] starting Next.js");
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:next", "--", "--hostname", "127.0.0.1"], {
    cwd: frontend,
    name: "next",
  });
}, 400);
