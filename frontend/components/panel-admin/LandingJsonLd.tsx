import { landingJsonLdGraph } from "@/lib/landing-seo";

/** Server-rendered JSON-LD for the public landing (Organization, WebApplication, FAQ). */
export function LandingJsonLd() {
  const data = landingJsonLdGraph();
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
