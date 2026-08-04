"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Wallet, ReceiptText, Drama, CalendarDays, Target, Flame, CalendarRange,
  Clock, Radio, Video, BarChart3, ChevronUp, ChevronDown, ArrowRight, type LucideIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { api, getUser, type DashboardOverview, type KpiMeRow } from "@/lib/api";

// ─── label maps (Thai) ───────────────────────────────────────
const JOB_STATUS_LABEL: Record<string, string> = {
  inquiry: "สอบถาม",
  quoted: "เสนอราคา",
  confirmed: "ยืนยันแล้ว",
  in_production: "กำลังผลิต",
  internal_qc: "QC ภายใน",
  delivered: "ส่งมอบแล้ว",
  revision: "แก้ไข",
  approved: "อนุมัติ",
  closed: "ปิดงาน",
  cancelled: "ยกเลิก",
};
const CONTENT_STATUS_LABEL: Record<string, string> = {
  idea: "ไอเดีย",
  brief: "บรีฟ",
  in_production: "กำลังผลิต",
  internal_review: "รอตรวจ",
  revision_needed: "ต้องแก้",
  approved: "อนุมัติ",
  scheduled: "ตั้งเวลา",
  published: "เผยแพร่แล้ว",
  archived: "เก็บถาวร",
};
const EPISODE_STATUS_LABEL: Record<string, string> = {
  idea: "ไอเดีย",
  script_draft: "ร่างบท",
  script_review: "ตรวจบท",
  script_approved: "บทอนุมัติ",
  shot_breakdown: "แตกช็อต",
  production: "ผลิต",
  edited: "ตัดต่อแล้ว",
  published: "เผยแพร่แล้ว",
  archived: "เก็บถาวร",
};

const ACTION_ICON: Record<string, string> = {
  entity: "•",
};

const baht = (n: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(Math.round(n));

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "เมื่อครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.floor(h / 24)} วันก่อน`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
}

