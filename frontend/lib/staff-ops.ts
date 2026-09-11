export const DEFAULT_STAFF_SECTIONS = [
  { id: "waiter", name: "سالن", access: "tasks" as const },
  { id: "kitchen", name: "آشپزخانه", access: "tasks" as const },
  { id: "bar", name: "بار", access: "tasks" as const },
  { id: "cashier", name: "صندوق", access: "pos" as const },
];

/** @deprecated use StaffSectionDef — kept for older imports */
export const STAFF_SECTIONS = DEFAULT_STAFF_SECTIONS.map((s) => ({
  value: s.id,
  label: s.name,
}));

export type StaffSectionAccess = "tasks" | "pos";

export type StaffSectionDef = {
  id: string;
  name: string;
  access: StaffSectionAccess;
  active: boolean;
};

/** Section id string (custom or builtin). */
export type StaffSection = string;

export type StaffEmployee = {
  id: string;
  name: string;
  section: StaffSection;
  active: boolean;
  /** Manager-only: recoverable login password */
  password?: string;
};

export type ChecklistTemplateItem = { id: string; label: string };

export type ChecklistTemplate = {
  id: string;
  section: StaffSection;
  title: string;
  items: ChecklistTemplateItem[];
  active: boolean;
};

export type ChecklistRunItem = {
  id: string;
  label: string;
  done: boolean;
  doneAt?: number;
};

export type ChecklistRunStatus = "open" | "submitted" | "approved" | "rejected";

export type ChecklistRun = {
  id: string;
  date: string;
  employeeId: string;
  templateId: string;
  section: StaffSection;
  items: ChecklistRunItem[];
  status: ChecklistRunStatus;
  submittedAt?: number;
  reviewedAt?: number;
  reviewNote?: string;
};

export type AttendanceMark = {
  employeeId: string;
  status: "present" | "absent";
  at: number;
  by: "manager" | "self";
};

export type AttendanceDay = {
  date: string;
  marks: AttendanceMark[];
};

export type StaffOpsData = {
  sections: StaffSectionDef[];
  employees: StaffEmployee[];
  templates: ChecklistTemplate[];
  runs: ChecklistRun[];
  attendance: AttendanceDay[];
};

export const EMPTY_STAFF_OPS: StaffOpsData = {
  sections: DEFAULT_STAFF_SECTIONS.map((s) => ({ ...s, active: true })),
  employees: [],
  templates: [],
  runs: [],
  attendance: [],
};

export function isStaffSectionAccess(value: unknown): value is StaffSectionAccess {
  return value === "tasks" || value === "pos";
}

export function sectionLabel(
  sectionId: string,
  sections?: StaffSectionDef[]
): string {
  const list = sections?.length ? sections : EMPTY_STAFF_OPS.sections;
  return list.find((s) => s.id === sectionId)?.name || sectionId;
}

export function sectionAccessOf(
  sectionId: string,
  sections?: StaffSectionDef[]
): StaffSectionAccess {
  const list = sections?.length ? sections : EMPTY_STAFF_OPS.sections;
  const found = list.find((s) => s.id === sectionId);
  if (found) return found.access;
  return sectionId === "cashier" ? "pos" : "tasks";
}

export function runStatusLabel(status: ChecklistRunStatus): string {
  switch (status) {
    case "open":
      return "باز";
    case "submitted":
      return "ارسال‌شده";
    case "approved":
      return "تأیید شده";
    case "rejected":
      return "رد شده";
    default:
      return status;
  }
}

function sanitizeSectionId(raw: unknown): string {
  return String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40);
}

