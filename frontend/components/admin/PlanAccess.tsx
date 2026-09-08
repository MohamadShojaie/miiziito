"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  UNLOCKED_ACCESS,
  hasPlanFeature,
  type PlanAccess,
  type PlanFeature,
} from "@/lib/plan-access";

type PlanAccessContextValue = {
  access: PlanAccess;
  has: (feature: PlanFeature) => boolean;
  requestUpgrade: (feature: PlanFeature) => void;
};

const PlanAccessContext = createContext<PlanAccessContextValue | null>(null);

export function PlanAccessProvider({
  access,
  onUpgrade,
  children,
}: {
  access: PlanAccess;
  onUpgrade: (feature: PlanFeature) => void;
  children: ReactNode;
}) {
  const has = useCallback(
    (feature: PlanFeature) => hasPlanFeature(access, feature),
    [access]
  );
  const value = useMemo(
    () => ({ access, has, requestUpgrade: onUpgrade }),
    [access, has, onUpgrade]
  );
  return (
    <PlanAccessContext.Provider value={value}>
      {children}
    </PlanAccessContext.Provider>
  );
}

export function usePlanAccess(): PlanAccessContextValue {
  const ctx = useContext(PlanAccessContext);
  if (!ctx) {
    return {
      access: UNLOCKED_ACCESS,
      has: () => true,
      requestUpgrade: () => {},
    };
  }
  return ctx;
}
