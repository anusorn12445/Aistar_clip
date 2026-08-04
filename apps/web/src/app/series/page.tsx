"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { api, getToken } from "@/lib/api";
import { EPISODE_STATUS_LABEL } from "@/lib/production";
import { seriesStatusMeta, type SeriesListItem, type SeriesListResponse } from "@/lib/series";
import SeriesCover from "./SeriesCover";
import { FilterSelect } from "@/components/ui/filter-select";
import { Clapperboard, Tv } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "active", label: "ออนแอร์" },
  { value: "hiatus", label: "พักออนแอร์" },
  { value: "completed", label: "จบแล้ว" },
];

const SORT_OPTIONS = [
  { value: "updatedAt", label: "อัปเดตล่าสุด" },
  { value: "name", label: "ชื่อเรื่อง ก-ฮ" },
];

interface Filters {
  q: string;
  status: string;
  sortBy: string;
}

const DEFAULT_FILTERS: Filters = { q: "", status: "", sortBy: "updatedAt" };

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400";

function SeriesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({
    q: searchParams.get("q") ?? "",
    status: searchParams.get("status") ?? "",
    sortBy: searchParams.get("sortBy") ?? "updatedAt",
  }));
  const [qInput, setQInput] = useState(filters.q);
  const [data, setData] = useState<SeriesListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", universe: "", premise: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncUrl = useCallback(
    (f: Filters) => {
      const sp = new URLSearchParams();
      if (f.q) sp.set("q", f.q);
      if (f.status) sp.set("status", f.status);
      if (f.sortBy !== "updatedAt") sp.set("sortBy", f.sortBy);
      router.replace(`/series${sp.size ? `?${sp.toString()}` : ""}`, { scroll: false });
    },
    [router],
  );

  const applyFilters = useCallback(
    (patch: Partial<Filters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        syncUrl(next);
        return next;
      });
    },
    [syncUrl],
  );

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
      sp.set("sortBy", f.sortBy);
      const res = await api<SeriesListResponse>(`/series?${sp.toString()}`);
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
  }, [router]);

  useEffect(() => {
    load(filters);
  }, [filters, load]);

  const activeFilterCount = useMemo(
    () => [filters.q, filters.status].filter(Boolean).length + (filters.sortBy !== "updatedAt" ? 1 : 0),
    [filters],
  );

  function clearFilters() {
    setQInput("");
    setFilters(DEFAULT_FILTERS);
    syncUrl(DEFAULT_FILTERS);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/series", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          universe: form.universe.trim() || undefined,
          premise: form.premise.trim() || undefined,
        }),
      });
      setForm({ name: "", universe: "", premise: "" });
      setShowForm(false);
      router.push(`/series/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างซีรีส์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={qInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="ค้นหาชื่อเรื่อง / premise / จักรวาล..."
          className={`w-72 ${inputCls}`}
        />
        <FilterSelect
          value={filters.status}
          onChange={(v) => applyFilters({ status: v })}
          options={[
            { value: "", label: "ทุกสถานะ" },
            ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />
        <FilterSelect
          value={filters.sortBy}
          onChange={(v) => applyFilters({ sortBy: v })}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
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
          + สร้างซีรีส์
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="grid gap-3 lg:grid-cols-2">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ชื่อซีรีส์ *"
              className={`${inputCls} bg-zinc-800`}
            />
            <input
              value={form.universe}
              onChange={(e) => setForm({ ...form, universe: e.target.value })}
              placeholder="จักรวาล (universe) เช่น AISTAR-VERSE"
              className={`${inputCls} bg-zinc-800`}
            />
          </div>
          <textarea
            value={form.premise}
            onChange={(e) => setForm({ ...form, premise: e.target.value })}
            rows={2}
            placeholder="Premise — โครงเรื่องหลักของทั้งซีรีส์ (เล่าสั้น ๆ ว่าเรื่องนี้เกี่ยวกับอะไร)"
            className={`w-full resize-y ${inputCls} bg-zinc-800`}
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? "กำลังสร้าง..." : "สร้างซีรีส์"}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Card grid */}
      {data && data.items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((s: SeriesListItem) => {
            const st = seriesStatusMeta(s.status);
            const epCount = s.episodeCount ?? s._count?.episodes ?? 0;
            const seasonCount = s.seasonCount ?? 0;
            const latest = s.latestEpisode;
            const latestStatus = latest
              ? EPISODE_STATUS_LABEL[latest.status as keyof typeof EPISODE_STATUS_LABEL]
              : null;
            return (
              <Link
                key={s.id}
                href={`/series/${s.id}`}
                className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 transition hover:border-amber-400/40 hover:bg-zinc-900"
              >
                <div className="relative h-36 overflow-hidden">
                  <SeriesCover coverAssetId={s.coverAssetId} name={s.name} className="h-full w-full" />
                  <span
                    className={`absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-2 py-1 text-xs ${st.cls}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold group-hover:text-amber-300">{s.name}</h3>
                    {s.universe && (
                      <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                        {s.universe}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 min-h-8 text-xs text-zinc-500">
                    {s.premise ?? s.description ?? "ยังไม่มี premise — เข้าไปเติมโครงเรื่องหลักได้"}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span className="inline-flex items-center gap-1"><Clapperboard className="size-3.5" /> {epCount} ตอน</span>
                    <span>{seasonCount} ซีซัน</span>
                    {latest && latestStatus && (
                      <span className="truncate text-zinc-500">
                        ล่าสุด {latest.displayCode} · {latestStatus.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    {(s.castPreview ?? []).map((c) => (
                      <span
                        key={c.id}
                        title={c.nameTh}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-amber-300 ring-1 ring-zinc-700"
                      >
                        {c.nameTh.slice(0, 2)}
                      </span>
                    ))}
                    {(s.castPreview ?? []).length === 0 && (
                      <span className="text-[11px] text-zinc-600">ยังไม่มีนักแสดงประจำ</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Empty states */}
      {data && data.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-16 text-center">
          {activeFilterCount > 0 ? (
            <>
              <p className="text-zinc-400">ไม่พบซีรีส์ตาม filter</p>
              <button onClick={clearFilters} className="mt-3 text-sm text-amber-300 hover:underline">
                ล้าง filter แล้วดูทั้งหมด
              </button>
            </>
          ) : (
            <>
              <p className="text-4xl"><Tv className="inline size-9" /></p>
              <p className="mt-3 text-zinc-300">ยังไม่มีซีรีส์ในระบบ</p>
              <p className="mt-1 text-sm text-zinc-500">
                Series Hub คือศูนย์บัญชาการของ AI Short Drama — สร้างซีรีส์แรกเพื่อเริ่มวางซีซัน นักแสดง และ bible
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
              >
                + สร้างซีรีส์แรก
              </button>
            </>
          )}
        </div>
      )}

      {!data && !error && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}

      {data && data.items.length > 0 && (
        <p className="text-xs text-zinc-500">ทั้งหมด {data.total} เรื่อง</p>
      )}
    </div>
  );
}

export default function SeriesPage() {
  return (
    <AppShell title="Series Hub">
      <Suspense fallback={<p className="text-sm text-zinc-500">กำลังโหลด...</p>}>
        <SeriesContent />
      </Suspense>
    </AppShell>
  );
}
