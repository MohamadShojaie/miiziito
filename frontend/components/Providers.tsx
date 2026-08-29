"use client";

import { useEffect } from "react";
import { applyTheme, SITE_CONFIG } from "@/lib/config";
import { apiJson, sandboxHeaders } from "@/lib/api";
import {
  applySiteTheme,
  mergeSiteSettings,
  type SiteSettings,
} from "@/lib/settings";
import { CartProvider } from "@/components/CartProvider";
import { ToastProvider } from "@/components/ToastProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme(SITE_CONFIG);
    apiJson<{ settings?: Partial<SiteSettings> }>("/api/settings", {
      auth: false,
      sandbox: true,
      headers: sandboxHeaders(),
    })
      .then((data) => applySiteTheme(mergeSiteSettings(data.settings)))
      .catch(() => {});
  }, []);

  return (
    <ToastProvider>
      <CartProvider>{children}</CartProvider>
    </ToastProvider>
  );
}
