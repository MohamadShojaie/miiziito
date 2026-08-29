"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiUrl,
  cashierHeaders,
  getCashierToken,
  isAlertMuted,
  sandboxHeaders,
  streamUrl,
} from "@/lib/api";
import type { Invoice, Order, Reservation, TablesPayload } from "@/lib/types";

type SyncState = "live" | "offline" | "connecting";

function playAlertTone(freq = 523.25) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(ctx.destination);
    g.gain.value = 0.04;
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    /* ignore */
  }
}

export function useOrdersLive(enabled: boolean) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Record<string, string>>({});
  const [regions, setRegions] = useState<TablesPayload["regions"]>([]);
  const [sync, setSync] = useState<SyncState>("connecting");
  const [syncLabel, setSyncLabel] = useState("در حال اتصال…");
  const [ready, setReady] = useState(false);
  const sinceRef = useRef(0);
  const known = useRef<Record<string, boolean>>({});
  const knownReservations = useRef<Record<string, boolean>>({});
  const armed = useRef(false);

  const applyPayload = useCallback((data: TablesPayload) => {
    if (Array.isArray(data.orders)) {
      if (armed.current && !isAlertMuted()) {
        data.orders.forEach((o) => {
          if (!o?.id) return;
          if (!known.current[o.id] && (o.status === "waiting" || !o.status)) {
            playAlertTone(523.25);
          }
          known.current[o.id] = true;
        });
      } else {
        data.orders.forEach((o) => {
          if (o?.id) known.current[o.id] = true;
        });
      }
      setOrders(data.orders);
    } else if (data.order?.id) {
      const patched = data.order;
      known.current[patched.id] = true;
      setOrders((prev) => {
        const i = prev.findIndex((o) => o.id === patched.id);
        if (i < 0) return [patched, ...prev];
        const next = prev.slice();
        next[i] = patched;
        return next;
      });
    }
    if (Array.isArray(data.reservations)) {
      if (armed.current && !isAlertMuted()) {
        data.reservations.forEach((r) => {
          if (!r?.id) return;
          if (!knownReservations.current[r.id] && r.status === "pending") {
            playAlertTone(659.25);
          }
          knownReservations.current[r.id] = true;
        });
      } else {
        data.reservations.forEach((r) => {
          if (r?.id) knownReservations.current[r.id] = true;
        });
      }
      setReservations(data.reservations);
    } else if (data.reservation?.id) {
      const patched = data.reservation;
      knownReservations.current[patched.id] = true;
      setReservations((prev) => {
        const i = prev.findIndex((r) => r.id === patched.id);
        if (i < 0) return [patched, ...prev];
        const next = prev.slice();
        next[i] = patched;
        return next;
      });
    }
    if (data.tables) setTables(data.tables);
    if (data.regions) setRegions(data.regions);
    if (Array.isArray(data.invoices)) setInvoices(data.invoices);
    if (data.since) sinceRef.current = data.since;
  }, []);

  const fetchOnce = useCallback(async () => {
    const res = await fetch(apiUrl("/api/orders"), { headers: sandboxHeaders() });
    if (!res.ok) throw new Error("orders");
    const data = (await res.json()) as TablesPayload;
    setSync("live");
    setSyncLabel("آنلاین — اتصال زنده");
    applyPayload(data);
    setReady(true);
    return data;
  }, [applyPayload]);

  useEffect(() => {
    if (!enabled || !getCashierToken()) {
      setReady(false);
      setSync("connecting");
      setSyncLabel("در حال اتصال…");
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;

    function startPoll() {
      const tick = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(streamUrl("poll", sinceRef.current), {
            headers: cashierHeaders(),
          });
          if (res.status === 401) {
            setSync("offline");
            setSyncLabel("نیاز به ورود مجدد");
            return;
          }
          if (!res.ok) throw new Error("stream");
          const data = (await res.json()) as TablesPayload;
          setSync("live");
          setSyncLabel("آنلاین — اتصال زنده");
          applyPayload(data);
          setReady(true);
        } catch {
          setSync("offline");
          setSyncLabel("قطع ارتباط با سرور");
        }
        if (!cancelled) pollTimer = setTimeout(tick, 2500);
      };
      tick();
    }

    fetchOnce()
      .then(() => {
        armed.current = true;
        if (cancelled) return;
        if (typeof EventSource === "undefined") {
          startPoll();
          return;
        }
        try {
          es = new EventSource(streamUrl("sse"));
          es.onmessage = (ev) => {
            try {
              const data = JSON.parse(ev.data) as TablesPayload;
              setSync("live");
              setSyncLabel("آنلاین — اتصال زنده");
              applyPayload(data);
              setReady(true);
            } catch {
              /* */
            }
          };
          es.addEventListener("auth", () => {
            setSync("offline");
            setSyncLabel("نیاز به ورود مجدد");
            es?.close();
          });
          es.onerror = () => {
            es?.close();
            if (!cancelled) startPoll();
          };
        } catch {
          startPoll();
        }
      })
      .catch(() => {
        setSync("offline");
        setSyncLabel("سرور در دسترس نیست");
        startPoll();
      });

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (es) {
        try {
          es.close();
        } catch {
          /* */
        }
      }
    };
  }, [enabled, applyPayload, fetchOnce]);

  return {
    orders,
    setOrders,
    invoices,
    setInvoices,
    reservations,
    setReservations,
    tables,
    setTables,
    regions,
    setRegions,
    sync,
    syncLabel,
    ready,
    loading: !ready,
    refresh: fetchOnce,
    applyPayload,
  };
}
