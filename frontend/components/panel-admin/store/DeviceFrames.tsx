"use client";

import type { ReactNode } from "react";
import { ProductAdminPreview, ProductMenuPreview } from "./ProductPreviews";

export function IPhoneFrame({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="mzt-device mzt-device--iphone">
      {label ? <span className="mzt-device-label">{label}</span> : null}
      <div className="mzt-device-iphone-body">
        <div className="mzt-device-iphone-btn mzt-device-iphone-btn--silent" aria-hidden="true" />
        <div className="mzt-device-iphone-btn mzt-device-iphone-btn--power" aria-hidden="true" />
        <div className="mzt-device-iphone-screen">
          <div className="mzt-device-iphone-notch" aria-hidden="true">
            <span />
          </div>
          <div className="mzt-device-iphone-content">{children}</div>
          <div className="mzt-device-iphone-home" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export function MacBookFrame({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="mzt-device mzt-device--macbook">
      {label ? <span className="mzt-device-label">{label}</span> : null}
      <div className="mzt-device-mac-lid">
        <div className="mzt-device-mac-bezel">
          <div className="mzt-device-mac-camera" aria-hidden="true" />
          <div className="mzt-device-mac-screen">
            <div className="mzt-device-mac-content">{children}</div>
          </div>
        </div>
      </div>
      <div className="mzt-device-mac-base" aria-hidden="true">
        <div className="mzt-device-mac-trackpad" />
      </div>
    </div>
  );
}

export function MenuPreviewDevice() {
  return (
    <IPhoneFrame label="iPhone · منوی مشتری">
      <ProductMenuPreview />
    </IPhoneFrame>
  );
}

export function AdminPreviewDevice() {
  return (
    <MacBookFrame label="Mac · پنل صندوق">
      <ProductAdminPreview />
    </MacBookFrame>
  );
}
