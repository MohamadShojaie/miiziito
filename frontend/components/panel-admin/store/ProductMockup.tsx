"use client";

import { IPhoneFrame, MacBookFrame } from "./DeviceFrames";
import { ProductAdminPreview, ProductMenuPreview } from "./ProductPreviews";

function BrowserChrome() {
  return (
    <div className="mzt-browser-chrome" aria-hidden="true">
      <span className="mzt-browser-dot" />
      <span className="mzt-browser-dot" />
      <span className="mzt-browser-dot" />
      <span className="mzt-browser-url">miiziito.ir/menu</span>
    </div>
  );
}

/** Full-size mockups for showcase sections */
export function PhoneMockup() {
  return (
    <div className="mzt-mockup mzt-mockup--phone mzt-mockup--showcase">
      <IPhoneFrame>
        <ProductMenuPreview showcase />
      </IPhoneFrame>
    </div>
  );
}

export function DesktopMockup() {
  return (
    <div className="mzt-mockup mzt-mockup--desktop mzt-mockup--showcase">
      <MacBookFrame>
        <ProductAdminPreview showcase />
      </MacBookFrame>
    </div>
  );
}

/** Compact layered composition for the hero only */
export function HeroMockups() {
  return (
    <div className="mzt-hero-mockups">
      <div className="mzt-mockup mzt-mockup--desktop mzt-mockup--hero">
        <MacBookFrame>
          <ProductAdminPreview compact />
        </MacBookFrame>
      </div>
      <div className="mzt-mockup mzt-mockup--phone mzt-mockup--hero">
        <IPhoneFrame>
          <ProductMenuPreview compact />
        </IPhoneFrame>
      </div>
    </div>
  );
}

export function ProductShot({ variant }: { variant: "menu" | "admin" }) {
  return (
    <div className="mzt-mockup mzt-mockup--browser mzt-mockup--showcase">
      <BrowserChrome />
      <div className="mzt-mockup-browser-body">
        {variant === "menu" ? <ProductMenuPreview showcase /> : <ProductAdminPreview showcase />}
      </div>
    </div>
  );
}
