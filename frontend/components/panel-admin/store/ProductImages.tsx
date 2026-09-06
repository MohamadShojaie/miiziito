"use client";

const IMAGES = {
  menu: {
    src: "/assets/marketing/digital-menu.png",
    alt: "پیش‌نمایش منوی دیجیتال — رابط مشتری روی موبایل",
  },
  admin: {
    src: "/assets/marketing/management-system.png",
    alt: "پیش‌نمایش سیستم مدیریت — پنل کافه و رستوران",
  },
} as const;

type ProductImageVariant = keyof typeof IMAGES;

export function ProductImage({
  variant,
  className = "",
  priority = false,
}: {
  variant: ProductImageVariant;
  className?: string;
  priority?: boolean;
}) {
  const { src, alt } = IMAGES[variant];

  return (
    <figure className={`mzt-product-image ${className}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" />
    </figure>
  );
}
