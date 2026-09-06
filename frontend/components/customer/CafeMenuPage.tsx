"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CustomerMenu } from "@/components/customer/CustomerMenu";
import {
  CartDrawer,
  WaiterModal,
  ReserveModal,
} from "@/components/customer/CartDrawer";
import { useCart } from "@/components/CartProvider";
import { toPersianDigits } from "@/lib/format";
import { resolveGuestTable } from "@/lib/table-session";
import { getMenuTenantSlug, setMenuTenantSlug, tenantSlugFromPath } from "@/lib/tenant";

export function CafeMenuPage() {
  const { count } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [waiterOpen, setWaiterOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [lockedTable, setLockedTable] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    const s = tenantSlugFromPath();
    setMenuTenantSlug(s);
    setSlug(s);
    const table = resolveGuestTable();
    if (table) setLockedTable(table);
  }, []);

  if (!slug) {
    return (
      <div className="sa-login" style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--sa-text-muted, #666)" }}>آدرس منو نامعتبر است.</p>
        <Link href="/">بازگشت به میزییتو</Link>
      </div>
    );
  }

  return (
    <>
      <CustomerMenu tenantSlug={slug} />

      <button
        type="button"
        className="float-reserve"
        id="reserve-table-btn"
        aria-label="رزرو میز"
        onClick={() => setReserveOpen(true)}
      >
        <span className="float-reserve-icon" aria-hidden="true" />
        <span className="float-reserve-label">رزرو میز</span>
      </button>

      <button
        type="button"
        className="float-waiter"
        id="waiter-call-btn"
        aria-label="صدازدن گارسون"
        onClick={() => setWaiterOpen(true)}
      >
        <span className="float-waiter-icon" aria-hidden="true" />
        <span className="float-waiter-label">گارسون</span>
      </button>

      <button
        type="button"
        className="float-cart"
        aria-label="سبد سفارش"
        data-count={count}
        onClick={() => setCartOpen(true)}
      >
        <span className="float-cart-icon" aria-hidden="true" />
        <span className="float-cart-count">
          {count > 0 ? toPersianDigits(count) : ""}
        </span>
      </button>

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lockedTable={lockedTable}
      />
      <WaiterModal
        open={waiterOpen}
        onClose={() => setWaiterOpen(false)}
        lockedTable={lockedTable}
      />
      <ReserveModal
        open={reserveOpen}
        onClose={() => setReserveOpen(false)}
        lockedTable={lockedTable}
      />
    </>
  );
}
