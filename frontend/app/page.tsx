import type { Metadata } from "next";
import { PlatformStoreApp } from "@/components/panel-admin/PlatformStoreApp";
import { LandingJsonLd } from "@/components/panel-admin/LandingJsonLd";
import { LANDING_DESCRIPTION, LANDING_TITLE } from "@/lib/landing-seo";
import { PLATFORM_BRAND } from "@/lib/brand";
import { absoluteUrl } from "@/lib/site-url";
import "@/styles/panel-admin.css";
import "@/styles/store-landing.css";

export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  applicationName: PLATFORM_BRAND.nameFa,
  keywords: [
    "منوی دیجیتال",
    "منوی QR",
    "سیستم مدیریت کافه",
    "صندوق کافه",
    "میزیتو",
    "Miiziito",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    siteName: PLATFORM_BRAND.nameFa,
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    url: absoluteUrl("/"),
    images: [{ url: "/og.png", width: 1200, height: 630, alt: LANDING_TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    images: ["/og.png"],
  },
};

/** Platform landing — https://miiziito.ir/ */
export default function HomePage() {
  return (
    <>
      <LandingJsonLd />
      <PlatformStoreApp />
    </>
  );
}
