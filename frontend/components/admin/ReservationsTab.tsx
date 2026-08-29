"use client";

import { useMemo, useState } from "react";
import { apiJson, cashierHeaders } from "@/lib/api";
import type { Reservation, TablesPayload } from "@/lib/types";
import { RESERVATION_STATUS_LABEL } from "@/lib/types";
import { formatOrderTime, toPersianDigits } from "@/lib/format";
import { formatJalaliIso } from "@/lib/jalali";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";

type Props = {
  reservations: Reservation[];
  loading?: boolean;
  onPatched: (data: TablesPayload) => void;
};

export function ReservationsTab({
  reservations,
  loading,
  onPatched,
}: Props) {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState("");

  const pending = useMemo(
    () =>
      reservations
        .filter((r) => r.status === "pending")
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [reservations]
  );

  const accepted = useMemo(
    () =>
      reservations
        .filter((r) => r.status === "accepted")
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [reservations]
  );

  async function act(
    id: string,
    action: "accept" | "reject" | "cancel"
  ) {
    setBusyId(id);
    try {
      const data = await apiJson<TablesPayload>("/api/reservations", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({ action, id }),
      });
      onPatched(data);
      if (action === "accept") showToast("رزرو تأیید شد");
      else if (action === "reject") showToast("رزرو رد شد");
      else showToast("رزرو لغو شد");
    } catch {
      showToast("عملیات ناموفق بود");
    } finally {
      setBusyId("");
    }
  }

  function card(r: Reservation, actions?: "pending" | "accepted") {
    const busy = busyId === r.id;
    return (
      <article key={r.id} className="reservation-card cp-card">
        <header className="reservation-card-head">
          <div>
            <h3 className="reservation-card-title">
              میز {toPersianDigits(r.table)}
            </h3>
            <p className="reservation-card-meta">
              {r.date
                ? `${formatJalaliIso(r.date)}${r.time ? ` · ساعت ${toPersianDigits(r.time)}` : ""}`
                : formatOrderTime(r.createdAt)}
              {" · "}
              {RESERVATION_STATUS_LABEL[r.status] || r.status}
            </p>
          </div>
          {r.guests ? (
            <span className="reservation-guests cp-chip">
              {toPersianDigits(r.guests)} نفر
            </span>
          ) : null}
        </header>
        <dl className="reservation-card-fields">
          <div>
            <dt>نام</dt>
            <dd>{r.name}</dd>
          </div>
          <div>
            <dt>تلفن</dt>
            <dd className="cp-num" dir="ltr">
              {toPersianDigits(r.phone)}
            </dd>
          </div>
          {r.date ? (
            <div>
              <dt>زمان رزرو</dt>
              <dd>
                {formatJalaliIso(r.date)}
                {r.time ? ` · ${toPersianDigits(r.time)}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
        {actions === "pending" ? (
          <div className="reservation-card-actions">
            <button
              type="button"
              className="cp-btn cp-btn--primary"
              disabled={busy}
              onClick={() => act(r.id, "accept")}
            >
              تأیید
            </button>
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={busy}
              onClick={() => act(r.id, "reject")}
            >
              رد
            </button>
          </div>
        ) : null}
        {actions === "accepted" ? (
          <div className="reservation-card-actions">
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={busy}
              onClick={() => act(r.id, "cancel")}
            >
              لغو رزرو
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  if (loading) return <LoadingShimmer variant="orders" />;

  return (
    <div className="reservations-tab">
      <section className="reservations-section">
        <header className="reservations-section-head">
          <h3 className="reservations-section-title">درخواست‌های جدید</h3>
          <span className="cp-chip">{toPersianDigits(pending.length)}</span>
        </header>
        {pending.length ? (
          <div className="reservations-grid">
            {pending.map((r) => card(r, "pending"))}
          </div>
        ) : (
          <p className="reservations-empty">درخواست معلقی نیست</p>
        )}
      </section>

      <section className="reservations-section">
        <header className="reservations-section-head">
          <h3 className="reservations-section-title">رزروهای فعال</h3>
          <span className="cp-chip">{toPersianDigits(accepted.length)}</span>
        </header>
        {accepted.length ? (
          <div className="reservations-grid">
            {accepted.map((r) => card(r, "accepted"))}
          </div>
        ) : (
          <p className="reservations-empty">رزرو فعالی نیست</p>
        )}
      </section>
    </div>
  );
}
