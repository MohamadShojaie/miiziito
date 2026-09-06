"use client";

import { IconSpark } from "@/components/panel-admin/store/StoreIcons";
import { ProductImage } from "@/components/panel-admin/store/ProductImages";
import { FeatureCheckList } from "@/components/panel-admin/store/ProductPreviews";

const DIGITAL_MENU = {
  id: "digital-menu",
  title: "منوی دیجیتال",
  subtitle: "تجربه‌ای مدرن برای مشتری",
  desc: "منوی QR زیبا با دسته‌بندی آیکون‌دار، تصاویر خطی آیتم‌ها، سبد خرید و سفارش آنلاین — بدون نیاز به نصب اپ.",
  features: [
    "دسته‌بندی با آیکون SVG",
    "سه چیدمان: کارت، فشرده، مجله",
    "تاپینگ، سبد و سفارش آنلاین",
    "برندینگ اختصاصی (رنگ و لوگو)",
  ],
} as const;

const MANAGEMENT = {
  id: "management",
  title: "سیستم مدیریت",
  subtitle: "کنترل کامل کافه و رستوران",
  desc: "پنل یکپارچه برای سفارش، صندوق، فاکتور، رزرو، میز، منو، آمار و باشگاه مشتریان — همه در یک جا.",
  features: [
    "سفارش زنده با هشدار صوتی",
    "صندوق، فاکتور و چاپ",
    "رزرو، میز و مدیریت منو",
    "آمار فروش و باشگاه مشتریان",
  ],
} as const;

export function ProductShowcases() {
  return (
    <div className="mzt-products" id="products">
      <div className="mzt-section-head">
        <span className="mzt-eyebrow">
          <IconSpark />
          محصولات
        </span>
        <h2>دو رابط، یک پلتفرم</h2>
        <p>منوی دیجیتال برای مشتری — سیستم مدیریت برای شما</p>
      </div>

      <article className="mzt-product mzt-product--menu" id={DIGITAL_MENU.id}>
        <div className="mzt-product-copy">
          <span className="mzt-product-tag">برای مشتری</span>
          <h3>{DIGITAL_MENU.title}</h3>
          <p className="mzt-product-sub">{DIGITAL_MENU.subtitle}</p>
          <p className="mzt-product-desc">{DIGITAL_MENU.desc}</p>
          <FeatureCheckList items={DIGITAL_MENU.features} />
        </div>
        <div className="mzt-product-visual">
          <div className="mzt-product-glow mzt-product-glow--gold" aria-hidden="true" />
          <ProductImage variant="menu" />
        </div>
      </article>

      <article className="mzt-product mzt-product--admin" id={MANAGEMENT.id}>
        <div className="mzt-product-visual">
          <div className="mzt-product-glow mzt-product-glow--warm" aria-hidden="true" />
          <ProductImage variant="admin" />
        </div>
        <div className="mzt-product-copy">
          <span className="mzt-product-tag">برای کسب‌وکار</span>
          <h3>{MANAGEMENT.title}</h3>
          <p className="mzt-product-sub">{MANAGEMENT.subtitle}</p>
          <p className="mzt-product-desc">{MANAGEMENT.desc}</p>
          <FeatureCheckList items={MANAGEMENT.features} />
        </div>
      </article>
    </div>
  );
}
