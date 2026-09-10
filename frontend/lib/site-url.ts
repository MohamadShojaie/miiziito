/** Canonical public site origin for metadata, sitemap, and absolute asset URLs. */
export function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_MIIZIITO_SITE_URL ||
    process.env.NEXT_PUBLIC_LUMIERE_SITE_URL ||
    "https://miiziito.ir"
  ).replace(/\/$/, "");
}

export function absoluteUrl(path = "/"): string {
  const origin = siteOrigin();
  if (!path || path === "/") return `${origin}/`;
  return path.startsWith("/") ? `${origin}${path}` : `${origin}/${path}`;
}
