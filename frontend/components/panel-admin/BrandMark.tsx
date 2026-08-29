import { PLATFORM_BRAND } from "@/lib/brand";

/** Platform logo text for panel-admin (میزییتو). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={className}>
      میزی<span>یتو</span>
    </span>
  );
}

export function BrandTitle({ className }: { className?: string }) {
  return <span className={className}>{PLATFORM_BRAND.title}</span>;
}
