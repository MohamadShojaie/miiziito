import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { Providers } from "@/components/Providers";
import { PLATFORM_BRAND } from "@/lib/brand";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-cormorant",
});

export const metadata: Metadata = {
  title: PLATFORM_BRAND.title,
  description: "پلتفرم منوی دیجیتال و مدیریت کافه و رستوران",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: PLATFORM_BRAND.markSvg, type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
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