// ─── small building blocks ───────────────────────────────────
function KpiCard({
  href,
  icon,
  label,
  value,
  sub,
  accent,
  className,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  const Icon = icon;
  return (
    <Link
      href={href}
      className={`group rounded-2xl border p-4 transition ${
        accent
          ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-zinc-900"
          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
      } ${className ?? ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
        <span className={`grid size-8 place-items-center rounded-lg ${accent ? "bg-amber-400/15 text-amber-500" : "bg-zinc-800/60 text-zinc-400"}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className={`mt-2 text-2xl font-bold ${accent ? "text-amber-300" : "text-zinc-100"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </Link>
  );
}

function ActionTile({
  href,
  label,
  count,
  tone,
  className,
}: {
  href: string;
  label: string;
  count: number;
  tone: "red" | "amber" | "sky" | "zinc";
  className?: string;
}) {
  const toneCls =
    count === 0
      ? "border-zinc-800 bg-zinc-900/40 text-zinc-500"
      : tone === "red"
      ? "border-red-900/60 bg-red-950/40 text-red-200 hover:border-red-700"
      : tone === "amber"
      ? "border-amber-900/60 bg-amber-950/30 text-amber-200 hover:border-amber-700"
      : tone === "sky"
      ? "border-sky-900/60 bg-sky-950/30 text-sky-200 hover:border-sky-700"
      : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700";
  return (
    <Link href={href} className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${toneCls} ${className ?? ""}`}>
      <span className="text-sm">{label}</span>
      <span className="text-xl font-bold tabular-nums">{count}</span>
    </Link>
  );
}

const PIPE_COLORS = [
  "bg-amber-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-indigo-500",
  "bg-pink-500",
  "bg-lime-500",
];

function PipelineBar({
  title,
  data,
  labels,
  href,
  className,
}: {
  title: string;
  data: Record<string, number>;
  labels: Record<string, string>;
  href: string;
  className?: string;
}) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 ${className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        <Link href={href} className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
          ดูทั้งหมด <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {total === 0 ? (
        <p className="py-4 text-center text-xs text-zinc-600">ยังไม่มีข้อมูล</p>
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-800">
            {entries.map(([k], i) => (
              <div
                key={k}
                className={PIPE_COLORS[i % PIPE_COLORS.length]}
                style={{ width: `${(data[k] / total) * 100}%` }}
                title={`${labels[k] ?? k}: ${data[k]}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {entries.map(([k], i) => (
              <span key={k} className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className={`h-2 w-2 rounded-full ${PIPE_COLORS[i % PIPE_COLORS.length]}`} />
                {labels[k] ?? k}
                <span className="font-semibold text-zinc-200">{data[k]}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 🎯 เป้าหมายของฉัน (KPI) ──────────────────────────────────
const KPI_PERIOD_LABEL: Record<string, string> = { weekly: "สัปดาห์นี้", monthly: "เดือนนี้" };

function goalBarTone(actual: number, target: number): string {
  if (target <= 0) return "bg-zinc-600";
  const pct = actual / target;
  if (pct >= 1) return "bg-emerald-500";
  if (pct >= 0.5) return "bg-amber-400";
  return "bg-rose-500";
}

function MyGoalsWidget() {
  const [rows, setRows] = useState<KpiMeRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    api<KpiMeRow[]>("/kpi/me")
      // 404 (API เก่า) / error → ซ่อน widget เงียบ ๆ ไม่ให้ Dashboard พัง
      .then((r) => alive && setRows(Array.isArray(r) ? r : []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, []);

  // ยังไม่โหลด หรือ ไม่มีเป้าในบทบาทของผู้ใช้ → ไม่แสดงอะไรเลย
  if (!rows || rows.length === 0) return null;

  const visible = rows.filter((r) => r.target > 0);
  if (visible.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <Target className="size-4 text-amber-400" /> เป้าหมายของฉันสัปดาห์นี้
      </h2>
      <div className="grid gap-3 rounded-2xl border border-amber-500/20 bg-zinc-900/60 p-4 sm:grid-cols-2">
        {visible.map((r) => {
          const pct = r.target > 0 ? Math.min(100, Math.round((r.actual / r.target) * 100)) : 0;
          return (
            <div key={`${r.metric}-${r.period}`} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">
                  {r.icon} {r.label}
                  <span className="ml-1 text-zinc-600">· ราย{KPI_PERIOD_LABEL[r.period] ?? r.period}</span>
                </span>
                <span className="tabular-nums text-zinc-400">
                  <span className="font-semibold text-zinc-100">{r.actual}</span>/{r.target}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full ${goalBarTone(r.actual, r.target)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── page ────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dashboard = admin เท่านั้น (CEO) — คนอื่นเข้าตรงด้วย URL ก็เด้งไป My Work
  useEffect(() => {
    const u = getUser();
    if (u && !u.roles?.includes("admin")) router.replace("/my-work");
  }, [router]);

  useEffect(() => {
    let alive = true;
    api<DashboardOverview>("/dashboard")
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AppShell title="Dashboard">
      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />
          ))}
        </div>
      ) : error || !data ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-10 text-center">
          <BarChart3 className="mx-auto size-8" />
          <p className="mt-2 text-sm text-zinc-400">
            {error === "session หมดอายุ" ? "กรุณาเข้าสู่ระบบใหม่" : "ยังโหลดข้อมูล Dashboard ไม่ได้"}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            หากเพิ่งอัปเดตระบบ อาจต้องรอ API รีสตาร์ทเพื่อเปิดใช้ /api/dashboard
          </p>
        </div>
      ) : (
        <DashboardBody data={data} />
      )}
    </AppShell>
  );
}

function DashboardBody({ data }: { data: DashboardOverview }) {
  const { kpis, actionNeeded, pipeline, performance, week, activity, financeVisible } = data;
  const maxGmv = performance ? Math.max(1, ...performance.gmvDailyLast7.map((d) => d.gmv)) : 1;

  return (
    <div className="space-y-6">
      {/* 1. KPI row */}
      <div className="grid grid-cols-12 gap-4">
        {financeVisible && kpis.gmvThisMonth !== undefined && (
          <KpiCard
            href="/performance"
            className="col-span-6 md:col-span-3"
            icon={Wallet}
            label="GMV เดือนนี้"
            value={`฿${baht(kpis.gmvThisMonth)}`}
            accent
            sub={
              kpis.gmvDeltaPct === null || kpis.gmvDeltaPct === undefined ? (
                "ยังไม่มีข้อมูลเดือนก่อน"
              ) : (
                <span className={`inline-flex items-center gap-1 ${kpis.gmvDeltaPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {kpis.gmvDeltaPct >= 0 ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />} {Math.abs(kpis.gmvDeltaPct)}% เทียบเดือนก่อน
                </span>
              )
            }
          />
        )}
        <KpiCard
          href="/jobs"
          className="col-span-6 md:col-span-3"
          icon={ReceiptText}
          label="งานกำลังผลิต"
          value={String(kpis.jobsInProduction)}
          sub={
            financeVisible && kpis.pipelineValue !== undefined
              ? `pipeline ฿${baht(kpis.pipelineValue)}`
              : "งานรับจ้าง"
          }
        />
        <KpiCard
          href="/characters"
          className="col-span-6 md:col-span-3"
          icon={Drama}
          label="Character พร้อมใช้"
          value={`${kpis.charactersReady}/${kpis.charactersTotal}`}
          sub="approved / production ready"
        />
        <KpiCard
          href="/calendar"
          className="col-span-6 md:col-span-3"
          icon={CalendarDays}
          label="คอนเทนต์สัปดาห์นี้"
          value={String(kpis.contentThisWeek)}
          sub={`ไลฟ์วันนี้ ${kpis.liveToday}`}
        />
      </div>

      {/* 1.5 เป้าหมายของฉัน (KPI) — ซ่อนเองถ้าไม่มีเป้าในบทบาท */}
      <MyGoalsWidget />

      {/* 2. Action needed */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <Flame className="size-4 text-amber-400" /> ต้องรีบจัดการ
        </h2>
        <div className="grid grid-cols-12 gap-4">
          <ActionTile className="col-span-6 sm:col-span-4 lg:col-span-2" href="/my-work" label="งานเลยกำหนด" count={actionNeeded.overdueTasks} tone="red" />
          <ActionTile className="col-span-6 sm:col-span-4 lg:col-span-2" href="/jobs" label="งานรับจ้างเลยกำหนด" count={actionNeeded.overdueJobs} tone="red" />
          <ActionTile className="col-span-6 sm:col-span-4 lg:col-span-2" href="/characters" label="รออนุมัติ" count={actionNeeded.pendingApprovals} tone="amber" />
          <ActionTile className="col-span-6 sm:col-span-4 lg:col-span-2" href="/calendar" label="QC ค้างตรวจ" count={actionNeeded.qcPending} tone="amber" />
          <ActionTile
            className="col-span-6 sm:col-span-4 lg:col-span-2"
            href="/jobs"
            label="Deliverable รอลูกค้า"
            count={actionNeeded.deliverablesAwaitingClient}
            tone="sky"
          />
          <ActionTile className="col-span-6 sm:col-span-4 lg:col-span-2" href="/library" label="ลิขสิทธิ์เสี่ยง/หมดอายุ" count={actionNeeded.rightsExpiringSoon} tone="amber" />
        </div>
      </section>

      {/* 3. Pipeline */}
      <section className="grid grid-cols-12 gap-4">
        <PipelineBar className="col-span-12 lg:col-span-4" title="Jobs" data={pipeline.jobs} labels={JOB_STATUS_LABEL} href="/jobs" />
        <PipelineBar className="col-span-12 lg:col-span-4" title="Episodes" data={pipeline.episodes} labels={EPISODE_STATUS_LABEL} href="/episodes" />
        <PipelineBar className="col-span-12 lg:col-span-4" title="Content" data={pipeline.content} labels={CONTENT_STATUS_LABEL} href="/calendar" />
      </section>

      {/* 4. Performance (finance only) */}
      {financeVisible && performance && (
        <section className="grid grid-cols-12 gap-4">
          <div className="col-span-12 rounded-2xl border border-amber-500/20 bg-zinc-900/60 p-4 lg:col-span-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-200">GMV รายวัน (7 วัน)</h3>
            <div className="flex h-32 flex-col">
              <div className="flex flex-1 items-end gap-1.5">
                {performance.gmvDailyLast7.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 rounded-t bg-amber-500/80"
                    style={{ height: `${Math.max(2, (d.gmv / maxGmv) * 100)}%` }}
                    title={`${d.date}: ฿${baht(d.gmv)}`}
                  />
                ))}
              </div>
              <div className="mt-1 flex gap-1.5">
                {performance.gmvDailyLast7.map((d) => (
                  <span key={d.date} className="flex-1 text-center text-[9px] text-zinc-600">
                    {d.date.slice(5)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <TopList className="col-span-12 lg:col-span-4" title="Top Presenter (GMV)" rows={performance.topPresenters} />
          <TopList className="col-span-12 lg:col-span-4" title="Top Products (GMV)" rows={performance.topProducts} />
        </section>
      )}

      {/* 5. Week + Activity */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200"><CalendarRange className="size-4 text-zinc-400" /> สัปดาห์นี้ (7 วันข้างหน้า)</h3>
          {week.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-600">ไม่มีกำหนดการใน 7 วันข้างหน้า</p>
          ) : (
            <ul className="space-y-1.5">
              {week.map((w) => (
                <li key={`${w.type}-${w.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-800/50">
                  <span className="text-zinc-400">
                    {w.type === "live" ? <Radio className="size-4 text-rose-400" /> : w.type === "job" ? <ReceiptText className="size-4" /> : <Video className="size-4" />}
                  </span>
                  <span className="flex-1 truncate text-sm text-zinc-300">{w.title}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{dayLabel(w.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="col-span-12 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200"><Clock className="size-4 text-zinc-400" /> กิจกรรมล่าสุด</h3>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-600">ยังไม่มีกิจกรรม</p>
          ) : (
            <ul className="space-y-1.5">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="text-zinc-600">{ACTION_ICON.entity}</span>
                  <span className="flex-1 truncate text-zinc-400">
                    <span className="text-zinc-300">{a.actorName ?? "ระบบ"}</span> {a.action}
                    {a.entityType ? ` · ${a.entityType}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-600">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function TopList({ title, rows, className }: { title: string; rows: { id: string; name: string; gmv: number }[]; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.gmv));
  return (
    <div className={`rounded-2xl border border-amber-500/20 bg-zinc-900/60 p-4 ${className ?? ""}`}>
      <h3 className="mb-3 text-sm font-semibold text-zinc-200">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-600">ยังไม่มีข้อมูล</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="flex items-center justify-between text-xs">
                <span className="truncate text-zinc-300">{r.name}</span>
                <span className="ml-2 shrink-0 font-semibold text-amber-300">฿{baht(r.gmv)}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${(r.gmv / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
