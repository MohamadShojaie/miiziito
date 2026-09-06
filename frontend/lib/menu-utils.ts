import type { MenuCategory, MenuItem } from "./types";
import { getMenuTenantSlug } from "./tenant";
import { MENU_DATA } from "./menu-data";

export const NEW_ITEM_MS = 14 * 24 * 60 * 60 * 1000;

export const DEFAULT_ITEM_IMAGE = "assets/items/iced-coffee-line.png";

export type PrintStationKind = "bar" | "kitchen";

export type CategoryMeta = {
  icon?: string;
  hidden?: boolean;
  deleted?: boolean;
  station?: PrintStationKind | string;
};

export type MenuOverrides = Record<string, unknown> & {
  _categories?: Record<string, CategoryMeta>;
  _addedCategories?: Record<
    string,
    { name?: string; icon?: string; hidden?: boolean; station?: PrintStationKind | string }
  >;
  _added?: Record<
    string,
    Partial<MenuItem> & {
      name?: string;
      categoryIndex?: number;
      soldOut?: boolean;
      newAt?: number;
      createdAt?: number;
      isNew?: boolean;
    }
  >;
  _categoryOrder?: Array<number | string>;
  /** Tenant cafes: do not merge with built-in demo menu. */
  _standalone?: boolean;
};

export type ItemOverride = Partial<MenuItem> & {
  soldOut?: boolean;
  newAt?: number;
  createdAt?: number;
  isNew?: boolean;
  photo?: string;
};

export type CustomerCategory = {
  ci: number;
  name: string;
  iconSrc: string;
  iconType: string;
  station: PrintStationKind;
  items: Array<MenuItem & { id: string }>;
};

/** Preset icons available under public/assets/category */
export const CATEGORY_ICON_PRESETS: Array<{ path: string; label: string }> = [
  { path: "assets/category/coffee.png", label: "قهوه" },
  { path: "assets/category/iced-coffee.png", label: "آیس" },
  { path: "assets/category/tea.png", label: "چای" },
  { path: "assets/category/damii.png", label: "دمی" },
  { path: "assets/category/ice-drinke.png", label: "سرد" },
  { path: "assets/category/shake.png", label: "شیک" },
  { path: "assets/category/bakery.png", label: "کیک" },
  { path: "assets/category/pizza.png", label: "پیتزا" },
  { path: "assets/category/pasta.png", label: "پاستا" },
  { path: "assets/category/burger.png", label: "برگر" },
  { path: "assets/category/taco.png", label: "تاکو" },
  { path: "assets/category/panini.png", label: "پنینی" },
  { path: "assets/category/breakfast.png", label: "صبحانه" },
  { path: "assets/category/salad.png", label: "سالاد" },
];

const BAR_NAME_HINTS = [
  "بار",
  "نوشیدنی",
  "شیک",
  "چای",
  "دمنوش",
  "دمی",
  "قهوه",
  "اسپرسو",
  "لاته",
  "آیس",
  "ماچا",
  "کافئین",
];

const KITCHEN_NAME_HINTS = [
  "پیتزا",
  "پاستا",
  "برگر",
  "هات داگ",
  "تاکو",
  "پنینی",
  "صبحانه",
  "پیش غذا",
  "کیک",
  "دسر",
  "غذا",
];

export function assetUrl(path?: string): string {
  if (!path) return "";
  if (
    path.startsWith("http") ||
    path.startsWith("/") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }
  return `/${path}`;
}

/** Placeholder group used by CSS masks (starters/mains/desserts/drinks). */
export function getCategoryIconType(categoryName: string): string {
  const n = categoryName || "";
  if (n.includes("قهوه") || n.includes("نوشیدنی")) return "drinks";
  if (n.includes("دسر")) return "desserts";
  if (n.includes("غذا") && !n.includes("پیش")) return "mains";
  if (n.includes("پیش")) return "starters";
  return "mains";
}

export function getCategoryIconImage(categoryName: string): string {
  const n = (categoryName || "").trim();
  if (n.includes("بار گرم - کافئین دار")) return "assets/category/coffee.png";
  if (n.includes("بار سرد - کافئین دار")) return "assets/category/iced-coffee.png";
  if (n.includes("چای و دمنوش")) return "assets/category/tea.png";
  if (n.includes("دمی")) return "assets/category/damii.png";
  if (n.includes("نوشیدنی سرد")) return "assets/category/ice-drinke.png";
  if (n.includes("شیک")) return "assets/category/shake.png";
  if (n.includes("کیک") || n.includes("دسر")) return "assets/category/bakery.png";
  if (n.includes("پیتزا دیترویت")) return "assets/category/pizza.png";
  if (n.includes("پیتزا")) return "assets/category/pizza.png";
  if (n.includes("پاستا")) return "assets/category/pasta.png";
  if (n.includes("تاکو")) return "assets/category/taco.png";
  if (n.includes("پنینی")) return "assets/category/panini.png";
  if (n.includes("صبحانه")) return "assets/category/breakfast.png";
  if (n.includes("پیش غذا")) return "assets/category/salad.png";
  if (n.includes("برگر")) return "assets/category/burger.png";
  if (n.includes("هات داگ")) return "assets/category/burger.png";
  return "assets/category/pizza.png";
}

