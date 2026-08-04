"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Loader2,
  Radio,
  RotateCcw,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";
import {
  ContentItemOption,
  ImportResult,
  LiveSessionOption,
  PLATFORMS,
  PerformanceList,
  PerformanceOverview,
  SummaryRow,
  asList,
  downloadCsvTemplate,
  fmtCompact,
  fmtDateTimeTh,
  fmtMoney,
  localDateTimeNow,
  localDay,
  platformLabel,
  uploadPerformanceCsv,
} from "@/lib/performance";

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";
const selectCls =
  "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm outline-none focus:border-amber-400";
const cardCls = "rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5";

const RANGE_PRESETS = [
  { value: "7", label: "7 วันล่าสุด" },
  { value: "30", label: "30 วันล่าสุด" },
  { value: "90", label: "90 วันล่าสุด" },
  { value: "custom", label: "กำหนดเอง" },
];

// ── metric form definition ───────────────────────────────────

const METRIC_GROUPS: {
  title: string;
  fields: { key: string; label: string; float?: boolean; step?: string }[];
}[] = [
  {
    title: "Reach",
    fields: [
      { key: "views", label: "ยอดวิว" },
      { key: "reach", label: "Reach" },
      { key: "impressions", label: "Impressions" },
    ],
  },
  {
    title: "Engagement",
    fields: [
      { key: "likes", label: "ไลก์" },
      { key: "comments", label: "คอมเมนต์" },
      { key: "shares", label: "แชร์" },
      { key: "saves", label: "เซฟ" },
      { key: "watchTimeSec", label: "Watch time (วิ)" },
      { key: "retention3Sec", label: "Retention 3s (0-1)", float: true, step: "0.01" },
      { key: "completionRate", label: "Completion (0-1)", float: true, step: "0.01" },
      { key: "ctr", label: "CTR (0-1)", float: true, step: "0.001" },
    ],
  },
  {
    title: "Commerce",
    fields: [
      { key: "productClicks", label: "คลิกสินค้า" },
      { key: "addToCart", label: "Add to cart" },
      { key: "orders", label: "ออเดอร์" },
      { key: "revenue", label: "รายได้ (฿)", float: true, step: "0.01" },
      { key: "gmv", label: "GMV (฿)", float: true, step: "0.01" },
      { key: "cvr", label: "CVR (0-1)", float: true, step: "0.001" },
      { key: "roas", label: "ROAS", float: true, step: "0.01" },
    ],
  },
];

const ENTRY_FILTER_KEYS = ["platform", "source", "recordedFrom", "recordedTo"] as const;

// ── shared bits ──────────────────────────────────────────────

function GmvBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap">{fmtMoney(value)}</span>
    </div>
  );
}

