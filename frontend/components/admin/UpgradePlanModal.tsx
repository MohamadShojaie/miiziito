"use client";

import { createPortal } from "react-dom";
import { FEATURE_LABELS, type PlanFeature } from "@/lib/plan-access";

export function UpgradePlanModal({
  open,
  feature,
  planName,
  onClose,
}: {
  open: boolean;
  feature: PlanFeature | null;
  planName?: string;
  onClose: () => void;
}) {
  if (!open || !feature || typeof document === "undefined") return null;
  const label = FEATURE_LABELS[feature] || feature;
  const plan = (planName || "").trim();

  return createPortal(
    <div
      className="table-glass-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-plan-title"
      onClick={onClose}
    >
      <div
        className="table-glass-dialog menu-glass-dialog invoice-glass-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="table-glass-head">
          <div>
            <h4 id="upgrade-plan-title" className="table-glass-title">
              این قابلیت در پلن شما فعال نیست
            </h4>
            <p className="table-glass-sub">
              برای استفاده از «{label}» باید پلن بالاتری داشته باشید.
            </p>
          </div>
          <button
            type="button"
            className="table-glass-close"
            aria-label="بستن"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p className="cp-upgrade-copy">
          {plan
            ? `قابلیت «${label}» در پلن ${plan} در دسترس نیست. برای فعال‌سازی، پلن را ارتقا دهید یا اشتراک را تمدید کنید.`
            : `قابلیت «${label}» در پلن فعلی در دسترس نیست. برای فعال‌سازی، پلن را ارتقا دهید یا اشتراک را تمدید کنید.`}
        </p>
        <footer className="menu-glass-actions">
          <button type="button" className="cp-btn cp-btn--ghost" onClick={onClose}>
            بستن
          </button>
          <a href="/panel-admin/account/" className="cp-btn cp-btn--primary">
            ارتقا / تمدید پلن
          </a>
        </footer>
      </div>
    </div>,
    document.body
  );
}

export function UpgradePlanPanel({
  feature,
  planName,
  onUpgrade,
}: {
  feature: PlanFeature;
  planName?: string;
  onUpgrade: () => void;
}) {
  const label = FEATURE_LABELS[feature] || feature;
  const plan = (planName || "").trim();
  return (
    <div className="cp-upgrade-panel">
      <h3 className="cp-upgrade-panel-title">این قابلیت قفل است</h3>
      <p className="cp-upgrade-copy">
        {plan
          ? `«${label}» در پلن ${plan} فعال نیست.`
          : `«${label}» در پلن فعلی فعال نیست.`}{" "}
        برای استفاده، پلن را ارتقا یا تمدید کنید.
      </p>
      <button type="button" className="cp-btn cp-btn--primary" onClick={onUpgrade}>
        ارتقا / تمدید پلن
      </button>
    </div>
  );
}
