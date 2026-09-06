import { CafeAdminPage } from "@/components/admin/CafeAdminPage";

/** Static export: all cafe admin URLs served via _/admin/index.html + .htaccess rewrite */
export function generateStaticParams() {
  return [{ slug: "_" }];
}

export default function CafeSlugAdminRoutePage() {
  return <CafeAdminPage />;
}
