"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { MenuItem, Topping } from "@/lib/types";
import { formatPriceAsNumber, parsePrice } from "@/lib/format";
import { useCart } from "@/components/CartProvider";
import { useToast } from "@/components/ToastProvider";
import { apiJson, menuHeaders } from "@/lib/api";
import { CashierLoginModal } from "@/components/admin/CashierLoginModal";
import {
  DEFAULT_SITE_SETTINGS,
  applySiteTheme,
  mergeSiteSettings,
  resolveMenuStructure,
  settingsBaseForContext,
  type SiteSettings,
} from "@/lib/settings";
import {
  assetUrl,
  buildCustomerCategories,
  getCategoryIconImage,
  itemImageShouldCover,
  itemIsNew,
  itemOverride,
  type CustomerCategory,
  type MenuOverrides,
} from "@/lib/menu-utils";
import { setMenuTenantSlug } from "@/lib/tenant";

function TabIcon({ src, name }: { src: string; name: string }) {
  const [step, setStep] = useState(0);
  const resolved =
    step === 0
      ? src
      : step === 1
        ? assetUrl(getCategoryIconImage(name))
        : assetUrl("assets/category/coffee.png");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="tab-icon"
      src={resolved}
      alt=""
      aria-hidden="true"
      onError={() => setStep((s) => Math.min(s + 1, 2))}
    />
  );
}

function NewItemCard({
  item,
  iconType,
  onAdd,
}: {
  item: MenuItem & { id: string };
  iconType: string;
  onAdd: (item: MenuItem) => void;
}) {
  const priceDisplay = formatPriceAsNumber(item.price);
  return (
    <article
      className={`new-item-card cp-product${item.soldOut ? " is-sold-out" : ""}`}
      data-item-id={item.id}
      data-category-icon={iconType}
    >
      <span className="new-item-ribbon">جدید</span>
      <div
        className={`item-image${itemImageShouldCover(item.image) ? " has-photo" : ""}`}
        aria-hidden="true"
      >
        <span className="item-image-placeholder" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl(item.image) || "/assets/items/iced-coffee-line.png"}
          alt=""
          loading="lazy"
        />
      </div>
      <div className="new-item-card-body">
        <span className="item-name">{item.name}</span>
        {item.description ? (
          <p className="new-item-card-desc">{item.description}</p>
        ) : null}
        <div className="new-item-card-foot">
          <span className="item-price">{priceDisplay}</span>
          <button
            type="button"
            className="btn-add"
            aria-label={item.soldOut ? "تمام شد" : "اضافه به لیست"}
            disabled={!!item.soldOut}
            onClick={() => onAdd(item)}
          >
            {item.soldOut ? "×" : "+"}
          </button>
        </div>
      </div>
      {item.soldOut ? (
        <span className="sold-out-badge">تمام شد</span>
      ) : null}
    </article>
  );
}

