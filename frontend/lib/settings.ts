import { SITE_CONFIG } from "./config";
import { DEFAULT_CAFE_NAME_EN, DEFAULT_CAFE_NAME_FA } from "./brand";
import { getMenuTenantSlug } from "./tenant";

export type MenuStructureId =
  | "classic"
  | "cards"
  | "compact"
  | "magazine"
  | "personal";

export type MenuStructureOption = {
  id: MenuStructureId;
  title: string;
  description: string;
  requiresSupport?: boolean;
};

export const MENU_STRUCTURE_OPTIONS: MenuStructureOption[] = [
  {
    id: "classic",
    title: "کلاسیک",
    description: "دسته‌ها به‌صورت تب افقی بالای صفحه، آیتم‌ها در لیست با عکس کنار متن",
  },
  {
    id: "cards",
    title: "کارت‌ها",
    description: "شبکه کارت‌های تصویری؛ هر آیتم یک کارت جدا با عکس بزرگ است",
  },
  {
    id: "compact",
    title: "سایدبار",
    description: "دسته‌ها در ستون کناری ثابت می‌مانند و آیتم‌ها لیست فشرده بدون عکس‌اند",
  },
  {
    id: "magazine",
    title: "مجله‌ای",
    description: "همه دسته‌ها پشت‌سرهم در یک صفحه؛ اولین آیتم هر دسته بزرگ نمایش داده می‌شود",
  },
  {
    id: "personal",
    title: "منوی شخصی من",
    description: "طراحی اختصاصی برای کافه شما — نیاز به هماهنگی با پشتیبانی",
    requiresSupport: true,
  },
];

export type SiteSettings = {
  restaurantNameFa: string;
  restaurantNameEn: string;
  tagline: string;
  address: string;
  phone: string;
  logo: string;
  backgroundImage: string;
  primary: string;
  secondary: string;
  creditName: string;
  telegram: string;
  email: string;
  showNewSection: boolean;
  showFooterCredit: boolean;
  showContactOnMenu: boolean;
  showLogoOnMenu: boolean;
  showLogoOnReceipt: boolean;
  showContactOnReceipt: boolean;
  receiptFooterMessage: string;
  showBackgroundOnMenu: boolean;
  menuStructure: MenuStructureId;
  updatedAt?: number;
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  restaurantNameFa: DEFAULT_CAFE_NAME_FA,
  restaurantNameEn: DEFAULT_CAFE_NAME_EN,
  tagline: SITE_CONFIG.tagline,
  address: "",
  phone: "",
  logo: "",
  backgroundImage: "",
  primary: SITE_CONFIG.primary,
  secondary: SITE_CONFIG.secondary,
  creditName: SITE_CONFIG.creditName,
  telegram: SITE_CONFIG.telegram,
  email: SITE_CONFIG.email,
  showNewSection: true,
  showFooterCredit: true,
  showContactOnMenu: false,
  showLogoOnMenu: true,
  showLogoOnReceipt: false,
  showContactOnReceipt: true,
  receiptFooterMessage: "به امید دیدار مجدد",
  showBackgroundOnMenu: true,
  menuStructure: "classic",
  updatedAt: 0,
};

/** Clean defaults for SaaS tenant cafes (no Buzz/demo branding). */
export function tenantDefaultSiteSettings(
  nameFa = DEFAULT_CAFE_NAME_FA,
  nameEn = DEFAULT_CAFE_NAME_EN
): SiteSettings {
  return {
    restaurantNameFa: nameFa,
    restaurantNameEn: nameEn,
    tagline: "",
    address: "",
    phone: "",
    logo: "",
    backgroundImage: "",
    primary: "#566347",
    secondary: "#D8DAD3",
    creditName: "",
    telegram: "",
    email: "",
    showNewSection: true,
    showFooterCredit: true,
    showContactOnMenu: false,
    showLogoOnMenu: true,
    showLogoOnReceipt: false,
    showContactOnReceipt: true,
    receiptFooterMessage: "",
    showBackgroundOnMenu: true,
    menuStructure: "classic",
    updatedAt: 0,
  };
}

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MENU_STRUCTURE_IDS = new Set(
  MENU_STRUCTURE_OPTIONS.map((opt) => opt.id)
);

export function normalizeMenuStructure(
  raw: unknown,
  fallback: MenuStructureId = "classic"
): MenuStructureId {
  const id = String(raw || "").trim() as MenuStructureId;
  return MENU_STRUCTURE_IDS.has(id) ? id : fallback;
}

