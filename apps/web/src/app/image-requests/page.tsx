"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Clock, Image as ImageIcon, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import { FilterSelect } from "@/components/ui/filter-select";
import { useAssetImage } from "@/lib/media";
import {
  api,
  createImageRequest,
  getToken,
  listImageRequests,
  fetchBrands,
  IMAGE_REQUEST_PRIORITY,
  IMAGE_REQUEST_STATUS,
  IMAGE_REQUEST_TYPE_LABEL,
  type BrandListItem,
  type CreateImageRequestInput,
  type ImageRequestListItem,
  type ImageRequestPriority,
  type ImageRequestStatus,
  type ImageRequestTarget,
  type ImageRequestType,
} from "@/lib/api";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400";
const labelCls = "mb-1 block text-xs font-medium text-zinc-400";

const STATUS_TABS: { key: "" | ImageRequestStatus; label: string }[] = [
  { key: "", label: "ทั้งหมด" },
  { key: "open", label: "เปิด" },
  { key: "in_progress", label: "กำลังทำ" },
  { key: "review", label: "รอรีวิว" },
  { key: "revision", label: "แก้ไข" },
  { key: "approved", label: "อนุมัติแล้ว" },
  { key: "cancelled", label: "ยกเลิก" },
];

interface Assignee {
  id: string;
  name: string;
  email: string;
}

