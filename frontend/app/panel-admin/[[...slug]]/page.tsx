import { PanelAdminApp } from "@/components/panel-admin/PanelAdminApp";

/** Static paths for `output: "export"` + trailingSlash. Dynamic IDs use `_` + .htaccess rewrite. */
export function generateStaticParams() {
  return [
    { slug: [] },
    { slug: ["login"] },
    { slug: ["register"] },
    { slug: ["account"] },
    { slug: ["manage"] },
    { slug: ["dashboard"] },
    { slug: ["requests"] },
    { slug: ["cafes"] },
    { slug: ["cafes", "_"] },
    { slug: ["plans"] },
    { slug: ["plans", "_"] },
    { slug: ["subscriptions"] },
    { slug: ["subscriptions", "_"] },
    { slug: ["payments"] },
    { slug: ["payments", "_"] },
    { slug: ["coupons"] },
    { slug: ["analytics"] },
    { slug: ["analytics", "revenue"] },
    { slug: ["analytics", "customers"] },
    { slug: ["analytics", "subscriptions"] },
    { slug: ["notifications"] },
    { slug: ["support"] },
    { slug: ["support", "_"] },
    { slug: ["system"] },
    { slug: ["system", "health"] },
    { slug: ["system", "settings"] },
    { slug: ["audit-logs"] },
    { slug: ["admin-users"] },
    { slug: ["roles"] },
  ];
}

export default function PanelAdminCatchAllPage() {
  return <PanelAdminApp />;
}