export function resolveMenuStructure(
  structure: MenuStructureId | undefined
): Exclude<MenuStructureId, "personal"> {
  const id = normalizeMenuStructure(structure);
  return id === "personal" ? "classic" : id;
}

export function normalizeHexColor(raw: string, fallback: string): string {
  const v = String(raw || "").trim();
  if (!HEX_COLOR.test(v)) return fallback;
  if (v.length === 4) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return v.toUpperCase();
}

export function settingsBaseForContext(
  nameFa?: string,
  nameEn?: string
): SiteSettings {
  if (getMenuTenantSlug()) {
    return tenantDefaultSiteSettings(
      nameFa || DEFAULT_CAFE_NAME_FA,
      nameEn || nameFa || DEFAULT_CAFE_NAME_EN
    );
  }
  return DEFAULT_SITE_SETTINGS;
}

export function mergeSiteSettings(
  raw?: Partial<SiteSettings> | null,
  base?: SiteSettings
): SiteSettings {
  const b = base ?? settingsBaseForContext();
  if (!raw || typeof raw !== "object") return b;

  const src = raw as Partial<SiteSettings> & Record<string, unknown>;

  return {
    restaurantNameFa: clip(src.restaurantNameFa, b.restaurantNameFa, 80),
    restaurantNameEn: clip(src.restaurantNameEn, b.restaurantNameEn, 80),
    tagline: clip(src.tagline, b.tagline, 200),
    address: clipOptional(src.address, 200),
    phone: clipOptional(src.phone, 40),
    logo: normalizeAssetPath(src.logo ?? src.logoUrl),
    backgroundImage: normalizeAssetPath(
      src.backgroundImage ?? src.backgroundUrl
    ),
    primary: normalizeHexColor(
      String(src.primary ?? src.primaryColor ?? ""),
      b.primary
    ),
    secondary: normalizeHexColor(
      String(src.secondary ?? src.secondaryColor ?? ""),
      b.secondary
    ),
    creditName: clip(src.creditName, b.creditName, 120),
    telegram: clip(src.telegram, b.telegram, 200),
    email: clip(src.email, b.email, 120),
    showNewSection:
      typeof src.showNewSection === "boolean"
        ? src.showNewSection
        : b.showNewSection,
    showFooterCredit:
      typeof src.showFooterCredit === "boolean"
        ? src.showFooterCredit
        : b.showFooterCredit,
    showContactOnMenu:
      typeof src.showContactOnMenu === "boolean"
        ? src.showContactOnMenu
        : b.showContactOnMenu,
    showLogoOnMenu:
      typeof src.showLogoOnMenu === "boolean"
        ? src.showLogoOnMenu
        : b.showLogoOnMenu,
    showLogoOnReceipt:
      typeof src.showLogoOnReceipt === "boolean"
        ? src.showLogoOnReceipt
        : b.showLogoOnReceipt,
    showContactOnReceipt:
      typeof src.showContactOnReceipt === "boolean"
        ? src.showContactOnReceipt
        : b.showContactOnReceipt,
    receiptFooterMessage: clip(
      src.receiptFooterMessage,
      b.receiptFooterMessage,
      120
    ),
    showBackgroundOnMenu:
      typeof src.showBackgroundOnMenu === "boolean"
        ? src.showBackgroundOnMenu
        : b.showBackgroundOnMenu,
    menuStructure: normalizeMenuStructure(src.menuStructure, b.menuStructure),
    updatedAt:
      typeof src.updatedAt === "number" && src.updatedAt > 0
        ? src.updatedAt
        : b.updatedAt,
  };
}

function clip(value: unknown, fallback: string, max: number): string {
  const s = String(value ?? "").trim();
  if (!s) return fallback;
  return s.length > max ? s.slice(0, max) : s;
}

function clipOptional(value: unknown, max: number): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeAssetPath(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (s.startsWith("data:")) return "";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) {
    return s.slice(0, 300);
  }
  if (s.startsWith("uploads/")) return s.slice(0, 300);
  return "";
}

export function applySiteTheme(settings: SiteSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--primary", settings.primary);
  root.style.setProperty("--secondary", settings.secondary);
  root.style.setProperty("--accent", settings.primary);
  root.style.setProperty("--surface", settings.secondary);
  root.style.setProperty("--color-primary", settings.primary);
  root.style.setProperty("--color-surface", settings.secondary);
}
