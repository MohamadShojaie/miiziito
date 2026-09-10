import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { Providers } from "@/components/Providers";
import { PLATFORM_BRAND } from "@/lib/brand";
import { LANDING_DESCRIPTION } from "@/lib/landing-seo";
import { absoluteUrl, siteOrigin } from "@/lib/site-url";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-cormorant",
});

export const metadata: Metadata = {
  metadataBase: new URL(`${siteOrigin()}/`),
  title: {
    default: PLATFORM_BRAND.title,
    template: `%s | ${PLATFORM_BRAND.nameFa}`,
  },
  description: LANDING_DESCRIPTION,
  applicationName: PLATFORM_BRAND.nameFa,
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: PLATFORM_BRAND.markSvg, type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    siteName: PLATFORM_BRAND.nameFa,
    title: PLATFORM_BRAND.title,
    description: LANDING_DESCRIPTION,
    url: absoluteUrl("/"),
    images: [{ url: "/og.png", width: 1200, height: 630, alt: PLATFORM_BRAND.title }],
  },
  twitter: {
    card: "summary_large_image",
    title: PLATFORM_BRAND.title,
    description: LANDING_DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className={cormorant.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
