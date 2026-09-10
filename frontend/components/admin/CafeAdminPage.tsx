"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CashierApp } from "@/components/admin/CashierApp";
import { setMenuTenantSlug, tenantSlugFromPath } from "@/lib/tenant";

export function CafeAdminPage() {
  const [slug, setSlug] = useState("");

  useEffect(() => {
    const s = tenantSlugFromPath();
    if (s) {
      setMenuTenantSlug(s);
      setSlug(s);
    }
  }, []);

  if (!slug) {
    return (
      <div className="modal-overlay cp-modal-overlay is-open">
        <div className="modal-card cp-modal" role="dialog">
          <h2 className="modal-title">پنل کافه یافت نشد</h2>
          <p className="modal-hint">آدرس باید به شکل miiziito.ir/نام-کافه/admin باشد.</p>
          <Link href="/" className="modal-submit cp-btn cp-btn--primary cp-btn--block">
            بازگشت به میزیتو
          </Link>
        </div>
      </div>
    );
  }

  return <CashierApp tenantSlug={slug} />;
}
