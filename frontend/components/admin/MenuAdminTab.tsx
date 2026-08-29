"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { MenuItem } from "@/lib/types";
import { formatPriceAsNumber, toPersianDigits } from "@/lib/format";
import {
  assetUrl,
  buildCustomerCategories,
  CATEGORY_ICON_PRESETS,
  categoryHasCustomIcon,
  getCategoryIconImage,
  itemHasCustomImage,
  itemIsNew,
  resolveDefaultItemImage,
  type CustomerCategory,
  type MenuOverrides,
  type PrintStationKind,
} from "@/lib/menu-utils";

type DraftCategoryPatch = {
  station?: PrintStationKind;
  icon?: string;
  image?: string;
  clearIcon?: boolean;
};
import { apiJson, cashierHeaders } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";

type EditableItem = MenuItem & {
  soldOut?: boolean;
  isNew?: boolean;
  categoryName: string;
  baseImage?: string;
};

function PriceField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const num = Math.max(0, Math.round(Number(value) || 0));

  return (
    <div className="checkout-amount">
      <button
        type="button"
        className="checkout-amount-btn"
        disabled={disabled}
        aria-label="کاهش"
        onClick={() => onChange(String(Math.max(0, num - 5000)))}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="checkout-amount-input cp-num"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      />
      <button
        type="button"
        className="checkout-amount-btn"
        disabled={disabled}
        aria-label="افزایش"
        onClick={() => onChange(String(num + 5000))}
      >
        +
      </button>
    </div>
  );
}

