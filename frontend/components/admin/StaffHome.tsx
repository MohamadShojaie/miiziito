"use client";

import { useEffect, useMemo, useState } from "react";
import {
  apiJson,
  cashierHeaders,
  getEmployeeId,
  getEmployeeName,
  getEmployeeSection,
} from "@/lib/api";
import {
  EMPTY_STAFF_OPS,
  normalizeStaffOpsPayload,
  runStatusLabel,
  sectionLabel,
  type ChecklistRun,
  type StaffOpsData,
  type StaffSection,
  isStaffSection,
} from "@/lib/staff-ops";
import { toPersianDigits } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { IconLogout } from "@/components/admin/CashierIcons";

const ERROR_FA: Record<string, string> = {
  forbidden_role: "اجازه این کار را ندارید",
  auth_required: "لطفاً دوباره وارد شوید",
  run_locked: "این چک‌لیست قفل است",
  not_found: "مورد پیدا نشد",
  item_not_found: "آیتم پیدا نشد",
};

function errFa(raw: string) {
  return ERROR_FA[raw] || "عملیات ناموفق بود";
}

export function StaffHome({
  active = true,
  tenantSlug = "",
  onLogout,
}: {
  active?: boolean;
  tenantSlug?: string;
  onLogout?: () => void;
}) {
  const { showToast } = useToast();
  const [data, setData] = useState<StaffOpsData>(EMPTY_STAFF_OPS);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meName, setMeName] = useState(getEmployeeName(tenantSlug));
  const name = meName || getEmployeeName(tenantSlug);
  const sectionRaw = getEmployeeSection(tenantSlug);
  const section: StaffSection = isStaffSection(sectionRaw) ? sectionRaw : "waiter";
  const myId = getEmployeeId(tenantSlug) || data.employees[0]?.id || "";
  const sectionName = sectionLabel(section, data.sections);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiJson<{
        staffOps?: unknown;
        today?: string;
        me?: { name?: string };
      }>("/api/staff-ops", { headers: cashierHeaders() });
      setData(normalizeStaffOpsPayload(res.staffOps));
      setToday(String(res.today || ""));
      if (res.me?.name) setMeName(res.me.name);
    } catch (e) {
      setError(errFa(e instanceof Error ? e.message : ""));
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
      showToast(errFa(e instanceof Error ? e.message : ""), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const todayRuns = useMemo(
    () =>
      data.runs.filter(
        (r) =>
          (!today || r.date === today) &&
          (!myId || r.employeeId === myId) &&
          (r.status === "open" || r.status === "submitted" || r.status === "rejected")
      ),
    [data.runs, today, myId]
  );

  const historyRuns = useMemo(() => {
    const rows = data.runs.filter(
      (r) =>
        (!myId || r.employeeId === myId) &&
        (r.status === "approved" || r.status === "rejected") &&
        (!today || r.date !== today || r.status === "approved")
    );
    // Keep today's rejected in todayRuns only; history shows older + today's approved
    return rows
      .filter((r) => !(r.date === today && r.status === "rejected"))
      .sort((a, b) => {
        const ta = a.reviewedAt || a.submittedAt || 0;
        const tb = b.reviewedAt || b.submittedAt || 0;
        if (tb !== ta) return tb - ta;
        return String(b.date).localeCompare(String(a.date));
      });
  }, [data.runs, today, myId]);

  const myMark = useMemo(() => {
    const day = data.attendance.find((a) => a.date === today);
    return day?.marks?.find((m) => m.employeeId === myId)?.status;
  }, [data.attendance, today, myId]);

  const doneCount = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const run of todayRuns) {
      for (const it of run.items) {
        total += 1;
        if (it.done) done += 1;
      }
    }
    return { done, total };
  }, [todayRuns]);

  if (!active) return null;
  if (loading) {
    return (
      <div className="staff-home">
        <LoadingShimmer />
      </div>
    );
  }

  return (
    <div className="staff-home">
      <header className="staff-home-top">
        <div className="staff-home-identity">
          <p className="staff-home-kicker">{sectionName}</p>
          <h1 className="staff-home-title">{name || "کارمند"}</h1>
          <p className="staff-home-meta">
            وظایف امروز
            {today ? ` · ${toPersianDigits(today)}` : ""}
          </p>
        </div>
        {onLogout ? (
          <button
            type="button"
            className="cp-icon-btn staff-home-logout"
            aria-label="خروج"
            title="خروج"
            onClick={onLogout}
          >
            <IconLogout size={18} />
          </button>
        ) : null}
      </header>

      {error ? <p className="staff-home-error">{error}</p> : null}

      <section className="staff-home-attendance" aria-label="حضور امروز">
        <div className="staff-home-attendance-copy">
          <h2>حضور امروز</h2>
          <p>
            {myMark === "present"
              ? "حاضر ثبت شده‌اید"
              : myMark === "absent"
                ? "غایب ثبت شده‌اید"
                : "هنوز وضعیت حضور ثبت نشده"}
          </p>
        </div>
        <div className="staff-home-seg" role="group" aria-label="وضعیت حضور">
          <button
            type="button"
            className={`staff-home-seg-btn${myMark === "present" ? " is-on" : ""}`}
            disabled={busy}
            onClick={() => post("markSelfAttendance", { status: "present" })}
          >
            حاضر
          </button>
          <button
            type="button"
            className={`staff-home-seg-btn${myMark === "absent" ? " is-on" : ""}`}
            disabled={busy}
            onClick={() => post("markSelfAttendance", { status: "absent" })}
          >
            غایب
          </button>
        </div>
      </section>

      <div className="staff-home-progress">
        <span>پیشرفت چک‌لیست</span>
        <strong>
          {toPersianDigits(String(doneCount.done))} از{" "}
          {toPersianDigits(String(doneCount.total))}
        </strong>
      </div>

      <div className="staff-home-runs">
        <h2 className="staff-home-section-title">امروز</h2>
        {todayRuns.length === 0 ? (
          <div className="staff-home-empty">
            <strong>چک‌لیستی برای امروز نیست</strong>
            <p>وقتی مدیر برای بخش شما چک‌لیست بسازد، اینجا دیده می‌شود.</p>
          </div>
        ) : (
          todayRuns.map((run: ChecklistRun) => {
            const editable = run.status === "open" || run.status === "rejected";
            const title =
              data.templates.find((t) => t.id === run.templateId)?.title ||
              "چک‌لیست";
            const runDone = run.items.filter((i) => i.done).length;
            return (
              <article key={run.id} className="staff-home-run">
                <header className="staff-home-run-head">
                  <div>
                    <h3>{title}</h3>
                    <p>
                      {toPersianDigits(String(runDone))} /{" "}
                      {toPersianDigits(String(run.items.length))} انجام شد
                    </p>
                  </div>
                  <span
                    className={`staff-home-badge staff-home-badge--${run.status}`}
                  >
                    {runStatusLabel(run.status)}
                  </span>
                </header>

                {run.reviewNote ? (
                  <p className="staff-home-note">یادداشت مدیر: {run.reviewNote}</p>
                ) : null}

                <ul className="staff-home-items">
                  {run.items.map((it) => (
                    <li key={it.id}>
                      <label
                        className={`staff-home-item${it.done ? " is-done" : ""}${
                          !editable ? " is-locked" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={it.done}
                          disabled={busy || !editable}
                          onChange={(e) =>
                            post("toggleItem", {
                              runId: run.id,
                              itemId: it.id,
                              done: e.target.checked,
                            })
                          }
                        />
                        <span>{it.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>

                {editable ? (
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary staff-home-submit"
                    disabled={busy || run.items.length === 0}
                    onClick={async () => {
                      const ok = await post("submitRun", { runId: run.id });
                      if (ok) showToast("برای تأیید مدیر ارسال شد", "success");
                    }}
                  >
                    ارسال برای تأیید
                  </button>
                ) : null}
              </article>
            );
          })
        )}

        <h2 className="staff-home-section-title">سوابق</h2>
        {historyRuns.length === 0 ? (
          <div className="staff-home-empty staff-home-empty--compact">
            <strong>سابقه‌ای نیست</strong>
            <p>چک‌لیست‌های تأیید یا رد شده اینجا می‌آیند.</p>
          </div>
        ) : (
          historyRuns.map((run) => {
            const title =
              data.templates.find((t) => t.id === run.templateId)?.title ||
              "چک‌لیست";
            const runDone = run.items.filter((i) => i.done).length;
            return (
              <article key={run.id} className="staff-home-run staff-home-run--history">
                <header className="staff-home-run-head">
                  <div>
                    <h3>{title}</h3>
                    <p>
                      {toPersianDigits(run.date)} · {toPersianDigits(String(runDone))} /{" "}
                      {toPersianDigits(String(run.items.length))}
                    </p>
                  </div>
                  <span
                    className={`staff-home-badge staff-home-badge--${run.status}`}
                  >
                    {runStatusLabel(run.status)}
                  </span>
                </header>
                {run.reviewNote ? (
                  <p className="staff-home-note">یادداشت مدیر: {run.reviewNote}</p>
                ) : null}
                <ul className="staff-home-items">
                  {run.items.map((it) => (
                    <li key={it.id}>
                      <div
                        className={`staff-home-item is-locked${it.done ? " is-done" : ""}`}
                      >
                        <span aria-hidden="true">{it.done ? "✓" : "○"}</span>
                        <span>{it.label}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
