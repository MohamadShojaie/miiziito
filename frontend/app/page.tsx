import type { Metadata } from "next";
import { PlatformStoreApp } from "@/components/panel-admin/PlatformStoreApp";
import { PLATFORM_BRAND } from "@/lib/brand";
import "@/styles/panel-admin.css";
import "@/styles/store-landing.css";

export const metadata: Metadata = {
  title: `${PLATFORM_BRAND.title} — منوی دیجیتال و سیستم مدیریت`,
  description:
    "منوی دیجیتال QR برای مشتری و سیستم مدیریت یکپارچه برای کافه و رستوران — سفارش، صندوق و فروش.",
};

/** Platform landing — https://miiziito.ir/ */
export default function HomePage() {
  return <PlatformStoreApp />;
}
