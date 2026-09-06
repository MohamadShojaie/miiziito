export function tenantSiteOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return (
    process.env.NEXT_PUBLIC_MIIZIITO_SITE_URL ||
    process.env.NEXT_PUBLIC_LUMIERE_SITE_URL ||
    "https://miiziito.ir"
  ).replace(/\/$/, "");
}

export function cafeMenuPath(slug: string): string {
  return `/${slug}/`;
}

export function cafeCashierPath(slug: string): string {
  return `/${slug}/admin/`;
}

export function cafeMenuUrl(slug: string): string {
  return `${tenantSiteOrigin()}${cafeMenuPath(slug)}`;
}

export function cafeCashierUrl(slug: string): string {
  return `${tenantSiteOrigin()}${cafeCashierPath(slug)}`;
}

export function cafeMenuLabel(slug: string, host = tenantSiteOrigin()): string {
  const hostLabel = host.replace(/^https?:\/\//, "");
  return `${hostLabel}/${slug}/`;
}

export function cafeCashierLabel(slug: string, host = tenantSiteOrigin()): string {
  const hostLabel = host.replace(/^https?:\/\//, "");
  return `${hostLabel}/${slug}/admin/`;
}