export function categoryMeta(
  overrides: MenuOverrides | null | undefined,
  ci: number
): CategoryMeta {
  const key = String(ci);
  return (
    (overrides?._categories && overrides._categories[key]) ||
    (overrides?._addedCategories && overrides._addedCategories[key]) ||
    {}
  );
}

export function inferStationFromName(categoryName: string): PrintStationKind {
  const n = String(categoryName || "").trim();
  if (!n) return "kitchen";
  if (BAR_NAME_HINTS.some((h) => n.includes(h))) return "bar";
  if (KITCHEN_NAME_HINTS.some((h) => n.includes(h))) return "kitchen";
  if (/drink|beverage|coffee|tea|shake/i.test(n)) return "bar";
  return "kitchen";
}

export function resolveCategoryStation(
  overrides: MenuOverrides | null | undefined,
  ci: number,
  name: string
): PrintStationKind {
  const meta = categoryMeta(overrides, ci);
  const s = String(meta.station || "").toLowerCase();
  if (s === "bar" || s === "kitchen") return s;
  return inferStationFromName(name);
}

export function categoryIconSrc(
  overrides: MenuOverrides | null | undefined,
  ci: number,
  name: string
): string {
  const meta = categoryMeta(overrides, ci);
  const src = meta.icon ? String(meta.icon) : "";
  if (src.startsWith("uploads/")) return src;
  if (src.startsWith("assets/")) return src;
  if (src) return src;
  return getCategoryIconImage(name);
}

export function categoryHasCustomIcon(
  overrides: MenuOverrides | null | undefined,
  ci: number
): boolean {
  const icon = String(categoryMeta(overrides, ci).icon || "");
  return !!icon;
}

export function builtInItemBaseImage(id: string): string | undefined {
  const m = /^cat-(\d+)-item-(\d+)$/.exec(String(id || ""));
  if (!m) return undefined;
  const ci = Number(m[1]);
  const ii = Number(m[2]);
  const cats = (MENU_DATA as { categories: MenuCategory[] }).categories || [];
  const item = cats[ci]?.items?.[ii];
  return item?.image ? String(item.image) : undefined;
}

export function resolveDefaultItemImage(id?: string): string {
  return builtInItemBaseImage(String(id || "")) || DEFAULT_ITEM_IMAGE;
}

export function itemIsNew(
  item?: MenuItem | null,
  over?: ItemOverride | null
): boolean {
  const o = over || {};
  const it = item || ({} as MenuItem);
  const flag = o.isNew !== undefined ? o.isNew : it.isNew;
  if (flag === false) return false;
  const ts = Number(
    o.newAt ||
      o.createdAt ||
      it.newAt ||
      it.createdAt ||
      0
  );
  if (ts <= 0) return !!flag;
  return Date.now() - ts < NEW_ITEM_MS;
}

export function itemOverride(
  overrides: MenuOverrides | null | undefined,
  id: string
): ItemOverride {
  if (!id || id === "_added" || !overrides) return {};
  const added = overrides._added;
  if (added && added[id] && typeof added[id] === "object") {
    return added[id] as ItemOverride;
  }
  const raw = overrides[id];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ItemOverride;
  }
  return {};
}

export function itemHasCustomImage(
  overrides: MenuOverrides | null | undefined,
  id: string
): boolean {
  const over = itemOverride(overrides, id);
  return !!(over.image || over.photo);
}

