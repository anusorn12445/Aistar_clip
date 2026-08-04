"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type KpiGoal,
  type KpiGoalsResponse,
  type KpiMetricDef,
  type KpiMetricsResponse,
  type KpiPeriod,
  type RoleOption,
} from "@/lib/api";
import { FilterSelect } from "@/components/ui/filter-select";
import { Check, Target } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

// ─── 🎯 เป้าหมายทีม (KPI) ─────────────────────────────────────
const PERIOD_LABEL: Record<KpiPeriod, string> = { weekly: "สัปดาห์", monthly: "เดือน" };

interface MetricDraft {
  target: string; // เก็บเป็น string เพื่อให้พิมพ์/ลบได้ลื่น
  active: boolean;
}

function barTone(actual: number, target: number): string {
  if (target <= 0) return "bg-zinc-600";
  const pct = actual / target;
  if (pct >= 1) return "bg-emerald-500"; // met
  if (pct >= 0.5) return "bg-amber-400"; // accent (กำลังไป)
  return "bg-rose-500"; // warning (ตามหลัง)
}

function ProgressBar({ actual, target }: { actual: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full rounded-full ${barTone(actual, target)}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function goalKey(metric: string, period: KpiPeriod) {
  return `${metric}::${period}`;
}

export default function KpiGoalsSection() {
  const [roles, setRoles] = useState<RoleOption[]>([{ key: "creator", name: "Creator" }]);
  const [roleKey, setRoleKey] = useState("creator");
  const [period, setPeriod] = useState<KpiPeriod>("weekly");
  const [metrics, setMetrics] = useState<KpiMetricDef[]>([]);
  const [goals, setGoals] = useState<KpiGoal[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MetricDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [unavailable, setUnavailable] = useState(false); // API เก่ายังไม่มี /kpi
  const [error, setError] = useState<string | null>(null);

  // โหลดรายชื่อ role (ถ้า 403/พัง → คงค่า default Creator ไว้)
  useEffect(() => {
    api<RoleOption[]>("/roles")
      .then((rs) => {
        if (Array.isArray(rs) && rs.length) setRoles(rs);
      })
      .catch(() => {});
  }, []);

  // โหลด metric catalog ครั้งเดียว
  useEffect(() => {
    api<KpiMetricsResponse>("/kpi/metrics")
      .then((res) => setMetrics(res.metrics))
      .catch(() => setUnavailable(true));
  }, []);

  const loadGoals = useCallback(async (rk: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<KpiGoalsResponse>(`/kpi/goals?roleKey=${encodeURIComponent(rk)}`);
      setGoals(res.goals);
      setUnavailable(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // 404 = API ยังไม่ได้รีสตาร์ทให้บริการ /kpi → degrade เงียบ ๆ
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) setUnavailable(true);
      else setError(msg || "โหลดเป้าหมายไม่สำเร็จ");
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGoals(roleKey);
  }, [roleKey, loadGoals]);

  // sync drafts จาก goals ที่โหลดมา (ทุก metric × period ปัจจุบัน)
  useEffect(() => {
    const next: Record<string, MetricDraft> = {};
    for (const m of metrics) {
      for (const p of ["weekly", "monthly"] as KpiPeriod[]) {
        const g = goals.find((x) => x.metric === m.metric && x.period === p);
        next[goalKey(m.metric, p)] = {
          target: g ? String(g.target) : "0",
          active: g ? g.active : true,
        };
      }
    }
    setDrafts(next);
  }, [goals, metrics]);

  const goalFor = (metric: string) => goals.find((g) => g.metric === metric && g.period === period);

  function setDraft(metric: string, patch: Partial<MetricDraft>) {
    const k = goalKey(metric, period);
    setDrafts((d) => ({ ...d, [k]: { ...(d[k] ?? { target: "0", active: true }), ...patch } }));
  }

  async function save() {
    // ส่งเฉพาะ period ที่กำลังแก้ — target>0 = เป้าจริง, ถ้าเคลียร์เป็น 0 แต่เคยมี → ปิด (active:false)
    let clamped = false;
    const payload = metrics
      .map((m) => {
        const d = drafts[goalKey(m.metric, period)] ?? { target: "0", active: true };
        const raw = Math.round(Number(d.target) || 0);
        if (raw > 1000) clamped = true;
        const target = Math.max(0, Math.min(1000, raw));
        const existed = !!goalFor(m.metric);
        if (target > 0) return { metric: m.metric, period, target, active: d.active };
        if (existed) return { metric: m.metric, period, target: 0, active: false };
        return null;
      })
      .filter((x): x is { metric: string; period: KpiPeriod; target: number; active: boolean } => !!x);

    if (payload.length === 0) {
      setError("ยังไม่มีเป้าหมายให้บันทึก — ใส่ค่าเป้าหมายอย่างน้อยหนึ่งรายการ");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api<KpiGoalsResponse>("/kpi/goals", {
        method: "PUT",
        body: JSON.stringify({ roleKey, goals: payload }),
      });
      setGoals(res.goals);
      setSaved(true);
      if (clamped) setError("เป้าหมายสูงสุด 1000 — ค่าที่เกินถูกปรับให้ไม่เกิน 1000");
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (unavailable) {
    return (
      <section className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Target className="size-4" /> เป้าหมายทีม (KPI)</h2>
        <p className="text-xs text-zinc-500">
          ฟีเจอร์นี้พร้อมใช้งานหลัง API รีสตาร์ท — กรุณารอสักครู่แล้วรีเฟรชหน้าอีกครั้ง
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Target className="size-4" /> เป้าหมายทีม (KPI)</h2>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
          Phase 1 — ตั้งเป้าต่อบทบาท
        </span>
      </div>
      <p className="text-xs text-zinc-500">
        ตั้งเป้าจำนวนงานที่ทีมต้องสร้างต่อ<b>คน</b> ในแต่ละบทบาท — ระบบนับจริงจาก activity log
        แสดงความคืบหน้าทั้งทีมและรายคนในช่วงปัจจุบัน
      </p>

      {/* role + period controls */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-zinc-400">บทบาท</label>
        <FilterSelect
          value={roleKey}
          onChange={setRoleKey}
          className="w-auto"
          options={roles.map((r) => ({ value: r.key, label: r.name }))}
        />
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-zinc-700">
          {(["weekly", "monthly"] as KpiPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs ${
                period === p ? "bg-amber-400 font-semibold text-zinc-950" : "bg-zinc-800 text-zinc-300"
              }`}
            >
              ราย{PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">กำลังโหลด...</p>
      ) : (
        <div className="space-y-3">
          {metrics.map((m) => {
            const d = drafts[goalKey(m.metric, period)] ?? { target: "0", active: true };
            const g = goalFor(m.metric);
            const targetNum = Math.max(0, Math.round(Number(d.target) || 0));
            const teamTarget = g ? targetNum * g.memberCount : 0;
            const teamActual = g?.teamActual ?? 0;
            return (
              <div
                key={m.metric}
                className={`rounded-xl border p-4 ${
                  d.active ? "border-zinc-800 bg-zinc-950/40" : "border-zinc-800/60 bg-zinc-950/20 opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg">{m.icon}</span>
                  <span className="text-sm font-medium text-zinc-200">{m.label}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-zinc-500">เป้า/คน/ราย{PERIOD_LABEL[period]}</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={d.target}
                      onChange={(e) => setDraft(m.metric, { target: e.target.value })}
                      className={`${inputCls} w-20 text-center`}
                    />
                    <label className="flex items-center gap-1 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={d.active}
                        onChange={(e) => setDraft(m.metric, { active: e.target.checked })}
                        className="accent-amber-400"
                      />
                      เปิด
                    </label>
                  </div>
                </div>

                {g ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">
                        ทีมทำได้ <span className="font-semibold text-zinc-100">{teamActual}</span> /{" "}
                        {teamTarget} ({g.memberCount} คน)
                      </span>
                      <span className="text-zinc-500">
                        {teamTarget > 0 ? Math.round((teamActual / teamTarget) * 100) : 0}%
                      </span>
                    </div>
                    <ProgressBar actual={teamActual} target={teamTarget} />
                    {g.perUser.length > 0 && (
                      <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                        {g.perUser.map((u) => (
                          <li key={u.userId} className="flex items-center gap-2 text-xs text-zinc-400">
                            <span className="w-28 shrink-0 truncate">{u.name}</span>
                            <span className="flex-1">
                              <ProgressBar actual={u.actual} target={targetNum} />
                            </span>
                            <span className="w-10 shrink-0 text-right tabular-nums text-zinc-300">
                              {u.actual}/{targetNum}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-zinc-600">
                    ยังไม่ได้ตั้งเป้า — ใส่ค่าแล้วกดบันทึกเพื่อเริ่มติดตาม
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : `บันทึกเป้าราย${PERIOD_LABEL[period]}`}
        </button>
        {saved && <span className="inline-flex items-center gap-1 text-sm text-emerald-300"><Check className="size-3.5" /> บันทึกแล้ว</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </section>
  );
}