export function MenuAdminTab() {
  const { showToast } = useToast();
  const [overrides, setOverrides] = useState<MenuOverrides>({});
  const [loaded, setLoaded] = useState(false);
  const [activeCi, setActiveCi] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<EditableItem | null>(null);
  const [draftPrice, setDraftPrice] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftImageDataUrl, setDraftImageDataUrl] = useState<string | null>(
    null
  );
  const [draftClearImage, setDraftClearImage] = useState(false);
  const [draftSoldOut, setDraftSoldOut] = useState(false);
  const [draftIsNew, setDraftIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [draftOrder, setDraftOrder] = useState<number[]>([]);
  const [draftPatches, setDraftPatches] = useState<
    Record<number, DraftCategoryPatch>
  >({});

  const categories = useMemo(
    () => buildCustomerCategories(overrides),
    [overrides]
  );

  useEffect(() => {
    let cancelled = false;
    apiJson<{ overrides?: MenuOverrides }>("/api/menu", {
      headers: cashierHeaders(),
    })
      .then((data) => {
        if (cancelled) return;
        setOverrides(data.overrides || {});
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!categories.length) return;
    if (activeCi != null && categories.some((c) => c.ci === activeCi)) return;
    setActiveCi(categories[0].ci);
  }, [categories, activeCi]);

  const activeCategory: CustomerCategory | undefined = categories.find(
    (c) => c.ci === activeCi
  );

  const stats = useMemo(() => {
    let total = 0;
    let sold = 0;
    let neu = 0;
    categories.forEach((cat) => {
      cat.items.forEach((it) => {
        total += 1;
        if (it.soldOut) sold += 1;
        if (itemIsNew(it)) neu += 1;
      });
    });
    return { total, sold, neu };
  }, [categories]);

  const visibleItems = useMemo(() => {
    if (!activeCategory) return [];
    const q = query.trim().toLowerCase();
    if (!q) return activeCategory.items;
    return activeCategory.items.filter((it) =>
      it.name.toLowerCase().includes(q)
    );
  }, [activeCategory, query]);

  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  function openItem(item: MenuItem, categoryName: string) {
    const id = item.id || item.name;
    setSelected({
      ...item,
      categoryName,
      baseImage: resolveDefaultItemImage(id),
    });
    setDraftPrice(String(Math.round(Number(item.price) || 0)));
    setDraftDescription(item.description || "");
    setDraftImageDataUrl(null);
    setDraftClearImage(false);
    setDraftSoldOut(!!item.soldOut);
    setDraftIsNew(item.isNew === true);
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("فرمت تصویر نامعتبر است");
      return;
    }
    if (file.size > 2_500_000) {
      showToast("حجم تصویر بیش از ۲.۵ مگابایت است");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDraftImageDataUrl(reader.result);
        setDraftClearImage(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function clearPhoto() {
    if (draftImageDataUrl) {
      setDraftImageDataUrl(null);
      return;
    }
    setDraftClearImage(true);
  }

  async function saveSelected() {
    if (!selected) return;
    const id = selected.id || selected.name;
    const price = Math.max(0, Math.round(Number(draftPrice) || 0));
    setBusy(true);
    try {
      const data = await apiJson<{ overrides?: MenuOverrides }>("/api/menu", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "update",
          id,
          price,
          soldOut: draftSoldOut,
          isNew: draftIsNew,
          description: draftDescription,
          ...(draftImageDataUrl ? { image: draftImageDataUrl } : {}),
          ...(draftClearImage ? { clearImage: true } : {}),
        }),
      });
      if (data.overrides) setOverrides(data.overrides);
      setSelected(null);
      showToast("ذخیره شد");
    } catch {
      showToast("ذخیره ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function saveReorderDialog() {
    const currentOrder = categories.map((c) => c.ci);
    const orderDirty =
      draftOrder.length !== currentOrder.length ||
      draftOrder.some((ci, i) => ci !== currentOrder[i]);
    const patchEntries = Object.entries(draftPatches).filter(([, p]) =>
      Boolean(p.station || p.icon || p.image || p.clearIcon)
    );
    if (!orderDirty && patchEntries.length === 0) {
      setReorderOpen(false);
      return;
    }

    setReorderBusy(true);
    try {
      if (orderDirty) {
        setOverrides((prev) => ({ ...prev, _categoryOrder: draftOrder }));
        const data = await apiJson<{ overrides?: MenuOverrides }>("/api/menu", {
          method: "POST",
          headers: cashierHeaders(),
          body: JSON.stringify({
            action: "reorderCategories",
            order: draftOrder,
          }),
        });
        if (data.overrides) setOverrides(data.overrides);
      }

      for (const [ciRaw, patch] of patchEntries) {
        const ci = Number(ciRaw);
        if (patch.station) {
          const data = await apiJson<{ overrides?: MenuOverrides }>(
            "/api/menu",
            {
              method: "POST",
              headers: cashierHeaders(),
              body: JSON.stringify({
                action: "setCategoryStation",
                categoryIndex: ci,
                station: patch.station,
              }),
            }
          );
          if (data.overrides) setOverrides(data.overrides);
        }
        if (patch.clearIcon || patch.icon || patch.image) {
          const data = await apiJson<{ overrides?: MenuOverrides }>(
            "/api/menu",
            {
              method: "POST",
              headers: cashierHeaders(),
              body: JSON.stringify({
                action: "setCategoryIcon",
                categoryIndex: ci,
                ...(patch.clearIcon
                  ? { clearIcon: true }
                  : patch.icon
                    ? { icon: patch.icon }
                    : { image: patch.image }),
              }),
            }
          );
          if (data.overrides) setOverrides(data.overrides);
        }
      }

      setDraftPatches({});
      setReorderOpen(false);
      showToast("تغییرات دسته‌ها ذخیره شد");
    } catch {
      setOverrides((prev) => ({ ...prev, _categoryOrder: currentOrder }));
      showToast("ذخیره تغییرات ناموفق بود");
    } finally {
      setReorderBusy(false);
    }
  }

  function patchDraftCategory(ci: number, patch: DraftCategoryPatch) {
    setDraftPatches((prev) => {
      const cur = { ...(prev[ci] || {}), ...patch };
      if (patch.image || patch.icon) {
        delete cur.clearIcon;
        if (patch.image) delete cur.icon;
        if (patch.icon) delete cur.image;
      }
      if (patch.clearIcon) {
        delete cur.icon;
        delete cur.image;
      }
      return { ...prev, [ci]: cur };
    });
  }

  function handleCategoryIconFile(
    ci: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const okType =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|svg)$/i.test(file.name);
    if (!okType) {
      showToast("فرمت مجاز: PNG، JPG، WEBP یا SVG");
      return;
    }
    if (file.size > 2_500_000) {
      showToast("حجم تصویر بیش از ۲.۵ مگابایت است");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        patchDraftCategory(ci, { image: reader.result });
      }
    };
    reader.readAsDataURL(file);
  }

  function openReorder() {
    setDraftOrder(categories.map((c) => c.ci));
    setDraftPatches({});
    setReorderOpen(true);
  }

  function moveDraftCategory(ci: number, dir: -1 | 1) {
    setDraftOrder((prev) => {
      const from = prev.indexOf(ci);
      if (from < 0) return prev;
      const to = from + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  const draftCategories = useMemo(() => {
    const byCi = new Map(categories.map((c) => [c.ci, c]));
    return draftOrder
      .map((ci) => byCi.get(ci))
      .filter((c): c is CustomerCategory => !!c)
      .map((cat) => {
        const patch = draftPatches[cat.ci];
        if (!patch) return cat;
        let iconSrc = cat.iconSrc;
        if (patch.clearIcon) iconSrc = getCategoryIconImage(cat.name);
        else if (patch.image) iconSrc = patch.image;
        else if (patch.icon) iconSrc = patch.icon;
        return {
          ...cat,
          station: patch.station || cat.station,
          iconSrc,
        };
      });
  }, [categories, draftOrder, draftPatches]);

  const draftDirty = useMemo(() => {
    const current = categories.map((c) => c.ci);
    const orderDirty =
      draftOrder.length !== current.length ||
      draftOrder.some((ci, i) => ci !== current[i]);
    const patchDirty = Object.values(draftPatches).some(
      (p) => p.station || p.icon || p.image || p.clearIcon
    );
    return orderDirty || patchDirty;
  }, [categories, draftOrder, draftPatches]);

  useEffect(() => {
    if (!reorderOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !reorderBusy) setReorderOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [reorderOpen, reorderBusy]);

  return (
    <div className="admin-tab admin-tab--menu menu-page">
      <header className="menu-admin-header">
        <div className="menu-admin-header-text">
          <h3 className="menu-admin-title">مدیریت منو</h3>
          <p className="menu-admin-subtitle">
            قیمت، وضعیت و تنظیم دسته‌ها —{" "}
            <span className="menu-admin-count">
              {toPersianDigits(stats.total)} آیتم
            </span>
            {stats.sold > 0 ? (
              <>
                {" "}
                ·{" "}
                <span className="menu-admin-count is-sold">
                  {toPersianDigits(stats.sold)} تمام
                </span>
              </>
            ) : null}
            {stats.neu > 0 ? (
              <>
                {" "}
                ·{" "}
                <span className="menu-admin-count is-new">
                  {toPersianDigits(stats.neu)} جدید
                </span>
              </>
            ) : null}
          </p>
        </div>
      </header>

      {!loaded ? <LoadingShimmer variant="menu" /> : null}

      {loaded ? (
      <>
      <section className="menu-admin-toolbar">
        <div className="menu-admin-toolbar-row">
          <div className="menu-admin-search">
            <input
              type="search"
              className="menu-admin-search-input"
              placeholder="جستجوی آیتم در این دسته…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="cp-btn cp-btn--ghost menu-admin-reorder-btn"
            disabled={!loaded || categories.length < 2}
            onClick={openReorder}
          >
            تنظیم دسته‌ها
          </button>
        </div>
        <div
          className="menu-admin-cats"
          role="tablist"
          aria-label="دسته‌ها"
        >
          {categories.map((cat) => (
            <button
              key={cat.ci}
              type="button"
              role="tab"
              aria-selected={activeCi === cat.ci}
              className={`menu-admin-cat${activeCi === cat.ci ? " is-active" : ""}`}
              onClick={() => {
                setActiveCi(cat.ci);
                setQuery("");
              }}
            >
              <span className="menu-admin-cat-name">{cat.name}</span>
              <span className="menu-admin-cat-count">
                {toPersianDigits(cat.items.length)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="menu-admin-panel" aria-live="polite">
        <div className="menu-admin-panel-head">
          <h4 className="menu-admin-panel-title">
            {activeCategory?.name || (loaded ? "—" : "در حال بارگذاری…")}
          </h4>
          <p className="menu-admin-panel-hint">
            برای ویرایش، روی آیتم بزنید
          </p>
        </div>

        {visibleItems.length === 0 ? (
          <div className="menu-admin-empty">
            <p>آیتمی در این دسته پیدا نشد.</p>
          </div>
        ) : (
          <ul className="menu-admin-list">
            {visibleItems.map((item) => {
              const img = assetUrl(item.image);
              const isNew = itemIsNew(item);
              return (
                <li key={item.id || item.name}>
                  <button
                    type="button"
                    className={`menu-admin-row${item.soldOut ? " is-sold" : ""}${isNew ? " is-new" : ""}`}
                    onClick={() =>
                      openItem(item, activeCategory?.name || "")
                    }
                  >
                    <span
                      className={`menu-admin-thumb${img ? "" : " is-empty"}`}
                      aria-hidden="true"
                    >
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" />
                      ) : (
                        <span>{item.name.slice(0, 1)}</span>
                      )}
                    </span>
                    <span className="menu-admin-row-main">
                      <strong className="menu-admin-row-name">
                        {item.name}
                      </strong>
                      <span className="menu-admin-row-meta">
                        <span className="menu-admin-row-price cp-num">
                          {formatPriceAsNumber(item.price)}
                        </span>
                        {isNew ? (
                          <span className="menu-admin-pill is-new">جدید</span>
                        ) : null}
                        {item.soldOut ? (
                          <span className="menu-admin-pill is-sold">تمام</span>
                        ) : (
                          <span className="menu-admin-pill is-ok">موجود</span>
                        )}
                      </span>
                    </span>
                    <span className="menu-admin-row-action" aria-hidden="true">
                      ویرایش
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected
        ? createPortal(
            (() => {
              const id = selected.id || selected.name;
              const defaultImage = assetUrl(
                selected.baseImage || resolveDefaultItemImage(id)
              );
              const previewImage = draftClearImage
                ? defaultImage
                : draftImageDataUrl ||
                  assetUrl(selected.image) ||
                  defaultImage;
              const canClearPhoto =
                !!draftImageDataUrl ||
                (!draftClearImage && itemHasCustomImage(overrides, id));

              return (
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={selected.name}
              onClick={() => !busy && setSelected(null)}
            >
              <div
                className="table-glass-dialog menu-glass-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div className="menu-glass-head-main">
                    {previewImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="menu-glass-thumb"
                        src={previewImage}
                        alt=""
                      />
                    ) : null}
                    <div>
                      <h4 className="table-glass-title">{selected.name}</h4>
                      <p className="table-glass-sub">{selected.categoryName}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    disabled={busy}
                    onClick={() => setSelected(null)}
                  >
                    ×
                  </button>
                </header>

                <section className="menu-glass-section">
                  <span className="table-glass-label">عکس آیتم</span>
                  <div className="menu-glass-photo-row">
                    <label
                      className={`menu-glass-photo${previewImage ? " has-photo" : ""}`}
                    >
                      {previewImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewImage} alt="" />
                      ) : (
                        <span className="menu-glass-photo-placeholder" />
                      )}
                      <span className="menu-glass-photo-hint">تغییر</span>
                      <input
                        type="file"
                        className="menu-glass-photo-input"
                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                        disabled={busy}
                        onChange={handlePhotoSelect}
                      />
                    </label>
                    {canClearPhoto ? (
                      <button
                        type="button"
                        className="menu-glass-photo-clear"
                        disabled={busy}
                        onClick={clearPhoto}
                      >
                        حذف و بازگشت به پیش‌فرض
                      </button>
                    ) : (
                      <span className="menu-glass-photo-default-note">
                        تصویر پیش‌فرض
                      </span>
                    )}
                  </div>
                </section>

                <section className="menu-glass-section">
                  <span className="table-glass-label">توضیحات</span>
                  <textarea
                    className="menu-glass-textarea"
                    rows={3}
                    maxLength={400}
                    placeholder="توضیح کوتاه برای منوی مشتری…"
                    value={draftDescription}
                    disabled={busy}
                    onChange={(e) => setDraftDescription(e.target.value)}
                  />
                </section>

                <section className="menu-glass-section">
                  <span className="table-glass-label">قیمت (تومان)</span>
                  <PriceField
                    value={draftPrice}
                    disabled={busy}
                    onChange={setDraftPrice}
                  />
                </section>

                <section className="menu-glass-flags">
                  <button
                    type="button"
                    className={`menu-glass-flag${draftSoldOut ? " is-active is-sold" : ""}`}
                    disabled={busy}
                    onClick={() => setDraftSoldOut((v) => !v)}
                  >
                    <span className="menu-glass-flag-title">تمام شده</span>
                    <span className="menu-glass-flag-hint">
                      از منوی مشتری مخفی می‌شود
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`menu-glass-flag${draftIsNew ? " is-active is-new" : ""}`}
                    disabled={busy}
                    onClick={() => setDraftIsNew((v) => !v)}
                  >
                    <span className="menu-glass-flag-title">برچسب جدید</span>
                    <span className="menu-glass-flag-hint">
                      در بخش تازه‌ها نمایش داده شود
                    </span>
                  </button>
                </section>

                <footer className="menu-glass-actions">
                  <button
                    type="button"
                    className={`orders-primary-btn${busy ? " is-loading" : ""}`}
                    disabled={busy}
                    onClick={saveSelected}
                  >
                    {busy ? "در حال ذخیره…" : "ذخیره تغییرات"}
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    disabled={busy}
                    onClick={() => setSelected(null)}
                  >
                    انصراف
                  </button>
                </footer>
              </div>
            </div>
              );
            })(),
            document.body
          )
        : null}

      {reorderOpen
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="ترتیب دسته‌ها"
              onClick={() => !reorderBusy && setReorderOpen(false)}
            >
              <div
                className="table-glass-dialog menu-glass-dialog menu-reorder-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 className="table-glass-title">ترتیب دسته‌ها</h4>
                    <p className="table-glass-sub">
                      ترتیب، آیکون و مقصد چاپ را تغییر دهید، سپس ذخیره کنید.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    disabled={reorderBusy}
                    onClick={() => setReorderOpen(false)}
                  >
                    ×
                  </button>
                </header>

                <ol className="menu-reorder-list">
                  {draftCategories.map((cat, index) => {
                    const patch = draftPatches[cat.ci];
                    const customIcon =
                      !patch?.clearIcon &&
                      (Boolean(patch?.icon || patch?.image) ||
                        categoryHasCustomIcon(overrides, cat.ci));
                    const iconPreview = patch?.image
                      ? patch.image
                      : assetUrl(cat.iconSrc);
                    return (
                      <li key={cat.ci} className="menu-reorder-row">
                        <span className="menu-reorder-pos cp-num">
                          {toPersianDigits(index + 1)}
                        </span>
                        <label
                          className={`menu-reorder-icon${reorderBusy ? " is-busy" : ""}`}
                          title="تغییر آیکون دسته"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={iconPreview} alt="" />
                          <span>تغییر</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg,.png,.jpg,.jpeg,.webp"
                            disabled={reorderBusy}
                            onChange={(e) => handleCategoryIconFile(cat.ci, e)}
                          />
                        </label>
                        <div className="menu-reorder-head">
                          <strong className="menu-reorder-name">{cat.name}</strong>
                          <span className="menu-reorder-meta">
                            {toPersianDigits(cat.items.length)} آیتم
                          </span>
                        </div>
                        <div className="menu-reorder-moves">
                          <button
                            type="button"
                            className="menu-reorder-move"
                            aria-label={`بالا بردن ${cat.name}`}
                            disabled={reorderBusy || index === 0}
                            onClick={() => moveDraftCategory(cat.ci, -1)}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="menu-reorder-move"
                            aria-label={`پایین بردن ${cat.name}`}
                            disabled={
                              reorderBusy || index === draftCategories.length - 1
                            }
                            onClick={() => moveDraftCategory(cat.ci, 1)}
                          >
                            ▼
                          </button>
                        </div>
                        <div className="menu-reorder-fields">
                          <div className="menu-reorder-field">
                            <span className="menu-reorder-field-label">
                              مقصد چاپ
                            </span>
                            <div
                              className="menu-reorder-station"
                              role="group"
                              aria-label={`مقصد چاپ ${cat.name}`}
                            >
                              <button
                                type="button"
                                className={
                                  cat.station === "bar" ? "is-active" : undefined
                                }
                                disabled={reorderBusy}
                                onClick={() =>
                                  patchDraftCategory(cat.ci, { station: "bar" })
                                }
                              >
                                بار
                              </button>
                              <button
                                type="button"
                                className={
                                  cat.station === "kitchen"
                                    ? "is-active"
                                    : undefined
                                }
                                disabled={reorderBusy}
                                onClick={() =>
                                  patchDraftCategory(cat.ci, {
                                    station: "kitchen",
                                  })
                                }
                              >
                                آشپزخانه
                              </button>
                            </div>
                          </div>
                          <div className="menu-reorder-field">
                            <span className="menu-reorder-field-label">
                              آیکون آماده
                            </span>
                            <div className="menu-reorder-icon-tools">
                              <select
                                className="menu-reorder-preset"
                                disabled={reorderBusy}
                                value=""
                                aria-label={`آیکون آماده ${cat.name}`}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  e.target.value = "";
                                  if (v)
                                    patchDraftCategory(cat.ci, { icon: v });
                                }}
                              >
                                <option value="">انتخاب آیکون…</option>
                                {CATEGORY_ICON_PRESETS.map((p) => (
                                  <option key={p.path} value={p.path}>
                                    {p.label}
                                  </option>
                                ))}
                              </select>
                              {customIcon ? (
                                <button
                                  type="button"
                                  className="menu-reorder-icon-clear"
                                  disabled={reorderBusy}
                                  onClick={() =>
                                    patchDraftCategory(cat.ci, {
                                      clearIcon: true,
                                    })
                                  }
                                >
                                  بازگشت به پیش‌فرض
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                <footer className="menu-glass-actions">
                  <button
                    type="button"
                    className="orders-primary-btn"
                    disabled={reorderBusy || !draftDirty}
                    onClick={() => void saveReorderDialog()}
                  >
                    {reorderBusy ? "در حال ذخیره…" : "ذخیره تغییرات"}
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    disabled={reorderBusy}
                    onClick={() => {
                      setDraftPatches({});
                      setReorderOpen(false);
                    }}
                  >
                    انصراف
                  </button>
                </footer>
              </div>
            </div>,
            document.body
          )
        : null}
      </>
      ) : null}
    </div>
  );
}
