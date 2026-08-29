/** Shared table identity for QR deep-links and customer session. */

export const TABLE_SESSION_KEY = "miiziito-table";

export function sanitizeTable(v: string): string {
  return String(v || "")
    .replace(/[^\d۰-۹]/g, "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .slice(0, 2);
}

export function buildTableMenuUrl(table: string, origin?: string): string {
  const t = sanitizeTable(table);
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  if (!t || !base) return "";
  return `${base}/?table=${encodeURIComponent(t)}`;
}

export function readTableFromSearch(search?: string): string | null {
  if (typeof window === "undefined" && search == null) return null;
  const raw =
    search ??
    (typeof window !== "undefined" ? window.location.search : "");
  const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
  const t = sanitizeTable(params.get("table") || "");
  return t || null;
}

export function getSessionTable(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const t = sanitizeTable(sessionStorage.getItem(TABLE_SESSION_KEY) || "");
    return t || null;
  } catch {
    return null;
  }
}

export function setSessionTable(table: string): void {
  if (typeof window === "undefined") return;
  const t = sanitizeTable(table);
  if (!t) return;
  try {
    sessionStorage.setItem(TABLE_SESSION_KEY, t);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearSessionTable(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TABLE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Resolve table from URL (?table=) first, then sessionStorage. */
export function resolveGuestTable(): string | null {
  const fromUrl = readTableFromSearch();
  if (fromUrl) {
    setSessionTable(fromUrl);
    return fromUrl;
  }
  return getSessionTable();
}
