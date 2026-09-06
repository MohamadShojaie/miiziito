import { CafeMenuPage } from "@/components/customer/CafeMenuPage";

/** Static export: all cafe slugs served via _/index.html + .htaccess rewrite */
export function generateStaticParams() {
  return [{ slug: "_" }];
}

export default function CafeSlugRoutePage() {
  return <CafeMenuPage />;
}