export default function ImageRequestsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ImageRequestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<"" | ImageRequestStatus>("");
  const [imageType, setImageType] = useState("");
  const [priority, setPriority] = useState("");
  const [mineOnly, setMineOnly] = useState(false); // งานภาพของฉัน (assignee = me)
  const [q, setQ] = useState("");

  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  const load = useCallback(async () => {
    try {
      const res = await listImageRequests({
        q: q || undefined,
        status: status || undefined,
        imageType: imageType || undefined,
        priority: priority || undefined,
        assigneeId: mineOnly ? "me" : undefined,
      });
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }, [q, status, imageType, priority, mineOnly]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell
      title="งานภาพ (Image Requests)"
      actions={
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + ขอภาพใหม่
        </button>
      }
    >
      <div className="space-y-4">
        {/* status tabs */}
        <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800 pb-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                status === t.key
                  ? "bg-amber-400/10 font-medium text-amber-300"
                  : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-zinc-600">{total} งาน</span>
        </div>

        {/* filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา (ชื่อ/IMG-code)..."
            className="w-56 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-amber-400"
          />
          <FilterSelect
            value={imageType}
            onChange={setImageType}
            options={[
              { value: "", label: "ทุกประเภท" },
              ...Object.entries(IMAGE_REQUEST_TYPE_LABEL).map(([v, m]) => ({ value: v, label: `${m.emoji} ${m.label}` })),
            ]}
          />
          <FilterSelect
            value={priority}
            onChange={setPriority}
            options={[
              { value: "", label: "ทุกความสำคัญ" },
              ...Object.entries(IMAGE_REQUEST_PRIORITY).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
          <button
            onClick={() => setMineOnly((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs ${
              mineOnly
                ? "border-amber-400 bg-amber-400/10 text-amber-300"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <CircleCheck className="inline size-4 align-text-bottom" /> งานภาพของฉัน
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((it) => (
            <RequestCard key={it.id} item={it} />
          ))}
        </div>
        {items.length === 0 && !error && (
          <p className="rounded-xl border border-dashed border-zinc-700 px-4 py-10 text-center text-sm text-zinc-500">
            ยังไม่มีงานภาพในมุมมองนี้ — กด &quot;+ ขอภาพใหม่&quot; เพื่อเปิดงานแรก
          </p>
        )}
      </div>

      {showForm && (
        <CreateModal
          onClose={() => setShowForm(false)}
          onCreated={(id) => {
            setShowForm(false);
            router.push(`/image-requests/${id}`);
          }}
        />
      )}
    </AppShell>
  );
}

function RequestCard({ item }: { item: ImageRequestListItem }) {
  const thumb = useAssetImage(item.latestVersionAssetId ?? null);
  const st = IMAGE_REQUEST_STATUS[item.status];
  const ty = IMAGE_REQUEST_TYPE_LABEL[item.imageType] ?? IMAGE_REQUEST_TYPE_LABEL.other;
  const prio = IMAGE_REQUEST_PRIORITY[item.priority] ?? IMAGE_REQUEST_PRIORITY.normal;
  const overdue =
    !!item.dueAt &&
    new Date(item.dueAt).getTime() < Date.now() &&
    !["approved", "cancelled"].includes(item.status);

  return (
    <Link
      href={`/image-requests/${item.id}`}
      className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:border-amber-400/50"
    >
      <div className="flex h-32 items-center justify-center bg-zinc-950/60">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <span className="text-4xl opacity-40">{ty.emoji}</span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-amber-300">{item.displayCode}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-zinc-400">
            <span className={`inline-block h-2 w-2 rounded-full ${prio.dot}`} />
            {prio.label}
          </span>
        </div>
        <p className="truncate text-sm font-medium text-zinc-100 group-hover:text-amber-200">
          {item.title}
        </p>
        <div className="flex flex-wrap gap-1 text-[10px] text-zinc-400">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5">
            {ty.emoji} {ty.label}
          </span>
          {item.platform && <span className="rounded bg-zinc-800 px-1.5 py-0.5">{item.platform}</span>}
          {item.sizeNote && <span className="rounded bg-zinc-800 px-1.5 py-0.5">{item.sizeNote}</span>}
          {(item.versionCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5"><ImageIcon className="size-4" /> {item.versionCount} เวอร์ชัน</span>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-zinc-500">
          {item.assigneeId ? (
            <span className="flex items-center gap-1.5">
              <EntityAvatar entityType="user" id={item.assigneeId} name={item.assigneeName ?? "?"} size="sm" />
              <span className="max-w-[100px] truncate">{item.assigneeName ?? "—"}</span>
            </span>
          ) : (
            <span className="text-zinc-600">ยังไม่มอบหมาย</span>
          )}
          {item.dueAt && (
            <span className={`inline-flex items-center gap-1 ${overdue ? "font-medium text-red-400" : ""}`}>
              <Clock className="size-4" /> {new Date(item.dueAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── target picker (content / campaign / episode) — สไตล์เดียวกับ work picker ของ ai-usage ──
function TargetPicker({
  value,
  onChange,
}: {
  value: { entityType: ImageRequestTarget; entityId: string; label: string } | null;
  onChange: (v: { entityType: ImageRequestTarget; entityId: string; label: string } | null) => void;
}) {
  const [kind, setKind] = useState<ImageRequestTarget>("content");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const enc = encodeURIComponent(q.trim());
        let r: { id: string; label: string }[] = [];
        if (kind === "content") {
          const res = await api<{ items: { id: string; title: string; platform?: string }[] }>(
            `/content-items?q=${enc}&pageSize=8`,
          );
          r = res.items.map((c) => ({ id: c.id, label: `${c.title}${c.platform ? ` · ${c.platform}` : ""}` }));
        } else if (kind === "campaign") {
          const res = await api<{ items: { id: string; name: string; displayCode?: string }[] }>(
            `/campaigns?q=${enc}&pageSize=8`,
          );
          r = res.items.map((c) => ({ id: c.id, label: `${c.displayCode ? `${c.displayCode} · ` : ""}${c.name}` }));
        } else {
          const res = await api<{ items: { id: string; title: string; displayCode: string }[] }>(
            `/episodes?q=${enc}&pageSize=8`,
          );
          r = res.items.map((e) => ({ id: e.id, label: `${e.displayCode} · ${e.title}` }));
        }
        setResults(r);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, kind]);

  if (value) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs text-amber-200">
        {value.label}
        <button type="button" onClick={() => onChange(null)} className="text-amber-300/70 hover:text-amber-100">
          <X className="size-4" />
        </button>
      </span>
    );
  }

  return (
    <div className="flex gap-2">
      <FilterSelect
        value={kind}
        onChange={(v) => {
          setKind(v as ImageRequestTarget);
          setResults([]);
        }}
        options={[
          { value: "content", label: "คอนเทนต์" },
          { value: "campaign", label: "แคมเปญ" },
          { value: "episode", label: "อีพี" },
        ]}
      />
      <div className="relative flex-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          className={inputCls}
          placeholder="ค้นหาปลายทางที่ภาพจะไปติด..."
        />
        {open && results.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
            {results.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => {
                  onChange({ entityType: kind, entityId: r.id, label: r.label });
                  setQ("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    imageType: "banner" as ImageRequestType,
    platform: "",
    sizeNote: "",
    copyText: "",
    brief: "",
    brandId: "",
    assigneeId: "",
    dueAt: "",
    priority: "normal" as ImageRequestPriority,
  });
  const [target, setTarget] = useState<{
    entityType: ImageRequestTarget;
    entityId: string;
    label: string;
  } | null>(null);
  const [brands, setBrands] = useState<BrandListItem[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchBrands().then(setBrands).catch(() => setBrands([]));
    api<Assignee[]>("/tasks/assignees").then(setAssignees).catch(() => setAssignees([]));
  }, []);

  async function submit() {
    if (!form.title.trim()) {
      setErr("ต้องระบุชื่องาน");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body: CreateImageRequestInput = {
        title: form.title.trim(),
        imageType: form.imageType,
        ...(form.platform.trim() ? { platform: form.platform.trim() } : {}),
        ...(form.sizeNote.trim() ? { sizeNote: form.sizeNote.trim() } : {}),
        ...(form.copyText.trim() ? { copyText: form.copyText.trim() } : {}),
        ...(form.brief.trim() ? { brief: form.brief.trim() } : {}),
        ...(form.brandId ? { brandId: form.brandId } : {}),
        ...(target ? { entityType: target.entityType, entityId: target.entityId } : {}),
        ...(form.assigneeId ? { assigneeId: form.assigneeId } : {}),
        ...(form.dueAt ? { dueAt: new Date(form.dueAt).toISOString() } : {}),
        priority: form.priority,
      };
      const created = await createImageRequest(body);
      onCreated(created.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "สร้างงานไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm">
      <div className="fixed inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-5 shadow-2xl duration-200 animate-in slide-in-from-right">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100"><ImageIcon className="size-5" /> ขอภาพใหม่</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>ชื่องาน *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputCls}
              placeholder="เช่น แบนเนอร์โปรโมทเซ็ตของขวัญปีใหม่"
            />
          </div>
          <div>
            <label className={labelCls}>ประเภทภาพ</label>
            <FilterSelect
              value={form.imageType}
              onChange={(v) => setForm({ ...form, imageType: v as ImageRequestType })}
              options={Object.entries(IMAGE_REQUEST_TYPE_LABEL).map(([v, m]) => ({ value: v, label: `${m.emoji} ${m.label}` }))}
              className="min-w-40"
            />
          </div>
          <div>
            <label className={labelCls}>แพลตฟอร์ม</label>
            <input
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className={inputCls}
              placeholder="facebook / tiktok / ig ..."
            />
          </div>
          <div>
            <label className={labelCls}>ขนาด/สัดส่วน</label>
            <input
              value={form.sizeNote}
              onChange={(e) => setForm({ ...form, sizeNote: e.target.value })}
              className={inputCls}
              placeholder="เช่น 1200x628 หรือ 9:16"
            />
          </div>
          <div>
            <label className={labelCls}>ข้อความบนภาพ (copy)</label>
            <input
              value={form.copyText}
              onChange={(e) => setForm({ ...form, copyText: e.target.value })}
              className={inputCls}
              placeholder="เช่น ลดจริง 50% เฉพาะสัปดาห์นี้"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>บรีฟ / โจทย์</label>
            <textarea
              value={form.brief}
              onChange={(e) => setForm({ ...form, brief: e.target.value })}
              rows={3}
              className={inputCls}
              placeholder="อธิบายภาพที่อยากได้ มู้ด อ้างอิง..."
            />
          </div>
          <div>
            <label className={labelCls}>แบรนด์ (ใช้ร่าง prompt จาก Brand Book)</label>
            <FilterSelect
              value={form.brandId}
              onChange={(v) => setForm({ ...form, brandId: v })}
              options={[
                { value: "", label: "— ไม่ระบุ —" },
                ...brands.map((b) => ({ value: b.id, label: b.name })),
              ]}
              className="min-w-40"
            />
          </div>
          <div>
            <label className={labelCls}>ผู้รับผิดชอบ</label>
            <FilterSelect
              value={form.assigneeId}
              onChange={(v) => setForm({ ...form, assigneeId: v })}
              options={[
                { value: "", label: "— ยังไม่มอบหมาย —" },
                ...assignees.map((a) => ({ value: a.id, label: a.name })),
              ]}
              className="min-w-40"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>ปลายทางที่ภาพจะไปติด (content / campaign / อีพี)</label>
            <TargetPicker value={target} onChange={setTarget} />
          </div>
          <div>
            <label className={labelCls}>กำหนดส่ง</label>
            <input
              type="date"
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>ความสำคัญ</label>
            <FilterSelect
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v as ImageRequestPriority })}
              options={Object.entries(IMAGE_REQUEST_PRIORITY).map(([v, m]) => ({ value: v, label: m.label }))}
              className="min-w-40"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? "กำลังสร้าง..." : "เปิดงานภาพ"}
          </button>
          <button onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-300">
            ยกเลิก
          </button>
          {err && <span className="text-sm text-red-400">{err}</span>}
        </div>
      </div>
    </div>
  );
}
