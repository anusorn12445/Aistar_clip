"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Bandage, BicepsFlexed, Check, Link, Target, TrendingUp, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";
import {
  COMPETITOR_TYPES,
  Competitor,
  CompetitorDetail,
  Paged,
  THREAT_LEVELS,
  WATCH_STATUS,
  fmtDateTime,
} from "@/lib/intelligence";

const FILTER_KEYS = ["q", "type", "threatLevel", "watchStatus"] as const;

const SORT_OPTIONS = [
  { value: "updatedAt:desc", label: "อัปเดตล่าสุด" },
  { value: "name:asc", label: "ชื่อ ก→ฮ" },
  { value: "threatLevel:desc", label: "Threat" },
];

const TABS = [
  { key: "channels", label: "Channels" },
  { key: "contents", label: "Contents" },
  { key: "insights", label: "Insights" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const emptyChannel = { platform: "", handle: "", url: "", followers: "", notes: "" };
const emptyContent = { url: "", platform: "", contentType: "", hook: "", metricsNote: "", notes: "" };
const emptyInsight = { fact: "", assumption: "", recommendation: "" };

function CompetitorsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Paged<Competitor> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "",
    category: "",
    positioning: "",
    audience: "",
    strength: "",
    weakness: "",
    threatLevel: "medium",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  // side panel
  const [panelId, setPanelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompetitorDetail | null>(null);
  const [tab, setTab] = useState<TabKey>("channels");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [channelForm, setChannelForm] = useState({ ...emptyChannel });
  const [editChannelId, setEditChannelId] = useState<string | null>(null);
  const [contentForm, setContentForm] = useState({ ...emptyContent });
  const [insightForm, setInsightForm] = useState({ ...emptyInsight });
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
      router.replace(`/competitors${params.toString() ? `?${params}` : ""}`);
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
    api<Paged<Competitor>>(`/competitors${query ? `?${query}` : ""}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [searchParams, reloadKey]);

  useEffect(() => {
    if (!panelId) {
      setDetail(null);
      return;
    }
    api<CompetitorDetail>(`/competitors/${panelId}`)
      .then((res) => {
        setDetail(res);
        setPanelError(null);
      })
      .catch((err) => setPanelError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [panelId, reloadKey]);

  const activeFilters = useMemo(
    () => FILTER_KEYS.filter((k) => searchParams.get(k)).length,
    [searchParams],
  );
  const sortValue = `${searchParams.get("sortBy") ?? "updatedAt"}:${searchParams.get("sortDir") ?? "desc"}`;

  function clearFilters() {
    setQInput("");
    router.replace("/competitors");
  }

  function reload() {
    setReloadKey((k) => k + 1);
  }

  function splitCsv(v: string): string[] | undefined {
    const arr = v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return arr.length ? arr : undefined;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/competitors", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type || undefined,
          category: splitCsv(form.category),
          positioning: form.positioning.trim() || undefined,
          audience: splitCsv(form.audience),
          strength: form.strength.trim() || undefined,
          weakness: form.weakness.trim() || undefined,
          threatLevel: form.threatLevel,
          notes: form.notes.trim() || undefined,
        }),
      });
      setShowForm(false);
      setForm({
        name: "",
        type: "",
        category: "",
        positioning: "",
        audience: "",
        strength: "",
        weakness: "",
        threatLevel: "medium",
        notes: "",
      });
      reload();
      setPanelId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มคู่แข่งไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!panelId) return;
    setPanelBusy(true);
    setPanelError(null);
    const body = {
      platform: channelForm.platform.trim(),
      handle: channelForm.handle.trim(),
      url: channelForm.url.trim() || undefined,
      followers: channelForm.followers ? parseInt(channelForm.followers, 10) : undefined,
      notes: channelForm.notes.trim() || undefined,
    };
    try {
      if (editChannelId) {
        await api(`/competitors/${panelId}/channels/${editChannelId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await api(`/competitors/${panelId}/channels`, { method: "POST", body: JSON.stringify(body) });
      }
      setChannelForm({ ...emptyChannel });
      setEditChannelId(null);
      reload();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "บันทึกช่องทางไม่สำเร็จ");
    } finally {
      setPanelBusy(false);
    }
  }

  async function removeChannel(channelId: string) {
    if (!panelId) return;
    setPanelBusy(true);
    try {
      await api(`/competitors/${panelId}/channels/${channelId}`, { method: "DELETE" });
      reload();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "ลบช่องทางไม่สำเร็จ");
    } finally {
      setPanelBusy(false);
    }
  }

  async function addContent(e: React.FormEvent) {
    e.preventDefault();
    if (!panelId) return;
    setPanelBusy(true);
    setPanelError(null);
    try {
      await api(`/competitors/${panelId}/contents`, {
        method: "POST",
        body: JSON.stringify({
          url: contentForm.url.trim(),
          platform: contentForm.platform.trim() || undefined,
          contentType: contentForm.contentType.trim() || undefined,
          hook: contentForm.hook.trim() || undefined,
          metricsNote: contentForm.metricsNote.trim() || undefined,
          notes: contentForm.notes.trim() || undefined,
        }),
      });
      setContentForm({ ...emptyContent });
      reload();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "บันทึก content ไม่สำเร็จ");
    } finally {
      setPanelBusy(false);
    }
  }

  async function addInsight(e: React.FormEvent) {
    e.preventDefault();
    if (!panelId) return;
    setPanelBusy(true);
    setPanelError(null);
    try {
      await api(`/competitors/${panelId}/insights`, {
        method: "POST",
        body: JSON.stringify({
          fact: insightForm.fact.trim(),
          assumption: insightForm.assumption.trim() || undefined,
          recommendation: insightForm.recommendation.trim() || undefined,
        }),
      });
      setInsightForm({ ...emptyInsight });
      reload();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "บันทึก insight ไม่สำเร็จ");
    } finally {
      setPanelBusy(false);
    }
  }

  async function convertInsight(insightId: string) {
    setPanelBusy(true);
    setPanelError(null);
    try {
      const res = await api<{ campaign: { displayCode: string } }>(
        `/insights/${insightId}/convert-to-campaign`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setFlash(`สร้างแคมเปญ ${res.campaign.displayCode} จาก insight แล้ว`);
      setTimeout(() => setFlash(null), 4000);
      reload();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "แปลงเป็นแคมเปญไม่สำเร็จ");
    } finally {
      setPanelBusy(false);
    }
  }

  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

  return (
    <AppShell
      title="Competitor Intelligence"
      actions={
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + คู่แข่งใหม่
        </button>
      }
    >
      <div className="space-y-4">
        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <input
            value={qInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาชื่อ / positioning..."
            className={`${inputCls} w-56 bg-zinc-900`}
          />
          <FilterSelect
            value={searchParams.get("type") ?? ""}
            onChange={(v) => setParam({ type: v })}
            options={[
              { value: "", label: "ประเภท: ทั้งหมด" },
              ...Object.entries(COMPETITOR_TYPES).map(([v, label]) => ({ value: v, label })),
            ]}
          />
          <FilterSelect
            value={searchParams.get("threatLevel") ?? ""}
            onChange={(v) => setParam({ threatLevel: v })}
            options={[
              { value: "", label: "Threat: ทั้งหมด" },
              ...Object.entries(THREAT_LEVELS).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
          <FilterSelect
            value={searchParams.get("watchStatus") ?? ""}
            onChange={(v) => setParam({ watchStatus: v })}
            options={[
              { value: "", label: "Watch: ทั้งหมด" },
              ...Object.entries(WATCH_STATUS).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
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
          <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm font-semibold text-amber-300">เพิ่มคู่แข่งใหม่</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ชื่อคู่แข่ง *"
                className={inputCls}
              />
              <FilterSelect
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                options={[
                  { value: "", label: "— ประเภท —" },
                  ...Object.entries(COMPETITOR_TYPES).map(([v, label]) => ({ value: v, label })),
                ]}
              />
              <FilterSelect
                value={form.threatLevel}
                onChange={(v) => setForm({ ...form, threatLevel: v })}
                options={Object.entries(THREAT_LEVELS).map(([v, m]) => ({
                  value: v,
                  label: `Threat: ${m.label}`,
                }))}
              />
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="category (คั่นด้วย , เช่น beauty, fashion)"
                className={inputCls}
              />
              <input
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                placeholder="audience (คั่นด้วย ,)"
                className={inputCls}
              />
              <input
                value={form.positioning}
                onChange={(e) => setForm({ ...form, positioning: e.target.value })}
                placeholder="positioning"
                className={inputCls}
              />
              <input
                value={form.strength}
                onChange={(e) => setForm({ ...form, strength: e.target.value })}
                placeholder="จุดแข็ง"
                className={inputCls}
              />
              <input
                value={form.weakness}
                onChange={(e) => setForm({ ...form, weakness: e.target.value })}
                placeholder="จุดอ่อน"
                className={inputCls}
              />
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="โน้ตเพิ่มเติม"
                className={inputCls}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || !form.name.trim()}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "เพิ่มคู่แข่ง"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm text-zinc-500 hover:text-zinc-300">
                ยกเลิก
              </button>
            </div>
          </form>
        )}

        {flash && (
          <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
            {flash}
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* table */}
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">ชื่อ</th>
                <th className="px-4 py-3 font-medium">ประเภท</th>
                <th className="px-4 py-3 font-medium">Threat</th>
                <th className="px-4 py-3 font-medium">Watch</th>
                <th className="px-4 py-3 text-center font-medium">Channels</th>
                <th className="px-4 py-3 text-center font-medium">Insights</th>
                <th className="px-4 py-3 font-medium">อัปเดต</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {data?.items.map((c) => {
                const threat = THREAT_LEVELS[c.threatLevel] ?? THREAT_LEVELS.medium;
                const watch = WATCH_STATUS[c.watchStatus] ?? WATCH_STATUS.active;
                return (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setPanelId(c.id);
                      setTab("channels");
                    }}
                    className={`cursor-pointer hover:bg-zinc-900/50 ${panelId === c.id ? "bg-zinc-900/70" : ""}`}
                  >
                    <td className="max-w-56 px-4 py-3">
                      <span className="block truncate font-medium">{c.name}</span>
                      {c.positioning && (
                        <span className="block truncate text-xs text-zinc-500">{c.positioning}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{c.type ? COMPETITOR_TYPES[c.type] ?? c.type : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs ${threat.cls}`}>{threat.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs ${watch.cls}`}>{watch.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-400">{c._count?.channels ?? 0}</td>
                    <td className="px-4 py-3 text-center text-zinc-400">{c._count?.insights ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{fmtDateTime(c.updatedAt)}</td>
                  </tr>
                );
              })}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                    ยังไม่มีคู่แข่งตาม filter — กด &ldquo;+ คู่แข่งใหม่&rdquo; เพื่อเริ่มเก็บข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
        {data && <p className="text-xs text-zinc-500">ทั้งหมด {data.total} คู่แข่ง</p>}
      </div>

      {/* side panel detail */}
      {panelId && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setPanelId(null)}>
          <div
            className="fixed inset-y-0 right-0 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-5 shadow-2xl duration-200 animate-in slide-in-from-right"
            onClick={(e) => e.stopPropagation()}
          >
            {detail ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">{detail.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      {detail.type && (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-300">
                          {COMPETITOR_TYPES[detail.type] ?? detail.type}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 ${(THREAT_LEVELS[detail.threatLevel] ?? THREAT_LEVELS.medium).cls}`}>
                        Threat: {(THREAT_LEVELS[detail.threatLevel] ?? THREAT_LEVELS.medium).label}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 ${(WATCH_STATUS[detail.watchStatus] ?? WATCH_STATUS.active).cls}`}>
                        {(WATCH_STATUS[detail.watchStatus] ?? WATCH_STATUS.active).label}
                      </span>
                      {detail.category.map((cat) => (
                        <span key={cat} className="rounded-full bg-zinc-800/70 px-2 py-0.5 text-zinc-400">
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setPanelId(null)} className="text-zinc-500 hover:text-zinc-300">
                    <X className="size-4" />
                  </button>
                </div>
                {(detail.strength || detail.weakness || detail.positioning) && (
                  <div className="mt-3 space-y-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-400">
                    {detail.positioning && (
                      <p className="inline-flex items-center gap-1"><Target className="size-3.5" /> {detail.positioning}</p>
                    )}
                    {detail.strength && (
                      <p className="inline-flex items-center gap-1 text-emerald-300/80"><BicepsFlexed className="size-3.5" /> {detail.strength}</p>
                    )}
                    {detail.weakness && (
                      <p className="inline-flex items-center gap-1 text-red-300/80"><Bandage className="size-3.5" /> {detail.weakness}</p>
                    )}
                  </div>
                )}

                {/* tabs */}
                <div className="mt-4 flex gap-1 border-b border-zinc-800 text-sm">
                  {TABS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`px-3 py-2 ${
                        tab === t.key
                          ? "border-b-2 border-amber-400 font-semibold text-amber-300"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {t.label}{" "}
                      <span className="text-xs text-zinc-600">
                        (
                        {t.key === "channels"
                          ? detail.channels.length
                          : t.key === "contents"
                            ? detail.contents.length
                            : detail.insights.length}
                        )
                      </span>
                    </button>
                  ))}
                </div>

                {panelError && <p className="mt-2 text-xs text-red-400">{panelError}</p>}

                {/* Channels tab */}
                {tab === "channels" && (
                  <div className="mt-3 space-y-3">
                    <form onSubmit={saveChannel} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                      <input
                        required
                        value={channelForm.platform}
                        onChange={(e) => setChannelForm({ ...channelForm, platform: e.target.value })}
                        placeholder="platform *"
                        className={`${inputCls} w-28`}
                      />
                      <input
                        required
                        value={channelForm.handle}
                        onChange={(e) => setChannelForm({ ...channelForm, handle: e.target.value })}
                        placeholder="@handle *"
                        className={`${inputCls} w-36`}
                      />
                      <input
                        type="number"
                        min={0}
                        value={channelForm.followers}
                        onChange={(e) => setChannelForm({ ...channelForm, followers: e.target.value })}
                        placeholder="followers"
                        className={`${inputCls} w-28`}
                      />
                      <input
                        value={channelForm.url}
                        onChange={(e) => setChannelForm({ ...channelForm, url: e.target.value })}
                        placeholder="URL"
                        className={`${inputCls} min-w-32 flex-1`}
                      />
                      <button
                        type="submit"
                        disabled={panelBusy}
                        className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                      >
                        {editChannelId ? "บันทึกแก้ไข" : "+ เพิ่มช่องทาง"}
                      </button>
                      {editChannelId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditChannelId(null);
                            setChannelForm({ ...emptyChannel });
                          }}
                          className="text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          ยกเลิก
                        </button>
                      )}
                    </form>
                    {detail.channels.map((ch) => (
                      <div key={ch.id} className="flex items-center gap-2 rounded-xl border border-zinc-800 p-3 text-sm">
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{ch.platform}</span>
                        {ch.url ? (
                          <a href={ch.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
                            {ch.handle}
                          </a>
                        ) : (
                          <span>{ch.handle}</span>
                        )}
                        {ch.followers != null && (
                          <span className="text-xs text-zinc-500">{ch.followers.toLocaleString()} followers</span>
                        )}
                        <span className="ml-auto flex gap-2 text-xs">
                          <button
                            onClick={() => {
                              setEditChannelId(ch.id);
                              setChannelForm({
                                platform: ch.platform,
                                handle: ch.handle,
                                url: ch.url ?? "",
                                followers: ch.followers != null ? String(ch.followers) : "",
                                notes: ch.notes ?? "",
                              });
                            }}
                            className="text-zinc-400 hover:text-amber-300"
                          >
                            แก้ไข
                          </button>
                          <button onClick={() => removeChannel(ch.id)} className="text-zinc-500 hover:text-red-300">
                            ลบ
                          </button>
                        </span>
                      </div>
                    ))}
                    {detail.channels.length === 0 && (
                      <p className="py-4 text-center text-xs text-zinc-600">ยังไม่มีช่องทาง</p>
                    )}
                  </div>
                )}

                {/* Contents tab */}
                {tab === "contents" && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-zinc-500">
                      เก็บ link + observation เท่านั้น (ไม่ scrape) — ใช้วิเคราะห์ pattern, ห้ามลอก creative ตรง ๆ (§18.5)
                    </p>
                    <form onSubmit={addContent} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                      <div className="flex flex-wrap gap-2">
                        <input
                          required
                          value={contentForm.url}
                          onChange={(e) => setContentForm({ ...contentForm, url: e.target.value })}
                          placeholder="URL คอนเทนต์ *"
                          className={`${inputCls} min-w-40 flex-1`}
                        />
                        <input
                          value={contentForm.platform}
                          onChange={(e) => setContentForm({ ...contentForm, platform: e.target.value })}
                          placeholder="platform"
                          className={`${inputCls} w-28`}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={contentForm.hook}
                          onChange={(e) => setContentForm({ ...contentForm, hook: e.target.value })}
                          placeholder="hook ที่สังเกตเห็น"
                          className={`${inputCls} min-w-40 flex-1`}
                        />
                        <input
                          value={contentForm.metricsNote}
                          onChange={(e) => setContentForm({ ...contentForm, metricsNote: e.target.value })}
                          placeholder="metrics (เช่น 1.2M views)"
                          className={`${inputCls} w-44`}
                        />
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={contentForm.notes}
                          onChange={(e) => setContentForm({ ...contentForm, notes: e.target.value })}
                          placeholder="observation เพิ่มเติม"
                          className={`${inputCls} flex-1`}
                        />
                        <button
                          type="submit"
                          disabled={panelBusy}
                          className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                        >
                          + เก็บ
                        </button>
                      </div>
                    </form>
                    {detail.contents.map((ct) => (
                      <div key={ct.id} className="space-y-1 rounded-xl border border-zinc-800 p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <a
                            href={ct.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 truncate text-sky-300 hover:underline"
                          >
                            <Link className="size-3.5 shrink-0" /> {ct.url}
                          </a>
                          {ct.platform && (
                            <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                              {ct.platform}
                            </span>
                          )}
                        </div>
                        {ct.hook && <p className="text-xs text-amber-200/80">{ct.hook}</p>}
                        {ct.metricsNote && (
                          <p className="inline-flex items-center gap-1 text-xs text-zinc-400"><TrendingUp className="size-3.5" /> {ct.metricsNote}</p>
                        )}
                        {ct.notes && <p className="text-xs text-zinc-500">{ct.notes}</p>}
                        <p className="text-xs text-zinc-700">{fmtDateTime(ct.capturedAt)}</p>
                      </div>
                    ))}
                    {detail.contents.length === 0 && (
                      <p className="py-4 text-center text-xs text-zinc-600">ยังไม่มี content ที่เก็บไว้</p>
                    )}
                  </div>
                )}

                {/* Insights tab — §18.4 แยก 3 ช่อง */}
                {tab === "insights" && (
                  <div className="mt-3 space-y-3">
                    <form onSubmit={addInsight} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                      <div>
                        <label className="text-xs font-semibold text-sky-300">
                          Fact * — สิ่งที่สังเกตเห็นจริง ตรวจสอบได้ (ห้ามใส่ความเห็น)
                        </label>
                        <textarea
                          required
                          value={insightForm.fact}
                          onChange={(e) => setInsightForm({ ...insightForm, fact: e.target.value })}
                          rows={2}
                          placeholder="เช่น คู่แข่งโพสต์คลิป live-selling ทุกวัน 20:00 ยอดวิวเฉลี่ย 500k"
                          className={`${inputCls} mt-1 w-full`}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-violet-300">
                          Assumption — สมมติฐาน/การตีความของเรา (อาจผิดได้)
                        </label>
                        <textarea
                          value={insightForm.assumption}
                          onChange={(e) => setInsightForm({ ...insightForm, assumption: e.target.value })}
                          rows={2}
                          placeholder="เช่น น่าจะเวิร์กเพราะช่วงเวลาตรงกับพฤติกรรมผู้ชมหลังเลิกงาน"
                          className={`${inputCls} mt-1 w-full`}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-emerald-300">
                          Recommendation — สิ่งที่ AISTAR ควรทำ (pattern ใหม่ของเราเอง ห้ามลอก)
                        </label>
                        <textarea
                          value={insightForm.recommendation}
                          onChange={(e) => setInsightForm({ ...insightForm, recommendation: e.target.value })}
                          rows={2}
                          placeholder="เช่น ทดลอง live ช่วง 19:30 ด้วย format ของเราเอง แล้ววัดผล 2 สัปดาห์"
                          className={`${inputCls} mt-1 w-full`}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={panelBusy || !insightForm.fact.trim()}
                        className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                      >
                        + บันทึก insight
                      </button>
                    </form>
                    {detail.insights.map((ins) => (
                      <div key={ins.id} className="space-y-1.5 rounded-xl border border-zinc-800 p-3 text-sm">
                        <p>
                          <span className="mr-1.5 rounded bg-sky-400/15 px-1.5 py-0.5 text-xs font-semibold text-sky-300">
                            FACT
                          </span>
                          {ins.fact}
                        </p>
                        {ins.assumption && (
                          <p>
                            <span className="mr-1.5 rounded bg-violet-400/15 px-1.5 py-0.5 text-xs font-semibold text-violet-300">
                              ASSUMPTION
                            </span>
                            {ins.assumption}
                          </p>
                        )}
                        {ins.recommendation && (
                          <p>
                            <span className="mr-1.5 rounded bg-emerald-400/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-300">
                              RECOMMENDATION
                            </span>
                            {ins.recommendation}
                          </p>
                        )}
                        <div className="flex items-center gap-2 pt-1 text-xs text-zinc-600">
                          <span>
                            {ins.createdByName ?? ""} · {fmtDateTime(ins.createdAt)}
                          </span>
                          {ins.convertedToCampaignId ? (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">
                              <Check className="size-3.5" /> แปลงเป็นแคมเปญแล้ว
                            </span>
                          ) : (
                            <button
                              onClick={() => convertInsight(ins.id)}
                              disabled={panelBusy}
                              className="ml-auto rounded-lg border border-emerald-400/40 px-2 py-1 text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-50"
                            >
                              แปลงเป็น Campaign
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {detail.insights.length === 0 && (
                      <p className="py-4 text-center text-xs text-zinc-600">ยังไม่มี insight</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-500">{panelError ?? "กำลังโหลด..."}</p>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function CompetitorsPage() {
  return (
    <Suspense fallback={null}>
      <CompetitorsInner />
    </Suspense>
  );
}
