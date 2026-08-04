"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Ban, X, Loader2, Sparkles, TriangleAlert, Check, RotateCcw,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";
import {
  CONTENT_FORMATS,
  CONTENT_NEXT,
  CONTENT_STATUS,
  CONTENT_TYPES,
  CalendarItem,
  ContentItemDetail,
  ContentItemListItem,
  PLATFORMS,
  Paged,
  THAI_DAYS,
  THAI_MONTHS,
  THAI_MONTHS_SHORT,
  dayKey,
  fmtDateTimeTh,
  fmtTimeTh,
  platformMeta,
} from "@/lib/publishing";

const FILTER_KEYS = ["q", "platform", "status", "characterId"] as const;

const SORT_OPTIONS = [
  { value: "scheduledAt:asc", label: "กำหนดโพสต์ เร็ว→ช้า" },
  { value: "scheduledAt:desc", label: "กำหนดโพสต์ ช้า→เร็ว" },
  { value: "updatedAt:desc", label: "อัปเดตล่าสุด" },
  { value: "title:asc", label: "ชื่อ ก→ฮ" },
  { value: "status:asc", label: "Status" },
];

interface RefItem {
  id: string;
  label: string;
}

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CalendarInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const view = searchParams.get("view") ?? "month"; // month | week | list
  const anchorStr = searchParams.get("anchor");
  const anchor = useMemo(() => {
    const d = anchorStr ? new Date(anchorStr) : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [anchorStr]);

  const [calItems, setCalItems] = useState<CalendarItem[]>([]);
  const [listData, setListData] = useState<Paged<ContentItemListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // render ปฏิทินเฉพาะฝั่ง client — anchor/todayKey มาจาก new Date() ซึ่งต่างกันระหว่าง
  // SSR กับ browser (hydration hazard) และ HTML จาก SSR จะโชว์ grid เปล่า "0 รายการ"
  // ค้างไว้จนกว่า hydration จะเสร็จ ทำให้ first load แสดงข้อมูลผิด
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // side panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContentItemDetail | null>(null);
  const [pendingAction, setPendingAction] = useState<{ to: string; needs?: string } | null>(null);
  const [actionInput, setActionInput] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // deep link จาก notification ฯลฯ — /calendar?item=<id> เปิด side panel ให้เลย
  const itemParam = searchParams.get("item");
  useEffect(() => {
    if (itemParam) setSelectedId(itemParam);
  }, [itemParam]);

  // create form
  const [showForm, setShowForm] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string>(""); // YYYY-MM-DDTHH:mm จากการคลิกช่องวัน

  // AI caption assist (Phase 4) — โชว์ปุ่มเมื่อ API ตั้ง key แล้วเท่านั้น
  const [aiConfigured, setAiConfigured] = useState(false);
  useEffect(() => {
    api<{ configured: boolean }>("/ai/status")
      .then((s) => setAiConfigured(!!s.configured))
      .catch(() => setAiConfigured(false));
  }, []);

  // reference data
  const [characters, setCharacters] = useState<RefItem[]>([]);
  const [products, setProducts] = useState<RefItem[]>([]);
  const [episodes, setEpisodes] = useState<RefItem[]>([]);
  const [campaigns, setCampaigns] = useState<RefItem[]>([]);

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
      router.replace(`/calendar${params.toString() ? `?${params}` : ""}`);
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

  // ชื่อ character → id (calendar endpoint ส่งมาแค่ชื่อ — ใช้ map นี้หา avatar)
  const [charIdByName, setCharIdByName] = useState<Map<string, string>>(new Map());

  // reference data — โหลดครั้งเดียว
  useEffect(() => {
    api<{ items: { id: string; nameTh: string; displayCode: string }[] }>("/characters?pageSize=50")
      .then((r) => {
        setCharacters(r.items.map((c) => ({ id: c.id, label: `${c.nameTh} (${c.displayCode})` })));
        setCharIdByName(new Map(r.items.map((c) => [c.nameTh, c.id])));
      })
      .catch(() => {});
    api<{ items: { id: string; name: string }[] }>("/products?pageSize=50")
      .then((r) => setProducts(r.items.map((p) => ({ id: p.id, label: p.name }))))
      .catch(() => {});
    api<{ items: { id: string; title: string; displayCode: string }[] }>("/episodes?pageSize=50")
      .then((r) => setEpisodes(r.items.map((e) => ({ id: e.id, label: `${e.displayCode} ${e.title}` }))))
      .catch(() => {});
    api<{ items: { id: string; name: string; displayCode: string }[] }>("/campaigns?pageSize=50")
      .then((r) => setCampaigns(r.items.map((c) => ({ id: c.id, label: `${c.displayCode} ${c.name}` }))))
      .catch(() => {});
  }, []);

  // ── ช่วงวันที่ของ grid ─────────────────────────────────────
  const gridDays = useMemo(() => {
    if (view === "week") {
      const start = new Date(anchor);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchor, view]);

  // ── fetch calendar / list ──────────────────────────────────
  useEffect(() => {
    const platform = searchParams.get("platform") ?? "";
    const status = searchParams.get("status") ?? "";
    const characterId = searchParams.get("characterId") ?? "";

    if (view === "list") {
      const params = new URLSearchParams();
      for (const k of FILTER_KEYS) {
        const v = searchParams.get(k);
        if (v) params.set(k, v);
      }
      params.set("sortBy", searchParams.get("sortBy") ?? "scheduledAt");
      params.set("sortDir", searchParams.get("sortDir") ?? "asc");
      const page = searchParams.get("page");
      if (page) params.set("page", page);
      api<Paged<ContentItemListItem>>(`/content-items?${params}`)
        .then((res) => {
          setListData(res);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
      return;
    }

    if (!gridDays.length) return;
    const from = new Date(gridDays[0]);
    from.setHours(0, 0, 0, 0);
    const to = new Date(gridDays[gridDays.length - 1]);
    to.setHours(23, 59, 59, 999);
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    if (platform) params.set("platform", platform);
    if (status) params.set("status", status);
    if (characterId) params.set("characterId", characterId);
    api<{ items: CalendarItem[] }>(`/content-items/calendar?${params}`)
      .then((res) => {
        setCalItems(res.items);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "โหลดปฏิทินไม่สำเร็จ");
      });
  }, [searchParams, view, gridDays, reloadKey]);

  // q filter ฝั่ง client สำหรับ month/week (calendar endpoint ไม่รับ q)
  const q = (searchParams.get("q") ?? "").toLowerCase();
  const visibleCalItems = useMemo(
    () => (q ? calItems.filter((i) => i.title.toLowerCase().includes(q)) : calItems),
    [calItems, q],
  );

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of visibleCalItems) {
      const key = dayKey(new Date(item.scheduledAt));
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return map;
  }, [visibleCalItems]);

  // ── side panel detail ──────────────────────────────────────
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api<ContentItemDetail>(`/content-items/${selectedId}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดรายละเอียดไม่สำเร็จ"));
  }, [selectedId, reloadKey]);

  // ── AI caption draft (Phase 4 §28.1) ───────────────────────
  const [aiCapBusy, setAiCapBusy] = useState(false);
  const [aiCapError, setAiCapError] = useState<string | null>(null);
  const [aiCapApplying, setAiCapApplying] = useState(false);
  const [aiCapDraft, setAiCapDraft] = useState<{
    caption: string;
    hashtags: string;
    cta: string;
    warning?: string;
  } | null>(null);

  // เปลี่ยน content ที่เลือก → ล้างร่าง AI เดิมทิ้ง
  useEffect(() => {
    setAiCapDraft(null);
    setAiCapError(null);
  }, [selectedId]);

  async function aiDraftCaption() {
    if (!detail) return;
    setAiCapBusy(true);
    setAiCapError(null);
    try {
      const res = await api<{ caption: string; hashtags: string[]; cta: string; warning?: string }>(
        "/ai/content/caption",
        {
          method: "POST",
          body: JSON.stringify({
            title: detail.title,
            platform: detail.platform,
            characterId: detail.characters[0]?.id || undefined,
            productId: detail.products[0]?.id || undefined,
            episodeId: detail.episode?.id || undefined,
          }),
        },
      );
      setAiCapDraft({
        caption: res.caption ?? "",
        hashtags: (res.hashtags ?? []).map((h) => `#${h.replace(/^#/, "")}`).join(" "),
        cta: res.cta ?? "",
        warning: res.warning,
      });
    } catch (err) {
      setAiCapError(err instanceof Error ? err.message : "AI ร่าง caption ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setAiCapBusy(false);
    }
  }

  async function applyAiCaption() {
    if (!detail || !aiCapDraft) return;
    setAiCapApplying(true);
    setAiCapError(null);
    try {
      await api(`/content-items/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          caption: aiCapDraft.caption,
          hashtags: aiCapDraft.hashtags
            .split(/[\s,]+/)
            .map((h) => h.replace(/^#/, "").trim())
            .filter(Boolean),
          cta: aiCapDraft.cta || undefined,
        }),
      });
      setAiCapDraft(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setAiCapError(err instanceof Error ? err.message : "บันทึก caption ไม่สำเร็จ");
    } finally {
      setAiCapApplying(false);
    }
  }

  async function doTransition(to: string, needs?: string) {
    if (!selectedId) return;
    if (needs && needs !== "scheduledAt" && !actionInput.trim()) return;
    setActionBusy(true);
    setError(null);
    const body: Record<string, string> = { status: to };
    if (needs === "comment") body.comment = actionInput.trim();
    if (needs === "reason") body.reason = actionInput.trim();
    if (needs === "postUrl") body.postUrl = actionInput.trim();
    if (needs === "scheduledAt" && actionInput) body.scheduledAt = new Date(actionInput).toISOString();
    try {
      await api(`/content-items/${selectedId}/status`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setPendingAction(null);
      setActionInput("");
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยน status ไม่สำเร็จ");
    } finally {
      setActionBusy(false);
    }
  }

  const activeFilters = useMemo(
    () => FILTER_KEYS.filter((k) => searchParams.get(k)).length,
    [searchParams],
  );

  function clearFilters() {
    setQInput("");
    const params = new URLSearchParams(searchParams.toString());
    for (const k of FILTER_KEYS) params.delete(k);
    params.delete("page");
    router.replace(`/calendar${params.toString() ? `?${params}` : ""}`);
  }

  function navigate(dir: -1 | 0 | 1) {
    if (dir === 0) {
      setParam({ anchor: "" });
      return;
    }
    const d = new Date(anchor);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setParam({ anchor: dayKey(d) });
  }

  const todayKey = dayKey(new Date());
  const sortValue = `${searchParams.get("sortBy") ?? "scheduledAt"}:${searchParams.get("sortDir") ?? "asc"}`;

  // ก่อน hydrate เสร็จ แสดง loading แทน grid เปล่า (ดู comment ที่ mounted ด้านบน)
  if (!mounted) {
    return (
      <AppShell title="Content Calendar">
        <p className="text-sm text-zinc-500">กำลังโหลดปฏิทิน...</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Content Calendar"
      actions={
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + สร้าง Content
        </button>
      }
    >
      <div className="space-y-4">
        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <input
            value={qInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาชื่อ / caption..."
            className={`${inputCls} w-52 bg-zinc-900`}
          />
          <FilterSelect
            value={searchParams.get("platform") ?? ""}
            onChange={(v) => setParam({ platform: v })}
            options={[
              { value: "", label: "Platform: ทั้งหมด" },
              ...PLATFORMS.map((p) => ({ value: p.value, label: p.label })),
            ]}
          />
          <FilterSelect
            value={searchParams.get("status") ?? ""}
            onChange={(v) => setParam({ status: v })}
            options={[
              { value: "", label: "Status: ทั้งหมด" },
              ...Object.entries(CONTENT_STATUS).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
          <FilterSelect
            value={searchParams.get("characterId") ?? ""}
            onChange={(v) => setParam({ characterId: v })}
            options={[
              { value: "", label: "Character: ทั้งหมด" },
              ...characters.map((c) => ({ value: c.id, label: c.label })),
            ]}
          />
          {view === "list" && (
            <FilterSelect
              value={sortValue}
              onChange={(v) => {
                const [sortBy, sortDir] = v.split(":");
                setParam({ sortBy, sortDir });
              }}
              options={SORT_OPTIONS.map((s) => ({ value: s.value, label: `เรียง: ${s.label}` }))}
            />
          )}
          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              ล้าง filter ({activeFilters})
            </button>
          )}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-700 p-0.5 text-sm">
            {[
              { v: "month", label: "เดือน" },
              { v: "week", label: "สัปดาห์" },
              { v: "list", label: "รายการ" },
            ].map((t) => (
              <button
                key={t.v}
                onClick={() => setParam({ view: t.v === "month" ? "" : t.v })}
                className={`rounded-md px-3 py-1 ${view === t.v ? "bg-amber-400 font-semibold text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* month / week navigation */}
        {view !== "list" && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="rounded-lg border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <ArrowLeft className="size-4" />
            </button>
            <button
              onClick={() => navigate(0)}
              className="rounded-lg border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              {view === "week" ? "สัปดาห์นี้" : "เดือนนี้"}
            </button>
            <button
              onClick={() => navigate(1)}
              className="rounded-lg border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <ArrowRight className="size-4" />
            </button>
            <h2 className="text-lg font-semibold text-amber-300">
              {view === "week"
                ? `สัปดาห์ ${gridDays[0]?.getDate()} ${THAI_MONTHS_SHORT[gridDays[0]?.getMonth() ?? 0]} – ${gridDays[6]?.getDate()} ${THAI_MONTHS_SHORT[gridDays[6]?.getMonth() ?? 0]} ${anchor.getFullYear() + 543}`
                : `${THAI_MONTHS[anchor.getMonth()]} ${anchor.getFullYear() + 543}`}
            </h2>
            <span className="text-xs text-zinc-500">{visibleCalItems.length} รายการในช่วงนี้</span>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {showForm && (
          <CreateContentForm
            key={prefillDate} // คลิกวันใหม่ตอนฟอร์มเปิดอยู่ → remount พร้อมวันที่ใหม่
            characters={characters}
            products={products}
            episodes={episodes}
            campaigns={campaigns}
            initialScheduledAt={prefillDate}
            onDone={(id) => {
              setShowForm(false);
              setPrefillDate("");
              setReloadKey((k) => k + 1);
              setSelectedId(id);
            }}
            onCancel={() => {
              setShowForm(false);
              setPrefillDate("");
            }}
          />
        )}

        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            {/* month grid */}
            {view === "month" && (
              <div className="overflow-hidden rounded-2xl border border-zinc-800">
                <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900 text-center text-xs text-zinc-400">
                  {THAI_DAYS.map((d) => (
                    <div key={d} className="py-2">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {gridDays.map((d) => {
                    const key = dayKey(d);
                    const inMonth = d.getMonth() === anchor.getMonth();
                    const isToday = key === todayKey;
                    const dayItems = itemsByDay.get(key) ?? [];
                    return (
                      <div
                        key={key}
                        onClick={() => {
                          setPrefillDate(`${key}T19:00`);
                          setShowForm(true);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        title="คลิกช่องว่างเพื่อสร้าง content ของวันนี้"
                        className={`group min-h-24 cursor-pointer border-b border-r border-zinc-800/60 p-1.5 hover:bg-zinc-800/40 ${inMonth ? "" : "bg-zinc-900/40"}`}
                      >
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                            isToday
                              ? "bg-amber-400 font-bold text-zinc-950"
                              : inMonth
                                ? "text-zinc-300"
                                : "text-zinc-600"
                          }`}
                        >
                          {d.getDate()}
                        </span>
                        <div className="mt-1 space-y-1">
                          {dayItems.slice(0, 3).map((item) => (
                            <ChipButton
                              key={item.id}
                              item={item}
                              charId={charIdByName.get(item.characters[0] ?? "") ?? null}
                              onClick={() => setSelectedId(item.id)}
                            />
                          ))}
                          {dayItems.length > 3 && (
                            <p className="px-1 text-[10px] text-zinc-500">+{dayItems.length - 3} รายการ</p>
                          )}
                          {dayItems.length === 0 && (
                            <p className="px-1 text-[10px] text-zinc-600 opacity-0 transition group-hover:opacity-100">
                              + สร้าง content
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* week view */}
            {view === "week" && (
              <div className="grid grid-cols-7 gap-2">
                {gridDays.map((d) => {
                  const key = dayKey(d);
                  const isToday = key === todayKey;
                  const dayItems = itemsByDay.get(key) ?? [];
                  return (
                    <div
                      key={key}
                      onClick={() => {
                        setPrefillDate(`${key}T19:00`);
                        setShowForm(true);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      title="คลิกช่องว่างเพื่อสร้าง content ของวันนี้"
                      className={`min-h-56 cursor-pointer rounded-xl border p-2 hover:border-zinc-600 ${isToday ? "border-amber-400/60 bg-amber-400/5" : "border-zinc-800 bg-zinc-900/40"}`}
                    >
                      <p className={`mb-2 text-center text-xs ${isToday ? "font-bold text-amber-300" : "text-zinc-400"}`}>
                        {THAI_DAYS[d.getDay()]} {d.getDate()} {THAI_MONTHS_SHORT[d.getMonth()]}
                      </p>
                      <div className="space-y-1.5">
                        {dayItems.map((item) => (
                          <button
                            key={item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(item.id);
                            }}
                            className="block w-full rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-left hover:border-amber-400/50"
                          >
                            <p className="text-[10px] text-zinc-500">
                              {fmtTimeTh(item.scheduledAt)} · {platformMeta(item.platform).label}
                            </p>
                            <p className="truncate text-xs text-zinc-200">{item.title}</p>
                            <span
                              className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] ${(CONTENT_STATUS[item.status] ?? CONTENT_STATUS.idea).cls}`}
                            >
                              {(CONTENT_STATUS[item.status] ?? CONTENT_STATUS.idea).label}
                            </span>
                          </button>
                        ))}
                        {dayItems.length === 0 && <p className="text-center text-[10px] text-zinc-700">—</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* list view */}
            {view === "list" && (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-2xl border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900 text-left text-zinc-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">กำหนดโพสต์</th>
                        <th className="px-4 py-3 font-medium">Content</th>
                        <th className="px-4 py-3 font-medium">Platform</th>
                        <th className="px-4 py-3 font-medium">Characters</th>
                        <th className="px-4 py-3 font-medium">Campaign</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {listData?.items.map((item) => {
                        const st = CONTENT_STATUS[item.status] ?? CONTENT_STATUS.idea;
                        return (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedId(item.id)}
                            className="cursor-pointer hover:bg-zinc-900/50"
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">
                              {fmtDateTimeTh(item.scheduledAt)}
                            </td>
                            <td className="max-w-64 px-4 py-3">
                              <span className="block truncate">{item.title}</span>
                              {item.blockedReason && (
                                <span className="inline-flex items-center gap-1 text-xs text-red-400"><Ban className="size-3" /> {item.blockedReason}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-zinc-400">{platformMeta(item.platform).label}</td>
                            <td className="px-4 py-3 text-xs text-zinc-400">
                              {item.characters.length > 0 ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="flex -space-x-1.5">
                                    {item.characters.slice(0, 3).map((c) => (
                                      <EntityAvatar
                                        key={c.id}
                                        entityType="character"
                                        id={c.id}
                                        name={c.nameTh}
                                        size="sm"
                                        className="ring-2 ring-zinc-950"
                                      />
                                    ))}
                                  </span>
                                  <span className="truncate">
                                    {item.characters.map((c) => c.nameTh).join(", ")}
                                  </span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-400">{item.campaign?.name ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-1 text-xs ${st.cls}`}>{st.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                      {listData && listData.items.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                            ยังไม่มี content ตาม filter — ลองล้าง filter หรือกด &ldquo;+ สร้าง Content&rdquo;
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {listData && listData.total > listData.pageSize && (
                  <div className="flex items-center gap-3 text-sm text-zinc-400">
                    <button
                      disabled={listData.page <= 1}
                      onClick={() => setParam({ page: String(listData.page - 1) })}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
                    >
                      <ArrowLeft className="size-4" /> ก่อนหน้า
                    </button>
                    <span>
                      หน้า {listData.page} / {Math.ceil(listData.total / listData.pageSize)}
                    </span>
                    <button
                      disabled={listData.page >= Math.ceil(listData.total / listData.pageSize)}
                      onClick={() => setParam({ page: String(listData.page + 1) })}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
                    >
                      ถัดไป <ArrowRight className="size-4" />
                    </button>
                  </div>
                )}
                {listData && <p className="text-xs text-zinc-500">ทั้งหมด {listData.total} รายการ</p>}
              </div>
            )}
          </div>

          {/* side panel */}
          {selectedId && (
            <aside className="w-96 shrink-0 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              {!detail && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}
              {detail && (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-zinc-500">
                        {platformMeta(detail.platform).icon} {platformMeta(detail.platform).label}
                        {detail.account ? ` · ${detail.account}` : ""}
                      </p>
                      <h3 className="text-base font-semibold">{detail.title}</h3>
                    </div>
                    <button onClick={() => setSelectedId(null)} className="text-zinc-500 hover:text-zinc-200">
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${(CONTENT_STATUS[detail.status] ?? CONTENT_STATUS.idea).cls}`}
                    >
                      {(CONTENT_STATUS[detail.status] ?? CONTENT_STATUS.idea).label}
                    </span>
                    {detail.blockedReason && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-900/60 px-2 py-1 text-xs text-red-200">
                        <Ban className="size-3" /> {detail.blockedReason}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-sm text-zinc-300">
                    <p>
                      <span className="text-zinc-500">กำหนดโพสต์:</span> {fmtDateTimeTh(detail.scheduledAt)}
                    </p>
                    {detail.campaign && (
                      <p>
                        <span className="text-zinc-500">แคมเปญ:</span> {detail.campaign.name}
                      </p>
                    )}
                    {detail.episode && (
                      <p>
                        <span className="text-zinc-500">Episode:</span> {detail.episode.title}
                      </p>
                    )}
                    {detail.owner && (
                      <p>
                        <span className="text-zinc-500">เจ้าของงาน:</span> {detail.owner.name}
                      </p>
                    )}
                    {detail.characters.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Characters:</span>
                        <span className="flex -space-x-2">
                          {detail.characters.map((c) => (
                            <EntityAvatar
                              key={c.id}
                              entityType="character"
                              id={c.id}
                              name={c.nameTh}
                              size="md"
                              title={`${c.nameTh} (${c.displayCode})`}
                              className="ring-2 ring-zinc-900"
                            />
                          ))}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {detail.characters.map((c) => c.nameTh).join(", ")}
                        </span>
                      </div>
                    )}
                    {detail.products.length > 0 && (
                      <p>
                        <span className="text-zinc-500">สินค้า:</span>{" "}
                        {detail.products.map((p) => p.name).join(", ")}
                      </p>
                    )}
                    {detail.caption && (
                      <p className="rounded-lg bg-zinc-800/70 p-2 text-xs text-zinc-300">{detail.caption}</p>
                    )}
                    {detail.hashtags.length > 0 && (
                      <p className="text-xs text-sky-300">{detail.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
                    )}
                    {detail.cta && (
                      <p className="text-xs">
                        <span className="text-zinc-500">CTA:</span> {detail.cta}
                      </p>
                    )}
                    {detail.postUrl && (
                      <p className="truncate text-xs">
                        <span className="text-zinc-500">โพสต์จริง:</span>{" "}
                        <a href={detail.postUrl} target="_blank" rel="noreferrer" className="text-amber-300 underline">
                          {detail.postUrl}
                        </a>
                      </p>
                    )}
                  </div>

                  {/* AI caption assist — โชว์เมื่อ API ตั้ง ANTHROPIC_API_KEY แล้ว */}
                  {aiConfigured && (
                    <div className="space-y-2 rounded-xl border border-violet-500/40 bg-violet-500/5 p-3">
                      {!aiCapDraft && (
                        <button
                          disabled={aiCapBusy}
                          onClick={() => void aiDraftCaption()}
                          className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-violet-500/50 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/10 disabled:opacity-60"
                        >
                          {aiCapBusy ? <><Loader2 className="size-3.5 animate-spin" /> AI กำลังร่าง caption...</> : <><Sparkles className="size-3.5" /> ร่าง caption ด้วย AI</>}
                        </button>
                      )}
                      {aiCapBusy && (
                        <p className="text-[11px] text-zinc-500">
                          AI กำลังเขียน caption / hashtags / CTA จากข้อมูล content นี้ — อาจใช้เวลา 1-3 นาที
                          อย่าเพิ่งปิดหน้านี้
                        </p>
                      )}
                      {aiCapError && <p className="text-xs text-red-400">{aiCapError}</p>}
                      {aiCapDraft && (
                        <div className="space-y-2">
                          <p className="inline-flex items-center gap-1 text-xs font-semibold text-violet-300"><Sparkles className="size-3.5" /> ร่างจาก AI — แก้ได้ก่อนใช้</p>
                          {aiCapDraft.warning && (
                            <p className="rounded-lg bg-amber-900/40 p-2 text-[11px] text-amber-200">
                              <TriangleAlert className="inline size-3.5" /> {aiCapDraft.warning}
                            </p>
                          )}
                          <label className="block text-[11px] text-zinc-500">
                            Caption
                            <textarea
                              value={aiCapDraft.caption}
                              onChange={(e) => setAiCapDraft({ ...aiCapDraft, caption: e.target.value })}
                              rows={4}
                              className={`${inputCls} mt-0.5 w-full text-xs`}
                            />
                          </label>
                          <label className="block text-[11px] text-zinc-500">
                            Hashtags (คั่นด้วยช่องว่าง)
                            <input
                              value={aiCapDraft.hashtags}
                              onChange={(e) => setAiCapDraft({ ...aiCapDraft, hashtags: e.target.value })}
                              className={`${inputCls} mt-0.5 w-full text-xs`}
                            />
                          </label>
                          <label className="block text-[11px] text-zinc-500">
                            CTA
                            <input
                              value={aiCapDraft.cta}
                              onChange={(e) => setAiCapDraft({ ...aiCapDraft, cta: e.target.value })}
                              className={`${inputCls} mt-0.5 w-full text-xs`}
                            />
                          </label>
                          <div className="flex gap-2">
                            <button
                              disabled={aiCapApplying}
                              onClick={() => void applyAiCaption()}
                              className="inline-flex items-center gap-1 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
                            >
                              {aiCapApplying ? "กำลังบันทึก..." : <><Check className="size-3.5" /> ใช้ caption นี้</>}
                            </button>
                            <button
                              disabled={aiCapBusy}
                              onClick={() => void aiDraftCaption()}
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                            >
                              {aiCapBusy ? <><Loader2 className="size-3.5 animate-spin" /> กำลังร่างใหม่...</> : <><RotateCcw className="size-3.5" /> ร่างใหม่</>}
                            </button>
                            <button
                              onClick={() => setAiCapDraft(null)}
                              className="text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              ทิ้งร่างนี้
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* readiness */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <p className="mb-1 text-xs font-semibold text-zinc-400">Readiness</p>
                    <div className="space-y-0.5 text-xs">
                      <p className={detail.readiness.caption ? "text-emerald-300" : "text-red-300"}>
                        {detail.readiness.caption ? <Check className="inline size-3.5" /> : <X className="inline size-3.5" />} Caption
                      </p>
                      <p className={detail.readiness.scheduledAt ? "text-emerald-300" : "text-red-300"}>
                        {detail.readiness.scheduledAt ? <Check className="inline size-3.5" /> : <X className="inline size-3.5" />} วัน-เวลาโพสต์
                      </p>
                      <p className={detail.readiness.characters ? "text-emerald-300" : "text-red-300"}>
                        {detail.readiness.characters ? <Check className="inline size-3.5" /> : <X className="inline size-3.5" />} Characters
                      </p>
                    </div>
                  </div>

                  {/* status transitions */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-zinc-400">เปลี่ยนสถานะ</p>
                    <div className="flex flex-wrap gap-2">
                      {(CONTENT_NEXT[detail.status] ?? []).map((t) => (
                        <button
                          key={t.to}
                          disabled={actionBusy}
                          onClick={() => {
                            if (t.needs) {
                              setPendingAction({ to: t.to, needs: t.needs });
                              setActionInput(t.needs === "scheduledAt" ? toLocalInput(detail.scheduledAt) : "");
                            } else {
                              void doTransition(t.to);
                            }
                          }}
                          className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                        >
                          {t.label}
                        </button>
                      ))}
                      {detail.status !== "published" && detail.status !== "archived" && (
                        <button
                          disabled={actionBusy}
                          onClick={() => {
                            setPendingAction({ to: "archived", needs: "reason" });
                            setActionInput("");
                          }}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                    {pendingAction && (
                      <div className="space-y-2 rounded-xl border border-amber-400/40 bg-zinc-950/60 p-3">
                        <p className="text-xs text-amber-300">
                          {pendingAction.needs === "comment" && "ระบุ comment ว่าต้องแก้อะไร"}
                          {pendingAction.needs === "reason" && "ระบุเหตุผลที่ archive"}
                          {pendingAction.needs === "postUrl" && "แนบลิงก์โพสต์จริง"}
                          {pendingAction.needs === "scheduledAt" && "ยืนยันวัน-เวลาโพสต์"}
                        </p>
                        {pendingAction.needs === "scheduledAt" ? (
                          <input
                            type="datetime-local"
                            value={actionInput}
                            onChange={(e) => setActionInput(e.target.value)}
                            className={`${inputCls} w-full`}
                          />
                        ) : pendingAction.needs === "postUrl" ? (
                          <input
                            value={actionInput}
                            onChange={(e) => setActionInput(e.target.value)}
                            placeholder="https://..."
                            className={`${inputCls} w-full`}
                          />
                        ) : (
                          <textarea
                            value={actionInput}
                            onChange={(e) => setActionInput(e.target.value)}
                            rows={2}
                            className={`${inputCls} w-full`}
                          />
                        )}
                        <div className="flex gap-2">
                          <button
                            disabled={actionBusy}
                            onClick={() => void doTransition(pendingAction.to, pendingAction.needs)}
                            className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                          >
                            ยืนยัน
                          </button>
                          <button
                            onClick={() => setPendingAction(null)}
                            className="text-xs text-zinc-500 hover:text-zinc-300"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ── chip ในช่องปฏิทิน ─────────────────────────────────────────
function ChipButton({
  item,
  charId,
  onClick,
}: {
  item: CalendarItem;
  charId?: string | null;
  onClick: () => void;
}) {
  const st = CONTENT_STATUS[item.status] ?? CONTENT_STATUS.idea;
  const pf = platformMeta(item.platform);
  const firstChar = item.characters[0];
  return (
    <button
      onClick={(e) => {
        e.stopPropagation(); // กันไม่ให้ไปเปิดฟอร์มสร้าง content ของช่องวัน
        onClick();
      }}
      title={`${pf.label} · ${item.title}${item.characters.length ? ` · ${item.characters.join(", ")}` : ""}`}
      className="flex w-full items-center gap-1 rounded-md bg-zinc-800/80 px-1 py-0.5 text-left hover:bg-zinc-700"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
      {/* หน้า character ตัวแรกของ content — เห็นปฏิทินแล้วรู้เลยว่าใครโพสต์ */}
      {charId && firstChar && (
        <EntityAvatar entityType="character" id={charId} name={firstChar} size="xs" />
      )}
      <span className="shrink-0 text-[9px] font-bold text-zinc-400">{pf.short}</span>
      <span className="truncate text-[10px] text-zinc-200">{item.title}</span>
    </button>
  );
}

// ── create form ──────────────────────────────────────────────
function CreateContentForm({
  characters,
  products,
  episodes,
  campaigns,
  initialScheduledAt,
  onDone,
  onCancel,
}: {
  characters: RefItem[];
  products: RefItem[];
  episodes: RefItem[];
  campaigns: RefItem[];
  initialScheduledAt?: string;
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    platform: "tiktok",
    scheduledAt: initialScheduledAt ?? "",
    contentFormat: "",
    contentType: "",
    episodeId: "",
    campaignId: "",
    caption: "",
    cta: "",
    account: "",
  });
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addTag() {
    const t = tagInput.trim().replace(/^#/, "");
    if (t && !hashtags.includes(t)) setHashtags([...hashtags, t]);
    setTagInput("");
  }

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/content-items", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          platform: form.platform,
          account: form.account || undefined,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
          contentFormat: form.contentFormat || undefined,
          contentType: form.contentType || undefined,
          episodeId: form.episodeId || undefined,
          campaignId: form.campaignId || undefined,
          caption: form.caption || undefined,
          cta: form.cta || undefined,
          hashtags: hashtags.length ? hashtags : undefined,
          characterIds: characterIds.length ? characterIds : undefined,
          productIds: productIds.length ? productIds : undefined,
        }),
      });
      onDone(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง content ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <p className="text-sm font-semibold text-amber-300">สร้าง Content ใหม่</p>
      <div className="grid grid-cols-3 gap-3">
        <input
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="ชื่อ content *"
          className={`${inputCls} col-span-2`}
        />
        <FilterSelect
          value={form.platform}
          onChange={(v) => setForm({ ...form, platform: v })}
          options={PLATFORMS.map((p) => ({ value: p.value, label: p.label }))}
        />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <input
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          className={inputCls}
        />
        <FilterSelect
          value={form.contentFormat}
          onChange={(v) => setForm({ ...form, contentFormat: v })}
          options={[
            { value: "", label: "— Format —" },
            ...CONTENT_FORMATS.map((f) => ({ value: f.value, label: f.label })),
          ]}
        />
        <FilterSelect
          value={form.contentType}
          onChange={(v) => setForm({ ...form, contentType: v })}
          options={[
            { value: "", label: "— Type —" },
            ...CONTENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
          ]}
        />
        <input
          value={form.account}
          onChange={(e) => setForm({ ...form, account: e.target.value })}
          placeholder="Account"
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FilterSelect
          value={form.episodeId}
          onChange={(v) => setForm({ ...form, episodeId: v })}
          options={[
            { value: "", label: "— Episode —" },
            ...episodes.map((ep) => ({ value: ep.id, label: ep.label })),
          ]}
        />
        <FilterSelect
          value={form.campaignId}
          onChange={(v) => setForm({ ...form, campaignId: v })}
          options={[
            { value: "", label: "— แคมเปญ —" },
            ...campaigns.map((c) => ({ value: c.id, label: c.label })),
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs text-zinc-500">Characters</p>
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {characters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(characterIds, setCharacterIds, c.id)}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  characterIds.includes(c.id)
                    ? "border-amber-400 bg-amber-400/20 text-amber-200"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {c.label}
              </button>
            ))}
            {characters.length === 0 && <span className="text-xs text-zinc-600">ไม่มี character</span>}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-zinc-500">สินค้า</p>
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(productIds, setProductIds, p.id)}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  productIds.includes(p.id)
                    ? "border-amber-400 bg-amber-400/20 text-amber-200"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {p.label}
              </button>
            ))}
            {products.length === 0 && <span className="text-xs text-zinc-600">ไม่มีสินค้า</span>}
          </div>
        </div>
      </div>

      <textarea
        value={form.caption}
        onChange={(e) => setForm({ ...form, caption: e.target.value })}
        placeholder="Caption"
        rows={3}
        className={`${inputCls} w-full`}
      />

      {/* hashtags chip input */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {hashtags.map((h) => (
            <span key={h} className="flex items-center gap-1 rounded-full bg-sky-900/60 px-2 py-0.5 text-xs text-sky-200">
              #{h}
              <button type="button" onClick={() => setHashtags(hashtags.filter((x) => x !== h))} className="hover:text-red-300">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder="+ hashtag แล้วกด Enter"
            className={`${inputCls} w-44 py-1 text-xs`}
          />
        </div>
      </div>

      <input
        value={form.cta}
        onChange={(e) => setForm({ ...form, cta: e.target.value })}
        placeholder="CTA เช่น กดตะกร้าเลย"
        className={`${inputCls} w-full`}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? "กำลังสร้าง..." : "สร้าง Content"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-zinc-500 hover:text-zinc-300">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarInner />
    </Suspense>
  );
}