function SummaryTable({
  title,
  hint,
  rows,
  labelHeader,
  showRoas,
  avatarType,
}: {
  title: string;
  hint?: string;
  rows: SummaryRow[];
  labelHeader: string;
  showRoas?: boolean;
  /** entityType สำหรับโชว์ avatar หน้าคอลัมน์ label (row.key ต้องเป็น entity id) */
  avatarType?: string;
}) {
  const maxGmv = Math.max(0, ...rows.map((r) => r.gmv));
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800">
      <div className="flex items-baseline justify-between bg-zinc-900 px-4 py-3">
        <p className="text-sm font-semibold text-amber-300">{title}</p>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      </div>
      <table className="w-full text-sm">
        <thead className="border-t border-zinc-800 bg-zinc-900/60 text-left text-xs text-zinc-500">
          <tr>
            <th className="px-4 py-2 font-medium">{labelHeader}</th>
            <th className="px-4 py-2 text-right font-medium">Views</th>
            <th className="px-4 py-2 text-right font-medium">ออเดอร์</th>
            <th className="px-4 py-2 font-medium">GMV</th>
            {showRoas && <th className="px-4 py-2 text-right font-medium">ROAS</th>}
            <th className="px-4 py-2 text-right font-medium">Entries</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="max-w-52 px-4 py-2.5" title={r.label}>
                {avatarType ? (
                  <span className="flex items-center gap-2">
                    <EntityAvatar entityType={avatarType} id={r.key} name={r.label} size="sm" />
                    <span className="truncate">{r.label}</span>
                  </span>
                ) : (
                  <span className="block truncate">{r.label}</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-zinc-300">{fmtCompact(r.views)}</td>
              <td className="px-4 py-2.5 text-right text-zinc-300">{fmtCompact(r.orders)}</td>
              <td className="px-4 py-2.5 text-zinc-300">
                <GmvBar value={r.gmv} max={maxGmv} />
              </td>
              {showRoas && (
                <td className="px-4 py-2.5 text-right text-zinc-300">
                  {r.roas === null ? "—" : r.roas.toFixed(2)}
                </td>
              )}
              <td className="px-4 py-2.5 text-right text-zinc-500">{r.count}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={showRoas ? 6 : 5} className="px-4 py-6 text-center text-sm text-zinc-600">
                ยังไม่มีข้อมูลในช่วงนี้
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── AI weekly plan (Phase 4 §28.1) ───────────────────────────

interface WeeklyPlanItem {
  platform: string;
  characterName: string;
  contentIdea: string;
  rationale: string;
}

interface WeeklyPlan {
  weekStart: string;
  days: { date: string; items: WeeklyPlanItem[] }[];
  planNotes: string;
}

const THAI_DAYS_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function fmtPlanDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${THAI_DAYS_FULL[d.getDay()]} ${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`;
}

// วันจันทร์หน้าแบบ local (YYYY-MM-DD)
function nextMonday(): string {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  return localDay(d);
}

function WeeklyPlanSection() {
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);

  useEffect(() => {
    api<{ configured: boolean }>("/ai/status")
      .then((s) => setConfigured(!!s.configured))
      .catch(() => setConfigured(false));
  }, []);

  if (!configured) return null;

  const weekStart = nextMonday();

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setPlan(await api<WeeklyPlan>("/ai/weekly-plan", {
        method: "POST",
        body: JSON.stringify({ weekStart }),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI วางแผนไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-violet-500/40 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-300">
            <Sparkles className="size-4" /> AI วางแผนคอนเทนต์สัปดาห์หน้า
          </p>
          <p className="text-xs text-zinc-500">
            AI ดู campaign ที่รันอยู่ + performance 30 วัน + คิวโพสต์ แล้วเสนอแผน 7 วัน (เริ่มจันทร์ {fmtPlanDay(weekStart)})
            — เป็นแค่ร่าง ทีมตัดสินใจเองเสมอ
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => void generate()}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-60"
        >
          {busy ? (
            <><Loader2 className="size-3.5 animate-spin" /> AI กำลังวางแผน...</>
          ) : plan ? (
            <><RotateCcw className="size-3.5" /> วางแผนใหม่</>
          ) : (
            <><Sparkles className="size-3.5" /> วางแผนสัปดาห์หน้า</>
          )}
        </button>
      </div>

      {busy && (
        <p className="text-xs text-zinc-500">
          กำลังรวบรวมข้อมูลและร่างแผน — อาจใช้เวลา 1-3 นาที อย่าเพิ่งปิดหน้านี้
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {plan && !busy && (
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            {plan.days.map((day) => (
              <div key={day.date} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="mb-2 text-xs font-semibold text-amber-300">{fmtPlanDay(day.date)}</p>
                <div className="space-y-2">
                  {day.items.map((item, i) => (
                    <div key={i} className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
                          {platformLabel(item.platform)}
                        </span>
                        <span className="text-[11px] font-semibold text-violet-300">{item.characterName}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-200">{item.contentIdea}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">เหตุผล: {item.rationale}</p>
                    </div>
                  ))}
                  {day.items.length === 0 && <p className="text-[11px] text-zinc-600">— วันพัก —</p>}
                </div>
              </div>
            ))}
          </div>
          {plan.planNotes && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-xs font-semibold text-zinc-400">โน้ตจาก AI</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-300">{plan.planNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Dashboard tab ────────────────────────────────────────────

function DashboardTab({
  setParam,
  goEntry,
}: {
  setParam: (patch: Record<string, string>) => void;
  goEntry: () => void;
}) {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") ?? "30";

  // คำนวณช่วงวันที่หลัง mount เท่านั้น — new Date()/localDay ตอน render ให้คนละวันระหว่าง
  // SSR (Railway = UTC) กับเครื่องผู้ใช้ (Bangkok) → hydration mismatch, React 19 ทิ้ง SSR tree ทั้งหน้า
  const [dates, setDates] = useState<{ dateFrom: string; dateTo: string } | null>(null);
  useEffect(() => {
    if (range === "custom") {
      setDates({
        dateFrom: searchParams.get("dateFrom") ?? "",
        dateTo: searchParams.get("dateTo") ?? "",
      });
      return;
    }
    const days = parseInt(range, 10) || 30;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setDates({ dateFrom: localDay(from), dateTo: localDay(to) });
  }, [range, searchParams]);
  const dateFrom = dates?.dateFrom ?? "";
  const dateTo = dates?.dateTo ?? "";

  const [overview, setOverview] = useState<PerformanceOverview | null>(null);
  const [byCharacter, setByCharacter] = useState<SummaryRow[]>([]);
  const [byPlatform, setByPlatform] = useState<SummaryRow[]>([]);
  const [byContent, setByContent] = useState<SummaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dates) return; // รอช่วงวันที่จริงหลัง mount ก่อน — กันยิง API ซ้ำด้วยช่วงว่าง
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    const base = qs.toString();
    Promise.all([
      api<PerformanceOverview>(`/performance/overview?${base}`),
      api<SummaryRow[]>(`/performance/summary?${base}&groupBy=character`),
      api<SummaryRow[]>(`/performance/summary?${base}&groupBy=platform`),
      api<SummaryRow[]>(`/performance/summary?${base}&groupBy=content`),
    ])
      .then(([ov, ch, pf, ct]) => {
        setOverview(ov);
        setByCharacter(ch);
        setByPlatform(pf.map((r) => ({ ...r, label: platformLabel(r.label) })));
        setByContent(ct);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [dates, dateFrom, dateTo]);

  const cards = overview
    ? [
        { label: "ยอดวิวรวม", value: fmtCompact(overview.views), sub: `ไลก์ ${fmtCompact(overview.likes)}` },
        { label: "GMV รวม", value: fmtMoney(overview.gmv), sub: `รายได้ ${fmtMoney(overview.revenue)}` },
        { label: "ออเดอร์", value: fmtCompact(overview.orders), sub: overview.topPlatform ? `แพลตฟอร์มเด่น: ${platformLabel(overview.topPlatform)}` : "" },
        { label: "จำนวน entries", value: String(overview.entryCount), sub: overview.topCharacter ? `ตัวท็อป: ${overview.topCharacter}` : "" },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* date range filter */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
        <span className="text-xs text-zinc-500">ช่วงเวลา:</span>
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setParam({ range: p.value === "30" ? "" : p.value })}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              range === p.value
                ? "bg-amber-400/10 font-medium text-amber-300"
                : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {p.label}
          </button>
        ))}
        {range === "custom" && (
          <>
            <input
              type="date"
              value={searchParams.get("dateFrom") ?? ""}
              onChange={(e) => setParam({ range: "custom", dateFrom: e.target.value })}
              className={`${selectCls} text-zinc-200`}
            />
            <span className="text-xs text-zinc-500">ถึง</span>
            <input
              type="date"
              value={searchParams.get("dateTo") ?? ""}
              onChange={(e) => setParam({ range: "custom", dateTo: e.target.value })}
              className={`${selectCls} text-zinc-200`}
            />
          </>
        )}
        <span className="ml-auto text-xs text-zinc-600">
          {dateFrom || "…"} – {dateTo || "…"}
        </span>
        {range !== "30" && (
          <button
            onClick={() => setParam({ range: "", dateFrom: "", dateTo: "" })}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ล้าง filter (1)
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* AI weekly plan */}
      <WeeklyPlanSection />

      {/* empty state */}
      {overview && overview.entryCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-16 text-center">
          <TrendingUp className="mx-auto size-8" />
          <p className="mt-3 text-sm text-zinc-300">ยังไม่มีข้อมูล performance ในช่วงเวลานี้</p>
          <p className="mt-1 text-xs text-zinc-500">
            เริ่มบันทึกตัวเลขจากแพลตฟอร์มด้วยมือ หรือนำเข้าไฟล์ CSV — ระบบจะสรุป insight ให้อัตโนมัติ
          </p>
          <button
            onClick={goEntry}
            className="mt-4 inline-flex items-center gap-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
          >
            ไปบันทึกผล <ArrowRight className="size-3.5" />
          </button>
        </div>
      ) : (
        <>
          {/* overview cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className={cardCls}>
                <p className="text-xs text-zinc-500">{c.label}</p>
                <p className="mt-1 text-2xl font-bold text-zinc-100">{c.value}</p>
                {c.sub && <p className="mt-1 truncate text-xs text-zinc-500">{c.sub}</p>}
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SummaryTable
              title="Character ไหนขายดีสุด"
              hint="เรียงตาม GMV"
              rows={byCharacter.slice(0, 10)}
              labelHeader="Character"
              showRoas
              avatarType="character"
            />
            <SummaryTable
              title="Platform ไหนเวิร์ค"
              hint="เรียงตาม GMV"
              rows={byPlatform}
              labelHeader="Platform"
              showRoas
            />
          </div>
          <SummaryTable
            title="Top Content"
            hint="คอนเทนต์/ไลฟ์ที่ทำเงินสูงสุด 10 อันดับ"
            rows={byContent.slice(0, 10)}
            labelHeader="Content"
          />
        </>
      )}
    </div>
  );
}

// ── Entry tab (บันทึกผล) ─────────────────────────────────────

function EntryTab({ setParam }: { setParam: (patch: Record<string, string>) => void }) {
  const searchParams = useSearchParams();

  const [contents, setContents] = useState<ContentItemOption[]>([]);
  const [lives, setLives] = useState<LiveSessionOption[]>([]);
  const [targetsNote, setTargetsNote] = useState<string | null>(null);

  const [targetType, setTargetType] = useState<"content" | "live">("content");
  const [targetId, setTargetId] = useState("");
  const [platform, setPlatform] = useState("");
  const [recordedAt, setRecordedAt] = useState(localDateTimeNow());
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [list, setList] = useState<PerformanceList | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // โหลดตัวเลือก content (published ก่อน — fallback ทั้งหมด) + live sessions
  useEffect(() => {
    (async () => {
      try {
        let items = asList<ContentItemOption>(
          await api<unknown>("/content-items?status=published&pageSize=100"),
        );
        if (items.length === 0) {
          items = asList<ContentItemOption>(await api<unknown>("/content-items?pageSize=100"));
        }
        setContents(items);
      } catch {
        setContents([]);
        setTargetsNote("โหลดรายการ content ไม่ได้ (โมดูล content-items อาจยังไม่พร้อม)");
      }
      try {
        setLives(asList<LiveSessionOption>(await api<unknown>("/live-sessions?pageSize=100")));
      } catch {
        setLives([]);
      }
    })();
  }, []);

  // recent entries — filter sync กับ URL
  useEffect(() => {
    const qs = new URLSearchParams();
    for (const k of [...ENTRY_FILTER_KEYS, "sortBy", "sortDir", "page"]) {
      const v = searchParams.get(k);
      if (v) qs.set(k, v);
    }
    api<PerformanceList>(`/performance${qs.toString() ? `?${qs}` : ""}`)
      .then((res) => {
        setList(res);
        setListError(null);
      })
      .catch((err) => setListError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [searchParams, reloadKey]);

  const activeFilters = useMemo(
    () => ENTRY_FILTER_KEYS.filter((k) => searchParams.get(k)).length,
    [searchParams],
  );
  const sortValue = `${searchParams.get("sortBy") ?? "recordedAt"}:${searchParams.get("sortDir") ?? "desc"}`;

  function pickTarget(type: "content" | "live", id: string) {
    setTargetType(type);
    setTargetId(id);
    const found =
      type === "content" ? contents.find((c) => c.id === id) : lives.find((l) => l.id === id);
    if (found?.platform) setPlatform(found.platform); // platform auto ตาม content
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) {
      setFormMsg({ ok: false, text: "กรุณาเลือก content หรือ live session ก่อน" });
      return;
    }
    setSaving(true);
    setFormMsg(null);
    const body: Record<string, unknown> = {
      [targetType === "content" ? "contentItemId" : "liveSessionId"]: targetId,
      platform,
      recordedAt: new Date(recordedAt).toISOString(),
    };
    for (const g of METRIC_GROUPS) {
      for (const f of g.fields) {
        const raw = (metrics[f.key] ?? "").trim();
        if (raw === "") continue;
        const n = Number(raw.replace(/,/g, ""));
        if (Number.isNaN(n)) continue;
        body[f.key] = f.float ? n : Math.round(n);
      }
    }
    try {
      await api("/performance", { method: "POST", body: JSON.stringify(body) });
      setMetrics({});
      setRecordedAt(localDateTimeNow());
      setFormMsg({ ok: true, text: "บันทึกผลเรียบร้อย" });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormMsg({ ok: false, text: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("ลบ entry นี้? (แก้ผิดลบได้ แล้วบันทึกใหม่)")) return;
    try {
      await api(`/performance/${id}`, { method: "DELETE" });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  async function handleImport() {
    if (!csvFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await uploadPerformanceCsv(csvFile);
      setImportResult(result);
      setCsvFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setReloadKey((k) => k + 1);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        {/* manual entry form */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm font-semibold text-amber-300">บันทึกผล (manual entry)</p>
          {targetsNote && <p className="text-xs text-yellow-500">{targetsNote}</p>}

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-zinc-500">
              ประเภท
              <FilterSelect
                value={targetType}
                onChange={(v) => {
                  setTargetType(v as "content" | "live");
                  setTargetId("");
                }}
                className="w-full"
                options={[
                  { value: "content", label: "Content" },
                  { value: "live", label: "Live Session" },
                ]}
              />
            </label>
            <label className="space-y-1 text-xs text-zinc-500">
              {targetType === "content" ? "เลือก content" : "เลือก live session"}
              <FilterSelect
                value={targetId}
                onChange={(v) => pickTarget(targetType, v)}
                className="w-full"
                options={[
                  { value: "", label: "— เลือก —" },
                  ...(targetType === "content" ? contents : lives).map((t) => ({
                    value: t.id,
                    label: t.title,
                  })),
                ]}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-zinc-500">
              Platform (auto ตาม content — เปลี่ยนได้)
              <FilterSelect
                value={platform}
                onChange={setPlatform}
                className="w-full"
                options={[
                  { value: "", label: "— platform —" },
                  ...PLATFORMS.map((p) => ({ value: p.value, label: p.label })),
                ]}
              />
            </label>
            <label className="space-y-1 text-xs text-zinc-500">
              บันทึกเมื่อ (recorded at)
              <input
                type="datetime-local"
                required
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
                className={`${inputCls} block w-full`}
              />
            </label>
          </div>

          {METRIC_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {g.title}
              </p>
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-4">
                {g.fields.map((f) => (
                  <label key={f.key} className="space-y-1 text-[11px] text-zinc-500">
                    {f.label}
                    <input
                      type="number"
                      min="0"
                      step={f.step ?? "1"}
                      value={metrics[f.key] ?? ""}
                      onChange={(e) => setMetrics({ ...metrics, [f.key]: e.target.value })}
                      placeholder="—"
                      className={`${inputCls} block w-full`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึกผล"}
            </button>
            {formMsg && (
              <p className={`text-sm ${formMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                {formMsg.text}
              </p>
            )}
          </div>
        </form>

        {/* CSV import zone */}
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm font-semibold text-amber-300">นำเข้า CSV</p>
          <p className="text-xs text-zinc-500">
            ดาวน์โหลด template แล้วกรอกตัวเลขจากแพลตฟอร์ม — ระบบจับคู่คอลัมน์ content_title
            กับชื่อ content ในระบบ (ต้องตรงเป๊ะ)
          </p>
          <button
            type="button"
            onClick={() => downloadCsvTemplate().catch(() => setImportError("ดาวน์โหลด template ไม่สำเร็จ"))}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <Download className="size-3.5" /> ดาวน์โหลด template
          </button>
          <div className="rounded-xl border border-dashed border-zinc-700 p-4">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200"
            />
            <button
              type="button"
              disabled={!csvFile || importing}
              onClick={handleImport}
              className="mt-3 rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {importing ? "กำลังนำเข้า..." : "นำเข้า CSV"}
            </button>
          </div>
          {importError && <p className="text-sm text-red-400">{importError}</p>}
          {importResult && (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
              <p className="inline-flex items-center gap-1 text-emerald-400">
                <Check className="size-3.5" /> นำเข้าสำเร็จ {importResult.imported} แถว
              </p>
              {importResult.errors.length > 0 && (
                <div>
                  <p className="text-red-400">แถวที่มีปัญหา ({importResult.errors.length}):</p>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-red-300/80">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>
                        บรรทัด {e.line}: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* recent entries + filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
        <FilterSelect
          value={searchParams.get("platform") ?? ""}
          onChange={(v) => setParam({ platform: v })}
          options={[
            { value: "", label: "Platform: ทั้งหมด" },
            ...PLATFORMS.map((p) => ({ value: p.value, label: p.label })),
          ]}
        />
        <FilterSelect
          value={searchParams.get("source") ?? ""}
          onChange={(v) => setParam({ source: v })}
          options={[
            { value: "", label: "ที่มา: ทั้งหมด" },
            { value: "manual", label: "manual" },
            { value: "csv", label: "csv" },
          ]}
        />
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          ตั้งแต่
          <input
            type="date"
            value={searchParams.get("recordedFrom") ?? ""}
            onChange={(e) => setParam({ recordedFrom: e.target.value })}
            className={`${selectCls} text-zinc-200`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          ถึง
          <input
            type="date"
            value={searchParams.get("recordedTo") ?? ""}
            onChange={(e) => setParam({ recordedTo: e.target.value })}
            className={`${selectCls} text-zinc-200`}
          />
        </label>
        <FilterSelect
          value={sortValue}
          onChange={(v) => {
            const [sortBy, sortDir] = v.split(":");
            setParam({ sortBy, sortDir });
          }}
          options={[
            { value: "recordedAt:desc", label: "เรียง: ล่าสุดก่อน" },
            { value: "recordedAt:asc", label: "เรียง: เก่าสุดก่อน" },
            { value: "views:desc", label: "เรียง: Views มาก→น้อย" },
            { value: "gmv:desc", label: "เรียง: GMV มาก→น้อย" },
          ]}
        />
        {activeFilters > 0 && (
          <button
            onClick={() =>
              setParam({ platform: "", source: "", recordedFrom: "", recordedTo: "", page: "" })
            }
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ล้าง filter ({activeFilters})
          </button>
        )}
      </div>

      {listError && <p className="text-sm text-red-400">{listError}</p>}

      <div className="overflow-hidden rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">บันทึกเมื่อ</th>
              <th className="px-4 py-3 font-medium">Content / Live</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 text-right font-medium">Views</th>
              <th className="px-4 py-3 text-right font-medium">ไลก์</th>
              <th className="px-4 py-3 text-right font-medium">ออเดอร์</th>
              <th className="px-4 py-3 text-right font-medium">GMV</th>
              <th className="px-4 py-3 font-medium">ที่มา</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {list?.items.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-900/50">
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-400">
                  {fmtDateTimeTh(p.recordedAt)}
                </td>
                <td className="max-w-56 px-4 py-2.5">
                  <span className="block truncate">
                    {p.liveSession ? (
                      <span className="inline-flex items-center gap-1">
                        <Radio className="size-3.5" /> {p.liveSession.title}
                      </span>
                    ) : (
                      p.contentItem?.title ?? "—"
                    )}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-400">{platformLabel(p.platform)}</td>
                <td className="px-4 py-2.5 text-right text-zinc-300">{fmtCompact(p.views)}</td>
                <td className="px-4 py-2.5 text-right text-zinc-300">{fmtCompact(p.likes)}</td>
                <td className="px-4 py-2.5 text-right text-zinc-300">{fmtCompact(p.orders)}</td>
                <td className="px-4 py-2.5 text-right text-zinc-300">{fmtMoney(p.gmv)}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      p.source === "csv"
                        ? "bg-sky-400/10 text-sky-300"
                        : "bg-zinc-700/40 text-zinc-300"
                    }`}
                  >
                    {p.source}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => handleDelete(p.id)}
                    title="ลบ (แก้ผิดลบได้)"
                    className="text-zinc-600 hover:text-red-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {list && list.items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-zinc-500">
                  ยังไม่มีข้อมูลตาม filter — กรอกฟอร์มด้านบนหรือนำเข้า CSV ได้เลย
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {list && list.total > list.pageSize && (
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <button
            disabled={list.page <= 1}
            onClick={() => setParam({ page: String(list.page - 1) })}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
          >
            <ArrowLeft className="size-3.5" /> ก่อนหน้า
          </button>
          <span>
            หน้า {list.page} / {Math.ceil(list.total / list.pageSize)}
          </span>
          <button
            disabled={list.page >= Math.ceil(list.total / list.pageSize)}
            onClick={() => setParam({ page: String(list.page + 1) })}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
          >
            ถัดไป <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}
      {list && <p className="text-xs text-zinc-500">ทั้งหมด {list.total} entries</p>}
    </div>
  );
}

// ── page shell ───────────────────────────────────────────────

function PerformanceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "entry" ? "entry" : "dashboard";

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      if (!("page" in patch)) params.delete("page");
      router.replace(`/performance${params.toString() ? `?${params}` : ""}`);
    },
    [router, searchParams],
  );

  return (
    <AppShell title="Performance">
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1 text-sm">
          {[
            { key: "dashboard", label: "Dashboard" },
            { key: "entry", label: "บันทึกผล" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setParam({ tab: t.key === "dashboard" ? "" : t.key })}
              className={`rounded-lg px-4 py-1.5 ${
                tab === t.key
                  ? "bg-amber-400/10 font-medium text-amber-300"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "dashboard" ? (
          <DashboardTab setParam={setParam} goEntry={() => setParam({ tab: "entry" })} />
        ) : (
          <EntryTab setParam={setParam} />
        )}
      </div>
    </AppShell>
  );
}

export default function PerformancePage() {
  return (
    <Suspense fallback={null}>
      <PerformanceInner />
    </Suspense>
  );
}
