"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardList, Target, Check, TriangleAlert, Loader2, Users,
  Image as ImageIcon, Clapperboard, FileText,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  api,
  fetchAssignmentSummary,
  fetchTeams,
  fetchUserKpiGoals,
  getToken,
  upsertUserKpiGoals,
  type AssignmentMember,
  type AssignmentSummaryResponse,
  type KpiMetricsResponse,
  type KpiMetricDef,
  type KpiPeriod,
  type RoleOption,
  type Team,
  type UserKpiGoal,
} from "@/lib/api";

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

const PERIOD_LABEL: Record<KpiPeriod, string> = { weekly: "สัปดาห์", monthly: "เดือน" };

// ─── progress bar — เขียวเมื่อถึงเป้า, amber กำลังไป, แดงเมื่อตามหลัง ─────
function TargetBar({
  pct,
  status,
}: {
  pct: number;
  status: "on_track" | "behind" | "done";
}) {
  const tone =
    status === "done" ? "bg-emerald-500" : status === "behind" ? "bg-rose-500" : "bg-amber-400";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  done: { label: "ถึงเป้า", cls: "bg-emerald-900 text-emerald-200" },
  on_track: { label: "ตามแผน", cls: "bg-amber-900/60 text-amber-200" },
  behind: { label: "ตามหลัง", cls: "bg-red-950 text-red-300" },
};

