"use client";

import type { CrmProfile } from "@/lib/crm";
import { customerTierLabel } from "@/lib/crm";
import {
  formatDaysAgo,
  formatPriceAsNumber,
  toPersianDigits,
} from "@/lib/format";

type Props = {
  profile: CrmProfile;
  onOpenCustomer?: (id: string) => void;
  onChangeCustomer?: () => void;
  onClearCustomer?: () => void;
  busy?: boolean;
};

export function CustomerOrderCard({
  profile,
  onOpenCustomer,
  onChangeCustomer,
  onClearCustomer,
  busy,
}: Props) {
  const favorite = profile.favorites[0];

  return (
    <aside className="customer-order-card" aria-label="خلاصه مشتری">
      <header className="customer-order-card-head">
        <button
          type="button"
          className="customer-order-card-name"
          disabled={!onOpenCustomer || busy}
          onClick={() => onOpenCustomer?.(profile.id)}
        >
          <strong>{profile.name}</strong>
          <span className={`crm-tier is-${profile.tier || "standard"}`}>
            {customerTierLabel(profile.tier)}
          </span>
        </button>
        <div className="customer-order-card-tools">
          {onChangeCustomer ? (
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={busy}
              onClick={onChangeCustomer}
            >
              تغییر
            </button>
          ) : null}
          {onClearCustomer ? (
            <button
              type="button"
              className="cp-btn cp-btn--ghost is-danger"
              disabled={busy}
              onClick={onClearCustomer}
            >
              حذف
            </button>
          ) : null}
        </div>
      </header>

      <ul className="customer-order-card-stats">
        <li>
          <span>مراجعه</span>
          <strong>{toPersianDigits(profile.visits)}</strong>
        </li>
        <li>
          <span>مجموع خرید</span>
          <strong className="cp-num">
            {formatPriceAsNumber(profile.spend)}
          </strong>
        </li>
        <li>
          <span>میانگین فاکتور</span>
          <strong className="cp-num">
            {formatPriceAsNumber(profile.avgTicket)}
          </strong>
        </li>
        <li>
          <span>آخرین مراجعه</span>
          <strong>{formatDaysAgo(profile.lastVisitAt)}</strong>
        </li>
      </ul>

      {favorite ? (
        <p className="customer-order-card-fav">
          <span>محبوب‌ترین</span>
          <strong>
            {favorite.name} × {toPersianDigits(favorite.count)}
          </strong>
        </p>
      ) : null}
    </aside>
  );
}
