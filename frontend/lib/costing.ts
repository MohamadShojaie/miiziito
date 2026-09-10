export type CostingUnit = "g" | "kg" | "ml" | "l" | "pcs";

export type CostingSettings = {
  profitPercent: number;
  monthlyPortions: number;
};

export type CostingIngredient = {
  id: string;
  name: string;
  unit: CostingUnit;
  unitPrice: number;
};

export type CostingBill = {
  id: string;
  name: string;
  monthlyAmount: number;
};

export type CostingEmployee = {
  id: string;
  name: string;
  role?: string;
  salary: number;
};

export type CostingRecipeLine = {
  ingredientId: string;
  qty: number;
  /** Usage unit in the recipe (converted to ingredient.unit for cost). */
  unit: CostingUnit;
};

export type CostingRecipe = {
  id: string;
  menuItemKey: string;
  lines: CostingRecipeLine[];
};

export type CostingData = {
  settings: CostingSettings;
  ingredients: CostingIngredient[];
  bills: CostingBill[];
  employees: CostingEmployee[];
  recipes: CostingRecipe[];
};

export const COSTING_UNITS: Array<{ value: CostingUnit; label: string }> = [
  { value: "g", label: "گرم" },
  { value: "kg", label: "کیلوگرم" },
  { value: "ml", label: "میلی‌لیتر" },
  { value: "l", label: "لیتر" },
  { value: "pcs", label: "عدد" },
];

const MASS_TO_G: Partial<Record<CostingUnit, number>> = { g: 1, kg: 1000 };
const VOL_TO_ML: Partial<Record<CostingUnit, number>> = { ml: 1, l: 1000 };

export const EMPTY_COSTING: CostingData = {
  settings: { profitPercent: 40, monthlyPortions: 1000 },
  ingredients: [],
  bills: [],
  employees: [],
  recipes: [],
};

export function unitLabel(unit: CostingUnit | string): string {
  return COSTING_UNITS.find((u) => u.value === unit)?.label || unit;
}

export function isCostingUnit(value: string): value is CostingUnit {
  return COSTING_UNITS.some((u) => u.value === value);
}

/** Units that can convert to/from the ingredient purchase unit. */
export function compatibleUnits(base: CostingUnit | string): CostingUnit[] {
  if (base === "g" || base === "kg") return ["g", "kg"];
  if (base === "ml" || base === "l") return ["ml", "l"];
  return ["pcs"];
}

/** Sensible recipe usage unit when a line has no unit saved yet. */
export function defaultUsageUnit(purchaseUnit: CostingUnit | string): CostingUnit {
  if (purchaseUnit === "kg") return "g";
  if (purchaseUnit === "l") return "ml";
  const unit = String(purchaseUnit);
  if (isCostingUnit(unit)) return unit;
  return "pcs";
}

/**
 * Convert quantity from one unit to another within the same family.
 * Returns null if units are incompatible.
 */
export function convertQty(
  qty: number,
  fromUnit: CostingUnit | string,
  toUnit: CostingUnit | string
): number | null {
  const q = Number(qty) || 0;
  if (fromUnit === toUnit) return q;
  const fromMass = MASS_TO_G[fromUnit as CostingUnit];
  const toMass = MASS_TO_G[toUnit as CostingUnit];
  if (fromMass != null && toMass != null) return (q * fromMass) / toMass;
  const fromVol = VOL_TO_ML[fromUnit as CostingUnit];
  const toVol = VOL_TO_ML[toUnit as CostingUnit];
  if (fromVol != null && toVol != null) return (q * fromVol) / toVol;
  return null;
}

export function lineIngredientCost(
  line: CostingRecipeLine,
  ingredient: CostingIngredient
): number {
  const usageUnit = line.unit || defaultUsageUnit(ingredient.unit);
  const qtyInPurchaseUnit = convertQty(line.qty, usageUnit, ingredient.unit);
  if (qtyInPurchaseUnit == null) return 0;
  return qtyInPurchaseUnit * (Number(ingredient.unitPrice) || 0);
}

export function totalMonthlyOverhead(data: CostingData): number {
  const bills = data.bills.reduce((s, b) => s + (Number(b.monthlyAmount) || 0), 0);
  const salaries = data.employees.reduce((s, e) => s + (Number(e.salary) || 0), 0);
  return bills + salaries;
}

export function overheadPerUnit(data: CostingData): number {
  const portions = Math.max(1, Number(data.settings.monthlyPortions) || 1);
  return totalMonthlyOverhead(data) / portions;
}

export function ingredientCostForRecipe(
  recipe: CostingRecipe,
  ingredients: CostingIngredient[]
): number {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  return (recipe.lines || []).reduce((sum, line) => {
    const ing = byId.get(line.ingredientId);
    if (!ing) return sum;
    return sum + lineIngredientCost(line, ing);
  }, 0);
}

export function calcRecipePricing(recipe: CostingRecipe, data: CostingData) {
  const ingredientCost = ingredientCostForRecipe(recipe, data.ingredients);
  const overhead = overheadPerUnit(data);
  const unitCost = ingredientCost + overhead;
  const profit = Math.max(0, Number(data.settings.profitPercent) || 0);
  const suggestedPrice = Math.round(unitCost * (1 + profit / 100));
  const suggestedRoundedUp = roundPriceUp(suggestedPrice);
  return {
    ingredientCost,
    overhead,
    unitCost,
    suggestedPrice,
    suggestedRoundedUp,
  };
}

/** Round price up to the next thousand toman (common menu step). */
export function roundPriceUp(price: number, step = 1000): number {
  const p = Math.max(0, Number(price) || 0);
  const s = Math.max(1, Math.round(step) || 1000);
  return Math.ceil(p / s) * s;
}

export function normalizeCostingPayload(raw: unknown): CostingData {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const settingsRaw =
    src.settings && typeof src.settings === "object"
      ? (src.settings as Record<string, unknown>)
      : {};
  const ingredients = Array.isArray(src.ingredients)
    ? (src.ingredients as CostingIngredient[])
    : [];
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const recipes = Array.isArray(src.recipes)
    ? (src.recipes as CostingRecipe[]).map((recipe) => ({
        ...recipe,
        lines: (recipe.lines || []).map((line) => {
          const ing = byId.get(line.ingredientId);
          const unit =
            line.unit && isCostingUnit(String(line.unit))
              ? line.unit
              : defaultUsageUnit(ing?.unit || "pcs");
          return { ...line, unit };
        }),
      }))
    : [];
  return {
    settings: {
      profitPercent: Math.max(0, Number(settingsRaw.profitPercent) || 40),
      monthlyPortions: Math.max(1, Number(settingsRaw.monthlyPortions) || 1000),
    },
    ingredients,
    bills: Array.isArray(src.bills) ? (src.bills as CostingBill[]) : [],
    employees: Array.isArray(src.employees) ? (src.employees as CostingEmployee[]) : [],
    recipes,
  };
}
