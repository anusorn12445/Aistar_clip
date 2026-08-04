"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import CoverImage from "@/components/CoverImage";
import CoverPicker from "@/components/CoverPicker";
import { useEntityThumb } from "@/lib/media";
import { api, getToken } from "@/lib/api";
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUS,
  CampaignListItem,
  Paged,
  fmtDate,
} from "@/lib/catalog";
import { FilterSelect } from "@/components/ui/filter-select";
import { X, ArrowLeft, ArrowRight, ShoppingBag, Clapperboard, Calendar } from "lucide-react";

const FILTER_KEYS = ["q", "status", "objective", "startFrom", "startTo"] as const;

const SORT_OPTIONS = [
  { value: "updatedAt:desc", label: "อัปเดตล่าสุด" },
  { value: "startDate:desc", label: "เริ่มล่าสุด" },
  { value: "startDate:asc", label: "เริ่มเก่าสุด" },
  { value: "name:asc", label: "ชื่อ ก→ฮ" },
  { value: "status:asc", label: "Status" },
];

const emptyKpiRow = { key: "", value: "" };

function CampaignsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Paged<CampaignListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    clientBrand: "",
    objective: "",
    startDate: "",
    endDate: "",
  });
  const [kpiRows, setKpiRows] = useState<{ key: string; value: string }[]>([{ ...emptyKpiRow }]);
  const [saving, setSaving] = useState(false);

  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      if (!("page" in patch)) params.delete("page");
      router.replace(`/campaigns${params.toString() ? `?${params}` : ""}`);
    },
    [router, searchParams],
  );

  function onSearchChange(value: string) {
    setQInput(value);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => setParam({ q: value }), 400);
  }

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  useEffect(() => {
    const query = searchParams.toString();
    api<Paged<CampaignListItem>>(`/campaigns${query ? `?${query}` : ""}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [searchParams]);

  const activeFilters = useMemo(
    () => FILTER_KEYS.filter((k) => searchParams.get(k)).length,
    [searchParams],
  );
  const sortValue = `${searchParams.get("sortBy") ?? "updatedAt"}:${searchParams.get("sortDir") ?? "desc"}`;

  function clearFilters() {
    setQInput("");
    router.replace("/campaigns");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const targetKpi: Record<string, unknown> = {};
    for (const row of kpiRows) {
      const k = row.key.trim();
      if (!k) continue;
      const num = parseFloat(row.value);
      targetKpi[k] = row.value !== "" && !Number.isNaN(num) && String(num) === row.value.trim() ? num : row.value;
    }
    try {
      const created = await api<{ id: string }>("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          clientBrand: form.clientBrand || undefined,
          objective: form.objective || undefined,
          startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
          endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
          targetKpi: Object.keys(targetKpi).length ? targetKpi : undefined,
        }),
      });
      setShowForm(false);
      setForm({ name: "", clientBrand: "", objective: "", startDate: "", endDate: "" });
      setKpiRows([{ ...emptyKpiRow }]);
      router.push(`/campaigns/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างแคมเปญไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const selectCls =
    "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm outline-none focus:border-amber-400";
  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

  return (
    <AppShell
      title="Campaigns"
      actions={
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + แคมเปญใหม่
        </button>
      }
    >
      <div className="space-y-4">
        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <input
            value={qInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัส / แบรนด์ลูกค้า..."
            className={`${inputCls} w-60 bg-zinc-900`}
          />
          <FilterSelect
            value={searchParams.get("status") ?? ""}
            onChange={(v) => setParam({ status: v })}
            options={[
              { value: "", label: "Status: ทั้งหมด" },
              ...Object.entries(CAMPAIGN_STATUS).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
          <FilterSelect
            value={searchParams.get("objective") ?? ""}
            onChange={(v) => setParam({ objective: v })}
            options={[
              { value: "", label: "Objective: ทั้งหมด" },
              ...CAMPAIGN_OBJECTIVES.map((o) => ({ value: o.value, label: o.label })),
            ]}
          />
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            เริ่มตั้งแต่
            <input
              type="date"
              value={searchParams.get("startFrom") ?? ""}
              onChange={(e) => setParam({ startFrom: e.target.value })}
              className={`${selectCls} text-zinc-200`}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            ถึง
            <input
              type="date"
              value={searchParams.get("startTo") ?? ""}
              onChange={(e) => setParam({ startTo: e.target.value })}
              className={`${selectCls} text-zinc-200`}
            />
          </label>
          <FilterSelect
            value={sortValue}
            onChange={(v) => {
              const [sortBy, sortDir] = v.split(":");
              setParam({ sortBy, sortDir });
            }}
            options={SORT_OPTIONS.map((s) => ({ value: s.value, label: `เรียง: ${s.label}` }))}
          />
          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              ล้าง filter ({activeFilters})
            </button>
          )}
        </div>

        {/* create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm font-semibold text-amber-300">แคมเปญใหม่</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ชื่อแคมเปญ *"
                className={inputCls}
              />
              <input
                value={form.clientBrand}
                onChange={(e) => setForm({ ...form, clientBrand: e.target.value })}
                placeholder="แบรนด์ลูกค้า"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FilterSelect
                value={form.objective}
                onChange={(v) => setForm({ ...form, objective: v })}
                options={[
                  { value: "", label: "— Objective —" },
                  ...CAMPAIGN_OBJECTIVES.map((o) => ({ value: o.value, label: o.label })),
                ]}
              />
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className={inputCls}
              />
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={inputCls}
              />
            </div>
            {/* targetKpi key-value rows → Json */}
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">Target KPI (เช่น views = 1000000, gmv = 500000)</p>
              {kpiRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={row.key}
                    onChange={(e) =>
                      setKpiRows(kpiRows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))
                    }
                    placeholder="ชื่อ KPI"
                    className={`${inputCls} w-48`}
                  />
                  <input
                    value={row.value}
                    onChange={(e) =>
                      setKpiRows(kpiRows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                    }
                    placeholder="เป้า"
                    className={`${inputCls} w-40`}
                  />
                  <button
                    type="button"
                    onClick={() => setKpiRows(kpiRows.filter((_, j) => j !== i))}
                    className="text-zinc-500 hover:text-red-300"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setKpiRows([...kpiRows, { ...emptyKpiRow }])}
                className="rounded-lg border border-dashed border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
              >
                + เพิ่ม KPI
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "กำลังสร้าง..." : "สร้างแคมเปญ"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-sm text-zinc-500 hover:text-zinc-300"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* card grid — ภาพ hero: ปกแคมเปญ (ถ้าอัปโหลด) → รูปตัวละครหลัก → gradient */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((c) => (
            <CampaignCard key={c.id} c={c} onClick={() => router.push(`/campaigns/${c.id}`)} />
          ))}
        </div>
        {data && data.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-12 text-center text-sm text-zinc-500">
            ยังไม่มีแคมเปญตาม filter — ลองล้าง filter หรือกด &ldquo;+ แคมเปญใหม่&rdquo;
          </div>
        )}

        {/* pagination */}
        {data && data.total > data.pageSize && (
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <button
              disabled={data.page <= 1}
              onClick={() => setParam({ page: String(data.page - 1) })}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
            >
              <ArrowLeft className="size-4" /> ก่อนหน้า
            </button>
            <span>
              หน้า {data.page} / {Math.ceil(data.total / data.pageSize)}
            </span>
            <button
              disabled={data.page >= Math.ceil(data.total / data.pageSize)}
              onClick={() => setParam({ page: String(data.page + 1) })}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
            >
              ถัดไป <ArrowRight className="size-4" />
            </button>
          </div>
        )}
        {data && <p className="text-xs text-zinc-500">ทั้งหมด {data.total} แคมเปญ</p>}
      </div>
    </AppShell>
  );
}

