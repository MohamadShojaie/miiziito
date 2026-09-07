import { PLATFORM_BRAND } from "@/lib/brand";

const MARK_SRC = "/assets/branding/miiziito-mark.svg";

/** Platform logo (mark + Persian wordmark) for panel-admin surfaces. */
export function BrandMark({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={`mzt-brand-mark${className ? ` ${className}` : ""}`}>
      <img
        className="mzt-brand-mark-icon"
        src={MARK_SRC}
        alt=""
        width={36}
        height={36}
        decoding="async"
      />
      {showWordmark ? (
        <span className="mzt-brand-mark-text" aria-label={PLATFORM_BRAND.nameFa}>
          میزی<span>یتو</span>
        </span>
      ) : (
        <span className="sr-only">{PLATFORM_BRAND.nameFa}</span>
      )}
    </span>
  );
}

export function BrandTitle({ className }: { className?: string }) {
  return <span className={className}>{PLATFORM_BRAND.title}</span>;
}
