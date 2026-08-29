import { SITE_CONFIG } from "./config";

const TOKEN_KEY = "miiziito-cashier-token";
const ROLE_KEY = "miiziito-cashier-role";
const SANDBOX_KEY = "miiziito-dev-sandbox";
const MUTE_KEY = "miiziito-alert-muted";
const QUEUE_KEY = "miiziito-pending-orders";
const CART_KEY = "miiziito-wanted";

function getBase() {
  return String(SITE_CONFIG.apiUrl || "").replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const base = getBase();
  if (path === "/api/health") return `${base}/api/index.php?route=health`;
  if (path === "/api/login") return `${base}/api/index.php?route=login`;
  if (path === "/api/logout") return `${base}/api/index.php?route=logout`;
  if (path === "/api/menu") return `${base}/api/index.php?route=menu`;
  if (path === "/api/tables") return `${base}/api/index.php?route=tables`;
  if (path === "/api/reservations") return `${base}/api/index.php?route=reservations`;
  if (path === "/api/stats") return `${base}/api/index.php?route=stats`;
  if (path === "/api/settings") return `${base}/api/index.php?route=settings`;
  if (path === "/api/customers") return `${base}/api/index.php?route=customers`;
  if (path === "/api/coupons") return `${base}/api/index.php?route=coupons`;
  if (path === "/api/hardware") return `${base}/api/index.php?route=hardware`;
  if (path === "/api/printers") return `${base}/api/index.php?route=printers`;
  if (path === "/api/payment-terminals")
    return `${base}/api/index.php?route=payment-terminals`;
  if (path === "/api/payment-agent")
    return `${base}/api/index.php?route=payment-agent`;
  if (path === "/api/payments") return `${base}/api/index.php?route=payments`;
  if (path.startsWith("/api/payments/")) {
    return `${base}/api/index.php?route=payment-item&id=${encodeURIComponent(path.slice("/api/payments/".length))}`;
  }
  if (path === "/api/invoices") return `${base}/api/index.php?route=invoices`;
  if (path.startsWith("/api/invoices/")) {
    return `${base}/api/index.php?route=invoice-item&id=${encodeURIComponent(path.slice("/api/invoices/".length))}`;
  }
  if (path === "/api/orders/stream") return `${base}/api/index.php?route=stream`;
  if (path.startsWith("/api/orders/")) {
    return `${base}/api/index.php?route=item&id=${encodeURIComponent(path.slice("/api/orders/".length))}`;
  }
  if (path === "/api/orders") return `${base}/api/index.php?route=orders`;
  return base + path;
}

export function getCashierToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setCashierToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getCashierRole(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(ROLE_KEY) || "";
  } catch {
    return "";
  }
}

export function getSandboxId(): string {
  if (typeof window === "undefined") return "dev";
  try {
    return localStorage.getItem(SANDBOX_KEY) || "dev";
  } catch {
    return "dev";
  }
}

export function setCashierRole(role: string, sandbox = "dev") {
  if (typeof window === "undefined") return;
  localStorage.setItem(ROLE_KEY, role);
  localStorage.setItem(SANDBOX_KEY, sandbox || "dev");
}

export function isDevMode(): boolean {
  return getCashierRole() === "dev";
}

export function isAlertMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAlertMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

export function cashierHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getCashierToken();
  if (token) headers["X-Cashier-Token"] = token;
  if (isDevMode()) headers["X-Miiziito-Sandbox"] = getSandboxId() || "dev";
  if (extra) Object.assign(headers, extra);
  return headers;
}

export function sandboxHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {};
  if (isDevMode()) headers["X-Miiziito-Sandbox"] = getSandboxId() || "dev";
  const token = getCashierToken();
  if (token) headers["X-Cashier-Token"] = token;
  if (extra) Object.assign(headers, extra);
  return headers;
}

export async function apiJson<T = unknown>(
  path: string,
  init?: RequestInit & { auth?: boolean; sandbox?: boolean }
): Promise<T> {
  const headers =
    init?.auth !== false
      ? cashierHeaders(init?.headers)
      : init?.sandbox
        ? sandboxHeaders(init?.headers)
        : { "Content-Type": "application/json", ...(init?.headers as object) };
  const res = await fetch(apiUrl(path), { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && (data as { error?: string }).error) || "request_failed");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return data as T;
}

export function loadCartRaw(): unknown {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveCartRaw(data: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(data));
}

export function loadQueue(): unknown[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveQueue(list: unknown[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
}

export function streamUrl(mode: "sse" | "poll", since = 0): string {
  const token = getCashierToken();
  let url = apiUrl("/api/orders/stream");
  const join = url.includes("?") ? "&" : "?";
  url += `${join}token=${encodeURIComponent(token || "")}`;
  if (mode === "poll") {
    url += `&mode=poll&since=${encodeURIComponent(String(since || 0))}`;
  }
  return url;
}
