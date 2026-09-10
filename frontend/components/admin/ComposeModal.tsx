"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  Invoice,
  MenuItem,
  Order,
  OrderItem,
  TableRegion,
  Topping,
} from "@/lib/types";
import { tablesFromRegions } from "@/lib/types";
import { formatPriceAsNumber, parsePrice, toPersianDigits, TAKEAWAY_TABLE } from "@/lib/format";
import { apiJson, cashierHeaders } from "@/lib/api";
import {
  buildCustomerCategories,
  type MenuOverrides,
} from "@/lib/menu-utils";
import { useToast } from "@/components/ToastProvider";
import {
  CustomerPicker,
  type CustomerPick,
} from "@/components/admin/CustomerPicker";

type ComposeLine = {
  key: string;
  id: string;
  name: string;
  unit: number;
  count: number;
  toppings?: Topping[];
};

function toppingKey(toppings?: Topping[]) {
  return (toppings || [])
    .map((t) => t.name)
    .filter(Boolean)
    .sort()
    .join("|");
}

function lineKey(id: string, toppings?: Topping[]) {
  return `${id}::${toppingKey(toppings)}`;
}

function normalizeToppings(raw?: OrderItem["toppings"]): Topping[] {
  if (!raw?.length) return [];
  const out: Topping[] = [];
  for (const t of raw) {
    if (typeof t === "string") {
      if (t.trim()) out.push({ name: t.trim(), price: 0 });
      continue;
    }
    const name = String(t?.name || "").trim();
    if (!name) continue;
    out.push({ name, price: Number(t.price) || 0 });
  }
  return out;
}

function toppingLabel(toppings?: Topping[]) {
  return (toppings || [])
    .map((t) => t.name)
    .filter(Boolean)
    .join(" · ");
}

function linesFromItems(items?: OrderItem[]): ComposeLine[] {
  const merged = new Map<string, ComposeLine>();
  (items || []).forEach((it) => {
    const id = String(it.id || it.name);
    if (!id) return;
    const toppings = normalizeToppings(it.toppings);
    const key = lineKey(id, toppings);
    const count = Math.max(1, Number(it.count) || 1);
    const prev = merged.get(key);
    if (prev) {
      prev.count += count;
      return;
    }
    merged.set(key, {
      key,
      id,
      name: it.name,
      unit: parsePrice(it.price),
      count,
      toppings: toppings.length ? toppings : undefined,
    });
  });
  return Array.from(merged.values());
}

