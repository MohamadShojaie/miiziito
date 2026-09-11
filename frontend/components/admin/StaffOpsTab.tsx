"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiJson, cashierHeaders } from "@/lib/api";
import {
  EMPTY_STAFF_OPS,
  normalizeStaffOpsPayload,
  runStatusLabel,
  sectionLabel,
  type StaffEmployee,
  type StaffOpsData,
  type StaffSection,
  type StaffSectionAccess,
  type StaffSectionDef,
} from "@/lib/staff-ops";
import { toPersianDigits } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { CpSelect } from "@/components/ui/CpSelect";

type Panel = "attendance" | "templates" | "review" | "history" | "employees" | "sections";

const PANELS: Array<{ id: Panel; label: string }> = [
  { id: "sections", label: "بخش‌ها" },
  { id: "employees", label: "کارمندان" },
  { id: "attendance", label: "حضور" },
  { id: "templates", label: "چک‌لیست‌ها" },
  { id: "review", label: "تأیید" },
  { id: "history", label: "سوابق" },
];

const ACCESS_OPTIONS = [
  ["tasks", "وظایف (چک‌لیست)"],
  ["pos", "صندوق / POS"],
] as const;

const ERROR_FA: Record<string, string> = {
  password_taken: "این رمز قبلاً برای کارمند دیگری استفاده شده",
  password_matches_manager: "رمز نباید با رمز مدیر یکی باشد",
  password_required: "رمز عبور الزامی است",
  name_required: "نام الزامی است",
  title_required: "عنوان الزامی است",
  items_required: "حداقل یک مورد لازم است",
  upgrade_required: "این قابلیت در پلن فعلی فعال نیست",
  forbidden_role: "اجازه این کار را ندارید",
  section_in_use: "ابتدا کارمند یا چک‌لیست این بخش را جابه‌جا کنید",
  section_required: "حداقل یک بخش لازم است",
  section_exists: "این شناسه بخش قبلاً وجود دارد",
  too_many: "تعداد بخش‌ها بیش از حد است",
};

type EmpDraft = {
  id?: string;
  name: string;
  section: StaffSection;
  password: string;
  active: boolean;
};

type TplDraft = {
  id?: string;
  title: string;
  section: StaffSection;
  items: string[];
  active: boolean;
};

type SecDraft = {
  id?: string;
  name: string;
  access: StaffSectionAccess;
  active: boolean;
};

function emptyEmp(defaultSection = "waiter"): EmpDraft {
  return { name: "", section: defaultSection, password: "", active: true };
}

function emptyTpl(defaultSection = "waiter"): TplDraft {
  return { title: "", section: defaultSection, items: [""], active: true };
}

function emptySec(): SecDraft {
  return { name: "", access: "tasks", active: true };
}

function initialOf(name: string) {
  const t = name.trim();
  return t ? t.charAt(0) : "؟";
}

