"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock, File, Handshake, MessageSquare, Phone, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import { FilterSelect } from "@/components/ui/filter-select";
import { useAssetImage } from "@/lib/media";
import { api, getToken } from "@/lib/api";
import type { JobDetail, JobDeliverable, JobStatus } from "@/lib/api";
import { JOB_DELIVERABLE_STATUS, JOB_NEXT, JOB_PRIORITY, JOB_STATUS, JOB_TYPES } from "@/lib/api";
import { uploadAsset, type Asset } from "@/lib/assets";

type PickItem = { id: string; label: string; sub?: string };

// generic search-picker: ยิง endpoint แล้วให้เลือกเพิ่ม
function Picker({
  placeholder,
  search,
  onPick,
}: {
  placeholder: string;
  search: (q: string) => Promise<PickItem[]>;
  onPick: (item: PickItem) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickItem[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await search(v).catch(() => []);
      setResults(r);
      setOpen(true);
    }, 250);
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => q && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm outline-none focus:border-amber-400"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onPick(r);
                setQ("");
                setResults([]);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              {r.label} {r.sub && <span className="text-xs text-zinc-500">{r.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [titleEdit, setTitleEdit] = useState(false);
  const [titleVal, setTitleVal] = useState("");
  const [brief, setBrief] = useState("");
  const [spec, setSpec] = useState({ qtyImages: "", qtyClips: "", revisionsIncluded: "" });
  const [price, setPrice] = useState({ quotePrice: "", depositAmount: "", paymentStatus: "unpaid" });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  const load = useCallback(() => {
    if (!jobId) return;
    api<JobDetail>(`/jobs/${jobId}`)
      .then((res) => {
        setJob(res);
        setTitleVal(res.title);
        setBrief(res.brief ?? "");
        setSpec({
          qtyImages: res.qtyImages?.toString() ?? "",
          qtyClips: res.qtyClips?.toString() ?? "",
          revisionsIncluded: res.revisionsIncluded?.toString() ?? "1",
        });
        setPrice({
          quotePrice: res.quotePrice?.toString() ?? "",
          depositAmount: res.depositAmount?.toString() ?? "",
          paymentStatus: res.paymentStatus ?? "unpaid",
        });
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchJob(body: Record<string, unknown>, okMsg?: string) {
    try {
      await api(`/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify(body) });
      load();
      if (okMsg) showToast(okMsg);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function changeStatus(next: JobStatus) {
    try {
      await api(`/jobs/${jobId}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function createTask() {
    if (!job) return;
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: `[${job.displayCode}] ${job.title}`,
          entityType: "job",
          entityId: job.id,
        }),
      });
      showToast("สร้าง Task ใน My Work แล้ว");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "สร้าง Task ไม่สำเร็จ");
    }
  }

  if (!job) {
    return (
      <AppShell title="งาน">
        <div className="space-y-3">
          <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300">
            <ArrowLeft className="size-4" /> กลับบอร์ด
          </Link>
          {error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : (
            <p className="text-sm text-zinc-500">กำลังโหลด...</p>
          )}
        </div>
      </AppShell>
    );
  }

  const st = JOB_STATUS[job.status];
  const ty = JOB_TYPES.find((t) => t.value === job.type);
  const prio = JOB_PRIORITY[job.priority] ?? JOB_PRIORITY.normal;
  const productIds = job.products.map((p) => p.id);
  const presenterIds = job.presenters.map((p) => p.id);
  const crewList = job.crew.map((c) => ({ creatorId: c.creatorId, roleNote: c.roleNote ?? undefined }));

  const cardCls = "rounded-2xl border border-zinc-800 bg-zinc-900 p-4";
  const labelCls = "mb-2 text-sm font-semibold text-amber-300";
  const inputCls = "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm outline-none focus:border-amber-400";

  return (
    <AppShell title={`${job.displayCode} · ${job.title}`}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300">
            <ArrowLeft className="size-4" /> กลับบอร์ด
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={createTask}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              + สร้าง Task ใน My Work
            </button>
            {!job.archivedAt ? (
              <button
                onClick={() =>
                  api(`/jobs/${jobId}`, { method: "DELETE" })
                    .then(load)
                    .catch((err) => showToast(err instanceof Error ? err.message : "archive ไม่สำเร็จ"))
                }
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-500 hover:text-red-300"
              >
                archive
              </button>
            ) : (
              <button
                onClick={() =>
                  api(`/jobs/${jobId}/unarchive`, { method: "PATCH" })
                    .then(load)
                    .catch((err) => showToast(err instanceof Error ? err.message : "กู้คืนไม่สำเร็จ"))
                }
                className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm text-amber-300"
              >
                กู้คืน
              </button>
            )}
          </div>
        </div>

        {/* header */}
        <div className={cardCls}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-amber-300">{job.displayCode}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
              {ty ? `${ty.emoji} ${ty.label}` : job.type}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
              <span className={`inline-block h-2 w-2 rounded-full ${prio.dot}`} /> {prio.label}
            </span>
            {job.archivedAt && (
              <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-300">archived</span>
            )}
          </div>

          <div className="mt-3">
            {titleEdit ? (
              <div className="flex items-center gap-2">
                <input
                  value={titleVal}
                  onChange={(e) => setTitleVal(e.target.value)}
                  className={`${inputCls} flex-1 text-lg`}
                />
                <button
                  onClick={() => {
                    patchJob({ title: titleVal });
                    setTitleEdit(false);
                  }}
                  className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950"
                >
                  บันทึก
                </button>
                <button onClick={() => setTitleEdit(false)} className="text-sm text-zinc-500">
                  ยกเลิก
                </button>
              </div>
            ) : (
              <h2
                onClick={() => setTitleEdit(true)}
                className="cursor-text text-2xl font-semibold text-zinc-100 hover:text-amber-200"
                title="คลิกเพื่อแก้ชื่อ"
              >
                {job.title}
              </h2>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <Handshake className="size-4" />
              <Link href={`/clients/${job.client.id}`} className="hover:text-amber-300">
                {job.client.name}
              </Link>
            </span>
            <label className="flex items-center gap-1">
              <Clock className="size-4" /> ครบกำหนด:
              <input
                type="date"
                value={job.dueDate ? job.dueDate.slice(0, 10) : ""}
                onChange={(e) => patchJob({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className={`${inputCls} py-1`}
              />
            </label>
            <label className="flex items-center gap-1">
              ความสำคัญ:
              <FilterSelect
                value={job.priority}
                onChange={(v) => patchJob({ priority: v })}
                options={Object.entries(JOB_PRIORITY).map(([v, m]) => ({ value: v, label: m.label }))}
              />
            </label>
          </div>

          {/* status transitions */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
            <span className="text-xs text-zinc-500">เปลี่ยนสถานะ:</span>
            {JOB_NEXT[job.status].length === 0 && <span className="text-xs text-zinc-600">— งานปิดแล้ว —</span>}
            {JOB_NEXT[job.status].map((next) => (
              <button
                key={next}
                onClick={() => changeStatus(next)}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${
                  next === "cancelled"
                    ? "border border-red-900 text-red-300 hover:bg-red-950"
                    : "bg-amber-400 text-zinc-950 hover:bg-amber-300"
                }`}
              >
                <ArrowRight className="size-4" /> {JOB_STATUS[next].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* brief */}
          <div className={cardCls}>
            <p className={labelCls}>โจทย์ / บรีฟ</p>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onBlur={() => brief !== (job.brief ?? "") && patchJob({ brief })}
              rows={4}
              placeholder="สรุปโจทย์จากลูกค้า..."
              className={`${inputCls} w-full`}
            />
          </div>

          {/* deliverable spec */}
          <div className={cardCls}>
            <p className={labelCls}>สเปกส่งมอบ</p>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs text-zinc-500">
                จำนวนภาพ
                <input
                  type="number"
                  value={spec.qtyImages}
                  onChange={(e) => setSpec({ ...spec, qtyImages: e.target.value })}
                  onBlur={() => patchJob({ qtyImages: spec.qtyImages ? Number(spec.qtyImages) : null })}
                  className={`${inputCls} mt-1 w-full`}
                />
              </label>
              <label className="text-xs text-zinc-500">
                จำนวนคลิป
                <input
                  type="number"
                  value={spec.qtyClips}
                  onChange={(e) => setSpec({ ...spec, qtyClips: e.target.value })}
                  onBlur={() => patchJob({ qtyClips: spec.qtyClips ? Number(spec.qtyClips) : null })}
                  className={`${inputCls} mt-1 w-full`}
                />
              </label>
              <label className="text-xs text-zinc-500">
                แก้ได้กี่รอบ
                <input
                  type="number"
                  value={spec.revisionsIncluded}
                  onChange={(e) => setSpec({ ...spec, revisionsIncluded: e.target.value })}
                  onBlur={() => patchJob({ revisionsIncluded: spec.revisionsIncluded ? Number(spec.revisionsIncluded) : 0 })}
                  className={`${inputCls} mt-1 w-full`}
                />
              </label>
            </div>
          </div>

          {/* products */}
          <div className={cardCls}>
            <p className={labelCls}>สินค้าที่รีวิว ({job.products.length})</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {job.products.map((p) => (
                <span key={p.id} className="flex items-center gap-2 rounded-lg bg-zinc-800 px-2 py-1 text-sm text-zinc-200">
                  <EntityAvatar entityType="product" id={p.id} name={p.name} size="sm" />
                  {p.name}
                  <button
                    onClick={() => patchJob({ productIds: productIds.filter((id) => id !== p.id) })}
                    className="text-zinc-500 hover:text-red-300"
                  >
                    <X className="size-4" />
                  </button>
                </span>
              ))}
              {job.products.length === 0 && <span className="text-xs text-zinc-600">ยังไม่มีสินค้า</span>}
            </div>
            <Picker
              placeholder="เพิ่มสินค้า..."
              search={async (q) => {
                const res = await api<{ items: { id: string; name: string; displayCode: string }[] }>(
                  `/products?q=${encodeURIComponent(q)}&pageSize=8`,
                );
                return res.items
                  .filter((p) => !productIds.includes(p.id))
                  .map((p) => ({ id: p.id, label: p.name, sub: p.displayCode }));
              }}
              onPick={(item) => patchJob({ productIds: [...productIds, item.id] })}
            />
          </div>

          {/* presenters */}
          <div className={cardCls}>
            <p className={labelCls}>Presenter ({job.presenters.length})</p>
            <div className="mb-2 flex flex-wrap gap-3">
              {job.presenters.map((c) => (
                <div key={c.id} className="flex flex-col items-center">
                  <EntityAvatar entityType="character" id={c.id} name={c.nameTh} size="lg" />
                  <span className="mt-1 max-w-[64px] truncate text-xs text-zinc-300">{c.nameTh}</span>
                  <button
                    onClick={() => patchJob({ characterIds: presenterIds.filter((id) => id !== c.id) })}
                    className="text-[10px] text-zinc-500 hover:text-red-300"
                  >
                    ลบ
                  </button>
                </div>
              ))}
              {job.presenters.length === 0 && <span className="text-xs text-zinc-600">ยังไม่มี presenter</span>}
            </div>
            <Picker
              placeholder="เพิ่ม presenter..."
              search={async (q) => {
                const res = await api<{ items: { id: string; nameTh: string; displayCode: string }[] }>(
                  `/characters?q=${encodeURIComponent(q)}&pageSize=8`,
                );
                return res.items
                  .filter((c) => !presenterIds.includes(c.id))
                  .map((c) => ({ id: c.id, label: c.nameTh, sub: c.displayCode }));
              }}
              onPick={(item) => patchJob({ characterIds: [...presenterIds, item.id] })}
            />
          </div>

          {/* crew */}
          <div className={cardCls}>
            <p className={labelCls}>ทีมผลิต ({job.crew.length})</p>
            <div className="mb-2 space-y-2">
              {job.crew.map((c) => (
                <div key={c.creatorId} className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm">
                  <span className="flex-1 text-zinc-200">{c.name ?? "—"}</span>
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-amber-300">
                      <Phone className="size-4" /> {c.phone}
                    </a>
                  )}
                  {c.line && <span className="inline-flex items-center gap-1 text-xs text-zinc-400"><MessageSquare className="size-4" /> {c.line}</span>}
                  <input
                    defaultValue={c.roleNote ?? ""}
                    placeholder="หน้าที่"
                    onBlur={(e) => {
                      const nn = e.target.value;
                      if (nn !== (c.roleNote ?? "")) {
                        patchJob({
                          crew: crewList.map((x) => (x.creatorId === c.creatorId ? { ...x, roleNote: nn } : x)),
                        });
                      }
                    }}
                    className="w-28 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={() => patchJob({ crew: crewList.filter((x) => x.creatorId !== c.creatorId) })}
                    className="text-zinc-500 hover:text-red-300"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              {job.crew.length === 0 && <span className="text-xs text-zinc-600">ยังไม่มีทีมผลิต</span>}
            </div>
            <Picker
              placeholder="เพิ่มทีมผลิต..."
              search={async (q) => {
                const res = await api<{ id: string; name: string; line?: string | null }[]>(
                  `/creators?q=${encodeURIComponent(q)}`,
                );
                return res
                  .filter((c) => !crewList.some((x) => x.creatorId === c.id))
                  .map((c) => ({ id: c.id, label: c.name, sub: c.line ?? undefined }));
              }}
              onPick={(item) => patchJob({ crew: [...crewList, { creatorId: item.id, roleNote: undefined }] })}
            />
          </div>

          {/* pricing */}
          <div className={cardCls}>
            <div className="mb-2 flex items-center justify-between">
              <p className={`${labelCls} mb-0`}>ราคา</p>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">เฟส 2 จะมี dashboard</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs text-zinc-500">
                เสนอราคา (บาท)
                <input
                  type="number"
                  value={price.quotePrice}
                  onChange={(e) => setPrice({ ...price, quotePrice: e.target.value })}
                  onBlur={() => patchJob({ quotePrice: price.quotePrice ? Number(price.quotePrice) : null })}
                  className={`${inputCls} mt-1 w-full`}
                />
              </label>
              <label className="text-xs text-zinc-500">
                มัดจำ (บาท)
                <input
                  type="number"
                  value={price.depositAmount}
                  onChange={(e) => setPrice({ ...price, depositAmount: e.target.value })}
                  onBlur={() => patchJob({ depositAmount: price.depositAmount ? Number(price.depositAmount) : null })}
                  className={`${inputCls} mt-1 w-full`}
                />
              </label>
              <label className="text-xs text-zinc-500">
                สถานะจ่ายเงิน
                <FilterSelect
                  value={price.paymentStatus}
                  onChange={(v) => {
                    setPrice({ ...price, paymentStatus: v });
                    patchJob({ paymentStatus: v });
                  }}
                  options={[
                    { value: "unpaid", label: "ยังไม่จ่าย" },
                    { value: "deposit_paid", label: "จ่ายมัดจำแล้ว" },
                    { value: "paid", label: "จ่ายครบแล้ว" },
                  ]}
                  className="mt-1 w-full"
                />
              </label>
            </div>
          </div>
        </div>

        {/* deliverables timeline */}
        <div className={cardCls}>
          <div className="mb-3 flex items-center justify-between">
            <p className={`${labelCls} mb-0`}>รอบส่งมอบ (Deliverables)</p>
            <button
              onClick={() =>
                api(`/jobs/${jobId}/deliverables`, { method: "POST", body: JSON.stringify({}) })
                  .then(load)
                  .catch((err) => showToast(err instanceof Error ? err.message : "เพิ่มรอบไม่สำเร็จ"))
              }
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
            >
              + เพิ่มรอบส่งมอบ
            </button>
          </div>
          <div className="space-y-3">
            {job.deliverables.map((d) => (
              <DeliverableCard key={d.id} jobId={job.id} d={d} onChange={load} onToast={showToast} />
            ))}
            {job.deliverables.length === 0 && (
              <p className="rounded-xl border border-dashed border-zinc-700 px-4 py-6 text-center text-sm text-zinc-500">
                ยังไม่มีรอบส่งมอบ
              </p>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-amber-200 shadow-lg ring-1 ring-amber-400/30">
          {toast}
        </div>
      )}
    </AppShell>
  );
}

function DeliverableCard({
  jobId,
  d,
  onChange,
  onToast,
}: {
  jobId: string;
  d: JobDeliverable;
  onChange: () => void;
  onToast: (m: string) => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dst = JOB_DELIVERABLE_STATUS[d.status];

  const loadAssets = useCallback(() => {
    api<{ items: Asset[] }>(`/assets?entityType=job_deliverable&entityId=${d.id}`)
      .then((res) => setAssets(res.items))
      .catch(() => setAssets([]));
  }, [d.id]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAsset(file, {
        assetType: "deliverable",
        entityType: "job_deliverable",
        entityId: d.id,
        linkRole: "deliverable",
      });
      loadAssets();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function setStatus(status: string) {
    await api(`/jobs/${jobId}/deliverables/${d.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
      .then(onChange)
      .catch((err) => onToast(err instanceof Error ? err.message : "อัปเดตไม่สำเร็จ"));
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-200">รอบ {d.round}</span>
          {d.title && <span className="text-sm text-zinc-300">{d.title}</span>}
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${dst.cls}`}>{dst.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setStatus("submitted")} className="rounded px-2 py-0.5 text-[11px] text-sky-300 hover:bg-zinc-800">
            ส่งแล้ว
          </button>
          <button onClick={() => setStatus("approved")} className="rounded px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-zinc-800">
            ผ่าน
          </button>
          <button onClick={() => setStatus("rejected")} className="rounded px-2 py-0.5 text-[11px] text-red-300 hover:bg-zinc-800">
            ไม่ผ่าน
          </button>
        </div>
      </div>

      {/* attachments grid */}
      <div className="mt-2 flex flex-wrap gap-2">
        {assets.map((a) => (
          <AttachmentThumb key={a.id} asset={a} />
        ))}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-500 hover:border-amber-400 hover:text-amber-300 disabled:opacity-50"
        >
          {uploading ? "..." : "+ ไฟล์"}
        </button>
        <input ref={fileRef} type="file" onChange={onFile} className="hidden" />
      </div>

      <textarea
        defaultValue={d.clientFeedback ?? ""}
        placeholder="ฟีดแบ็กจากลูกค้า..."
        onBlur={(e) => {
          if (e.target.value !== (d.clientFeedback ?? "")) {
            api(`/jobs/${jobId}/deliverables/${d.id}`, {
              method: "PATCH",
              body: JSON.stringify({ clientFeedback: e.target.value }),
            })
              .then(onChange)
              .catch(() => undefined);
          }
        }}
        rows={2}
        className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-amber-400"
      />
    </div>
  );
}

function AttachmentThumb({ asset }: { asset: Asset }) {
  const url = useAssetImage(asset.mimeType.startsWith("image/") ? asset.id : null);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={asset.originalFilename} className="h-16 w-16 rounded-lg object-cover" title={asset.originalFilename} />;
  }
  return (
    <div
      className="flex h-16 w-16 items-center justify-center rounded-lg bg-zinc-800"
      title={asset.originalFilename}
    >
      <File className="size-6" />
    </div>
  );
}