export function normalizeStaffOpsPayload(raw: unknown): StaffOpsData {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sections: StaffSectionDef[] = [];
  for (const row of Array.isArray(src.sections) ? src.sections : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = sanitizeSectionId(r.id);
    const name = String(r.name || "").trim();
    if (!id || !name) continue;
    sections.push({
      id,
      name,
      access: r.access === "pos" ? "pos" : "tasks",
      active: r.active !== false,
    });
  }
  const sectionList =
    sections.length > 0
      ? sections
      : DEFAULT_STAFF_SECTIONS.map((s) => ({ ...s, active: true }));
  const known = new Set(sectionList.map((s) => s.id));
  const fallbackSection = sectionList[0]?.id || "waiter";

  const employees: StaffEmployee[] = [];
  for (const row of Array.isArray(src.employees) ? src.employees : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || "").trim();
    const name = String(r.name || "").trim();
    if (!id || !name) continue;
    const sid = sanitizeSectionId(r.section) || fallbackSection;
    employees.push({
      id,
      name,
      section: known.has(sid) ? sid : fallbackSection,
      active: r.active !== false,
      password: r.password ? String(r.password) : "",
    });
  }
  const templates: ChecklistTemplate[] = [];
  for (const row of Array.isArray(src.templates) ? src.templates : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || "").trim();
    const title = String(r.title || "").trim();
    if (!id || !title) continue;
    const sid = sanitizeSectionId(r.section) || fallbackSection;
    const items: ChecklistTemplateItem[] = [];
    for (const it of Array.isArray(r.items) ? r.items : []) {
      if (!it || typeof it !== "object") continue;
      const item = it as Record<string, unknown>;
      const iid = String(item.id || "").trim();
      const label = String(item.label || "").trim();
      if (!iid || !label) continue;
      items.push({ id: iid, label });
    }
    templates.push({
      id,
      section: known.has(sid) ? sid : fallbackSection,
      title,
      items,
      active: r.active !== false,
    });
  }
  const runs: ChecklistRun[] = [];
  for (const row of Array.isArray(src.runs) ? src.runs : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || "").trim();
    if (!id) continue;
    const statusRaw = String(r.status || "open");
    const status: ChecklistRunStatus =
      statusRaw === "submitted" ||
      statusRaw === "approved" ||
      statusRaw === "rejected"
        ? statusRaw
        : "open";
    const sid = sanitizeSectionId(r.section) || fallbackSection;
    const items: ChecklistRunItem[] = [];
    for (const it of Array.isArray(r.items) ? r.items : []) {
      if (!it || typeof it !== "object") continue;
      const item = it as Record<string, unknown>;
      const iid = String(item.id || "").trim();
      const label = String(item.label || "").trim();
      if (!iid || !label) continue;
      items.push({
        id: iid,
        label,
        done: Boolean(item.done),
        doneAt: typeof item.doneAt === "number" ? item.doneAt : undefined,
      });
    }
    runs.push({
      id,
      date: String(r.date || ""),
      employeeId: String(r.employeeId || ""),
      templateId: String(r.templateId || ""),
      section: known.has(sid) ? sid : fallbackSection,
      items,
      status,
      submittedAt: typeof r.submittedAt === "number" ? r.submittedAt : undefined,
      reviewedAt: typeof r.reviewedAt === "number" ? r.reviewedAt : undefined,
      reviewNote: r.reviewNote ? String(r.reviewNote) : undefined,
    });
  }
  const attendance: AttendanceDay[] = [];
  for (const row of Array.isArray(src.attendance) ? src.attendance : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const date = String(r.date || "").trim();
    if (!date) continue;
    const marks: AttendanceMark[] = [];
    for (const m of Array.isArray(r.marks) ? r.marks : []) {
      if (!m || typeof m !== "object") continue;
      const mark = m as Record<string, unknown>;
      const employeeId = String(mark.employeeId || "").trim();
      if (!employeeId) continue;
      const status = mark.status === "absent" ? "absent" : "present";
      marks.push({
        employeeId,
        status,
        at: typeof mark.at === "number" ? mark.at : 0,
        by: mark.by === "self" ? "self" : "manager",
      });
    }
    attendance.push({ date, marks });
  }
  return { sections: sectionList, employees, templates, runs, attendance };
}

export function isCashierEmployee(role: string, sectionOrAccess: string): boolean {
  return (
    role === "employee" &&
    (sectionOrAccess === "pos" || sectionOrAccess === "cashier")
  );
}

export function isTaskOnlyEmployee(role: string, sectionOrAccess: string): boolean {
  return role === "employee" && !isCashierEmployee(role, sectionOrAccess);
}

/** @deprecated */
export function isStaffSection(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