export function StaffOpsTab({ active }: { active: boolean }) {
  const { showToast } = useToast();
  const [panel, setPanel] = useState<Panel>("employees");
  const [data, setData] = useState<StaffOpsData>(EMPTY_STAFF_OPS);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sectionFilter, setSectionFilter] = useState<StaffSection | "all">("all");
  const [mounted, setMounted] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [empDraft, setEmpDraft] = useState<EmpDraft>(emptyEmp());
  const [empShowPass, setEmpShowPass] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplDraft, setTplDraft] = useState<TplDraft>(emptyTpl());
  const [secOpen, setSecOpen] = useState(false);
  const [secDraft, setSecDraft] = useState<SecDraft>(emptySec());
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [historyFilter, setHistoryFilter] = useState<"all" | "approved" | "rejected">(
    "all"
  );

  useEffect(() => setMounted(true), []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiJson<{ staffOps?: unknown; today?: string }>("/api/staff-ops", {
        headers: cashierHeaders(),
      });
      setData(normalizeStaffOpsPayload(res.staffOps));
      setToday(String(res.today || ""));
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(ERROR_FA[code] || "خطا در بارگذاری");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (active) load();
  }, [active]);

  async function post(action: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await apiJson<{ staffOps?: unknown }>("/api/staff-ops", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({ action, ...body }),
      });
      if (res.staffOps) setData(normalizeStaffOpsPayload(res.staffOps));
      return true;
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      showToast(ERROR_FA[code] || "عملیات ناموفق بود", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const employees = useMemo(
    () =>
      data.employees.filter(
        (e) => sectionFilter === "all" || e.section === sectionFilter
      ),
    [data.employees, sectionFilter]
  );

  const templates = useMemo(
    () =>
      data.templates.filter(
        (t) => sectionFilter === "all" || t.section === sectionFilter
      ),
    [data.templates, sectionFilter]
  );

  const submittedRuns = useMemo(
    () =>
      data.runs.filter((r) => {
        if (r.status !== "submitted") return false;
        if (sectionFilter !== "all" && r.section !== sectionFilter) return false;
        return true;
      }),
    [data.runs, sectionFilter]
  );

  const historyRuns = useMemo(() => {
    const rows = data.runs.filter((r) => {
      if (r.status !== "approved" && r.status !== "rejected") return false;
      if (sectionFilter !== "all" && r.section !== sectionFilter) return false;
      if (historyFilter !== "all" && r.status !== historyFilter) return false;
      return true;
    });
    return rows.sort((a, b) => {
      const ta = a.reviewedAt || a.submittedAt || 0;
      const tb = b.reviewedAt || b.submittedAt || 0;
      if (tb !== ta) return tb - ta;
      return String(b.date).localeCompare(String(a.date));
    });
  }, [data.runs, sectionFilter, historyFilter]);

  const attendanceMarks = useMemo(() => {
    const day = data.attendance.find((a) => a.date === today);
    const map = new Map<string, "present" | "absent">();
    for (const m of day?.marks || []) map.set(m.employeeId, m.status);
    return map;
  }, [data.attendance, today]);

  const presentCount = useMemo(() => {
    let n = 0;
    for (const e of data.employees.filter((x) => x.active)) {
      if (attendanceMarks.get(e.id) === "present") n += 1;
    }
    return n;
  }, [data.employees, attendanceMarks]);

  const sections = data.sections;
  const sectionOptions = useMemo(
    () =>
      sections
        .filter((s) => s.active || true)
        .map((s) => [s.id, s.name] as [string, string]),
    [sections]
  );
  const defaultSectionId = sections[0]?.id || "waiter";

  function labelOf(sectionId: string) {
    return sectionLabel(sectionId, sections);
  }

  function accessLabel(access: StaffSectionAccess) {
    return access === "pos" ? "صندوق / POS" : "وظایف";
  }

  function empName(id: string) {
    return data.employees.find((e) => e.id === id)?.name || id;
  }

  async function saveSection() {
    if (!secDraft.name.trim()) {
      showToast("نام الزامی است", "error");
      return;
    }
    const ok = await post("upsertSection", {
      id: secDraft.id,
      name: secDraft.name.trim(),
      access: secDraft.access,
      active: secDraft.active,
    });
    if (ok) {
      showToast(secDraft.id ? "بخش به‌روز شد" : "بخش اضافه شد", "success");
      setSecOpen(false);
      setSecDraft(emptySec());
    }
  }

  async function saveEmployee() {
    if (!empDraft.name.trim()) {
      showToast("نام الزامی است", "error");
      return;
    }
    if (!empDraft.id && !empDraft.password.trim()) {
      showToast("رمز عبور الزامی است", "error");
      return;
    }
    const ok = await post("upsertEmployee", {
      id: empDraft.id,
      name: empDraft.name.trim(),
      section: empDraft.section,
      active: empDraft.active,
      password: empDraft.password.trim() || undefined,
    });
    if (ok) {
      showToast(empDraft.id ? "کارمند به‌روز شد" : "کارمند اضافه شد", "success");
      setEmpOpen(false);
      setEmpDraft(emptyEmp(defaultSectionId));
      setEmpShowPass(false);
    }
  }

  async function saveTemplate() {
    const items = tplDraft.items.map((l) => l.trim()).filter(Boolean);
    if (!tplDraft.title.trim() || !items.length) {
      showToast("عنوان و حداقل یک مورد لازم است", "error");
      return;
    }
    const ok = await post("upsertTemplate", {
      id: tplDraft.id,
      title: tplDraft.title.trim(),
      section: tplDraft.section,
      active: tplDraft.active,
      items: items.map((label, i) => {
        const existing = tplDraft.id
          ? data.templates.find((t) => t.id === tplDraft.id)?.items[i]
          : undefined;
        return { id: existing?.id || undefined, label };
      }),
    });
    if (ok) {
      showToast("چک‌لیست ذخیره شد", "success");
      setTplOpen(false);
      setTplDraft(emptyTpl(defaultSectionId));
      await post("ensureRuns", { date: today });
    }
  }

  const panelCount = (id: Panel) => {
    if (id === "sections") return sections.length;
    if (id === "attendance") return employees.filter((e) => e.active).length;
    if (id === "templates") return templates.length;
    if (id === "review") return submittedRuns.length;
    if (id === "history") return historyRuns.length;
    return employees.length;
  };

  if (!active) return null;
  if (loading) return <LoadingShimmer />;

  return (
    <div className="staff-ops">
      <header className="staff-ops-hero">
        <div>
          <h2 className="staff-ops-title">پرسنل</h2>
          <p className="staff-ops-sub">
            حضور، چک‌لیست و تأیید
            {today ? ` · ${toPersianDigits(today)}` : ""}
          </p>
        </div>
        <div className="staff-ops-kpis">
          <div className="staff-ops-kpi">
            <span>کارمند</span>
            <strong>{toPersianDigits(String(data.employees.length))}</strong>
          </div>
          <div className="staff-ops-kpi">
            <span>حاضر امروز</span>
            <strong>{toPersianDigits(String(presentCount))}</strong>
          </div>
          <div className="staff-ops-kpi">
            <span>در انتظار تأیید</span>
            <strong>{toPersianDigits(String(submittedRuns.length))}</strong>
          </div>
        </div>
      </header>

      {error ? <p className="staff-ops-error">{error}</p> : null}

      <div className="staff-ops-filters" role="group" aria-label="فیلتر بخش">
        <button
          type="button"
          className={`staff-ops-chip${sectionFilter === "all" ? " is-on" : ""}`}
          onClick={() => setSectionFilter("all")}
        >
          همه
        </button>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`staff-ops-chip${sectionFilter === s.id ? " is-on" : ""}`}
            onClick={() => setSectionFilter(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="staff-ops-tabs" role="tablist">
        {PANELS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={panel === p.id}
            className={`staff-ops-tab${panel === p.id ? " is-active" : ""}`}
            onClick={() => setPanel(p.id)}
          >
            {p.label}
            <span>{toPersianDigits(String(panelCount(p.id)))}</span>
          </button>
        ))}
      </div>

      <div className="staff-ops-body">
        {panel === "sections" ? (
          <>
            <div className="staff-ops-toolbar">
              <h3>بخش‌ها</h3>
              <button
                type="button"
                className="cp-btn cp-btn--primary cp-btn--sm"
                onClick={() => {
                  setSecDraft(emptySec());
                  setSecOpen(true);
                }}
              >
                بخش جدید
              </button>
            </div>
            <p className="staff-ops-sub" style={{ marginBottom: "0.75rem" }}>
              هر بخش را خودتان بسازید. دسترسی «صندوق / POS» برای ورود به پنل سفارش است؛ بقیه فقط
              وظایف می‌بینند.
            </p>
            {sections.length === 0 ? (
              <div className="staff-ops-empty">
                <strong>بخشی تعریف نشده</strong>
                <p>اولین بخش را اضافه کنید.</p>
              </div>
            ) : (
              <ul className="staff-ops-list">
                {sections.map((s: StaffSectionDef) => (
                  <li key={s.id} className="staff-ops-row">
                    <div className="staff-ops-person">
                      <div>
                        <strong>
                          {s.name}
                          {!s.active ? (
                            <span className="staff-ops-inactive">غیرفعال</span>
                          ) : null}
                        </strong>
                        <em>{accessLabel(s.access)}</em>
                      </div>
                    </div>
                    <div className="staff-ops-row-actions">
                      <button
                        type="button"
                        className="cp-btn cp-btn--sm"
                        onClick={() => {
                          setSecDraft({
                            id: s.id,
                            name: s.name,
                            access: s.access,
                            active: s.active,
                          });
                          setSecOpen(true);
                        }}
                      >
                        ویرایش
                      </button>
                      <button
                        type="button"
                        className="cp-btn cp-btn--sm"
                        disabled={busy || sections.length <= 1}
                        onClick={() => post("removeSection", { id: s.id })}
                      >
                        حذف
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {panel === "attendance" ? (
          <>
            <div className="staff-ops-toolbar">
              <h3>حضور امروز</h3>
            </div>
            {employees.filter((e) => e.active).length === 0 ? (
              <div className="staff-ops-empty">
                <strong>کارمند فعالی نیست</strong>
                <p>از تب کارمندان، پرسنل را اضافه کنید.</p>
              </div>
            ) : (
              <ul className="staff-ops-list">
                {employees
                  .filter((e) => e.active)
                  .map((e) => {
                    const st = attendanceMarks.get(e.id);
                    return (
                      <li key={e.id} className="staff-ops-row">
                        <div className="staff-ops-person">
                          <span className="staff-ops-avatar" aria-hidden="true">
                            {initialOf(e.name)}
                          </span>
                          <div>
                            <strong>{e.name}</strong>
                            <em>{labelOf(e.section)}</em>
                          </div>
                        </div>
                        <div className="staff-ops-seg" role="group">
                          <button
                            type="button"
                            className={`staff-ops-seg-btn${st === "present" ? " is-on" : ""}`}
                            disabled={busy}
                            onClick={() =>
                              post("setAttendance", {
                                employeeId: e.id,
                                status: "present",
                                date: today,
                              })
                            }
                          >
                            حاضر
                          </button>
                          <button
                            type="button"
                            className={`staff-ops-seg-btn${st === "absent" ? " is-on is-absent" : ""}`}
                            disabled={busy}
                            onClick={() =>
                              post("setAttendance", {
                                employeeId: e.id,
                                status: "absent",
                                date: today,
                              })
                            }
                          >
                            غایب
                          </button>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </>
        ) : null}

        {panel === "templates" ? (
          <>
            <div className="staff-ops-toolbar">
              <h3>چک‌لیست‌ها</h3>
              <button
                type="button"
                className="cp-btn cp-btn--primary cp-btn--sm"
                onClick={() => {
                  setTplDraft(emptyTpl(defaultSectionId));
                  setTplOpen(true);
                }}
              >
                چک‌لیست جدید
              </button>
            </div>
            {templates.length === 0 ? (
              <div className="staff-ops-empty">
                <strong>چک‌لیستی نیست</strong>
                <p>برای هر بخش یک چک‌لیست روزانه بسازید.</p>
              </div>
            ) : (
              <ul className="staff-ops-list">
                {templates.map((t) => (
                  <li key={t.id} className="staff-ops-row">
                    <div className="staff-ops-person">
                      <div>
                        <strong>{t.title}</strong>
                        <em>
                          {labelOf(t.section)} ·{" "}
                          {toPersianDigits(String(t.items.length))} مورد
                          {!t.active ? " · غیرفعال" : ""}
                        </em>
                      </div>
                    </div>
                    <div className="staff-ops-row-actions">
                      <button
                        type="button"
                        className="cp-btn cp-btn--sm"
                        onClick={() => {
                          setTplDraft({
                            id: t.id,
                            title: t.title,
                            section: t.section,
                            items: t.items.map((i) => i.label),
                            active: t.active,
                          });
                          setTplOpen(true);
                        }}
                      >
                        ویرایش
                      </button>
                      <button
                        type="button"
                        className="cp-btn cp-btn--sm"
                        disabled={busy}
                        onClick={() => post("removeTemplate", { id: t.id })}
                      >
                        حذف
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {panel === "review" ? (
          <>
            <div className="staff-ops-toolbar">
              <h3>در انتظار تأیید</h3>
            </div>
            {submittedRuns.length === 0 ? (
              <div className="staff-ops-empty">
                <strong>موردی برای بررسی نیست</strong>
                <p>وقتی کارمند چک‌لیست را بفرستد، اینجا می‌آید.</p>
              </div>
            ) : (
              <div className="staff-ops-review-grid">
                {submittedRuns.map((run) => (
                  <article key={run.id} className="staff-ops-review-card">
                    <header>
                      <div>
                        <strong>{empName(run.employeeId)}</strong>
                        <em>
                          {toPersianDigits(run.date)} · {labelOf(run.section)} ·{" "}
                          {data.templates.find((t) => t.id === run.templateId)?.title ||
                            "چک‌لیست"}
                        </em>
                      </div>
                      <span className={`staff-ops-badge staff-ops-badge--${run.status}`}>
                        {runStatusLabel(run.status)}
                      </span>
                    </header>
                    <ul className="staff-ops-review-items">
                      {run.items.map((it) => (
                        <li key={it.id} className={it.done ? "is-done" : ""}>
                          <span aria-hidden="true">{it.done ? "✓" : "○"}</span>
                          {it.label}
                        </li>
                      ))}
                    </ul>
                    <label className="staff-ops-field">
                      <span>یادداشت (اختیاری)</span>
                      <input
                        value={reviewNote[run.id] || ""}
                        onChange={(e) =>
                          setReviewNote((m) => ({ ...m, [run.id]: e.target.value }))
                        }
                        placeholder="توضیح تأیید یا رد"
                      />
                    </label>
                    <div className="staff-ops-row-actions">
                      <button
                        type="button"
                        className="cp-btn cp-btn--primary cp-btn--sm"
                        disabled={busy}
                        onClick={() =>
                          post("reviewRun", {
                            runId: run.id,
                            decision: "approved",
                            reviewNote: reviewNote[run.id] || "",
                          })
                        }
                      >
                        تأیید
                      </button>
                      <button
                        type="button"
                        className="cp-btn cp-btn--sm"
                        disabled={busy}
                        onClick={() =>
                          post("reviewRun", {
                            runId: run.id,
                            decision: "rejected",
                            reviewNote: reviewNote[run.id] || "",
                          })
                        }
                      >
                        رد
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : null}

        {panel === "history" ? (
          <>
            <div className="staff-ops-toolbar">
              <h3>سوابق چک‌لیست</h3>
              <div className="staff-ops-filters" role="group" aria-label="فیلتر وضعیت">
                {(
                  [
                    ["all", "همه"],
                    ["approved", "تأیید شده"],
                    ["rejected", "رد شده"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`staff-ops-chip${historyFilter === id ? " is-on" : ""}`}
                    onClick={() => setHistoryFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {historyRuns.length === 0 ? (
              <div className="staff-ops-empty">
                <strong>سابقه‌ای نیست</strong>
                <p>چک‌لیست‌های تأیید یا رد شده اینجا نمایش داده می‌شوند.</p>
              </div>
            ) : (
              <div className="staff-ops-review-grid">
                {historyRuns.map((run) => {
                  const done = run.items.filter((i) => i.done).length;
                  return (
                    <article key={run.id} className="staff-ops-review-card">
                      <header>
                        <div>
                          <strong>{empName(run.employeeId)}</strong>
                          <em>
                            {toPersianDigits(run.date)} · {labelOf(run.section)} ·{" "}
                            {data.templates.find((t) => t.id === run.templateId)?.title ||
                              "چک‌لیست"}
                          </em>
                        </div>
                        <span className={`staff-ops-badge staff-ops-badge--${run.status}`}>
                          {runStatusLabel(run.status)}
                        </span>
                      </header>
                      <p className="staff-ops-history-meta">
                        {toPersianDigits(String(done))} از{" "}
                        {toPersianDigits(String(run.items.length))} مورد انجام شده
                      </p>
                      <ul className="staff-ops-review-items">
                        {run.items.map((it) => (
                          <li key={it.id} className={it.done ? "is-done" : ""}>
                            <span aria-hidden="true">{it.done ? "✓" : "○"}</span>
                            {it.label}
                          </li>
                        ))}
                      </ul>
                      {run.reviewNote ? (
                        <p className="staff-ops-history-note">یادداشت: {run.reviewNote}</p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : null}

        {panel === "employees" ? (
          <>
            <div className="staff-ops-toolbar">
              <h3>کارمندان</h3>
              <button
                type="button"
                className="cp-btn cp-btn--primary cp-btn--sm"
              onClick={() => {
                setEmpDraft(emptyEmp(defaultSectionId));
                setEmpShowPass(false);
                setEmpOpen(true);
              }}
              >
                کارمند جدید
              </button>
            </div>
            {employees.length === 0 ? (
              <div className="staff-ops-empty">
                <strong>هنوز کارمندی ندارید</strong>
                <p>برای هر نفر رمز و نقش تعریف کنید تا بتواند وارد شود.</p>
              </div>
            ) : (
              <ul className="staff-ops-list">
                {employees.map((e: StaffEmployee) => (
                  <li key={e.id} className="staff-ops-row">
                    <div className="staff-ops-person">
                      <span className="staff-ops-avatar" aria-hidden="true">
                        {initialOf(e.name)}
                      </span>
                      <div>
                        <strong>
                          {e.name}
                          {!e.active ? (
                            <span className="staff-ops-inactive">غیرفعال</span>
                          ) : null}
                        </strong>
                        <em>{labelOf(e.section)}</em>
                      </div>
                    </div>
                    <div className="staff-ops-row-actions">
                      <button
                        type="button"
                        className="cp-btn cp-btn--sm"
                        onClick={() => {
                    setEmpDraft({
                      id: e.id,
                      name: e.name,
                      section: e.section,
                      password: e.password || "",
                      active: e.active,
                    });
                    setEmpShowPass(true);
                    setEmpOpen(true);
                  }}
                >
                  ویرایش
                </button>
                      <button
                        type="button"
                        className="cp-btn cp-btn--sm"
                        disabled={busy}
                        onClick={() => post("removeEmployee", { id: e.id })}
                      >
                        حذف
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>

      {mounted && empOpen
        ? createPortal(
            <div className="table-glass-overlay is-open" onClick={() => setEmpOpen(false)}>
              <div
                className="modal-card cp-modal staff-ops-modal"
                role="dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="modal-title">
                  {empDraft.id ? "ویرایش کارمند" : "کارمند جدید"}
                </h3>
                <label className="staff-ops-field">
                  <span>نام</span>
                  <input
                    value={empDraft.name}
                    onChange={(e) => setEmpDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                </label>
                <label className="staff-ops-field">
                  <span>نقش / بخش</span>
                  <CpSelect
                    value={empDraft.section}
                    onChange={(v) =>
                      setEmpDraft((d) => ({ ...d, section: v as StaffSection }))
                    }
                    options={sectionOptions}
                  />
                </label>
                <label className="staff-ops-field">
                  <span>رمز ورود</span>
                  <div className="staff-ops-password-row">
                    <input
                      type={empShowPass ? "text" : "password"}
                      value={empDraft.password}
                      onChange={(e) =>
                        setEmpDraft((d) => ({ ...d, password: e.target.value }))
                      }
                      autoComplete="new-password"
                      placeholder={empDraft.id ? "رمز فعلی یا رمز جدید" : "رمز ورود کارمند"}
                      required={!empDraft.id}
                    />
                    <button
                      type="button"
                      className="cp-btn cp-btn--sm"
                      onClick={() => setEmpShowPass((v) => !v)}
                    >
                      {empShowPass ? "مخفی" : "نمایش"}
                    </button>
                  </div>
                  {empDraft.id ? (
                    <em className="staff-ops-field-hint">
                      رمز فعلی نمایش داده می‌شود؛ برای تغییر، همینجا ویرایش و ذخیره کنید.
                    </em>
                  ) : null}
                </label>
                <label className="staff-ops-check">
                  <input
                    type="checkbox"
                    checked={empDraft.active}
                    onChange={(e) =>
                      setEmpDraft((d) => ({ ...d, active: e.target.checked }))
                    }
                  />
                  فعال
                </label>
                <div className="staff-ops-row-actions staff-ops-modal-actions">
                  <button type="button" className="cp-btn" onClick={() => setEmpOpen(false)}>
                    انصراف
                  </button>
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

      {mounted && tplOpen
        ? createPortal(
            <div className="table-glass-overlay is-open" onClick={() => setTplOpen(false)}>
              <div
                className="modal-card cp-modal staff-ops-modal"
                role="dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="modal-title">
                  {tplDraft.id ? "ویرایش چک‌لیست" : "چک‌لیست جدید"}
                </h3>
                <label className="staff-ops-field">
                  <span>عنوان</span>
                  <input
                    value={tplDraft.title}
                    onChange={(e) => setTplDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </label>
                <label className="staff-ops-field">
                  <span>بخش</span>
                  <CpSelect
                    value={tplDraft.section}
                    onChange={(v) =>
                      setTplDraft((d) => ({ ...d, section: v as StaffSection }))
                    }
                    options={sectionOptions}
                  />
                </label>
                <div className="staff-ops-field">
                  <span>موارد</span>
                  <div className="staff-ops-item-inputs">
                    {tplDraft.items.map((line, i) => (
                      <input
                        key={i}
                        value={line}
                        placeholder={`مورد ${toPersianDigits(String(i + 1))}`}
                        onChange={(e) => {
                          const items = [...tplDraft.items];
                          items[i] = e.target.value;
                          setTplDraft((d) => ({ ...d, items }));
                        }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="cp-btn cp-btn--sm"
                    onClick={() =>
                      setTplDraft((d) => ({ ...d, items: [...d.items, ""] }))
                    }
                  >
                    افزودن مورد
                  </button>
                </div>
                <label className="staff-ops-check">
                  <input
                    type="checkbox"
                    checked={tplDraft.active}
                    onChange={(e) =>
                      setTplDraft((d) => ({ ...d, active: e.target.checked }))
                    }
                  />
                  فعال
                </label>
                <div className="staff-ops-row-actions staff-ops-modal-actions">
                  <button type="button" className="cp-btn" onClick={() => setTplOpen(false)}>
                    انصراف
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary"
                    disabled={busy}
                    onClick={saveTemplate}
                  >
                    ذخیره
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && secOpen
        ? createPortal(
            <div className="table-glass-overlay is-open" onClick={() => setSecOpen(false)}>
              <div
                className="modal-card cp-modal staff-ops-modal"
                role="dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="modal-title">
                  {secDraft.id ? "ویرایش بخش" : "بخش جدید"}
                </h3>
                <label className="staff-ops-field">
                  <span>نام بخش</span>
                  <input
                    value={secDraft.name}
                    onChange={(e) => setSecDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="مثلاً سالن، انبار، پیک"
                  />
                </label>
                <label className="staff-ops-field">
                  <span>نوع دسترسی</span>
                  <CpSelect
                    value={secDraft.access}
                    onChange={(v) =>
                      setSecDraft((d) => ({
                        ...d,
                        access: v === "pos" ? "pos" : "tasks",
                      }))
                    }
                    options={[...ACCESS_OPTIONS]}
                  />
                </label>
                <label className="staff-ops-check">
                  <input
                    type="checkbox"
                    checked={secDraft.active}
                    onChange={(e) =>
                      setSecDraft((d) => ({ ...d, active: e.target.checked }))
                    }
                  />
                  فعال
                </label>
                <div className="staff-ops-row-actions staff-ops-modal-actions">
                  <button type="button" className="cp-btn" onClick={() => setSecOpen(false)}>
                    انصراف
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary"
                    disabled={busy}
                    onClick={saveSection}
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
