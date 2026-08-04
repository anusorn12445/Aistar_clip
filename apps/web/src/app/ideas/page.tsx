"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArrowLeft, ArrowRight, ChevronDown, Clapperboard, Lightbulb, Link, Sparkles } from "lucide-react";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";
import {
  IDEA_NEXT,
  IDEA_STATUS,
  IDEA_TYPES,
  Idea,
  Paged,
  fmtDateTime,
} from "@/lib/intelligence";

const FILTER_KEYS = ["q", "ideaType", "status", "createdBy", "dateFrom", "dateTo"] as const;

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "ใหม่ล่าสุด" },
  { value: "createdAt:asc", label: "เก่าสุด" },
  { value: "title:asc", label: "ชื่อ ก→ฮ" },
  { value: "status:asc", label: "Status" },
];

function IdeasInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Paged<Idea> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // quick-add bar
  const [quick, setQuick] = useState({ title: "", ideaType: "", url: "" });
  const [saving, setSaving] = useState(false);

  // per-card state
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState<string | null>(null);
  const [cardError, setCardError] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);

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
      router.replace(`/ideas${params.toString() ? `?${params}` : ""}`);
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
    api<Paged<Idea>>(`/ideas${query ? `?${query}` : ""}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [searchParams, reloadKey]);

  const activeFilters = useMemo(
    () => FILTER_KEYS.filter((k) => searchParams.get(k)).length,
    [searchParams],
  );
  const sortValue = `${searchParams.get("sortBy") ?? "createdAt"}:${searchParams.get("sortDir") ?? "desc"}`;

  function clearFilters() {
    setQInput("");
    router.replace("/ideas");
  }

  function reload() {
    setReloadKey((k) => k + 1);
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quick.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api("/ideas", {
        method: "POST",
        body: JSON.stringify({
          title: quick.title.trim(),
          ideaType: quick.ideaType || undefined,
          url: quick.url.trim() || undefined,
        }),
      });
      setQuick({ title: "", ideaType: "", url: "" });
      setFlash("เก็บไอเดียแล้ว");
      setTimeout(() => setFlash(null), 2500);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไอเดียไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleAiAssist(idea: Idea) {
    setAiBusy(idea.id);
    setCardError((m) => ({ ...m, [idea.id]: "" }));
    try {
      await api(`/ideas/${idea.id}/ai-assist`, { method: "POST", body: JSON.stringify({}) });
      setExpanded(idea.id);
      reload();
    } catch (err) {
      setCardError((m) => ({
        ...m,
        [idea.id]: err instanceof Error ? err.message : "AI assist ไม่สำเร็จ",
      }));
    } finally {
      setAiBusy(null);
    }
  }

  async function handleStatus(idea: Idea, status: string) {
    setCardError((m) => ({ ...m, [idea.id]: "" }));
    try {
      await api(`/ideas/${idea.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      reload();
    } catch (err) {
      setCardError((m) => ({
        ...m,
        [idea.id]: err instanceof Error ? err.message : "เปลี่ยน status ไม่สำเร็จ",
      }));
    }
  }

  async function handleConvert(idea: Idea, to: "campaign" | "episode") {
    setConvertOpen(null);
    setCardError((m) => ({ ...m, [idea.id]: "" }));
    try {
      const res = await api<{ entity: { displayCode: string } }>(`/ideas/${idea.id}/convert`, {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      setFlash(`Convert เป็น ${to === "campaign" ? "Campaign" : "Episode"} ${res.entity.displayCode} แล้ว`);
      setTimeout(() => setFlash(null), 4000);
      reload();
    } catch (err) {
      setCardError((m) => ({
        ...m,
        [idea.id]: err instanceof Error ? err.message : "convert ไม่สำเร็จ",
      }));
    }
  }

  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";
  const selectCls =
    "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm outline-none focus:border-amber-400";

  return (
    <AppShell title="Idea Library">
      <div className="space-y-4">
        {/* quick-add bar — Enter = save, มือถือ friendly */}
        <form
          onSubmit={handleQuickAdd}
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/30 bg-zinc-900 p-3"
        >
          <Lightbulb className="size-4" />
          <input
            value={quick.title}
            onChange={(e) => setQuick({ ...quick, title: e.target.value })}
            placeholder="เจอไอเดียอะไรมา? พิมพ์แล้วกด Enter เก็บเลย..."
            className={`${inputCls} min-w-40 flex-1`}
          />
          <FilterSelect
            value={quick.ideaType}
            onChange={(v) => setQuick({ ...quick, ideaType: v })}
            options={[
              { value: "", label: "— ประเภท —" },
              ...Object.entries(IDEA_TYPES).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
          <input
            value={quick.url}
            onChange={(e) => setQuick({ ...quick, url: e.target.value })}
            placeholder="วาง URL (ถ้ามี)"
            className={`${inputCls} w-48`}
          />
          <button
            type="submit"
            disabled={saving || !quick.title.trim()}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? "กำลังเก็บ..." : "+ เก็บไอเดีย"}
          </button>
        </form>

        {flash && (
          <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
            {flash}
          </p>
        )}

        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <input
            value={qInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาชื่อ / โน้ต..."
            className={`${inputCls} w-56 bg-zinc-900`}
          />
          <FilterSelect
            value={searchParams.get("ideaType") ?? ""}
            onChange={(v) => setParam({ ideaType: v })}
            options={[
              { value: "", label: "ประเภท: ทั้งหมด" },
              ...Object.entries(IDEA_TYPES).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
          <FilterSelect
            value={searchParams.get("status") ?? ""}
            onChange={(v) => setParam({ status: v })}
            options={[
              { value: "", label: "Status: ทั้งหมด (ยกเว้น archive)" },
              ...Object.entries(IDEA_STATUS).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
          <button
            onClick={() => setParam({ createdBy: searchParams.get("createdBy") === "me" ? "" : "me" })}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              searchParams.get("createdBy") === "me"
                ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            ของฉัน
          </button>
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            ตั้งแต่
            <input
              type="date"
              value={searchParams.get("dateFrom") ?? ""}
              onChange={(e) => setParam({ dateFrom: e.target.value })}
              className={`${selectCls} text-zinc-200`}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            ถึง
            <input
              type="date"
              value={searchParams.get("dateTo") ?? ""}
              onChange={(e) => setParam({ dateTo: e.target.value })}
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

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* card grid */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((idea) => {
            const type = idea.ideaType ? IDEA_TYPES[idea.ideaType] : null;
            const st = IDEA_STATUS[idea.status] ?? IDEA_STATUS.captured;
            const next = IDEA_NEXT[idea.status];
            const isExpanded = expanded === idea.id;
            return (
              <div
                key={idea.id}
                className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-snug">{idea.title}</p>
                  {idea.url && (
                    <a
                      href={idea.url}
                      target="_blank"
                      rel="noreferrer"
                      title={idea.url}
                      className="shrink-0 text-zinc-500 hover:text-amber-300"
                    >
                      <Link className="size-4" />
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {type && (
                    <span className={`rounded-full border px-2 py-0.5 ${type.cls}`}>{type.label}</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                  <span className="text-zinc-600">
                    {idea.createdByName ?? ""} · {fmtDateTime(idea.createdAt)}
                  </span>
                </div>
                {idea.note && <p className="line-clamp-2 text-xs text-zinc-400">{idea.note}</p>}
                {idea.aiSummary && !isExpanded && (
                  <p className="inline-flex items-center gap-1 text-xs text-amber-200/80"><Sparkles className="size-3.5 shrink-0" /> {idea.aiSummary}</p>
                )}

                {isExpanded && (idea.aiSummary || idea.aiAdaptation) && (
                  <div className="space-y-2 rounded-xl border border-amber-400/20 bg-zinc-950/60 p-3 text-xs">
                    {idea.aiSummary && (
                      <div>
                        <p className="mb-1 inline-flex items-center gap-1 font-semibold text-amber-300"><Sparkles className="size-3.5" /> Pattern ที่ reusable</p>
                        <p className="whitespace-pre-wrap text-zinc-300">{idea.aiSummary}</p>
                      </div>
                    )}
                    {idea.aiAdaptation && (
                      <div>
                        <p className="mb-1 inline-flex items-center gap-1 font-semibold text-emerald-300"><Clapperboard className="size-3.5" /> ไอเดียแบบ AISTAR (original)</p>
                        <p className="whitespace-pre-wrap text-zinc-300">{idea.aiAdaptation}</p>
                      </div>
                    )}
                  </div>
                )}

                {cardError[idea.id] && <p className="text-xs text-red-400">{cardError[idea.id]}</p>}

                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                  <button
                    onClick={() => handleAiAssist(idea)}
                    disabled={aiBusy === idea.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 px-2.5 py-1 text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                  >
                    {aiBusy === idea.id ? "กำลังสกัด..." : <><Sparkles className="size-3.5" /> AI สกัด pattern</>}
                  </button>
                  {(idea.aiSummary || idea.aiAdaptation) && (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : idea.id)}
                      className="rounded-lg border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:bg-zinc-800"
                    >
                      {isExpanded ? "ซ่อนผล AI" : "ดูผล AI"}
                    </button>
                  )}
                  {next && (
                    <button
                      onClick={() => handleStatus(idea, next)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:bg-zinc-800"
                      title={`เปลี่ยนเป็น ${IDEA_STATUS[next]?.label}`}
                    >
                      <ArrowRight className="size-3.5" /> {IDEA_STATUS[next]?.label}
                    </button>
                  )}
                  {idea.status !== "converted" && idea.status !== "archived" && (
                    <div className="relative">
                      <button
                        onClick={() => setConvertOpen(convertOpen === idea.id ? null : idea.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 px-2.5 py-1 text-emerald-300 hover:bg-emerald-400/10"
                      >
                        Convert <ChevronDown className="size-3.5" />
                      </button>
                      {convertOpen === idea.id && (
                        <div className="absolute bottom-full left-0 z-10 mb-1 w-40 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
                          <button
                            onClick={() => handleConvert(idea, "campaign")}
                            className="flex w-full items-center gap-1 px-3 py-2 text-left hover:bg-zinc-800"
                          >
                            <ArrowRight className="size-3.5" /> Campaign (brief)
                          </button>
                          <button
                            onClick={() => handleConvert(idea, "episode")}
                            className="flex w-full items-center gap-1 px-3 py-2 text-left hover:bg-zinc-800"
                          >
                            <ArrowRight className="size-3.5" /> Episode (idea)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {idea.status !== "archived" && (
                    <button
                      onClick={() => handleStatus(idea, "archived")}
                      className="ml-auto text-zinc-600 hover:text-zinc-400"
                      title="Archive"
                    >
                      <Archive className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {data && data.items.length === 0 && (
          <p className="rounded-2xl border border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
            ยังไม่มีไอเดียตาม filter — เจออะไรเจ๋ง ๆ ก็เก็บเข้ามาได้เลยจากช่องด้านบน
          </p>
        )}

        {/* pagination */}
        {data && data.total > data.pageSize && (
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <button
              disabled={data.page <= 1}
              onClick={() => setParam({ page: String(data.page - 1) })}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
            >
              <ArrowLeft className="size-3.5" /> ก่อนหน้า
            </button>
            <span>
              หน้า {data.page} / {Math.ceil(data.total / data.pageSize)}
            </span>
            <button
              disabled={data.page >= Math.ceil(data.total / data.pageSize)}
              onClick={() => setParam({ page: String(data.page + 1) })}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
            >
              ถัดไป <ArrowRight className="size-3.5" />
            </button>
          </div>
        )}
        {data && <p className="text-xs text-zinc-500">ทั้งหมด {data.total} ไอเดีย</p>}
      </div>
    </AppShell>
  );
}

export default function IdeasPage() {
  return (
    <Suspense fallback={null}>
      <IdeasInner />
    </Suspense>
  );
}
