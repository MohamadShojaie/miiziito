#!/usr/bin/env node
/**
 * Build static frontend for ParsPack (same-origin API on miiziito.ir).
 * Creates dist/parspack-deploy/ ready to upload to public_html.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = join(root, "frontend");
const out = join(frontend, "out");
const deploy = join(root, "dist", "parspack-deploy");

console.log("[parspack] building frontend (same-origin API)…");
execSync("npm ci && NEXT_BUILD=1 npm run build", {
  cwd: frontend,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_MIIZIITO_API_URL: "",
    NEXT_PUBLIC_LUMIERE_API_URL: "",
  },
});

if (!existsSync(out)) {
  console.error("[parspack] missing frontend/out after build");
  process.exit(1);
}

if (existsSync(deploy)) rmSync(deploy, { recursive: true, force: true });
mkdirSync(deploy, { recursive: true });

for (const name of ["api", "data", "uploads"]) {
  cpSync(join(root, name), join(deploy, name), { recursive: true });
}
const htaccessSrc = join(root, ".htaccess");
let htaccess = readFileSync(htaccessSrc, "utf8");
htaccess = htaccess.replace(/^\s*SetEnv\s+MIIZIITO_DATABASE_URL.*$/gm, "");
writeFileSync(join(deploy, ".htaccess"), htaccess, "utf8");
cpSync(join(root, "robots.txt"), join(deploy, "robots.txt"));
cpSync(out, deploy, { recursive: true });

const dbLocal = join(deploy, "data", "db.local.php");
if (existsSync(dbLocal)) {
  unlinkSync(dbLocal);
  console.log("[parspack] removed data/db.local.php (JSON mode on ParsPack)");
}

const secret = join(root, "data", "secret.php");
if (!existsSync(secret)) {
  console.warn("[parspack] WARNING: data/secret.php missing — upload it on the server");
}

writeFileSync(
  join(deploy, "PARSPACK-README.txt"),
  `Miiziito — ParsPack deploy package
================================

1. Upload ALL files in this folder to public_html (merge/replace).
   If you already have live orders, do NOT overwrite data/ — upload api/, .htaccess, _next/, _/, panel-admin/ only.
2. ParsPack uses JSON files (no Neon). Do NOT add data/db.local.php or SetEnv in .htaccess.
3. cPanel → PHP 8.1+.
4. data/ permissions: 755 (secret.php must exist).
5. uploads/ permissions: 755 (writable for images).

Test:
  https://YOUR-DOMAIN/api/index.php?route=health  → {"database":"json_files"}
  https://YOUR-DOMAIN/
  https://YOUR-DOMAIN/{cafe-slug}/admin/
  https://YOUR-DOMAIN/panel-admin/login/
`,
  "utf8"
);

console.log(`[parspack] ready: ${deploy}`);
execSync(`cd "${deploy}" && zip -r "${join(root, "dist", "miiziito-parspack.zip")}" .`, {
  stdio: "inherit",
});