function CampaignCard({ c, onClick }: { c: CampaignListItem; onClick: () => void }) {
  const st = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.brief;
  const obj = CAMPAIGN_OBJECTIVES.find((o) => o.value === c.objective);
  // hero: ปกที่อัปโหลดเอง (entityType campaign) มาก่อน ถ้าไม่มีใช้รูปตัวละครตัวแรก
  const coverAsset = useEntityThumb("campaign", c.id);
  const charAsset = useEntityThumb("character", coverAsset ? null : (c.characters[0]?.id ?? null));
  const [coverOverride, setCoverOverride] = useState<string | null>(null);
  const hero = coverOverride ?? coverAsset ?? charAsset;

  return (
    <div
      onClick={onClick}
      className="cursor-pointer overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:-translate-y-0.5 hover:border-zinc-600"
    >
      <CoverImage assetId={hero} entityType="campaign" name={c.name} aspect="aspect-video">
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="rounded bg-zinc-950/70 px-2 py-0.5 font-mono text-[10px] text-amber-300">
            {c.displayCode}
          </span>
          <span className={`rounded-full px-2 py-1 text-xs ${st.cls}`}>{st.label}</span>
        </div>
        <div
          className="absolute right-2 top-10 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <CoverPicker
            entityType="campaign"
            entityId={c.id}
            name={c.name}
            assetType="campaign_cover"
            onChanged={setCoverOverride}
            triggerClass="rounded-lg bg-zinc-950/75 px-2 py-1 text-[11px] text-zinc-100 hover:bg-zinc-950"
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/60 to-transparent p-3 pt-10">
          <p className="truncate text-base font-semibold text-white">{c.name}</p>
          <p className="text-xs text-zinc-300">
            {c.clientBrand ? `${c.clientBrand} · ` : ""}
            {obj?.label ?? "ยังไม่กำหนด objective"}
          </p>
        </div>
      </CoverImage>
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex -space-x-1.5">
          {c.characters.slice(0, 4).map((ch) => (
            <EntityAvatar
              key={ch.id}
              entityType="character"
              id={ch.id}
              name={ch.nameTh}
              size="sm"
              title={`${ch.nameTh} (${ch.displayCode})`}
              className="ring-2 ring-zinc-900"
            />
          ))}
          {c.characters.length > 4 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-900 bg-zinc-800 text-[10px] text-zinc-400">
              +{c.characters.length - 4}
            </span>
          )}
          {c.characters.length === 0 && (
            <span className="text-xs text-zinc-600">ยังไม่มีตัวละคร</span>
          )}
        </div>
        <div className="text-right text-[11px] leading-4 text-zinc-500">
          <p className="flex items-center justify-end gap-1">
            <ShoppingBag className="size-3.5" /> {c.products.length} · <Clapperboard className="size-3.5" /> {c.counts.episodes} · <Calendar className="size-3.5" /> {c.counts.contents}
          </p>
          <p>
            {fmtDate(c.startDate)} – {fmtDate(c.endDate)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={null}>
      <CampaignsInner />
    </Suspense>
  );
}
