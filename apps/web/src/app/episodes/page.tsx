"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Clapperboard, Drama, Target, Tv, User } from "lucide-react";
import AppShell from "@/components/AppShell";
import CoverImage from "@/components/CoverImage";
import CoverPicker from "@/components/CoverPicker";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";
import {
  EPISODE_SORT_OPTIONS,
  EPISODE_STATUS_LABEL,
  type EpisodeList,
  type EpisodeListItem,
  type EpisodeStatus,
  type Series,
  type SeriesList,
} from "@/lib/production";

const STATUS_OPTIONS = Object.entries(EPISODE_STATUS_LABEL).map(([value, v]) => ({
  value,
  label: v.label,
}));

// สีขอบซ้ายของการ์ดตาม status — ให้กวาดตาแล้วรู้สถานะทันทีโดยไม่ต้องอ่าน
const STATUS_EDGE: Record<EpisodeStatus, string> = {
  idea: "border-l-zinc-600",
  script_draft: "border-l-sky-500",
  script_review: "border-l-blue-500",
  script_approved: "border-l-emerald-500",
  shot_breakdown: "border-l-violet-500",
  production: "border-l-amber-400",
  edited: "border-l-teal-500",
  published: "border-l-green-500",
  archived: "border-l-zinc-800",
};

interface Filters {
  q: string;
  status: string;
  seriesId: string;
  season: string;
  sortBy: string;
  sortDir: string;
  page: number;
}

const DEFAULT_FILTERS: Filters = {
  q: "",
  status: "",
  seriesId: "",
  season: "",
  sortBy: "updatedAt",
  sortDir: "desc",
  page: 1,
};

// thumbnail ตอน + ปุ่มเปลี่ยนปก (state override ในตัว โชว์รูปใหม่ทันที)
function EpisodeCoverThumb({ id, title }: { id: string; title: string }) {
  const [override, setOverride] = useState<string | null>(null);
  return (
    <CoverImage
      assetId={override ?? undefined}
      entityType="episode"
      entityId={id}
      name={title}
      aspect="aspect-square"
      className="w-20 shrink-0 rounded-xl"
    >
      <div className="absolute inset-x-0 bottom-0" onClick={(e) => e.stopPropagation()}>
        <CoverPicker
          entityType="episode"
          entityId={id}
          name={title}
          assetType="episode_cover"
          onChanged={setOverride}
          triggerClass="block w-full bg-black/75 py-0.5 text-center text-[9px] font-medium text-zinc-100 hover:bg-black/90"
          triggerLabel="ปก"
        />
      </div>
    </CoverImage>
  );
}

function filtersFromParams(sp: URLSearchParams): Filters {
  return {
    q: sp.get("q") ?? "",
    status: sp.get("status") ?? "",
    seriesId: sp.get("seriesId") ?? "",
    season: sp.get("season") ?? "",
    sortBy: sp.get("sortBy") ?? "updatedAt",
    sortDir: sp.get("sortDir") ?? "desc",
    page: parseInt(sp.get("page") ?? "1", 10) || 1,
  };
}

function EpisodesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(new URLSearchParams(searchParams.toString())));
  const [qInput, setQInput] = useState(filters.q);
  const [data, setData] = useState<EpisodeList | null>(null);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", seriesId: "", season: "", episodeNumber: "", logline: "" });
  const [newSeriesName, setNewSeriesName] = useState("");
  const [showNewSeries, setShowNewSeries] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL sync — filters → query string
  const syncUrl = useCallback(
    (f: Filters) => {
      const sp = new URLSearchParams();
      if (f.q) sp.set("q", f.q);
      if (f.status) sp.set("status", f.status);
      if (f.seriesId) sp.set("seriesId", f.seriesId);
      if (f.season) sp.set("season", f.season);
      if (f.sortBy !== "updatedAt") sp.set("sortBy", f.sortBy);
      if (f.sortDir !== "desc") sp.set("sortDir", f.sortDir);
      if (f.page > 1) sp.set("page", String(f.page));
      router.replace(`/episodes${sp.size ? `?${sp.toString()}` : ""}`, { scroll: false });
    },
    [router],
  );

  const applyFilters = useCallback(
    (patch: Partial<Filters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch, page: patch.page ?? 1 };
        syncUrl(next);
        return next;
      });
    },
    [syncUrl],
  );

  // debounced search
  const onSearchChange = (value: string) => {
    setQInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters({ q: value }), 400);
  };

  const load = useCallback(async (f: Filters) => {
    try {
      const sp = new URLSearchParams();
      if (f.q) sp.set("q", f.q);
      if (f.status) sp.set("status", f.status);
      if (f.seriesId) sp.set("seriesId", f.seriesId);
      if (f.season) sp.set("season", f.season);
      sp.set("sortBy", f.sortBy);
      sp.set("sortDir", f.sortDir);
      sp.set("page", String(f.page));
      const res = await api<EpisodeList>(`/episodes?${sp.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<SeriesList>("/series?status=active").then((r) => setSeriesList(r.items)).catch(() => {});
  }, [router]);

  useEffect(() => {
    load(filters);
  }, [filters, load]);

  const activeFilterCount = useMemo(
    () =>
      [filters.q, filters.status, filters.seriesId, filters.season].filter(Boolean).length +
      (filters.sortBy !== "updatedAt" || filters.sortDir !== "desc" ? 1 : 0),
    [filters],
  );

  function clearFilters() {
    setQInput("");
    setFilters(DEFAULT_FILTERS);
    syncUrl(DEFAULT_FILTERS);
  }

  async function quickCreateSeries() {
    if (!newSeriesName.trim()) return;
    try {
      const s = await api<Series>("/series", {
        method: "POST",
        body: JSON.stringify({ name: newSeriesName.trim() }),
      });
      setSeriesList((prev) => [s, ...prev]);
      setForm((f) => ({ ...f, seriesId: s.id }));
      setNewSeriesName("");
      setShowNewSeries(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง series ไม่สำเร็จ");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/episodes", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          seriesId: form.seriesId || undefined,
          season: form.season || undefined,
          episodeNumber: form.episodeNumber ? parseInt(form.episodeNumber, 10) : undefined,
          logline: form.logline || undefined,
        }),
      });
      setForm({ title: "", seriesId: "", season: "", episodeNumber: "", logline: "" });
      setShowForm(false);
      router.push(`/episodes/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400";

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={qInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="ค้นหาชื่อตอน / รหัส / logline..."
          className={`w-64 ${inputCls}`}
        />
        <FilterSelect
          value={filters.status}
          onChange={(v) => applyFilters({ status: v })}
          options={[
            { value: "", label: "ทุก status" },
            ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />
        <FilterSelect
          value={filters.seriesId}
          onChange={(v) => applyFilters({ seriesId: v })}
          options={[
            { value: "", label: "ทุก series" },
            ...seriesList.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <input
          value={filters.season}
          onChange={(e) => applyFilters({ season: e.target.value })}
          placeholder="Season"
          className={`w-24 ${inputCls}`}
        />
        <FilterSelect
          value={`${filters.sortBy}:${filters.sortDir}`}
          onChange={(v) => {
            const [sortBy, sortDir] = v.split(":");
            applyFilters({ sortBy, sortDir });
          }}
          options={EPISODE_SORT_OPTIONS.flatMap((o) => [
            { v: `${o.value}:desc`, label: `${o.label} ↓` },
            { v: `${o.value}:asc`, label: `${o.label} ↑` },
          ]).map((o) => ({ value: o.v, label: o.label }))}
        />
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ล้าง filter ({activeFilterCount})
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + สร้าง Episode
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="ชื่อตอน *"
              className={`${inputCls} bg-zinc-800`}
            />
            <div className="flex gap-2">
              <FilterSelect
                value={form.seriesId}
                onChange={(v) => setForm({ ...form, seriesId: v })}
                options={[
                  { value: "", label: "— ไม่ระบุ series —" },
                  ...seriesList.map((s) => ({ value: s.id, label: s.name })),
                ]}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setShowNewSeries((v) => !v)}
                className="rounded-lg border border-zinc-700 px-3 text-sm text-zinc-300 hover:bg-zinc-800"
                title="สร้าง series ใหม่"
              >
                +
              </button>
            </div>
          </div>
          {showNewSeries && (
            <div className="flex gap-2">
              <input
                value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)}
                placeholder="ชื่อ series ใหม่"
                className={`flex-1 ${inputCls} bg-zinc-800`}
              />
              <button
                type="button"
                onClick={quickCreateSeries}
                className="rounded-lg border border-amber-400/60 px-4 text-sm text-amber-300 hover:bg-amber-400/10"
              >
                สร้าง series
              </button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <input
              value={form.season}
              onChange={(e) => setForm({ ...form, season: e.target.value })}
              placeholder="Season เช่น S01"
              className={`${inputCls} bg-zinc-800`}
            />
            <input
              type="number"
              min={1}
              value={form.episodeNumber}
              onChange={(e) => setForm({ ...form, episodeNumber: e.target.value })}
              placeholder="EP Number"
              className={`${inputCls} bg-zinc-800`}
            />
          </div>
          <input
            value={form.logline}
            onChange={(e) => setForm({ ...form, logline: e.target.value })}
            placeholder="Logline — เรื่องย่อหนึ่งบรรทัด"
            className={`w-full ${inputCls} bg-zinc-800`}
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? "กำลังสร้าง..." : "สร้าง Episode"}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Episode cards — thumbnail + ขอบสีตาม status + progress ของ shots */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((ep: EpisodeListItem) => {
          const st = EPISODE_STATUS_LABEL[ep.status] ?? EPISODE_STATUS_LABEL.idea;
          const edge = STATUS_EDGE[ep.status] ?? STATUS_EDGE.idea;
          const shotPct =
            ep.shotCounts.total > 0
              ? Math.round((ep.shotCounts.approved / ep.shotCounts.total) * 100)
              : 0;
          return (
            <div
              key={ep.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/episodes/${ep.id}`)}
              className={`flex cursor-pointer gap-3 overflow-hidden rounded-2xl border border-zinc-800 border-l-4 ${edge} bg-zinc-900 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-zinc-600 hover:shadow-lg hover:shadow-black/40`}
            >
              <EpisodeCoverThumb id={ep.id} title={ep.title} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[10px] text-amber-300">{ep.displayCode}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}>
                    {st.label}
                  </span>
                </div>
                <p className="truncate text-sm font-semibold text-zinc-100">{ep.title}</p>
                {ep.logline && <p className="truncate text-xs text-zinc-500">{ep.logline}</p>}
                <p className="flex flex-wrap gap-x-2 text-[11px] text-zinc-500">
                  {ep.series && (
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <Tv className="size-4 shrink-0" /> {ep.series.name}
                      {ep.season ? ` ${ep.season}` : ""}
                      {ep.episodeNumber ? ` EP${ep.episodeNumber}` : ""}
                    </span>
                  )}
                  {ep.campaign && (
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <Target className="size-4 shrink-0" /> {ep.campaign.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Drama className="size-4 shrink-0" /> {ep.characterCount} ตัวละคร
                  </span>
                  {ep.owner && (
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <User className="size-4 shrink-0" /> {ep.owner.name}
                    </span>
                  )}
                </p>
                {ep.shotCounts.total > 0 && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${Math.max(2, shotPct)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[10px] text-zinc-500">
                      {ep.shotCounts.approved}/{ep.shotCounts.total} shots
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {data && data.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-14 text-center text-zinc-500">
          <Clapperboard className="mx-auto size-8 text-zinc-600" />
          <p className="mt-2 text-sm">ไม่พบ episode ตาม filter — ลองล้าง filter หรือสร้างตอนใหม่</p>
        </div>
      )}

      {/* Pagination */}
      {data && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>ทั้งหมด {data.total} ตอน · หน้า {data.page}/{totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={filters.page <= 1}
              onClick={() => applyFilters({ page: filters.page - 1 })}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 disabled:opacity-40 hover:bg-zinc-800"
            >
              <ArrowLeft className="size-4" /> ก่อนหน้า
            </button>
            <button
              disabled={filters.page >= totalPages}
              onClick={() => applyFilters({ page: filters.page + 1 })}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 disabled:opacity-40 hover:bg-zinc-800"
            >
              ถัดไป <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EpisodesPage() {
  return (
    <AppShell title="Episodes & Shots">
      <Suspense fallback={<p className="text-sm text-zinc-500">กำลังโหลด...</p>}>
        <EpisodesContent />
      </Suspense>
    </AppShell>
  );
}
