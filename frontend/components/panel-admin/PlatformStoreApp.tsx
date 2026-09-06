"use client";

import { useEffect, useState } from "react";
import {
  clearSaSession,
  getSaToken,
  saFetch,
  setSaAdminRaw,
} from "@/lib/super-admin/api";
import type { AdminUser } from "@/lib/super-admin/types";
import { StorePage } from "./pages/StorePage";
import { ToastHost } from "./ui/Toast";

type SessionKind = "admin" | "cafe" | null;
type CafeOwner = { id: string; email: string; name?: string; phone?: string; tenantId?: string };

/** Public SaaS landing at miiziito.ir/ — renders immediately, session loads in background. */
export function PlatformStoreApp() {
  const [kind, setKind] = useState<SessionKind>(null);

  useEffect(() => {
    document.body.classList.add("sa-panel-active");
    return () => document.body.classList.remove("sa-panel-active");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const token = getSaToken();
      if (!token) {
        if (!cancelled) setKind(null);
        return;
      }
      try {
        const me = await saFetch<{ kind: SessionKind; admin?: AdminUser; owner?: CafeOwner }>("sa-me");
        if (cancelled) return;
        if (me.kind === "admin" && me.admin) {
          setKind("admin");
          setSaAdminRaw(JSON.stringify({ kind: "admin", admin: me.admin }));
        } else if (me.kind === "cafe" && me.owner) {
          setKind("cafe");
          setSaAdminRaw(JSON.stringify({ kind: "cafe", owner: me.owner }));
        } else {
          clearSaSession();
          setKind(null);
        }
      } catch {
        clearSaSession();
        if (!cancelled) setKind(null);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="sa-root sa-rtl">
      <ToastHost>
        <StorePage isLoggedIn={kind !== null} kind={kind} />
      </ToastHost>
    </div>
  );
}