export function ComposeModal({
  open,
  order,
  tables,
  regions,
  invoices = [],
  onClose,
  onDone,
}: {
  open: boolean;
  order?: Order | null;
  tables: Record<string, string>;
  regions?: TableRegion[];
  invoices?: Invoice[];
  onClose: () => void;
  onDone: (data: unknown) => void;
}) {
  const { showToast } = useToast();
  const [channel, setChannel] = useState<"table" | "takeaway">("table");
  const [table, setTable] = useState("");
  const [q, setQ] = useState("");
  const [activeCi, setActiveCi] = useState<number | null>(null);
  const [cart, setCart] = useState<ComposeLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState<MenuOverrides>({});
  const [openTops, setOpenTops] = useState<string | null>(null);
  const [selectedTops, setSelectedTops] = useState<Record<string, string[]>>(
    {}
  );
  const [customer, setCustomer] = useState<CustomerPick | null>(null);
  const seededFor = useRef<string | null>(null);

  const categories = useMemo(
    () => buildCustomerCategories(overrides),
    [overrides]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiJson<{ overrides?: MenuOverrides }>("/api/menu", {
      headers: cashierHeaders(),
    })
      .then((data) => {
        if (!cancelled) setOverrides(data.overrides || {});
      })
      .catch(() => {
        if (!cancelled) setOverrides({});
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      seededFor.current = null;
      return;
    }
    const seedId = order?.id || "__new__";
    if (seededFor.current === seedId) return;
    seededFor.current = seedId;
    if (order) {
      setChannel(order.type === "takeaway" ? "takeaway" : "table");
      setTable(String(order.table || ""));
      setCart(linesFromItems(order.items));
      setCustomer(
        order.customerId
          ? {
              id: order.customerId,
              name: order.customerName || "",
              phone: order.customerPhone,
            }
          : null
      );
    } else {
      setChannel("table");
      setTable("");
      setCart([]);
      setCustomer(null);
    }
    setQ("");
    setOpenTops(null);
    setSelectedTops({});
  }, [open, order]);

  useEffect(() => {
    if (!categories.length) return;
    if (activeCi != null && categories.some((c) => c.ci === activeCi)) return;
    setActiveCi(categories[0].ci);
  }, [categories, activeCi]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const total = cart.reduce((s, l) => s + l.unit * l.count, 0);
  const cartCount = cart.reduce((s, l) => s + l.count, 0);

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle) {
      const items: MenuItem[] = [];
      categories.forEach((c) => c.items.forEach((it) => items.push(it)));
      return items.filter((it) => it.name.toLowerCase().includes(needle));
    }
    const cat = categories.find((c) => c.ci === activeCi);
    return cat?.items || [];
  }, [categories, q, activeCi]);

  function selectedToppingsFor(item: MenuItem): Topping[] {
    const id = item.id || item.name;
    const names = selectedTops[id] || [];
    return (item.toppings || []).filter((t) => names.includes(t.name));
  }

  function itemUnit(item: MenuItem, toppings: Topping[]) {
    return (
      parsePrice(item.price) +
      toppings.reduce((s, t) => s + (Number(t.price) || 0), 0)
    );
  }

  function toggleTopping(itemId: string, name: string) {
    setSelectedTops((prev) => {
      const cur = prev[itemId] || [];
      const next = cur.includes(name)
        ? cur.filter((n) => n !== name)
        : [...cur, name];
      return { ...prev, [itemId]: next };
    });
  }

  function addItem(item: MenuItem) {
    if (item.soldOut) {
      showToast("این آیتم تمام شده است");
      return;
    }
    const id = item.id || item.name;
    const available = item.toppings || [];
    if (available.length && openTops !== id) {
      setOpenTops(id);
      return;
    }
    const toppings = selectedToppingsFor(item);
    const key = lineKey(id, toppings);
    const unit = itemUnit(item, toppings);
    setCart((prev) => {
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
          id,
          name: item.name,
          unit,
          count: 1,
          toppings: toppings.length ? toppings : undefined,
        },
      ];
    });
  }

  function setQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((x) => (x.key === key ? { ...x, count: x.count + delta } : x))
        .filter((x) => x.count > 0)
    );
  }

  async function submit() {
    if (!order && channel === "table" && !table) {
      showToast("میز را انتخاب کنید");
      return;
    }
    if (!cart.length) {
      showToast("حداقل یک آیتم لازم است");
      return;
    }
    setBusy(true);
    const items = cart.map((l) => ({
      id: l.id,
      name: l.name,
      price: l.unit,
      count: l.count,
      toppings: l.toppings || [],
    }));
    const customerPayload = customer
      ? {
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone || "",
        }
      : { customerId: "" };
    try {
      let data: unknown;
      if (order) {
        data = await apiJson(`/api/orders/${order.id}`, {
          method: "POST",
          headers: cashierHeaders(),
          body: JSON.stringify({
            action: "items",
            items,
            total,
            ...customerPayload,
          }),
        });
        showToast("سفارش ویرایش شد");
      } else {
        const takeaway = channel === "takeaway";
        data = await apiJson("/api/orders", {
          method: "POST",
          headers: cashierHeaders(),
          body: JSON.stringify({
            type: takeaway ? "takeaway" : "food",
            table: takeaway ? TAKEAWAY_TABLE : table,
            items,
            total,
            ...customerPayload,
          }),
        });
        showToast(takeaway ? "سفارش بیرون‌بر ثبت شد" : "سفارش ثبت شد");
      }
      onDone(data);
      onClose();
    } catch {
      showToast(order ? "ویرایش ناموفق بود" : "ثبت ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  const allTables = useMemo(() => tablesFromRegions(regions), [regions]);
  const lineCount = (id: string) =>
    cart.filter((l) => l.id === id).reduce((s, l) => s + l.count, 0);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="table-glass-overlay compose-glass-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-title"
      onClick={() => !busy && onClose()}
    >
      <div
        className="table-glass-dialog compose-glass-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="table-glass-head">
          <div>
            <h4 className="table-glass-title" id="compose-title">
              {order ? "ویرایش سفارش" : "سفارش جدید"}
            </h4>
            <p className="table-glass-sub">
              {order
                ? order.type === "takeaway"
                  ? "بیرون‌بر"
                  : `میز ${toPersianDigits(String(order.table))}`
                : channel === "takeaway"
                  ? "سفارش بیرون‌بر — بدون میز"
                  : "میز را انتخاب کنید و آیتم‌ها را اضافه کنید"}
            </p>
          </div>
          <button
            type="button"
            className="table-glass-close"
            aria-label="بستن"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="compose-glass-split">
          <div className="compose-glass-main">
            {!order ? (
              <section className="compose-glass-section">
                <span className="table-glass-label">نوع سفارش</span>
                <div className="compose-channel-toggle" role="tablist" aria-label="نوع سفارش">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={channel === "table"}
                    className={`compose-channel-btn${channel === "table" ? " is-active" : ""}`}
                    disabled={busy}
                    onClick={() => {
                      setChannel("table");
                    }}
                  >
                    سر میز
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={channel === "takeaway"}
                    className={`compose-channel-btn${channel === "takeaway" ? " is-active" : ""}`}
                    disabled={busy}
                    onClick={() => {
                      setChannel("takeaway");
                      setTable("");
                    }}
                  >
                    بیرون‌بر
                  </button>
                </div>
                {channel === "table" ? (
                  <>
                    <span className="table-glass-label">میز</span>
                    <div className="compose-glass-tables">
                      {allTables.map((n) => {
                        const disabled = tables[String(n)] === "disabled";
                        return (
                          <button
                            key={n}
                            type="button"
                            className={`compose-glass-table${table === String(n) ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
                            disabled={disabled || busy}
                            onClick={() => setTable(String(n))}
                          >
                            {toPersianDigits(n)}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="compose-takeaway-hint">
                    این سفارش بدون اشغال میز ثبت می‌شود و در لیست سفارش‌ها با برچسب بیرون‌بر دیده می‌شود.
                  </p>
                )}
              </section>
            ) : null}

            <section className="compose-glass-section">
              <CustomerPicker
                value={customer}
                invoices={invoices}
                disabled={busy}
                onChange={setCustomer}
              />
            </section>

            <section className="compose-glass-section compose-glass-menu">
              <div className="compose-glass-toolbar">
                <div className="compose-glass-search">
                  <input
                    type="search"
                    className="compose-glass-search-input"
                    placeholder="جستجوی آیتم منو…"
                    value={q}
                    disabled={busy}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>

                {!q.trim() && categories.length > 1 ? (
                  <div
                    className="compose-glass-cats"
                    role="tablist"
                    aria-label="دسته‌ها"
                  >
                    {categories.map((cat) => (
                      <button
                        key={cat.ci}
                        type="button"
                        role="tab"
                        aria-selected={activeCi === cat.ci}
                        className={`compose-glass-cat${activeCi === cat.ci ? " is-active" : ""}`}
                        disabled={busy}
                        onClick={() => setActiveCi(cat.ci)}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {filteredItems.length === 0 ? (
                <p className="compose-glass-empty">آیتمی پیدا نشد.</p>
              ) : (
                <ul className="compose-glass-items">
                  {filteredItems.map((item) => {
                    const id = item.id || item.name;
                    const count = lineCount(id);
                    const hasTops = !!(item.toppings && item.toppings.length);
                    const isOpen = openTops === id;
                    const pickedTops = selectedToppingsFor(item);
                    return (
                      <li
                        key={id}
                        className={`compose-glass-item-wrap${hasTops ? " has-tops" : ""}${isOpen ? " is-open" : ""}`}
                      >
                        <button
                          type="button"
                          className={`compose-glass-item${item.soldOut ? " is-sold" : ""}${count > 0 ? " is-picked" : ""}`}
                          disabled={!!item.soldOut || busy}
                          onClick={() => {
                            if (hasTops) {
                              setOpenTops(isOpen ? null : id);
                              return;
                            }
                            addItem(item);
                          }}
                        >
                          <span className="compose-glass-item-main">
                            <strong className="compose-glass-item-name">
                              {item.name}
                            </strong>
                            <span className="compose-glass-item-price cp-num">
                              {formatPriceAsNumber(
                                hasTops ? itemUnit(item, pickedTops) : item.price
                              )}
                              {hasTops ? (
                                <em className="compose-glass-item-tops-hint">
                                  تاپینگ
                                </em>
                              ) : null}
                            </span>
                          </span>
                          <span className="compose-glass-item-add" aria-hidden="true">
                            {hasTops
                              ? isOpen
                                ? "▴"
                                : "▾"
                              : count > 0
                                ? toPersianDigits(count)
                                : "+"}
                          </span>
                        </button>
                        {hasTops && isOpen && !item.soldOut ? (
                          <div className="compose-glass-tops">
                            <p className="compose-glass-tops-title">
                              تاپینگ (اختیاری)
                            </p>
                            {(item.toppings || []).map((t) => (
                              <label key={t.name} className="compose-glass-top-row">
                                <input
                                  type="checkbox"
                                  checked={(selectedTops[id] || []).includes(
                                    t.name
                                  )}
                                  disabled={busy}
                                  onChange={() => toggleTopping(id, t.name)}
                                />
                                <span>{t.name}</span>
                                <em className="cp-num">
                                  +{formatPriceAsNumber(t.price)}
                                </em>
                              </label>
                            ))}
                            <button
                              type="button"
                              className="compose-glass-tops-add"
                              disabled={busy}
                              onClick={() => addItem(item)}
                            >
                              افزودن به سفارش
                              {count > 0
                                ? ` (${toPersianDigits(count)})`
                                : ""}
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <aside className="compose-glass-cart">
            <div className="compose-glass-cart-head">
              <h5 className="compose-glass-cart-title">سفارش جاری</h5>
              {cartCount > 0 ? (
                <span className="compose-glass-cart-badge cp-num">
                  {toPersianDigits(cartCount)}
                </span>
              ) : null}
            </div>

            {!cart.length ? (
              <p className="compose-glass-cart-empty">
                هنوز آیتمی اضافه نشده.
              </p>
            ) : (
              <ul className="compose-glass-cart-list">
                {cart.map((l) => (
                  <li key={l.key} className="compose-glass-cart-row">
                    <div className="compose-glass-cart-info">
                      <strong>{l.name}</strong>
                      {l.toppings?.length ? (
                        <em className="compose-glass-cart-tops">
                          {toppingLabel(l.toppings)}
                        </em>
                      ) : null}
                      <span className="cp-num">
                        {formatPriceAsNumber(l.unit * l.count)}
                      </span>
                    </div>
                    <div className="compose-glass-qty">
                      <button
                        type="button"
                        aria-label="کاهش"
                        disabled={busy}
                        onClick={() => setQty(l.key, -1)}
                      >
                        −
                      </button>
                      <strong className="cp-num">
                        {toPersianDigits(l.count)}
                      </strong>
                      <button
                        type="button"
                        aria-label="افزایش"
                        disabled={busy}
                        onClick={() => setQty(l.key, 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="compose-glass-cart-remove"
                      aria-label="حذف"
                      disabled={busy}
                      onClick={() =>
                        setCart((prev) => prev.filter((x) => x.key !== l.key))
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <footer className="compose-glass-foot">
              <div className="compose-glass-total">
                <span>جمع</span>
                <strong className="cp-num">
                  {formatPriceAsNumber(total)}
                </strong>
              </div>
              <button
                type="button"
                className={`orders-primary-btn${busy ? " is-loading" : ""}`}
                disabled={busy}
                onClick={submit}
              >
                {busy
                  ? "در حال ثبت…"
                  : order
                    ? "ذخیره تغییرات"
                    : "ثبت سفارش"}
              </button>
            </footer>
          </aside>
        </div>
      </div>
    </div>,
    document.body
  );
}
