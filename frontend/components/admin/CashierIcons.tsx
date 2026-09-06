"use client";

import type { ReactNode } from "react";

type IconProps = {
  className?: string;
  size?: number;
};

function Svg({
  children,
  className,
  size = 20,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconOrders(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </Svg>
  );
}

export function IconInvoices(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16l3-1.5L10 20l3-1.5L16 20l3-1.5L22 20V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h6" />
      <path d="M8 17h4" />
    </Svg>
  );
}

export function IconTables(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </Svg>
  );
}

export function IconStats(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M22 19V8" />
    </Svg>
  );
}

export function IconCustomers(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.5 19.5c.8-3.2 2.9-5 6.5-5s5.7 1.8 6.5 5" />
      <circle cx="17.5" cy="9" r="2.5" />
      <path d="M15.2 14.5c2.3.3 4.1 1.5 4.8 4" />
    </Svg>
  );
}

export function IconCoupons(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 9a2 2 0 0 0 2-2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a2 2 0 1 0 0 4v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2z" />
      <path d="M10 8v8" strokeDasharray="2 3" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 2.8v2.1M12 19.1v2.1M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function IconSoundOn(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" />
      <path d="M18.2 6a8 8 0 0 1 0 12" />
    </Svg>
  );
}

export function IconSoundOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M22 9l-6 6" />
      <path d="M16 9l6 6" />
    </Svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M16 8l4 4-4 4" />
      <path d="M20 12H10" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </Svg>
  );
}

export function IconSidebar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
    </Svg>
  );
}

export function IconHardware(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
      <path d="M8 9h3" />
      <path d="M8 12h5" />
    </Svg>
  );
}

export function IconCrm(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M3 19c.7-3 2.6-4.8 5-4.8S15.3 16 16 19" />
      <path d="M17 8h4" />
      <path d="M19 6v4" />
      <path d="M16.2 13.2c1.7.4 3.1 1.5 3.8 3.3" />
    </Svg>
  );
}

export function IconReservations(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M8 14h3" />
      <path d="M13 14h3" />
      <path d="M8 17h8" />
    </Svg>
  );
}

export function IconPayments(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
      <path d="M14 15h4" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5 9 16.5 19 6.5" />
    </Svg>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5 11 15.5 16 9.5" />
    </Svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </Svg>
  );
}

export function IconMobile(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </Svg>
  );
}

export function IconDevices(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="5" width="14" height="10" rx="1.5" />
      <path d="M8 19h6" />
      <path d="M11 15v4" />
      <rect x="16" y="7" width="6" height="10" rx="1.5" />
    </Svg>
  );
}

export function IconBrowser(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <circle cx="6.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function IconTrendUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 18V6" />
      <path d="M20 18H4" />
      <path d="M7 14l4-4 3 3 5-6" />
    </Svg>
  );
}

export function IconQr(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3z" />
      <path d="M17 17h4v4h-4z" />
      <path d="M14 20h3" />
    </Svg>
  );
}

export const TAB_ICONS = {
  orders: IconOrders,
  invoices: IconInvoices,
  reservations: IconReservations,
  tables: IconTables,
  menu: IconMenu,
  stats: IconStats,
  customers: IconCrm,
  coupons: IconCoupons,
  hardware: IconHardware,
  payments: IconPayments,
  settings: IconSettings,
} as const;
