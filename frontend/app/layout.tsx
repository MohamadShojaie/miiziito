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
  description: "قهوه تخصصی، طعمی متفاوت از غذا",
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
