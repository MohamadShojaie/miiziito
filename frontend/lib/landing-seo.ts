import { PLATFORM_BRAND } from "@/lib/brand";
import { absoluteUrl, siteOrigin } from "@/lib/site-url";

export const LANDING_SUPPORT_PHONE = "09031261254";

export const LANDING_FAQ = [
  {
    q: "آیا مشتری نیاز به نصب اپلیکیشن دارد؟",
    a: "خیر. مشتری با اسکن QR Code منوی شما را در مرورگر موبایل باز می‌کند — بدون دانلود یا نصب.",
  },
  {
    q: "راه‌اندازی منوی دیجیتال چقدر زمان می‌برد؟",
    a: "پس از خرید پلن و ثبت‌نام، می‌توانید محصولات و دسته‌بندی‌ها را وارد کنید و QR منو را در همان روز استفاده کنید.",
  },
  {
    q: "آیا روی موبایل و تبلت هم کار می‌کند؟",
    a: "بله. هم منوی مشتری و هم پنل مدیریت روی موبایل، تبلت و کامپیوتر در مرورگر کار می‌کنند.",
  },
  {
    q: "آیا می‌توانم منوی خودم را شخصی‌سازی کنم؟",
    a: "بله. نام کافه، لوگو، رنگ برند و چیدمان منو قابل تنظیم است.",
  },
  {
    q: "آیا امکان مدیریت سفارش‌ها وجود دارد؟",
    a: "بله. سفارش‌های آنلاین و دستی در پنل مدیریت با وضعیت‌های مختلف (جدید، آماده‌سازی، آماده) قابل پیگیری هستند.",
  },
  {
    q: "آیا اطلاعات مشتریان ذخیره می‌شود؟",
    a: "بله. باشگاه مشتریان تاریخچه سفارش، پروفایل و امتیاز وفاداری را نگه می‌دارد (بسته به پلن اشتراک).",
  },
  {
    q: "پلن‌های اشتراک چگونه هستند؟",
    a: "پلن‌های ۶ ماهه و سالانه با امکانات متفاوت وجود دارد. جزئیات در بخش قیمت‌گذاری نمایش داده می‌شود.",
  },
  {
    q: "چطور با پشتیبانی تماس بگیرم؟",
    a: "از بخش «تماس با ما» پیام بگذارید یا با شماره و تلگرام پشتیبانی ارتباط بگیرید. تیم میزیتو در اولین فرصت پاسخ می‌دهد.",
  },
] as const;

export const LANDING_DESCRIPTION =
  "منوی دیجیتال QR برای مشتری و سیستم مدیریت یکپارچه برای کافه و رستوران — سفارش سر میز، صندوق، فاکتور و باشگاه مشتریان.";

export const LANDING_TITLE = `${PLATFORM_BRAND.title} — منوی دیجیتال و سیستم مدیریت`;

export function landingJsonLdGraph() {
  const origin = siteOrigin();
  const logo = absoluteUrl(PLATFORM_BRAND.markPng);
  const orgId = `${origin}/#organization`;
  const appId = `${origin}/#software`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: PLATFORM_BRAND.nameFa,
        alternateName: PLATFORM_BRAND.nameEn,
        url: `${origin}/`,
        logo,
        contactPoint: [
          {
            "@type": "ContactPoint",
            telephone: `+98${LANDING_SUPPORT_PHONE.replace(/^0/, "")}`,
            contactType: "customer support",
            availableLanguage: ["Persian", "fa"],
          },
        ],
      },
      {
        "@type": "WebApplication",
        "@id": appId,
        name: PLATFORM_BRAND.nameFa,
        alternateName: PLATFORM_BRAND.nameEn,
        url: `${origin}/`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "fa-IR",
        description: LANDING_DESCRIPTION,
        provider: { "@id": orgId },
        offers: {
          "@type": "Offer",
          url: `${origin}/#plans`,
          priceCurrency: "IRR",
          availability: "https://schema.org/InStock",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${origin}/#faq`,
        mainEntity: LANDING_FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
      },
    ],
  };
}