/** True when the image should fill its frame (photos), not sit as a padded icon. */
export function itemImageShouldCover(src?: string | null): boolean {
  const s = String(src || "");
  if (!s) return false;
  if (s.startsWith("data:") || s.startsWith("blob:")) return true;
  if (s.includes("uploads/")) return true;
  if (/-line\.(png|svg|webp|jpe?g)$/i.test(s)) return false;
  if (/assets\/items\//i.test(s)) return false;
  return true;
}

function applyCategoryOrder<T extends { ci: number }>(
  list: T[],
  overrides: MenuOverrides | null | undefined
): T[] {
  const order = Array.isArray(overrides?._categoryOrder)
    ? overrides!._categoryOrder!
    : [];
  const rank: Record<string, number> = {};
  order.forEach((v, i) => {
    rank[String(v)] = i;
  });
  return list.slice().sort((a, b) => {
    const ka = String(a.ci);
    const kb = String(b.ci);
    const hasA = Object.prototype.hasOwnProperty.call(rank, ka);
    const hasB = Object.prototype.hasOwnProperty.call(rank, kb);
    if (hasA && hasB) return rank[ka] - rank[kb];
    if (hasA) return -1;
    if (hasB) return 1;
    return a.ci - b.ci;
  });
}

function mergeItem(
  item: MenuItem,
  id: string,
  over: ItemOverride
): MenuItem & { id: string } {
  return {
    ...item,
    id,
    price: over.price != null ? Number(over.price) : item.price,
    soldOut: !!over.soldOut,
    image: over.image || over.photo || item.image,
    name: over.name || item.name,
    description:
      over.description != null ? over.description : item.description,
    isNew: over.isNew !== undefined ? over.isNew : item.isNew,
    newAt: over.newAt != null ? Number(over.newAt) : item.newAt,
    createdAt:
      over.createdAt != null ? Number(over.createdAt) : item.createdAt,
    toppings: over.toppings || item.toppings,
  };
}

/** Stable IDs matching the PHP/legacy SPA so menu overrides apply. */
export function builtInItemId(ci: number, ii: number): string {
  return `cat-${ci}-item-${ii}`;
}

/** Legacy patch keys (cat-0-item-0) or tenant-owned menu entries. */
function hasMenuContent(overrides?: MenuOverrides | null): boolean {
  if (!overrides) return false;
  if (overrides._addedCategories && Object.keys(overrides._addedCategories).length)
    return true;
  if (overrides._added && Object.keys(overrides._added).length) return true;
  return Object.keys(overrides).some(
    (k) => /^cat-\d+-item-\d+$/.test(k) || /^cat-\d+$/.test(k)
  );
}

export function isTenantMenuMode(
  overrides?: MenuOverrides | null,
  standalone?: boolean
): boolean {
  if (standalone === true) return true;
  if (standalone === false) return false;
  if (overrides?._standalone === true) return true;
  if (overrides?._standalone === false) return false;
  if (!getMenuTenantSlug()) return false;
  return !hasMenuContent(overrides);
}

export function buildCustomerCategories(
  overrides?: MenuOverrides | null,
  options?: { standalone?: boolean }
): CustomerCategory[] {
  const standalone = isTenantMenuMode(overrides, options?.standalone);
  const base = standalone
    ? []
    : (((MENU_DATA as { categories: MenuCategory[] }).categories ||
        []) as MenuCategory[]);
  const list: CustomerCategory[] = [];

  base.forEach((cat, ci) => {
    const meta =
      (overrides?._categories && overrides._categories[String(ci)]) || {};
    if (meta.deleted || meta.hidden) return;

    const items: Array<MenuItem & { id: string }> = [];
    (cat.items || []).forEach((item, ii) => {
      const id = builtInItemId(ci, ii);
      const over = itemOverride(overrides, id);
      items.push(mergeItem(item, id, over));
    });

    const added = overrides?._added || {};
    Object.keys(added).forEach((id) => {
      const it = added[id];
      if (!it || typeof it !== "object") return;
      if (Number(it.categoryIndex) !== ci) return;
      if (!String(it.name || "").trim()) return;
      items.push(
        mergeItem(
          {
            name: it.name || "",
            description: it.description,
            price: Number(it.price) || 0,
            image: it.image,
            toppings: it.toppings,
          },
          id,
          it as ItemOverride
        )
      );
    });

    const name = cat.name;
    list.push({
      ci,
      name,
      iconSrc: categoryIconSrc(overrides, ci, name),
      iconType: getCategoryIconType(name),
      station: resolveCategoryStation(overrides, ci, name),
      items,
    });
  });

  const addedCats = overrides?._addedCategories || {};
  Object.keys(addedCats)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((key) => {
      const c = addedCats[key];
      if (!c || typeof c !== "object" || c.hidden) return;
      const ci = Number(key);
      const name = c.name || "دسته";
      const items: Array<MenuItem & { id: string }> = [];
      const added = overrides?._added || {};
      Object.keys(added).forEach((id) => {
        const it = added[id];
        if (!it || typeof it !== "object") return;
        if (Number(it.categoryIndex) !== ci) return;
        if (!String(it.name || "").trim()) return;
        items.push(
          mergeItem(
            {
              name: it.name || "",
              description: it.description,
              price: Number(it.price) || 0,
              image: it.image,
              toppings: it.toppings,
            },
            id,
            it as ItemOverride
          )
        );
      });
      list.push({
        ci,
        name,
        iconSrc: categoryIconSrc(overrides, ci, name),
        iconType: getCategoryIconType(name),
        station: resolveCategoryStation(overrides, ci, name),
        items,
      });
    });

  return applyCategoryOrder(list, overrides);
}
