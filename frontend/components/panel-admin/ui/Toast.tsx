"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

let pushToastExternal: ((message: string, tone?: Toast["tone"]) => void) | null = null;

export function toast(message: string, tone: Toast["tone"] = "info") {
  pushToastExternal?.(message, tone);
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    pushToastExternal = push;
    return () => {
      pushToastExternal = null;
    };
  }, [push]);

  return (
    <>
      {children}
      <div className="sa-toast-host" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`sa-toast ${t.tone === "info" ? "" : t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
