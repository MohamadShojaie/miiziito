"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiJson, cashierHeaders } from "@/lib/api";
import {
  COSTING_UNITS,
  EMPTY_COSTING,
  calcRecipePricing,
  compatibleUnits,
  normalizeCostingPayload,
  overheadPerUnit,
  totalMonthlyOverhead,
  unitLabel,
  type CostingBill,
  type CostingData,
  type CostingEmployee,
  type CostingIngredient,
  type CostingRecipe,
  type CostingRecipeLine,
  type CostingUnit,
} from "@/lib/costing";
import { formatPriceAsNumber, toPersianDigits } from "@/lib/format";
import {
  buildCustomerCategories,
  type MenuOverrides,
} from "@/lib/menu-utils";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { CpSelect } from "@/components/ui/CpSelect";

type Panel = "ingredients" | "bills" | "employees" | "recipes";

type IngredientDraft = {
  id?: string;
  name: string;
  unit: CostingUnit;
  unitPrice: string;
};

type BillDraft = {
  id?: string;
  name: string;
  monthlyAmount: string;
};

type EmployeeDraft = {
  id?: string;
  name: string;
  role: string;
  salary: string;
};

type RecipeDraft = {
  id?: string;
  menuItemKey: string;
  lines: Array<{ ingredientId: string; qty: string; unit: CostingUnit }>;
};

const PANELS: Array<{ id: Panel; label: string }> = [
  { id: "ingredients", label: "مواد اولیه" },
  { id: "bills", label: "قبوض و هزینه‌ها" },
  { id: "employees", label: "پرسنل" },
  { id: "recipes", label: "دستور ساخت و قیمت" },
];

const UNIT_OPTIONS = COSTING_UNITS.map((u) => [u.value, u.label] as const);

function emptyIngredient(): IngredientDraft {
  return { name: "", unit: "g", unitPrice: "" };
}

function emptyBill(): BillDraft {
  return { name: "", monthlyAmount: "" };
}

function emptyEmployee(): EmployeeDraft {
  return { name: "", role: "", salary: "" };
}

function emptyRecipe(): RecipeDraft {
  return { menuItemKey: "", lines: [{ ingredientId: "", qty: "", unit: "g" }] };
}