// ─── modal: มอบหมาย Task ให้คนนี้ (reuse POST /tasks เดิม — แจ้งเตือนอัตโนมัติ) ─
function AssignTaskModal({
  member,
  onClose,
  onDone,
}: {
  member: AssignmentMember;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // endpoint สร้างงานเดิมของ My Work — แจ้งเตือนผู้รับอัตโนมัติ
      const task = await api<{ id: string }>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          assigneeId: member.userId,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      });
      // โน้ตเพิ่มเติม → description (PATCH เดิมของ Trello card)
      if (note.trim()) {
        await api(`/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ description: note.trim() }),
        });
      }
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "มอบหมายงานไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-md flex-col space-y-3 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-6 shadow-2xl duration-200 animate-in slide-in-from-right"
      >
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold"><ClipboardList className="size-4" /> มอบหมาย Task ให้ {member.name}</p>
        <input
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ชื่องาน เช่น ตัดคลิปรีวิวสินค้าใหม่ *"
          className={`${inputCls} w-full`}
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="โน้ต/รายละเอียดเพิ่มเติม (ไม่บังคับ)"
          rows={3}
          className={`${inputCls} w-full resize-none`}
        />
        <div className="grid grid-cols-2 gap-3">
          <FilterSelect
            value={priority}
            onChange={setPriority}
            options={[
              { value: "normal", label: "ปกติ" },
              { value: "urgent", label: "ด่วน" },
              { value: "low", label: "ชิลๆ" },
            ]}
          />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? "กำลังมอบหมาย..." : "มอบหมายงาน"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── modal: ตั้งเป้ารายคน (PUT /kpi/goals scope=user) ────────────────────
function UserGoalsModal({
  member,
  period,
  metrics,
  onClose,
  onDone,
}: {
  member: AssignmentMember;
  period: KpiPeriod;
  metrics: KpiMetricDef[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [existing, setExisting] = useState<UserKpiGoal[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // metric → target string
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserKpiGoals(member.userId)
      .then((res) => {
        setExisting(res.goals);
        const next: Record<string, string> = {};
        for (const m of metrics) {
          const g = res.goals.find((x) => x.metric === m.metric && x.period === period && x.active);
          next[m.metric] = g ? String(g.target) : "";
        }
        setDrafts(next);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดเป้าไม่สำเร็จ"));
  }, [member.userId, metrics, period]);

  // เป้า effective ปัจจุบัน (จาก summary) — โชว์ว่าตอนนี้ใช้ของ role หรือรายคน
  const effectiveFor = (metric: string) => member.targets.find((t) => t.metric === metric);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!existing) return;
    // semantics เดียวกับ KPI editor ใน Settings: >0 = ตั้งเป้า, เคลียร์แต่เคยมี = ปิด (active:false)
    const payload: { metric: string; period: KpiPeriod; target: number; active?: boolean }[] = [];
    for (const m of metrics) {
      const raw = Math.max(0, Math.min(1000, Math.round(Number(drafts[m.metric]) || 0)));
      const existed = existing.some((g) => g.metric === m.metric && g.period === period);
      if (raw > 0) payload.push({ metric: m.metric, period, target: raw, active: true });
      else if (existed) payload.push({ metric: m.metric, period, target: 0, active: false });
    }
    if (payload.length === 0) {
      setError("ยังไม่มีเป้าให้บันทึก — ใส่ค่าเป้าอย่างน้อยหนึ่งรายการ");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertUserKpiGoals(member.userId, payload);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกเป้าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-lg flex-col space-y-3 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-6 shadow-2xl duration-200 animate-in slide-in-from-right"
      >
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Target className="size-4" /> ตั้งเป้ารายคน — {member.name} (ราย{PERIOD_LABEL[period]})
        </p>
        <p className="text-xs text-zinc-500">
          เป้ารายคนจะ override เป้าของ role — เว้นว่าง = ใช้เป้าของ role ตามเดิม
        </p>
        {!existing && !error && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}
        {existing && (
          <div className="space-y-2">
            {metrics.map((m) => {
              const eff = effectiveFor(m.metric);
              return (
                <div
                  key={m.metric}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2"
                >
                  <span className="text-lg">{m.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-200">{m.label}</span>
                    <span className="block text-[11px] text-zinc-500">
                      {eff
                        ? eff.source === "user"
                          ? `ตอนนี้ใช้เป้าเฉพาะคน: ${eff.target}`
                          : `ตอนนี้ใช้เป้าของ role: ${eff.target}`
                        : "ยังไม่มีเป้า"}
                    </span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={drafts[m.metric] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.metric]: e.target.value }))}
                    placeholder="—"
                    className={`${inputCls} w-20 text-center`}
                  />
                </div>
              );
            })}
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={saving || !existing}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกเป้า"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── หน้า Assignment Hub ──────────────────────────────────────────────────
export default function AssignmentsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<KpiPeriod>("weekly");
  const [teamId, setTeamId] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [metrics, setMetrics] = useState<KpiMetricDef[]>([]);
  const [data, setData] = useState<AssignmentSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<AssignmentMember | null>(null);
  const [goalsFor, setGoalsFor] = useState<AssignmentMember | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    fetchTeams()
      .then((ts) => setTeams(ts.filter((t) => t.status === "active")))
      .catch(() => setTeams([]));
    api<RoleOption[]>("/roles")
      .then((rs) => setRoles(Array.isArray(rs) ? rs : []))
      .catch(() => setRoles([]));
    api<KpiMetricsResponse>("/kpi/metrics")
      .then((res) => setMetrics(res.metrics))
      .catch(() => setMetrics([]));
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAssignmentSummary({
        period,
        teamId: teamId || undefined,
        roleKey: roleKey || undefined,
      });
      setData(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, teamId, roleKey]);

  // debounced reload เมื่อ filter เปลี่ยน (idiom เดียวกับ My Work)
  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  const members = data?.members ?? [];
  // สรุปหัวหน้าอยากเห็นก่อน: มีเป้าแล้วตามหลังกี่คน / ตามแผน-ถึงเป้ากี่คน
  const behindCount = members.filter((m) => m.totals.behind > 0).length;
  const okCount = members.filter((m) => m.totals.targets > 0 && m.totals.behind === 0).length;
  const noTargetCount = members.filter((m) => m.totals.targets === 0).length;
  const elapsedPct = data ? Math.round(data.elapsedFraction * 100) : 0;

  return (
    <AppShell title="มอบหมายงาน">
      <div className="space-y-6">
        {/* header controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-zinc-700">
            {(["weekly", "monthly"] as KpiPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-2 text-sm ${
                  period === p ? "bg-amber-400 font-semibold text-zinc-950" : "bg-zinc-800 text-zinc-300"
                }`}
              >
                ราย{PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          <FilterSelect
            value={teamId}
            onChange={setTeamId}
            options={[
              { value: "", label: "ทุกทีม" },
              ...teams.map((t) => ({ value: t.id, label: `${t.name} (${t.memberCount})` })),
            ]}
          />
          <FilterSelect
            value={roleKey}
            onChange={setRoleKey}
            options={[
              { value: "", label: "ทุกบทบาท" },
              ...roles.map((r) => ({ value: r.key, label: r.name })),
            ]}
          />

          {/* summary chips */}
          {data && (
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/70 px-2.5 py-1 text-emerald-200">
                <Check className="size-3" /> ตามแผน/ถึงเป้า {okCount} คน
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-950 px-2.5 py-1 text-red-300">
                <TriangleAlert className="size-3" /> ตามหลัง {behindCount} คน
              </span>
              {noTargetCount > 0 && (
                <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-zinc-400">
                  ยังไม่มีเป้า {noTargetCount} คน
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-zinc-500" title="สัดส่วนเวลาที่ผ่านไปของช่วงนี้">
                <Loader2 className="size-3" /> ผ่านไป {elapsedPct}% ของ{PERIOD_LABEL[period]}
              </span>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}

        {/* empty state */}
        {!loading && !error && members.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-8 text-center">
            <p className="text-sm text-zinc-300">
              {teamId ? "ทีมนี้ยังไม่มีสมาชิก" : "ไม่พบสมาชิกตามเงื่อนไขที่เลือก"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              จัดการทีมและสมาชิกได้ที่{" "}
              <Link href="/users" className="text-amber-300 hover:underline">
                Users &amp; Roles
              </Link>
            </p>
          </div>
        )}

        {/* member cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => (
            <div
              key={m.userId}
              className={`space-y-3 rounded-2xl border bg-zinc-900 p-4 ${
                m.totals.behind > 0 ? "border-red-900/70" : "border-zinc-800"
              }`}
            >
              {/* identity */}
              <div className="flex items-center gap-3">
                <EntityAvatar entityType="user" id={m.userId} name={m.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-100">{m.name}</p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {m.roles.map((r) => r.name).join(" · ") || "ไม่มีบทบาท"}
                    {m.teams.length > 0 && <> · <Users className="inline size-3" /> {m.teams.map((t) => t.name).join(", ")}</>}
                  </p>
                </div>
                {m.totals.targets > 0 && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                      m.totals.behind > 0
                        ? STATUS_CHIP.behind.cls
                        : m.totals.done === m.totals.targets
                          ? STATUS_CHIP.done.cls
                          : STATUS_CHIP.on_track.cls
                    }`}
                  >
                    {m.totals.behind > 0
                      ? `ตามหลัง ${m.totals.behind}`
                      : m.totals.done === m.totals.targets
                        ? "ถึงเป้าครบ"
                        : "ตามแผน"}
                  </span>
                )}
              </div>

              {/* per-metric progress */}
              {m.targets.length > 0 ? (
                <div className="space-y-2">
                  {m.targets.map((t) => (
                    <div key={t.metric} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-zinc-300">
                          {t.icon} {t.label}
                          <span
                            className={`ml-1.5 rounded px-1 py-px text-[9px] ${
                              t.source === "user"
                                ? "bg-amber-400/15 text-amber-300"
                                : "bg-zinc-800 text-zinc-500"
                            }`}
                            title={t.source === "user" ? "เป้าตั้งเฉพาะคนนี้" : "ใช้เป้าของ role"}
                          >
                            {t.source === "user" ? "เป้าเฉพาะคน" : "เป้า role"}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-zinc-400">
                          {t.actual}/{t.target}
                          <span
                            className={`ml-1.5 rounded px-1 py-px text-[9px] ${STATUS_CHIP[t.status].cls}`}
                          >
                            {STATUS_CHIP[t.status].label}
                          </span>
                        </span>
                      </div>
                      <TargetBar pct={t.progressPct} status={t.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-3 text-center text-[11px] text-zinc-500">
                  ยังไม่มีเป้า — ตั้งเป้าของ role ที่ Settings หรือกด &ldquo;<Target className="inline size-3" /> ตั้งเป้ารายคน&rdquo;
                </p>
              )}

              {/* workload row — งานค้างในมือ */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-800 pt-2 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1" title="Task ค้าง (ไม่รวมที่เสร็จแล้ว)"><ClipboardList className="size-3" /> {m.workload.tasks} งาน</span>
                <span className="inline-flex items-center gap-1" title="งานภาพค้าง (open/กำลังทำ/รอรีวิว/แก้)"><ImageIcon className="size-3" /> {m.workload.imageRequests} งานภาพ</span>
                <span className="inline-flex items-center gap-1" title="อีพีที่รับผิดชอบ (ยังไม่เผยแพร่)"><Clapperboard className="size-3" /> {m.workload.episodes} อีพี</span>
                <span className="inline-flex items-center gap-1" title="คอนเทนต์ช่วง idea → รีวิวภายใน"><FileText className="size-3" /> {m.workload.contentItems} คอนเทนต์</span>
              </div>

              {/* actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setAssignFor(m)}
                  className="flex-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300"
                >
                  + มอบหมาย Task
                </button>
                <button
                  onClick={() => setGoalsFor(m)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  <Target className="size-3.5" /> ตั้งเป้ารายคน
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {assignFor && (
        <AssignTaskModal member={assignFor} onClose={() => setAssignFor(null)} onDone={load} />
      )}
      {goalsFor && (
        <UserGoalsModal
          member={goalsFor}
          period={period}
          metrics={metrics}
          onClose={() => setGoalsFor(null)}
          onDone={load}
        />
      )}
    </AppShell>
  );
}
