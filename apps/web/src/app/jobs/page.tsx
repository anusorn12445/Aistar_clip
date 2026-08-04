"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clapperboard, Clock, Handshake, Package, ShoppingBag } from "lucide-react";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import CoverPicker from "@/components/CoverPicker";
import { FilterSelect } from "@/components/ui/filter-select";
import { useAssetImage, useEntityThumb } from "@/lib/media";
import { api, getToken } from "@/lib/api";
import type { Client, JobListItem, JobStatus } from "@/lib/api";
import { JOB_DELIVERABLE_STATUS, JOB_NEXT, JOB_PRIORITY, JOB_STATUS, JOB_TYPES } from "@/lib/api";
import { fmtPrice, fmtDate, type Paged } from "@/lib/catalog";

// 10 สถานะ → 6 คอลัมน์ทำงานหลัก. target = สถานะที่พยายามเปลี่ยนไปเมื่อ drop ลงคอลัมน์
const COLUMNS: { key: string; label: string; statuses: JobStatus[]; target: JobStatus; accent: string }[] = [
  { key: "inquiry", label: "รับบรีฟ", statuses: ["inquiry"], target: "inquiry", accent: "border-zinc-600" },
  { key: "quoted", label: "เสนอราคา", statuses: ["quoted"], target: "quoted", accent: "border-sky-700" },
  { key: "confirmed", label: "ยืนยันแล้ว", statuses: ["confirmed"], target: "confirmed", accent: "border-indigo-700" },
  { key: "production", label: "กำลังผลิต", statuses: ["in_production", "internal_qc"], target: "in_production", accent: "border-amber-700" },
  { key: "delivered", label: "ส่งมอบ / แก้", statuses: ["delivered", "revision"], target: "delivered", accent: "border-teal-700" },
  { key: "closed", label: "ปิดงาน", statuses: ["approved", "closed"], target: "approved", accent: "border-emerald-700" },
];

function columnKeyOf(status: JobStatus): string | null {
  return COLUMNS.find((c) => c.statuses.includes(status))?.key ?? null;
}

const SORT_OPTIONS = [
  { value: "updatedAt:desc", label: "อัปเดตล่าสุด" },
  { value: "dueDate:asc", label: "ครบกำหนดเร็วสุด" },
  { value: "createdAt:desc", label: "สร้างล่าสุด" },
];

function dueChip(due?: string | null): { text: string; cls: string } | null {
  if (!due) return null;
  const d = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  const text = fmtDate(due);
  if (diff < 0) return { text: `${text} (เลย)`, cls: "bg-red-950 text-red-300" };
  if (diff <= 3) return { text, cls: "bg-amber-950 text-amber-300" };
  return { text, cls: "bg-zinc-800 text-zinc-400" };
}

function JobsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Paged<JobListItem> | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    clientId: "",
    type: "video_review",
    priority: "normal",
    dueDate: "",
    quotePrice: "",
  });
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
      router.replace(`/jobs${params.toString() ? `?${params}` : ""}`);
    },
    [router, searchParams],
  );

  function onSearchChange(value: string) {
    setQInput(value);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => setParam({ q: value }), 400);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  const load = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    // board ต้องเห็นทุกงานพร้อมกัน — ขอ pageSize ใหญ่สุด
    if (!params.get("pageSize")) params.set("pageSize", "50");
    api<Paged<JobListItem>>(`/jobs?${params.toString()}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<Client[]>("/clients?status=active")
      .then(setClients)
      .catch(() => setClients([]));
  }, []);

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  async function moveJob(job: JobListItem, colKey: string) {
    if (columnKeyOf(job.status) === colKey) return; // อยู่คอลัมน์เดิม
    const col = COLUMNS.find((c) => c.key === colKey);
    if (!col) return;
    if (!JOB_NEXT[job.status].includes(col.target)) {
      showToast(`ย้าย "${job.displayCode}" ไป "${col.label}" ไม่ได้ตามลำดับงาน`);
      return;
    }
    // optimistic
    const prev = data;
    setData((d) =>
      d ? { ...d, items: d.items.map((j) => (j.id === job.id ? { ...j, status: col.target } : j)) } : d,
    );
    try {
      await api(`/jobs/${job.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: col.target }),
      });
      load();
    } catch (err) {
      setData(prev ?? null); // revert
      showToast(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          clientId: form.clientId,
          type: form.type,
          priority: form.priority,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          quotePrice: form.quotePrice ? Number(form.quotePrice) : undefined,
        }),
      });
      setShowForm(false);
      setForm({ title: "", clientId: "", type: "video_review", priority: "normal", dueDate: "", quotePrice: "" });
      router.push(`/jobs/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างงานไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

  const items = data?.items ?? [];
  const archived = searchParams.get("archived") === "1";

  return (
    <AppShell
      title="Jobs / งานรับจ้างผลิต"
      actions={
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + รับงานใหม่
        </button>
      }
    >
      <div className="space-y-4">
        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <input
            value={qInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาชื่องาน / รหัส..."
            className={`${inputCls} w-56 bg-zinc-900`}
          />
          <FilterSelect
            value={searchParams.get("clientId") ?? ""}
            onChange={(v) => setParam({ clientId: v })}
            options={[
              { value: "", label: "ลูกค้า: ทั้งหมด" },
              ...clients.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <FilterSelect
            value={searchParams.get("type") ?? ""}
            onChange={(v) => setParam({ type: v })}
            options={[
              { value: "", label: "ประเภท: ทั้งหมด" },
              ...JOB_TYPES.map((t) => ({ value: t.value, label: `${t.emoji} ${t.label}` })),
            ]}
          />
          <FilterSelect
            value={searchParams.get("priority") ?? ""}
            onChange={(v) => setParam({ priority: v })}
            options={[
              { value: "", label: "ความสำคัญ: ทั้งหมด" },
              ...Object.entries(JOB_PRIORITY).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
          <FilterSelect
            value={`${searchParams.get("sortBy") ?? "updatedAt"}:${searchParams.get("sortDir") ?? "desc"}`}
            onChange={(v) => {
              const [sortBy, sortDir] = v.split(":");
              setParam({ sortBy, sortDir });
            }}
            options={SORT_OPTIONS.map((s) => ({ value: s.value, label: `เรียง: ${s.label}` }))}
          />
          <button
            onClick={() => setParam({ archived: archived ? "" : "1" })}
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${
              archived ? "border-amber-400 text-amber-300" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <Package className="size-4" /> {archived ? "กำลังดู archive" : "archive"}
          </button>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-700 p-0.5">
            <button
              onClick={() => setView("board")}
              className={`rounded px-3 py-1 text-sm ${view === "board" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400"}`}
            >
              บอร์ด
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded px-3 py-1 text-sm ${view === "list" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400"}`}
            >
              รายการ
            </button>
          </div>
        </div>

        {/* create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm font-semibold text-amber-300">รับงานใหม่</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="ชื่องาน *"
                className={inputCls}
              />
              <FilterSelect
                value={form.clientId}
                onChange={(v) => setForm({ ...form, clientId: v })}
                options={[
                  { value: "", label: "— เลือกลูกค้า * —" },
                  ...clients.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <FilterSelect
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                options={JOB_TYPES.map((t) => ({ value: t.value, label: `${t.emoji} ${t.label}` }))}
              />
              <FilterSelect
                value={form.priority}
                onChange={(v) => setForm({ ...form, priority: v })}
                options={Object.entries(JOB_PRIORITY).map(([v, m]) => ({ value: v, label: m.label }))}
              />
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className={inputCls}
              />
              <input
                type="number"
                value={form.quotePrice}
                onChange={(e) => setForm({ ...form, quotePrice: e.target.value })}
                placeholder="เสนอราคา (บาท)"
                className={inputCls}
              />
            </div>
            {clients.length === 0 && (
              <p className="text-xs text-amber-400">
                ยังไม่มีลูกค้า — ไปเพิ่มที่เมนู &ldquo;Clients / ลูกค้า&rdquo; ก่อน
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || !form.clientId}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "กำลังสร้าง..." : "สร้างงาน"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm text-zinc-500 hover:text-zinc-300">
                ยกเลิก
              </button>
            </div>
          </form>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {data && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-12 text-center text-sm text-zinc-500">
            ยังไม่มีงานตาม filter — กด &ldquo;+ รับงานใหม่&rdquo; เพื่อเริ่ม
          </div>
        )}

        {/* board */}
        {view === "board" && items.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {COLUMNS.map((col) => {
              const colJobs = items.filter((j) => col.statuses.includes(j.status));
              const isDrop = dragId !== null && dragOverCol === col.key;
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverCol !== col.key) setDragOverCol(col.key);
                  }}
                  onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = dragId ?? e.dataTransfer.getData("text/plain");
                    setDragOverCol(null);
                    const job = items.find((j) => j.id === id);
                    if (job) moveJob(job, col.key);
                  }}
                  className={`flex w-72 shrink-0 flex-col rounded-2xl border-t-2 bg-zinc-900/40 ${col.accent} ${
                    isDrop ? "ring-2 ring-amber-400/50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between px-3 py-2">
                    <p className="text-sm font-semibold text-zinc-200">{col.label}</p>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{colJobs.length}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 px-2 pb-3">
                    {colJobs.map((j) => (
                      <JobCard
                        key={j.id}
                        job={j}
                        clientName={j.client?.name ?? clientName.get(j.clientId) ?? "—"}
                        draggable
                        onDragStart={(e) => {
                          setDragId(j.id);
                          e.dataTransfer.setData("text/plain", j.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragOverCol(null);
                        }}
                        onClick={() => router.push(`/jobs/${j.id}`)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* list */}
        {view === "list" && items.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2">รหัส</th>
                  <th className="px-3 py-2">งาน</th>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2">ประเภท</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">ครบกำหนด</th>
                  <th className="px-3 py-2 text-right">ราคา</th>
                </tr>
              </thead>
              <tbody>
                {items.map((j) => {
                  const st = JOB_STATUS[j.status];
                  const ty = JOB_TYPES.find((t) => t.value === j.type);
                  return (
                    <tr
                      key={j.id}
                      onClick={() => router.push(`/jobs/${j.id}`)}
                      className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-900/60"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-amber-300">{j.displayCode}</td>
                      <td className="px-3 py-2 text-zinc-200">{j.title}</td>
                      <td className="px-3 py-2 text-zinc-400">{j.client?.name ?? clientName.get(j.clientId) ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-400">{ty ? `${ty.emoji} ${ty.label}` : j.type}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{fmtDate(j.dueDate)}</td>
                      <td className="px-3 py-2 text-right text-zinc-300">{j.quotePrice ? fmtPrice(j.quotePrice) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && <p className="text-xs text-zinc-500">ทั้งหมด {data.total} งาน</p>}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-amber-200 shadow-lg ring-1 ring-amber-400/30">
          {toast}
        </div>
      )}
    </AppShell>
  );
}

function JobCard({
  job,
  clientName,
  onClick,
  ...drag
}: {
  job: JobListItem;
  clientName: string;
  onClick: () => void;
} & React.HTMLAttributes<HTMLDivElement>) {
  const thumb = useEntityThumb("job", job.thumbAssetId ? null : job.id);
  const [override, setOverride] = useState<string | null>(null);
  const finalThumb = override ?? job.thumbAssetId ?? thumb;
  const ty = JOB_TYPES.find((t) => t.value === job.type);
  const due = dueChip(job.dueDate);
  const prio = JOB_PRIORITY[job.priority] ?? JOB_PRIORITY.normal;
  const delivery = job.latestDeliverableStatus ? JOB_DELIVERABLE_STATUS[job.latestDeliverableStatus] : null;

  return (
    <div
      {...drag}
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 transition hover:border-zinc-600"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-amber-300">{job.displayCode}</span>
        <span className="flex items-center gap-1 text-[10px] text-zinc-500">
          <span onClick={(e) => e.stopPropagation()}>
            <CoverPicker
              entityType="job"
              entityId={job.id}
              name={job.title}
              assetType="job_cover"
              onChanged={setOverride}
              triggerClass="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700"
              triggerLabel="ปก"
            />
          </span>
          <span className={`inline-block h-2 w-2 rounded-full ${prio.dot}`} title={`ความสำคัญ: ${prio.label}`} />
          {ty?.emoji}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium text-zinc-100">{job.title}</p>
      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-500">
        <Handshake className="size-4 shrink-0" /> {clientName}
      </p>

      {finalThumb && <JobThumb assetId={finalThumb} />}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {due && (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${due.cls}`}>
            <Clock className="size-3.5" /> {due.text}
          </span>
        )}
        {job.quotePrice && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-emerald-300">฿{fmtPrice(job.quotePrice)}</span>
        )}
        {delivery && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${delivery.cls}`}>ส่งมอบ: {delivery.label}</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {(job.presenterIds ?? []).slice(0, 4).map((id) => (
            <EntityAvatar key={id} entityType="character" id={id} name="presenter" size="sm" className="ring-2 ring-zinc-900" />
          ))}
        </div>
        <span className="text-[10px] text-zinc-600">
          <ShoppingBag className="inline size-4 align-text-bottom" /> {job.counts?.products ?? 0} ·{" "}
          <Clapperboard className="inline size-4 align-text-bottom" /> {job.counts?.deliverables ?? 0}
        </span>
      </div>
    </div>
  );
}

function JobThumb({ assetId }: { assetId: string }) {
  const url = useAssetImage(assetId);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="mt-2 h-24 w-full rounded-lg object-cover" />;
}

export default function JobsPage() {
  return (
    <Suspense fallback={null}>
      <JobsInner />
    </Suspense>
  );
}
