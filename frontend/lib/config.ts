export type SiteConfig = {
  primary: string;
  secondary: string;
  tagline: string;
  apiUrl: string;
  creditName: string;
  telegram: string;
  email: string;
};

export const SITE_CONFIG: SiteConfig = {
  primary: "#D8DAD3",
  secondary: "#566347",
  tagline: "قهوه تخصصی، طعمی متفاوت از غذا",
  // Empty in local dev (Next.js proxies /api). Set on Netlify:
  // NEXT_PUBLIC_MIIZIITO_API_URL=https://your-api-host.example.com
  apiUrl:
    process.env.NEXT_PUBLIC_MIIZIITO_API_URL ||
    process.env.NEXT_PUBLIC_LUMIERE_API_URL ||
    "",
  creditName: "Mohamad Shojaei",
  telegram: "https://t.me/mo1hamad",
  email: "mohamad.shojaie.bg@gmail.com",
};

export function applyTheme(config: SiteConfig = SITE_CONFIG) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--primary", config.primary);
  root.style.setProperty("--secondary", config.secondary);
  root.style.setProperty("--accent", config.primary);
  root.style.setProperty("--surface", config.secondary);
  root.style.setProperty("--color-primary", config.primary);
  root.style.setProperty("--color-surface", config.secondary);
}
