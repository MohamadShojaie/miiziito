"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadCartRaw, saveCartRaw } from "@/lib/api";
import type { CartLine, Topping } from "@/lib/types";

type CartContextValue = {
  lines: CartLine[];
  addItem: (item: {
    id: string;
    name: string;
    unit: number;
    toppings?: Topping[];
  }) => void;
  setCount: (key: string, count: number) => void;
  clear: () => void;
  total: number;
  count: number;
};

const CartContext = createContext<CartContextValue | null>(null);

function lineKey(id: string, toppings?: Topping[]) {
  const t = (toppings || [])
    .map((x) => x.name)
    .sort()
    .join("|");
  return `${id}::${t}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    const raw = loadCartRaw();
    if (Array.isArray(raw)) setLines(raw as CartLine[]);
  }, []);

  useEffect(() => {
    saveCartRaw(lines);
  }, [lines]);

  const addItem = useCallback(
    (item: { id: string; name: string; unit: number; toppings?: Topping[] }) => {
      const key = lineKey(item.id, item.toppings);
      setLines((prev) => {
        const i = prev.findIndex((l) => l.key === key);
        if (i >= 0) {
          const next = prev.slice();
          next[i] = { ...next[i], count: next[i].count + 1 };
          return next;
        }
        return [
          ...prev,
          {
            key,
            id: item.id,
            name: item.name,
            unit: item.unit,
            count: 1,
            toppings: item.toppings,
          },
        ];
      });
    },
    []
  );

  const setCount = useCallback((key: string, count: number) => {
    setLines((prev) => {
      if (count <= 0) return prev.filter((l) => l.key !== key);
      return prev.map((l) => (l.key === key ? { ...l, count } : l));
    });
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const total = useMemo(
    () =>
      lines.reduce((s, l) => {
        const top = (l.toppings || []).reduce((a, t) => a + (t.price || 0), 0);
        return s + (l.unit + top) * l.count;
      }, 0),
    [lines]
  );

  const count = useMemo(
    () => lines.reduce((s, l) => s + l.count, 0),
    [lines]
  );

  const value = useMemo(
    () => ({ lines, addItem, setCount, clear, total, count }),
    [lines, addItem, setCount, clear, total, count]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart outside provider");
  return ctx;
}
