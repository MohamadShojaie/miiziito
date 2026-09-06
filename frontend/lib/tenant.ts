const TENANT_KEY = "miiziito-menu-tenant";

export const TENANT_RESERVED = new Set([
  "admin",
  "panel-admin",
  "api",
  "assets",
  "_next",
  "uploads",
  "data",
  "404",
  "robots.txt",
  "_",
]);

export function sanitizeTenantSlug(raw: string): string {
  const slug = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
  if (!slug || slug.length > 64) return "";
  if (TENANT_RESERVED.has(slug)) return "";
  return slug;
}

/** Read cafe slug from URL path: /{slug}/ */
export function tenantSlugFromPath(pathname?: string): string {
  if (typeof window === "undefined") return "";
  const path = pathname ?? window.location.pathname;
  const part = path.replace(/\/+$/, "").split("/").filter(Boolean)[0] || "";
  return sanitizeTenantSlug(part);
}

export function setMenuTenantSlug(slug: string) {
  if (typeof window === "undefined") return;
  const clean = sanitizeTenantSlug(slug);
  if (clean) sessionStorage.setItem(TENANT_KEY, clean);
  else sessionStorage.removeItem(TENANT_KEY);
}

export function getMenuTenantSlug(): string {
  if (typeof window === "undefined") return "";
  const fromPath = tenantSlugFromPath();
  if (fromPath) return fromPath;
  try {
    return sanitizeTenantSlug(sessionStorage.getItem(TENANT_KEY) || "");
  } catch {
    return "";
  }
}

export function tenantApiHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {};
  const slug = getMenuTenantSlug();
  if (slug) headers["X-Miiziito-Tenant"] = slug;
  if (extra) Object.assign(headers, extra);
  return headers;
}
