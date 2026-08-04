"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Drama, ShoppingCart, Target, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";
import {
  LIVE_STATUS,
  LiveSessionListItem,
  PLATFORMS,
  Paged,
  fmtDateTimeTh,
  fmtGmv,
  platformMeta,
} from "@/lib/publishing";

const FILTER_KEYS = ["q", "platform", "status", "scheduledFrom", "scheduledTo"] as const;

interface RefItem {
  id: string;
  label: string;
}

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";
const selectCls =
  "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm outline-none focus:border-amber-400";

// ปุ่ม transition ต่อ status (ตรงกับ state machine ฝั่ง API)
const LIVE_NEXT: Record<string, { to: string; label: string; confirm?: string }[]> = {
  scheduled: [
    { to: "live", label: "เริ่มไลฟ์" },
    { to: "cancelled", label: "ยกเลิก", confirm: "ยืนยันยกเลิก live session นี้?" },
  ],
  live: [{ to: "done", label: "จบไลฟ์" }],
  done: [],
  cancelled: [],
};

function LiveInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Paged<LiveSessionListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [characters, setCharacters] = useState<RefItem[]>([]);
  const [products, setProducts] = useState<RefItem[]>([]);

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
      router.replace(`/live${params.toString() ? `?${params}` : ""}`);
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
    api<{ items: { id: string; nameTh: string; displayCode: string }[] }>("/characters?pageSize=50")
      .then((r) => setCharacters(r.items.map((c) => ({ id: c.id, label: `${c.nameTh} (${c.displayCode})` }))))
      .catch(() => {});
    api<{ items: { id: string; name: string }[] }>("/products?pageSize=50")
      .then((r) => setProducts(r.items.map((p) => ({ id: p.id, label: p.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      const v = searchParams.get(k);
      if (v) {
        if (k === "scheduledFrom") params.set(k, new Date(v).toISOString());
        else if (k === "scheduledTo") {
          const d = new Date(v);
          d.setHours(23, 59, 59, 999);
          params.set(k, d.toISOString());
        } else params.set(k, v);
      }
    }
    const page = searchParams.get("page");
    if (page) params.set("page", page);
    params.set("pageSize", "50");
    api<Paged<LiveSessionListItem>>(`/live-sessions?${params}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [searchParams, reloadKey]);

  const now = Date.now();
  const upcoming = useMemo(
    () =>
      (data?.items ?? []).filter(
        (l) => l.status === "live" || (l.status === "scheduled" && new Date(l.scheduledAt).getTime() >= now - 3600_000),
      ),
    [data, now],
  );
  const past = useMemo(() => (data?.items ?? []).filter((l) => !upcoming.includes(l)).reverse(), [data, upcoming]);

  async function transition(id: string, to: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(id);
    setError(null);
    try {
      await api(`/live-sessions/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: to }),
      });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยน status ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  const activeFilters = useMemo(
    () => FILTER_KEYS.filter((k) => searchParams.get(k)).length,
    [searchParams],
  );

  function clearFilters() {
    setQInput("");
    router.replace("/live");
  }

  function LiveCard({ live }: { live: LiveSessionListItem }) {
    const st = LIVE_STATUS[live.status] ?? LIVE_STATUS.scheduled;
    const pf = platformMeta(live.platform);
    return (
      <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all hover:-translate-y-0.5 hover:border-zinc-600 hover:shadow-lg hover:shadow-black/40">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* หน้า host จริง — ไลฟ์นี้ใครไลฟ์ เห็นทันที */}
            {live.hostCharacters.length > 0 && (
              <span className="flex shrink-0 -space-x-2.5">
                {live.hostCharacters.slice(0, 3).map((c) => (
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
            )}
            <div className="min-w-0">
              <p className="text-xs text-zinc-500">
                {pf.icon} {pf.label}
                {live.account ? ` · ${live.account}` : ""}
              </p>
              <h3 className="truncate font-semibold">{live.title}</h3>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${st.cls}`}>{st.label}</span>
        </div>
        <p className="text-sm text-amber-300">{fmtDateTimeTh(live.scheduledAt)}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {live.hostCharacters.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Drama className="size-3.5" /> {live.hostCharacters.map((c) => c.nameTh).join(", ")}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <ShoppingCart className="size-3.5" /> {live.productCount} สินค้า
          </span>
          <span className="inline-flex items-center gap-1">
            <Target className="size-3.5" /> เป้า GMV {fmtGmv(live.targetGmv)}
          </span>
        </div>
        {(LIVE_NEXT[live.status] ?? []).length > 0 && (
          <div className="flex gap-2 pt-1">
            {(LIVE_NEXT[live.status] ?? []).map((t) => (
              <button
                key={t.to}
                disabled={busyId === live.id}
                onClick={() => void transition(live.id, t.to, t.confirm)}
                className={
                  t.to === "cancelled"
                    ? "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
                    : "rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <AppShell
      title="Live Commerce Schedule"
      actions={
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + นัดไลฟ์ใหม่
        </button>
      }
    >
      <div className="space-y-4">
        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <input
            value={qInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาชื่อไลฟ์..."
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
              ...Object.entries(LIVE_STATUS).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            ตั้งแต่
            <input
              type="date"
              value={searchParams.get("scheduledFrom") ?? ""}
              onChange={(e) => setParam({ scheduledFrom: e.target.value })}
              className={`${selectCls} text-zinc-200`}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            ถึง
            <input
              type="date"
              value={searchParams.get("scheduledTo") ?? ""}
              onChange={(e) => setParam({ scheduledTo: e.target.value })}
              className={`${selectCls} text-zinc-200`}
            />
          </label>
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

        {showForm && (
          <CreateLiveForm
            characters={characters}
            products={products}
            onDone={() => {
              setShowForm(false);
              setReloadKey((k) => k + 1);
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* upcoming */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-amber-300">ไลฟ์ที่กำลังจะถึง ({upcoming.length})</h2>
          {upcoming.length === 0 && (
            <p className="rounded-2xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">
              ยังไม่มีไลฟ์ที่กำลังจะถึงตาม filter — กด &ldquo;+ นัดไลฟ์ใหม่&rdquo; เพื่อจัดตาราง
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((l) => (
              <LiveCard key={l.id} live={l} />
            ))}
          </div>
        </section>

        {/* past */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400">ที่ผ่านมา ({past.length})</h2>
          <div className="grid grid-cols-1 gap-3 opacity-80 md:grid-cols-2 xl:grid-cols-3">
            {past.map((l) => (
              <LiveCard key={l.id} live={l} />
            ))}
          </div>
        </section>

        {data && <p className="text-xs text-zinc-500">ทั้งหมด {data.total} live sessions</p>}
      </div>
    </AppShell>
  );
}

// ── create form ──────────────────────────────────────────────
function CreateLiveForm({
  characters,
  products,
  onDone,
  onCancel,
}: {
  characters: RefItem[];
  products: RefItem[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    platform: "tiktok_shop",
    scheduledAt: "",
    account: "",
    offer: "",
    script: "",
    faq: "",
    commentGuide: "",
    sceneSetup: "",
    targetGmv: "",
  });
  const [hostIds, setHostIds] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]); // productId เรียงตาม pinOrder
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePin(id: string) {
    setPinned(pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id]);
  }

  function movePin(index: number, dir: -1 | 1) {
    const next = [...pinned];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setPinned(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.scheduledAt) {
      setError("กรุณาระบุวัน-เวลาไลฟ์");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/live-sessions", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          platform: form.platform,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          account: form.account || undefined,
          offer: form.offer || undefined,
          script: form.script || undefined,
          faq: form.faq || undefined,
          commentGuide: form.commentGuide || undefined,
          sceneSetup: form.sceneSetup || undefined,
          targetGmv: form.targetGmv ? parseFloat(form.targetGmv) : undefined,
          hostCharacterIds: hostIds.length ? hostIds : undefined,
          products: pinned.length
            ? pinned.map((productId, i) => ({ productId, pinOrder: i + 1 }))
            : undefined,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง live session ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const productLabel = (id: string) => products.find((p) => p.id === id)?.label ?? id;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <p className="text-sm font-semibold text-amber-300">นัดไลฟ์ใหม่</p>
      <div className="grid grid-cols-4 gap-3">
        <input
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="ชื่อไลฟ์ *"
          className={`${inputCls} col-span-2`}
        />
        <FilterSelect
          value={form.platform}
          onChange={(v) => setForm({ ...form, platform: v })}
          options={PLATFORMS.map((p) => ({ value: p.value, label: p.label }))}
        />
        <input
          required
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <input
          value={form.account}
          onChange={(e) => setForm({ ...form, account: e.target.value })}
          placeholder="Account"
          className={inputCls}
        />
        <input
          value={form.targetGmv}
          onChange={(e) => setForm({ ...form, targetGmv: e.target.value })}
          type="number"
          min="0"
          step="any"
          placeholder="เป้า GMV (บาท)"
          className={inputCls}
        />
        <input
          value={form.offer}
          onChange={(e) => setForm({ ...form, offer: e.target.value })}
          placeholder="โปร/ข้อเสนอ เช่น ลด 50% 100 ชิ้นแรก"
          className={inputCls}
        />
      </div>

      {/* host characters */}
      <div>
        <p className="mb-1 text-xs text-zinc-500">Host characters</p>
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {characters.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setHostIds(hostIds.includes(c.id) ? hostIds.filter((x) => x !== c.id) : [...hostIds, c.id])}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                hostIds.includes(c.id)
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

      {/* product picker + pin order */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs text-zinc-500">เลือกสินค้าเข้าไลฟ์</p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePin(p.id)}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  pinned.includes(p.id)
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
        <div>
          <p className="mb-1 text-xs text-zinc-500">ลำดับ pin ตะกร้า (บน = pin แรก)</p>
          <div className="space-y-1">
            {pinned.map((id, i) => (
              <div key={id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-xs">
                <span className="w-5 text-center font-mono text-amber-300">{i + 1}</span>
                <span className="flex-1 truncate">{productLabel(id)}</span>
                <button type="button" onClick={() => movePin(i, -1)} disabled={i === 0} className="text-zinc-400 hover:text-amber-300 disabled:opacity-30">
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" onClick={() => movePin(i, 1)} disabled={i === pinned.length - 1} className="text-zinc-400 hover:text-amber-300 disabled:opacity-30">
                  <ArrowDown className="size-3.5" />
                </button>
                <button type="button" onClick={() => togglePin(id)} className="text-zinc-500 hover:text-red-300">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {pinned.length === 0 && <p className="text-xs text-zinc-600">ยังไม่ได้เลือกสินค้า</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <textarea
          value={form.script}
          onChange={(e) => setForm({ ...form, script: e.target.value })}
          placeholder="Script / รันดาวน์ไลฟ์"
          rows={3}
          className={inputCls}
        />
        <textarea
          value={form.faq}
          onChange={(e) => setForm({ ...form, faq: e.target.value })}
          placeholder="FAQ ที่คาดว่าจะถูกถาม"
          rows={3}
          className={inputCls}
        />
        <textarea
          value={form.commentGuide}
          onChange={(e) => setForm({ ...form, commentGuide: e.target.value })}
          placeholder="แนวทางตอบคอมเมนต์"
          rows={2}
          className={inputCls}
        />
        <textarea
          value={form.sceneSetup}
          onChange={(e) => setForm({ ...form, sceneSetup: e.target.value })}
          placeholder="Scene setup / ฉาก อุปกรณ์"
          rows={2}
          className={inputCls}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "นัดไลฟ์"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-zinc-500 hover:text-zinc-300">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

export default function LivePage() {
  return (
    <Suspense fallback={null}>
      <LiveInner />
    </Suspense>
  );
}
