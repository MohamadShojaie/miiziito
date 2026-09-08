import { SITE_CONFIG } from "@/lib/config";

const TOKEN_KEY = "miiziito-sa-token";
const ADMIN_KEY = "miiziito-sa-admin";

function getBase() {
  return String(SITE_CONFIG.apiUrl || "").replace(/\/$/, "");
}

export function saApiUrl(route: string, id?: string): string {
  const base = getBase();
  let url = `${base}/api/index.php?route=${encodeURIComponent(route)}`;
  if (id) url += `&id=${encodeURIComponent(id)}`;
  return url;
}

export function getSaToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setSaToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getSaAdminRaw(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(ADMIN_KEY) || "";
  } catch {
    return "";
  }
}

export function setSaAdminRaw(json: string) {
  if (typeof window === "undefined") return;
  if (json) localStorage.setItem(ADMIN_KEY, json);
  else localStorage.removeItem(ADMIN_KEY);
}

export function clearSaSession() {
  setSaToken("");
  setSaAdminRaw("");
}

export function saHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getSaToken();
  if (token) headers["X-Super-Admin-Token"] = token;
  if (extra) Object.assign(headers, extra);
  return headers;
}

export async function saFetch<T = unknown>(
  route: string,
  init?: RequestInit & {
    id?: string;
    query?: Record<string, string | number | undefined>;
    skipAuth?: boolean;
  }
): Promise<T> {
  let url = saApiUrl(route, init?.id);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === "") continue;
      url += `&${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
    }
  }
  const { id: _ignoredId, query: _ignoredQuery, skipAuth, ...rest } = init || {};
  void _ignoredId;
  void _ignoredQuery;
  const headers = skipAuth
    ? { "Content-Type": "application/json", ...(rest.headers as object) }
    : saHeaders(rest.headers);
  const res = await fetch(url, {
    ...rest,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = data as { error?: string; message?: string };
    const err = new Error(payload.message || payload.error || "request_failed");
    (err as Error & { status?: number; code?: string }).status = res.status;
    (err as Error & { status?: number; code?: string }).code = payload.error;
    throw err;
  }
  return data as T;
}
