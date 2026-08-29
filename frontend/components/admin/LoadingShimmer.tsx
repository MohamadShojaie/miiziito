"use client";

type ShimmerVariant =
  | "orders"
  | "invoices"
  | "tables"
  | "menu"
  | "list"
  | "stats"
  | "settings";

export function LoadingShimmer({
  variant = "list",
  count,
  label = "در حال بارگذاری…",
}: {
  variant?: ShimmerVariant;
  count?: number;
  label?: string;
}) {
  const n =
    count ??
    (variant === "orders"
      ? 6
      : variant === "invoices"
        ? 7
        : variant === "tables"
          ? 3
          : variant === "menu"
            ? 6
            : variant === "stats"
              ? 4
              : variant === "settings"
                ? 2
                : 5);

  if (variant === "orders") {
    return (
      <div
        className="cp-shimmer cp-shimmer--orders"
        role="status"
        aria-busy="true"
        aria-label={label}
      >
        <div className="cp-shimmer-toolbar">
          <span className="cp-skeleton cp-shimmer-bar" />
          <div className="cp-shimmer-chips">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="cp-skeleton cp-shimmer-chip" />
            ))}
          </div>
        </div>
        <div className="cp-skeleton-grid cp-shimmer-orders-grid">
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="cp-skeleton cp-skeleton--card cp-shimmer-order-card">
              <span className="cp-skeleton-line" />
              <span className="cp-skeleton-line" />
              <span className="cp-skeleton-line" />
            </div>
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === "invoices") {
    return (
      <div
        className="cp-shimmer cp-shimmer--invoices"
        role="status"
        aria-busy="true"
        aria-label={label}
      >
        <div className="cp-shimmer-toolbar">
          <span className="cp-skeleton cp-shimmer-bar" />
          <div className="cp-shimmer-chips">
            {Array.from({ length: 3 }).map((_, i) => (
              <span key={i} className="cp-skeleton cp-shimmer-chip" />
            ))}
          </div>
        </div>
        <div className="cp-shimmer-table">
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="cp-skeleton cp-shimmer-table-row">
              <span className="cp-skeleton-line" />
            </div>
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === "tables") {
    return (
      <div
        className="cp-shimmer cp-shimmer--tables"
        role="status"
        aria-busy="true"
        aria-label={label}
      >
        <div className="cp-shimmer-toolbar">
          <span className="cp-skeleton cp-shimmer-bar" />
          <div className="cp-shimmer-chips">
            {Array.from({ length: 3 }).map((_, i) => (
              <span key={i} className="cp-skeleton cp-shimmer-chip" />
            ))}
          </div>
        </div>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="cp-shimmer-room">
            <span className="cp-skeleton cp-shimmer-room-title" />
            <div className="cp-shimmer-tiles">
              {Array.from({ length: 6 }).map((__, j) => (
                <span key={j} className="cp-skeleton cp-shimmer-tile" />
              ))}
            </div>
          </div>
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === "menu") {
    return (
      <div
        className="cp-shimmer cp-shimmer--menu"
        role="status"
        aria-busy="true"
        aria-label={label}
      >
        <div className="cp-shimmer-chips">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="cp-skeleton cp-shimmer-chip" />
          ))}
        </div>
        <ul className="cp-shimmer-list">
          {Array.from({ length: n }).map((_, i) => (
            <li key={i}>
              <div className="cp-skeleton cp-shimmer-menu-row">
                <span className="cp-skeleton cp-shimmer-thumb" />
                <span className="cp-skeleton-line" />
              </div>
            </li>
          ))}
        </ul>
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === "stats") {
    return (
      <div
        className="cp-shimmer cp-shimmer--stats stats-kpi-grid"
        role="status"
        aria-busy="true"
        aria-label={label}
      >
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="stats-kpi cp-skeleton">
            <span className="cp-skeleton-line" />
            <strong className="cp-skeleton-line" />
          </div>
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === "settings") {
    return (
      <div
        className="cp-shimmer cp-shimmer--settings"
        role="status"
        aria-busy="true"
        aria-label={label}
      >
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="settings-card cp-skeleton">
            <span className="cp-skeleton-line" />
            <span className="cp-skeleton-line" />
          </div>
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <ul
      className="cp-shimmer cp-shimmer--list"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: n }).map((_, i) => (
        <li key={i}>
          <div className="cp-skeleton cp-shimmer-list-row">
            <span className="cp-skeleton-line" />
          </div>
        </li>
      ))}
      <span className="sr-only">{label}</span>
    </ul>
  );
}