function MenuItemRow({
  item,
  iconType,
  featured,
  hideImage,
  openItem,
  selectedTops,
  onToggleOpen,
  onToggleTopping,
  onAdd,
  itemSubtotal,
}: {
  item: MenuItem & { id: string };
  iconType: string;
  featured?: boolean;
  hideImage?: boolean;
  openItem: string | null;
  selectedTops: Record<string, string[]>;
  onToggleOpen: (id: string) => void;
  onToggleTopping: (itemId: string, name: string) => void;
  onAdd: (item: MenuItem) => void;
  itemSubtotal: (item: MenuItem) => number;
}) {
  const id = item.id;
  const hasTops = !!(item.toppings && item.toppings.length);
  const isOpen = openItem === id;
  const priceDisplay = formatPriceAsNumber(item.price);

  return (
    <li
      className={`menu-item cp-product-card${item.soldOut ? " is-sold-out" : ""}${hasTops ? " menu-item--expandable" : ""}${isOpen ? " is-open" : ""}${featured ? " is-featured" : ""}`}
      data-item-id={id}
      data-category-icon={iconType}
    >
      {!hideImage ? (
        <div className="item-image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`item-image${itemImageShouldCover(item.image) ? " has-photo" : ""}`}
            src={assetUrl(item.image) || "/assets/items/iced-coffee-line.png"}
            alt=""
            loading="lazy"
          />
        </div>
      ) : null}
      <div className="item-info">
        <div className="item-header">
          <span className="item-name-wrap">
            <span className="item-name">{item.name}</span>
            {itemIsNew(item) ? (
              <span className="new-item-badge">جدید</span>
            ) : null}
          </span>
          <span className="item-price">
            {hasTops ? (
              <span className="item-price-base">{priceDisplay}</span>
            ) : (
              priceDisplay
            )}
          </span>
        </div>
        {item.description ? (
          <p className="item-desc">{item.description}</p>
        ) : null}
      </div>
      <div className="item-actions">
        {hasTops ? (
          <button
            type="button"
            className="item-expand-toggle"
            aria-expanded={isOpen}
            aria-label="تاپینگ‌ها"
            onClick={() => onToggleOpen(id)}
          >
            <span className="item-expand-chevron" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="btn-add"
          aria-label={item.soldOut ? "تمام شد" : "اضافه به لیست"}
          disabled={!!item.soldOut}
          onClick={() => onAdd(item)}
        >
          {item.soldOut ? "×" : "+"}
        </button>
      </div>
      {hasTops ? (
        <div
          className={`item-toppings-collapse${isOpen ? " is-open" : ""}`}
          aria-hidden={!isOpen}
        >
          <div className="item-toppings-panel">
            <p className="item-toppings-title">تاپینگ (اختیاری)</p>
            {(item.toppings || []).map((t) => (
              <label key={t.name} className="topping-row">
                <span className="topping-name">{t.name}</span>
                <span className="topping-price">
                  +{formatPriceAsNumber(t.price)}
                </span>
                <input
                  type="checkbox"
                  className="topping-checkbox"
                  checked={(selectedTops[id] || []).includes(t.name)}
                  onChange={() => onToggleTopping(id, t.name)}
                  tabIndex={isOpen ? 0 : -1}
                />
              </label>
            ))}
            <div className="item-toppings-subtotal">
              <span className="item-toppings-subtotal-label">جمع این آیتم:</span>{" "}
              <span className="item-toppings-subtotal-value">
                {formatPriceAsNumber(itemSubtotal(item))}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function CustomerMenu({ tenantSlug = "" }: { tenantSlug?: string }) {
  const router = useRouter();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [activeCat, setActiveCat] = useState(0);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [selectedTops, setSelectedTops] = useState<Record<string, string[]>>(
    {}
  );
  const [overrides, setOverrides] = useState<MenuOverrides | null>(null);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loadError, setLoadError] = useState("");
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [categories, setCategories] = useState<CustomerCategory[]>(() =>
    buildCustomerCategories(null)
  );

  useEffect(() => {
    if (tenantSlug) setMenuTenantSlug(tenantSlug);
    setLoadError("");
    setMenuLoaded(false);
    apiJson<{ overrides?: MenuOverrides }>("/api/menu", {
      auth: false,
      headers: menuHeaders(),
    })
      .then((data) => {
        const next = data.overrides || {};
        setOverrides(next);
        setCategories(buildCustomerCategories(next));
        setMenuLoaded(true);
      })
      .catch(() => setLoadError("menu_unavailable"));
    apiJson<{ settings?: Partial<SiteSettings> }>("/api/settings", {
      auth: false,
      headers: menuHeaders(),
    })
      .then((data) => {
        const next = mergeSiteSettings(
          data.settings,
          settingsBaseForContext(
            data.settings?.restaurantNameFa,
            data.settings?.restaurantNameEn
          )
        );
        setSettings(next);
        applySiteTheme(next);
      })
      .catch(() => {});
  }, [tenantSlug]);

  function toggleTopping(itemId: string, name: string) {
    setSelectedTops((prev) => {
      const cur = prev[itemId] || [];
      const next = cur.includes(name)
        ? cur.filter((n) => n !== name)
        : [...cur, name];
      return { ...prev, [itemId]: next };
    });
  }

  function onAdd(item: MenuItem) {
    if (item.soldOut) {
      showToast("این آیتم تمام شده است");
      return;
    }
    const id = item.id || item.name;
    const names = selectedTops[id] || [];
    const toppings: Topping[] = (item.toppings || []).filter((t) =>
      names.includes(t.name)
    );
    addItem({
      id,
      name:
        item.name +
        (toppings.length
          ? " (" + toppings.map((t) => t.name).join("، ") + ")"
          : ""),
      unit: Number(item.price) || 0,
      toppings,
    });
    showToast("به سبد اضافه شد");
  }

  function itemSubtotal(item: MenuItem) {
    const id = item.id || item.name;
    const names = selectedTops[id] || [];
    const top = (item.toppings || [])
      .filter((t) => names.includes(t.name))
      .reduce((s, t) => s + (t.price || 0), 0);
    return (Number(item.price) || 0) + top;
  }

  const layout = resolveMenuStructure(settings.menuStructure);
  const showAllCategories = layout === "magazine";
  const hideItemImage = layout === "compact";

  function scrollToCategory(index: number) {
    setActiveCat(index);
    if (!showAllCategories) return;
    const el = document.getElementById(`cat-${categories[index]?.ci}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const categoryNav = (
    <nav
      id="menu-tabs"
      className={`tabs cp-category-rail customer-menu-nav customer-menu-nav--${layout}`}
      role="tablist"
      aria-label="دسته‌بندی منو"
    >
      {categories.map((cat, i) => {
        const newCount = cat.items.filter((it) =>
          itemIsNew(it, itemOverride(overrides, it.id))
        ).length;
        return (
          <button
            key={`${cat.ci}-${cat.name}`}
            type="button"
            role="tab"
            className={`tab${activeCat === i ? " active" : ""}${newCount ? " has-new" : ""}`}
            aria-selected={activeCat === i}
            data-category-icon={cat.iconType}
            onClick={() => scrollToCategory(i)}
          >
            {layout !== "magazine" ? (
              <TabIcon src={assetUrl(cat.iconSrc)} name={cat.name} />
            ) : null}
            <span className="tab-label">{cat.name}</span>
            {newCount ? <span className="tab-new">جدید</span> : null}
          </button>
        );
      })}
    </nav>
  );

  if (loadError) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
        <p>منوی این کافه در دسترس نیست یا اشتراک فعال ندارد.</p>
      </div>
    );
  }

  const menuEmpty = menuLoaded && categories.length === 0;

  return (
    <div className={`customer-menu customer-menu--${layout}`}>
      <header
        className={`header cp-customer-header${
          settings.showBackgroundOnMenu && settings.backgroundImage
            ? " has-bg"
            : ""
        }`}
        style={
          settings.showBackgroundOnMenu && settings.backgroundImage
            ? ({
                "--menu-header-bg": `url(${assetUrl(settings.backgroundImage)})`,
              } as CSSProperties)
            : undefined
        }
      >
        {settings.showLogoOnMenu && settings.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="restaurant-logo"
            src={assetUrl(settings.logo)}
            alt={settings.restaurantNameFa || settings.restaurantNameEn || ""}
          />
        ) : null}
        <h1 className="restaurant-name">
          {settings.restaurantNameFa}{" "}
          <span className="latin">{settings.restaurantNameEn}</span>
        </h1>
        <p className="tagline">{settings.tagline}</p>
        {settings.showContactOnMenu && (settings.phone || settings.address) ? (
          <div className="restaurant-contact">
            {settings.phone ? (
              <a className="restaurant-phone" href={`tel:${settings.phone}`} dir="ltr">
                {settings.phone}
              </a>
            ) : null}
            {settings.address ? (
              <p className="restaurant-address">{settings.address}</p>
            ) : null}
          </div>
        ) : null}
      </header>

      {menuEmpty ? (
        <div
          className="customer-menu-empty"
          style={{
            padding: "3rem 1.5rem",
            textAlign: "center",
            maxWidth: "28rem",
            margin: "2rem auto",
          }}
        >
          <p style={{ fontSize: "1.1rem", marginBottom: "0.75rem", color: "var(--secondary, #566347)" }}>
            منوی این کافه هنوز خالی است.
          </p>
          <p style={{ color: "#666", marginBottom: "1.25rem", lineHeight: 1.7 }}>
            برای افزودن دسته‌بندی و آیتم، وارد پنل مدیریت کافه شوید.
          </p>
          {tenantSlug ? (
            <button
              type="button"
              className="btn btn-primary"
              style={{ display: "inline-block" }}
              onClick={() => setAdminLoginOpen(true)}
            >
              ورود به پنل مدیریت
            </button>
          ) : null}
        </div>
      ) : (
        <>
      <div className="customer-menu-body">
        {categoryNav}
        <main className="menu-content cp-menu-content" id="menu-content">
          {categories.map((cat, i) => {
            const newItems = cat.items.filter((it) =>
              itemIsNew(it, itemOverride(overrides, it.id))
            );
            const visible = showAllCategories || activeCat === i;
            return (
              <section
                key={`${cat.ci}-${cat.name}`}
                id={`cat-${cat.ci}`}
                className={`menu-panel${visible ? " active" : ""}`}
                role="tabpanel"
                hidden={!visible}
              >
                <h2 className="category-title">{cat.name}</h2>

                {settings.showNewSection &&
                layout !== "compact" &&
                newItems.length ? (
                  <div className="new-items">
                    <p className="new-items-label">تازه‌های این دسته</p>
                    <div
                      className={`new-items-track${newItems.length === 1 ? " is-single" : ""}`}
                    >
                      {newItems.map((item) => (
                        <NewItemCard
                          key={item.id}
                          item={item}
                          iconType={cat.iconType}
                          onAdd={onAdd}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                <ul className="menu-list">
                  {cat.items.map((item, itemIdx) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      iconType={cat.iconType}
                      featured={layout === "magazine" && itemIdx === 0}
                      hideImage={hideItemImage}
                      openItem={openItem}
                      selectedTops={selectedTops}
                      onToggleOpen={(id) =>
                        setOpenItem((cur) => (cur === id ? null : id))
                      }
                      onToggleTopping={toggleTopping}
                      onAdd={onAdd}
                      itemSubtotal={itemSubtotal}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </main>
      </div>

      {settings.showFooterCredit ? (
        <footer className="site-footer">
          <div className="site-credit">
            <span className="site-credit-btn">
              © 2026 {settings.creditName}
            </span>
          </div>
        </footer>
      ) : null}
        </>
      )}

      {adminLoginOpen && tenantSlug ? (
        <CashierLoginModal
          tenantSlug={tenantSlug}
          title="ورود به پنل مدیریت"
          submitLabel="ورود"
          onClose={() => setAdminLoginOpen(false)}
          onSuccess={() => {
            setAdminLoginOpen(false);
            router.push(`/${tenantSlug}/admin/`);
          }}
        />
      ) : null}
    </div>
  );
}

void parsePrice;