export function CostingTab({ active }: { active: boolean }) {
  const { showToast } = useToast();
  const [panel, setPanel] = useState<Panel>("ingredients");
  const [data, setData] = useState<CostingData>(EMPTY_COSTING);
  const [overrides, setOverrides] = useState<MenuOverrides>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [profitPercent, setProfitPercent] = useState("40");
  const [monthlyPortions, setMonthlyPortions] = useState("1000");
  const [mounted, setMounted] = useState(false);

  const [ingredientOpen, setIngredientOpen] = useState(false);
  const [ingredientDraft, setIngredientDraft] = useState<IngredientDraft>(emptyIngredient());
  const [billOpen, setBillOpen] = useState(false);
  const [billDraft, setBillDraft] = useState<BillDraft>(emptyBill());
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeDraft>(emptyEmployee());
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(emptyRecipe());

  useEffect(() => setMounted(true), []);

  function applyCosting(next: CostingData) {
    setData(next);
    setProfitPercent(String(next.settings.profitPercent));
    setMonthlyPortions(String(next.settings.monthlyPortions));
  }

  function loadAll() {
    setLoading(true);
    setError("");
    return Promise.all([
      apiJson<{ costing?: unknown }>("/api/costing", { headers: cashierHeaders() }),
      apiJson<{ overrides?: MenuOverrides }>("/api/menu", { headers: cashierHeaders() }),
    ])
      .then(([costingRes, menuRes]) => {
        applyCosting(normalizeCostingPayload(costingRes.costing));
        setOverrides(menuRes.overrides || {});
      })
      .catch(() => setError("بارگذاری هزینه‌یابی ناموفق بود"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!active) return;
    loadAll();
  }, [active]);

  useEffect(() => {
    const open = ingredientOpen || billOpen || employeeOpen || recipeOpen;
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIngredientOpen(false);
        setBillOpen(false);
        setEmployeeOpen(false);
        setRecipeOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ingredientOpen, billOpen, employeeOpen, recipeOpen]);

  const menuItems = useMemo(() => {
    const cats = buildCustomerCategories(overrides);
    const rows: Array<{ key: string; name: string; category: string; price: number }> = [];
    cats.forEach((cat) => {
      cat.items.forEach((item) => {
        rows.push({
          key: item.id,
          name: item.name,
          category: cat.name,
          price: Number(item.price) || 0,
        });
      });
    });
    return rows;
  }, [overrides]);

  const menuByKey = useMemo(() => {
    const map = new Map(menuItems.map((m) => [m.key, m]));
    return map;
  }, [menuItems]);

  const menuOptions = useMemo(
    () =>
      [
        ["", "انتخاب آیتم منو"],
        ...menuItems.map((m) => [m.key, `${m.category} — ${m.name}`] as const),
      ] as const,
    [menuItems]
  );

  const ingredientOptions = useMemo(
    () =>
      [
        ["", "انتخاب ماده"],
        ...data.ingredients.map(
          (i) =>
            [i.id, `${i.name} (قیمت بر اساس ${unitLabel(i.unit)})`] as const
        ),
      ] as const,
    [data.ingredients]
  );

  const ingredientById = useMemo(() => {
    return new Map(data.ingredients.map((i) => [i.id, i]));
  }, [data.ingredients]);

  const overheadShare = overheadPerUnit(data);
  const monthlyOverhead = totalMonthlyOverhead(data);

  const filteredIngredients = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || panel !== "ingredients") return data.ingredients;
    return data.ingredients.filter((i) => i.name.toLowerCase().includes(needle));
  }, [data.ingredients, q, panel]);

  const filteredBills = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || panel !== "bills") return data.bills;
    return data.bills.filter((b) => b.name.toLowerCase().includes(needle));
  }, [data.bills, q, panel]);

  const filteredEmployees = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || panel !== "employees") return data.employees;
    return data.employees.filter((e) =>
      `${e.name} ${e.role || ""}`.toLowerCase().includes(needle)
    );
  }, [data.employees, q, panel]);

  const recipeRows = useMemo(() => {
    return data.recipes.map((recipe) => {
      const menu = menuByKey.get(recipe.menuItemKey);
      const pricing = calcRecipePricing(recipe, data);
      return { recipe, menu, pricing };
    });
  }, [data, menuByKey]);

  async function postCosting(body: Record<string, unknown>) {
    const res = await apiJson<{ costing?: unknown }>("/api/costing", {
      method: "POST",
      headers: cashierHeaders(),
      body: JSON.stringify(body),
    });
    if (res.costing) applyCosting(normalizeCostingPayload(res.costing));
    return res;
  }

  async function saveSettings() {
    const profit = Math.max(0, Number(profitPercent) || 0);
    const portions = Math.max(1, Number(monthlyPortions) || 1);
    setBusy(true);
    try {
      await postCosting({
        action: "saveSettings",
        settings: { profitPercent: profit, monthlyPortions: portions },
      });
      showToast("تنظیمات ذخیره شد");
    } catch {
      showToast("ذخیره تنظیمات ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function saveIngredient() {
    const name = ingredientDraft.name.trim();
    if (!name) {
      showToast("نام ماده را وارد کنید");
      return;
    }
    setBusy(true);
    try {
      await postCosting({
        action: "upsertIngredient",
        id: ingredientDraft.id,
        name,
        unit: ingredientDraft.unit,
        unitPrice: Math.max(0, Number(ingredientDraft.unitPrice) || 0),
      });
      setIngredientOpen(false);
      showToast(ingredientDraft.id ? "ماده به‌روز شد" : "ماده اضافه شد");
    } catch {
      showToast("ذخیره ماده ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function removeIngredient(item: CostingIngredient) {
    if (!window.confirm(`«${item.name}» حذف شود؟`)) return;
    setBusy(true);
    try {
      await postCosting({ action: "removeIngredient", id: item.id });
      setIngredientOpen(false);
      showToast("ماده حذف شد");
    } catch {
      showToast("حذف ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function saveBill() {
    const name = billDraft.name.trim();
    if (!name) {
      showToast("نام هزینه را وارد کنید");
      return;
    }
    setBusy(true);
    try {
      await postCosting({
        action: "upsertBill",
        id: billDraft.id,
        name,
        monthlyAmount: Math.max(0, Number(billDraft.monthlyAmount) || 0),
      });
      setBillOpen(false);
      showToast(billDraft.id ? "هزینه به‌روز شد" : "هزینه اضافه شد");
    } catch {
      showToast("ذخیره هزینه ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function removeBill(item: CostingBill) {
    if (!window.confirm(`«${item.name}» حذف شود؟`)) return;
    setBusy(true);
    try {
      await postCosting({ action: "removeBill", id: item.id });
      setBillOpen(false);
      showToast("حذف شد");
    } catch {
      showToast("حذف ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function saveEmployee() {
    const name = employeeDraft.name.trim();
    if (!name) {
      showToast("نام پرسنل را وارد کنید");
      return;
    }
    setBusy(true);
    try {
      await postCosting({
        action: "upsertEmployee",
        id: employeeDraft.id,
        name,
        role: employeeDraft.role.trim(),
        salary: Math.max(0, Number(employeeDraft.salary) || 0),
      });
      setEmployeeOpen(false);
      showToast(employeeDraft.id ? "پرسنل به‌روز شد" : "پرسنل اضافه شد");
    } catch {
      showToast("ذخیره پرسنل ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function removeEmployee(item: CostingEmployee) {
    if (!window.confirm(`«${item.name}» حذف شود؟`)) return;
    setBusy(true);
    try {
      await postCosting({ action: "removeEmployee", id: item.id });
      setEmployeeOpen(false);
      showToast("حذف شد");
    } catch {
      showToast("حذف ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function saveRecipe() {
    if (!recipeDraft.menuItemKey) {
      showToast("آیتم منو را انتخاب کنید");
      return;
    }
    const lines: CostingRecipeLine[] = recipeDraft.lines
      .map((line) => {
        const ing = ingredientById.get(line.ingredientId);
        const allowed = compatibleUnits(ing?.unit || line.unit || "pcs");
        const unit = allowed.includes(line.unit) ? line.unit : allowed[0];
        return {
          ingredientId: line.ingredientId,
          qty: Math.max(0, Number(line.qty) || 0),
          unit,
        };
      })
      .filter((line) => line.ingredientId && line.qty > 0);
    if (!lines.length) {
      showToast("حداقل یک ماده با مقدار وارد کنید");
      return;
    }
    setBusy(true);
    try {
      await postCosting({
        action: "upsertRecipe",
        id: recipeDraft.id,
        menuItemKey: recipeDraft.menuItemKey,
        lines,
      });
      setRecipeOpen(false);
      showToast(recipeDraft.id ? "دستور به‌روز شد" : "دستور ذخیره شد");
    } catch {
      showToast("ذخیره دستور ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function removeRecipe(recipe: CostingRecipe) {
    const label = menuByKey.get(recipe.menuItemKey)?.name || recipe.menuItemKey;
    if (!window.confirm(`دستور «${label}» حذف شود؟`)) return;
    setBusy(true);
    try {
      await postCosting({ action: "removeRecipe", id: recipe.id });
      setRecipeOpen(false);
      showToast("دستور حذف شد");
    } catch {
      showToast("حذف ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function applyPrice(menuItemKey: string, suggestedPrice: number) {
    setBusy(true);
    try {
      const res = await apiJson<{ overrides?: MenuOverrides }>("/api/menu", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "update",
          id: menuItemKey,
          price: Math.max(0, Math.round(suggestedPrice)),
        }),
      });
      if (res.overrides) setOverrides(res.overrides);
      showToast("قیمت منو به‌روز شد");
    } catch {
      showToast("اعمال قیمت ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function applyAllSuggested() {
    if (!recipeRows.length) return;
    if (
      !window.confirm(
        `قیمت پیشنهادی برای ${toPersianDigits(recipeRows.length)} آیتم روی منو اعمال شود؟`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      let lastOverrides: MenuOverrides | null = null;
      for (const row of recipeRows) {
        const res = await apiJson<{ overrides?: MenuOverrides }>("/api/menu", {
          method: "POST",
          headers: cashierHeaders(),
          body: JSON.stringify({
            action: "update",
            id: row.recipe.menuItemKey,
            price: Math.max(0, Math.round(row.pricing.suggestedPrice)),
          }),
        });
        if (res.overrides) lastOverrides = res.overrides;
      }
      if (lastOverrides) setOverrides(lastOverrides);
      showToast("قیمت‌های پیشنهادی اعمال شد");
    } catch {
      showToast("اعمال گروهی ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  function openEditIngredient(item: CostingIngredient) {
    setIngredientDraft({
      id: item.id,
      name: item.name,
      unit: item.unit,
      unitPrice: String(item.unitPrice ?? ""),
    });
    setIngredientOpen(true);
  }

  function openEditBill(item: CostingBill) {
    setBillDraft({
      id: item.id,
      name: item.name,
      monthlyAmount: String(item.monthlyAmount ?? ""),
    });
    setBillOpen(true);
  }

  function openEditEmployee(item: CostingEmployee) {
    setEmployeeDraft({
      id: item.id,
      name: item.name,
      role: item.role || "",
      salary: String(item.salary ?? ""),
    });
    setEmployeeOpen(true);
  }

  function openEditRecipe(recipe: CostingRecipe) {
    setRecipeDraft({
      id: recipe.id,
      menuItemKey: recipe.menuItemKey,
      lines: recipe.lines.length
        ? recipe.lines.map((l) => {
            const ing = data.ingredients.find((i) => i.id === l.ingredientId);
            const allowed = compatibleUnits(ing?.unit || l.unit || "pcs");
            const unit = allowed.includes(l.unit) ? l.unit : allowed[0];
            return {
              ingredientId: l.ingredientId,
              qty: String(l.qty ?? ""),
              unit,
            };
          })
        : [{ ingredientId: "", qty: "", unit: "g" }],
    });
    setRecipeOpen(true);
  }

  if (loading) {
    return (
      <div className="admin-tab costing-page">
        <LoadingShimmer variant="list" count={5} />
      </div>
    );
  }

  const panelAddLabel =
    panel === "ingredients"
      ? "+ ماده جدید"
      : panel === "bills"
        ? "+ هزینه جدید"
        : panel === "employees"
          ? "+ پرسنل جدید"
          : "+ دستور ساخت";

  function openPanelAdd() {
    if (panel === "ingredients") {
      setIngredientDraft(emptyIngredient());
      setIngredientOpen(true);
      return;
    }
    if (panel === "bills") {
      setBillDraft(emptyBill());
      setBillOpen(true);
      return;
    }
    if (panel === "employees") {
      setEmployeeDraft(emptyEmployee());
      setEmployeeOpen(true);
      return;
    }
    setRecipeDraft(emptyRecipe());
    setRecipeOpen(true);
  }

  return (
    <div className="admin-tab costing-page">
      <header className="costing-header">
        <div>
          <h3 className="costing-title">هزینه‌یابی منو</h3>
          <p className="costing-subtitle">
            از مواد و هزینه‌ها تا قیمت پیشنهادی فروش با درصد سود
          </p>
        </div>
        <div className="costing-header-actions">
          {panel === "recipes" && recipeRows.length ? (
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={busy}
              onClick={applyAllSuggested}
            >
              اعمال همه
            </button>
          ) : null}
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            onClick={openPanelAdd}
          >
            {panelAddLabel}
          </button>
        </div>
      </header>

      {error ? <p className="costing-error">{error}</p> : null}

      <section className="costing-settings" aria-label="تنظیمات محاسبه">
        <div className="costing-settings-fields">
          <label className="costing-field">
            <span>درصد سود</span>
            <div className="costing-input-affix">
              <input
                type="number"
                min={0}
                step={1}
                value={profitPercent}
                onChange={(e) => setProfitPercent(e.target.value)}
              />
              <em>%</em>
            </div>
          </label>
          <label className="costing-field">
            <span>فروش ماهانه (پرس)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={monthlyPortions}
              onChange={(e) => setMonthlyPortions(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="cp-btn cp-btn--primary costing-settings-save"
            disabled={busy}
            onClick={saveSettings}
          >
            ذخیره
          </button>
        </div>
        <div className="costing-kpi-row">
          <div className="costing-kpi">
            <span>هزینه ماهانه</span>
            <strong className="cp-num">{formatPriceAsNumber(monthlyOverhead)}</strong>
          </div>
          <div className="costing-kpi">
            <span>سربار هر پرس</span>
            <strong className="cp-num">{formatPriceAsNumber(overheadShare)}</strong>
          </div>
          <div className="costing-kpi costing-kpi--muted">
            <span>مواد اولیه</span>
            <strong className="cp-num">
              {toPersianDigits(data.ingredients.length)}
            </strong>
          </div>
          <div className="costing-kpi costing-kpi--muted">
            <span>دستور ساخت</span>
            <strong className="cp-num">
              {toPersianDigits(data.recipes.length)}
            </strong>
          </div>
        </div>
      </section>

      <nav className="costing-panels" aria-label="بخش‌های هزینه‌یابی">
        {PANELS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`costing-panel-tab${panel === p.id ? " is-active" : ""}`}
            onClick={() => {
              setPanel(p.id);
              setQ("");
            }}
          >
            {p.label}
            <em>
              {toPersianDigits(
                p.id === "ingredients"
                  ? data.ingredients.length
                  : p.id === "bills"
                    ? data.bills.length
                    : p.id === "employees"
                      ? data.employees.length
                      : data.recipes.length
              )}
            </em>
          </button>
        ))}
      </nav>

      {panel !== "recipes" ? (
        <div className="costing-toolbar">
          <input
            type="search"
            className="costing-search"
            placeholder={
              panel === "ingredients"
                ? "جستجوی ماده…"
                : panel === "bills"
                  ? "جستجوی هزینه…"
                  : "جستجوی پرسنل…"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      ) : null}

      {panel === "ingredients" ? (
        <div className="costing-list">
          {filteredIngredients.length === 0 ? (
            <div className="costing-empty">
              <p className="costing-empty-title">
                {q.trim() ? "ماده‌ای پیدا نشد" : "هنوز ماده‌ای ثبت نشده"}
              </p>
              <p className="costing-empty-hint">
                مواد اولیه را با واحد خرید و قیمت واحد اضافه کنید
              </p>
              {!q.trim() ? (
                <button
                  type="button"
                  className="cp-btn cp-btn--primary"
                  onClick={openPanelAdd}
                >
                  + ماده جدید
                </button>
              ) : null}
            </div>
          ) : (
            filteredIngredients.map((item) => (
              <button
                key={item.id}
                type="button"
                className="costing-row"
                onClick={() => openEditIngredient(item)}
              >
                <div className="costing-row-main">
                  <strong>{item.name}</strong>
                  <small>واحد خرید: {unitLabel(item.unit)}</small>
                </div>
                <div className="costing-row-side">
                  <span className="costing-row-meta cp-num">
                    {formatPriceAsNumber(item.unitPrice)}
                  </span>
                  <span className="costing-row-action">ویرایش</span>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}

      {panel === "bills" ? (
        <div className="costing-list">
          {filteredBills.length === 0 ? (
            <div className="costing-empty">
              <p className="costing-empty-title">
                {q.trim() ? "هزینه‌ای پیدا نشد" : "هنوز هزینه‌ای ثبت نشده"}
              </p>
              <p className="costing-empty-hint">
                برق، آب، اجاره و سایر هزینه‌های ماهانه را اینجا وارد کنید
              </p>
              {!q.trim() ? (
                <button
                  type="button"
                  className="cp-btn cp-btn--primary"
                  onClick={openPanelAdd}
                >
                  + هزینه جدید
                </button>
              ) : null}
            </div>
          ) : (
            filteredBills.map((item) => (
              <button
                key={item.id}
                type="button"
                className="costing-row"
                onClick={() => openEditBill(item)}
              >
                <div className="costing-row-main">
                  <strong>{item.name}</strong>
                  <small>ماهانه</small>
                </div>
                <div className="costing-row-side">
                  <span className="costing-row-meta cp-num">
                    {formatPriceAsNumber(item.monthlyAmount)}
                  </span>
                  <span className="costing-row-action">ویرایش</span>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}

      {panel === "employees" ? (
        <div className="costing-list">
          {filteredEmployees.length === 0 ? (
            <div className="costing-empty">
              <p className="costing-empty-title">
                {q.trim() ? "پرسنلی پیدا نشد" : "هنوز پرسنلی ثبت نشده"}
              </p>
              <p className="costing-empty-hint">
                حقوق ماهانه پرسنل در سربار هر پرس لحاظ می‌شود
              </p>
              {!q.trim() ? (
                <button
                  type="button"
                  className="cp-btn cp-btn--primary"
                  onClick={openPanelAdd}
                >
                  + پرسنل جدید
                </button>
              ) : null}
            </div>
          ) : (
            filteredEmployees.map((item) => (
              <button
                key={item.id}
                type="button"
                className="costing-row"
                onClick={() => openEditEmployee(item)}
              >
                <div className="costing-row-main">
                  <strong>{item.name}</strong>
                  <small>{item.role || "بدون سمت"}</small>
                </div>
                <div className="costing-row-side">
                  <span className="costing-row-meta cp-num">
                    {formatPriceAsNumber(item.salary)}
                  </span>
                  <span className="costing-row-action">ویرایش</span>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}

      {panel === "recipes" ? (
        <div className="costing-list costing-list--recipes">
          {recipeRows.length === 0 ? (
            <div className="costing-empty">
              <p className="costing-empty-title">هنوز دستوری نیست</p>
              <p className="costing-empty-hint">
                برای هر آیتم منو مواد مصرفی را با واحد مصرف تعریف کنید
              </p>
              <button
                type="button"
                className="cp-btn cp-btn--primary"
                onClick={openPanelAdd}
              >
                + دستور ساخت
              </button>
            </div>
          ) : (
            recipeRows.map(({ recipe, menu, pricing }) => {
              const delta =
                pricing.suggestedRoundedUp - (Number(menu?.price) || 0);
              return (
                <article key={recipe.id} className="costing-recipe-card">
                  <div className="costing-recipe-head">
                    <div>
                      <span className="costing-recipe-cat">
                        {menu?.category || "منو"}
                      </span>
                      <h4 className="costing-recipe-name">
                        {menu?.name || recipe.menuItemKey}
                      </h4>
                      <p className="costing-recipe-lines-count">
                        {toPersianDigits(recipe.lines.length)} ماده در دستور
                      </p>
                    </div>
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost"
                      onClick={() => openEditRecipe(recipe)}
                    >
                      ویرایش
                    </button>
                  </div>

                  <div className="costing-recipe-hero">
                    <div className="costing-recipe-hero-main">
                      <span>پیشنهادی (گرد به بالا)</span>
                      <strong className="cp-num">
                        {formatPriceAsNumber(pricing.suggestedRoundedUp)}
                      </strong>
                    </div>
                    <div className="costing-recipe-hero-side">
                      <div>
                        <span>پیشنهادی دقیق</span>
                        <strong className="cp-num">
                          {formatPriceAsNumber(pricing.suggestedPrice)}
                        </strong>
                      </div>
                      <div>
                        <span>قیمت فعلی منو</span>
                        <strong className="cp-num">
                          {formatPriceAsNumber(menu?.price || 0)}
                        </strong>
                      </div>
                      <div>
                        <span>اختلاف</span>
                        <strong
                          className={`cp-num${delta > 0 ? " is-up" : delta < 0 ? " is-down" : ""}`}
                        >
                          {delta === 0
                            ? "بدون تغییر"
                            : `${delta > 0 ? "+" : "−"}${formatPriceAsNumber(Math.abs(delta))}`}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="costing-recipe-breakdown">
                    <div>
                      <span>مواد</span>
                      <strong className="cp-num">
                        {formatPriceAsNumber(pricing.ingredientCost)}
                      </strong>
                    </div>
                    <div>
                      <span>سربار</span>
                      <strong className="cp-num">
                        {formatPriceAsNumber(pricing.overhead)}
                      </strong>
                    </div>
                    <div>
                      <span>بهای تمام‌شده</span>
                      <strong className="cp-num">
                        {formatPriceAsNumber(pricing.unitCost)}
                      </strong>
                    </div>
                  </div>

                  <div className="costing-recipe-actions">
                    <button
                      type="button"
                      className="cp-btn cp-btn--primary"
                      disabled={busy}
                      onClick={() =>
                        applyPrice(
                          recipe.menuItemKey,
                          pricing.suggestedRoundedUp
                        )
                      }
                    >
                      گرد به بالا و اعمال
                    </button>
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost"
                      disabled={busy}
                      onClick={() =>
                        applyPrice(recipe.menuItemKey, pricing.suggestedPrice)
                      }
                    >
                      اعمال دقیق
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : null}

      {mounted && ingredientOpen
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="presentation"
              onClick={() => !busy && setIngredientOpen(false)}
            >
              <div
                className="table-glass-dialog costing-glass-dialog"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 className="table-glass-title">
                      {ingredientDraft.id ? "ویرایش ماده" : "ماده جدید"}
                    </h4>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    disabled={busy}
                    onClick={() => setIngredientOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="costing-form">
                  <label className="costing-field">
                    <span>نام</span>
                    <input
                      autoFocus
                      value={ingredientDraft.name}
                      disabled={busy}
                      onChange={(e) =>
                        setIngredientDraft((d) => ({ ...d, name: e.target.value }))
                      }
                    />
                  </label>
                  <CpSelect
                    label="واحد"
                    value={ingredientDraft.unit}
                    options={UNIT_OPTIONS}
                    disabled={busy}
                    onChange={(v) =>
                      setIngredientDraft((d) => ({
                        ...d,
                        unit: v as CostingUnit,
                      }))
                    }
                  />
                  <label className="costing-field">
                    <span>قیمت هر واحد (تومان)</span>
                    <input
                      type="number"
                      min={0}
                      value={ingredientDraft.unitPrice}
                      disabled={busy}
                      onChange={(e) =>
                        setIngredientDraft((d) => ({
                          ...d,
                          unitPrice: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="costing-dialog-actions">
                  {ingredientDraft.id ? (
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost"
                      disabled={busy}
                      onClick={() =>
                        removeIngredient({
                          id: ingredientDraft.id!,
                          name: ingredientDraft.name,
                          unit: ingredientDraft.unit,
                          unitPrice: Number(ingredientDraft.unitPrice) || 0,
                        })
                      }
                    >
                      حذف
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary"
                    disabled={busy}
                    onClick={saveIngredient}
                  >
                    ذخیره
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && billOpen
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="presentation"
              onClick={() => !busy && setBillOpen(false)}
            >
              <div
                className="table-glass-dialog costing-glass-dialog"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 className="table-glass-title">
                      {billDraft.id ? "ویرایش هزینه" : "هزینه جدید"}
                    </h4>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    disabled={busy}
                    onClick={() => setBillOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="costing-form">
                  <label className="costing-field">
                    <span>نام (مثلاً برق، آب، اجاره)</span>
                    <input
                      autoFocus
                      value={billDraft.name}
                      disabled={busy}
                      onChange={(e) =>
                        setBillDraft((d) => ({ ...d, name: e.target.value }))
                      }
                    />
                  </label>
                  <label className="costing-field">
                    <span>مبلغ ماهانه (تومان)</span>
                    <input
                      type="number"
                      min={0}
                      value={billDraft.monthlyAmount}
                      disabled={busy}
                      onChange={(e) =>
                        setBillDraft((d) => ({
                          ...d,
                          monthlyAmount: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="costing-dialog-actions">
                  {billDraft.id ? (
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost"
                      disabled={busy}
                      onClick={() =>
                        removeBill({
                          id: billDraft.id!,
                          name: billDraft.name,
                          monthlyAmount: Number(billDraft.monthlyAmount) || 0,
                        })
                      }
                    >
                      حذف
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary"
                    disabled={busy}
                    onClick={saveBill}
                  >
                    ذخیره
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && employeeOpen
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="presentation"
              onClick={() => !busy && setEmployeeOpen(false)}
            >
              <div
                className="table-glass-dialog costing-glass-dialog"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 className="table-glass-title">
                      {employeeDraft.id ? "ویرایش پرسنل" : "پرسنل جدید"}
                    </h4>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    disabled={busy}
                    onClick={() => setEmployeeOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="costing-form">
                  <label className="costing-field">
                    <span>نام</span>
                    <input
                      autoFocus
                      value={employeeDraft.name}
                      disabled={busy}
                      onChange={(e) =>
                        setEmployeeDraft((d) => ({ ...d, name: e.target.value }))
                      }
                    />
                  </label>
                  <label className="costing-field">
                    <span>سمت (اختیاری)</span>
                    <input
                      value={employeeDraft.role}
                      disabled={busy}
                      onChange={(e) =>
                        setEmployeeDraft((d) => ({ ...d, role: e.target.value }))
                      }
                    />
                  </label>
                  <label className="costing-field">
                    <span>حقوق ماهانه (تومان)</span>
                    <input
                      type="number"
                      min={0}
                      value={employeeDraft.salary}
                      disabled={busy}
                      onChange={(e) =>
                        setEmployeeDraft((d) => ({
                          ...d,
                          salary: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="costing-dialog-actions">
                  {employeeDraft.id ? (
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost"
                      disabled={busy}
                      onClick={() =>
                        removeEmployee({
                          id: employeeDraft.id!,
                          name: employeeDraft.name,
                          role: employeeDraft.role,
                          salary: Number(employeeDraft.salary) || 0,
                        })
                      }
                    >
                      حذف
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary"
                    disabled={busy}
                    onClick={saveEmployee}
                  >
                    ذخیره
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && recipeOpen
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="presentation"
              onClick={() => !busy && setRecipeOpen(false)}
            >
              <div
                className="table-glass-dialog costing-glass-dialog costing-glass-dialog--wide"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 className="table-glass-title">
                      {recipeDraft.id ? "ویرایش دستور" : "دستور ساخت جدید"}
                    </h4>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    disabled={busy}
                    onClick={() => setRecipeOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="costing-form">
                  <CpSelect
                    label="آیتم منو"
                    value={recipeDraft.menuItemKey}
                    options={menuOptions}
                    disabled={busy}
                    onChange={(v) =>
                      setRecipeDraft((d) => ({ ...d, menuItemKey: v }))
                    }
                  />
                  <div className="costing-recipe-lines">
                    <div className="costing-recipe-lines-head">
                      <span>مواد مصرفی — واحد مصرف می‌تواند با واحد خرید فرق کند</span>
                      <button
                        type="button"
                        className="cp-btn cp-btn--ghost"
                        disabled={busy}
                        onClick={() =>
                          setRecipeDraft((d) => ({
                            ...d,
                            lines: [
                              ...d.lines,
                              { ingredientId: "", qty: "", unit: "g" },
                            ],
                          }))
                        }
                      >
                        + ماده
                      </button>
                    </div>
                    {recipeDraft.lines.map((line, idx) => {
                      const ing = ingredientById.get(line.ingredientId);
                      const unitOpts = compatibleUnits(ing?.unit || line.unit || "pcs").map(
                        (u) => [u, unitLabel(u)] as const
                      );
                      return (
                      <div key={idx} className="costing-recipe-line">
                        <CpSelect
                          value={line.ingredientId}
                          options={ingredientOptions}
                          disabled={busy}
                          onChange={(v) =>
                            setRecipeDraft((d) => {
                              const lines = [...d.lines];
                              const nextIng = ingredientById.get(v);
                              const allowed = compatibleUnits(nextIng?.unit || "pcs");
                              lines[idx] = {
                                ...lines[idx],
                                ingredientId: v,
                                unit: allowed.includes(lines[idx].unit)
                                  ? lines[idx].unit
                                  : allowed[0],
                              };
                              return { ...d, lines };
                            })
                          }
                        />
                        <input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="مقدار"
                          value={line.qty}
                          disabled={busy}
                          onChange={(e) =>
                            setRecipeDraft((d) => {
                              const lines = [...d.lines];
                              lines[idx] = { ...lines[idx], qty: e.target.value };
                              return { ...d, lines };
                            })
                          }
                        />
                        <CpSelect
                          value={line.unit}
                          options={unitOpts}
                          disabled={busy || !line.ingredientId}
                          onChange={(v) =>
                            setRecipeDraft((d) => {
                              const lines = [...d.lines];
                              lines[idx] = {
                                ...lines[idx],
                                unit: v as CostingUnit,
                              };
                              return { ...d, lines };
                            })
                          }
                        />
                        <button
                          type="button"
                          className="cp-btn cp-btn--ghost"
                          aria-label="حذف خط"
                          disabled={busy}
                          onClick={() =>
                            setRecipeDraft((d) => ({
                              ...d,
                              lines:
                                d.lines.length <= 1
                                  ? [{ ingredientId: "", qty: "", unit: "g" }]
                                  : d.lines.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          ×
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </div>
                <div className="costing-dialog-actions">
                  {recipeDraft.id ? (
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost"
                      disabled={busy}
                      onClick={() =>
                        removeRecipe({
                          id: recipeDraft.id!,
                          menuItemKey: recipeDraft.menuItemKey,
                          lines: [],
                        })
                      }
                    >
                      حذف
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary"
                    disabled={busy}
                    onClick={saveRecipe}
                  >
                    ذخیره
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
