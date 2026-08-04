"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CircleCheck, ClipboardList, Clock, File, Tag, Target, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import { FilterSelect } from "@/components/ui/filter-select";
import { useAssetImage } from "@/lib/media";
import { uploadAsset } from "@/lib/assets";
import {
  api,
  cancelImageRequest,
  changeImageRequestStatus,
  draftImageRequestPrompt,
  getImageRequest,
  getToken,
  getUser,
  updateImageRequest,
  IMAGE_REQUEST_PRIORITY,
  IMAGE_REQUEST_STATUS,
  IMAGE_REQUEST_TARGET_LABEL,
  IMAGE_REQUEST_TYPE_LABEL,
  type ImageRequestDetail,
  type ImageRequestStatus,
  type ImageRequestVersion,
} from "@/lib/api";

const cardCls = "rounded-2xl border border-zinc-800 bg-zinc-900 p-4";
const labelCls = "mb-2 text-sm font-semibold text-amber-300";
const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm outline-none focus:border-amber-400";

interface Assignee {
  id: string;
  name: string;
  email: string;
}

// role ที่ปกติถือสิทธิ์ A บน image_request (ตาม seed) — ใช้ซ่อน/โชว์ปุ่มเท่านั้น
// server เช็คของจริงเสมอ (requester OR role ถือ A)
const APPROVER_ROLES = ["admin", "founder", "creative_lead", "qc_reviewer"];

export default function ImageRequestDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  // อ่าน user จาก localStorage หลัง mount เท่านั้น — อ่านตอน render ทำ hydration mismatch
  // (server ไม่มี localStorage) → React 19 ทิ้ง SSR tree ทั้งหน้า (แบบเดียวกับ AppShell)
  const [me, setMe] = useState<ReturnType<typeof getUser>>(null);
  useEffect(() => {
    setMe(getUser());
  }, []);

  const [req, setReq] = useState<ImageRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);

  // draft prompt
  const [promptText, setPromptText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftMeta, setDraftMeta] = useState<{ provenance: string; negativePrompt?: string | null; notes?: string | null } | null>(null);

  // versions
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<ImageRequestVersion | null>(null);

  // approve modal (เลือกเวอร์ชันภาพที่ใช้)
  const [approving, setApproving] = useState(false);
  const [pickedAssetId, setPickedAssetId] = useState<string | null>(null);

  // comment box
  const [comment, setComment] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  const load = useCallback(() => {
    if (!id) return;
    getImageRequest(id)
      .then((res) => {
        setReq(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // sync กล่อง prompt กับค่าบน server เมื่อโหลด/ร่างใหม่
  const serverPrompt = req?.draftPrompt ?? "";
  useEffect(() => {
    setPromptText(serverPrompt);
  }, [serverPrompt]);

  useEffect(() => {
    api<Assignee[]>("/tasks/assignees").then(setAssignees).catch(() => setAssignees([]));
  }, []);

  async function patch(body: Record<string, unknown>, okMsg?: string) {
    try {
      await updateImageRequest(id, body);
      load();
      if (okMsg) showToast(okMsg);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function move(status: ImageRequestStatus, extra: { approvedAssetId?: string; comment?: string } = {}) {
    try {
      await changeImageRequestStatus(id, { status, ...extra });
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function draft() {
    setDrafting(true);
    try {
      const res = await draftImageRequestPrompt(id);
      setPromptText(res.draftPrompt);
      setDraftMeta({ provenance: res.provenance, negativePrompt: res.negativePrompt, notes: res.notes });
      showToast(res.provenance === "ai" ? "AI ร่าง prompt ให้แล้ว" : "ร่าง prompt จากบรีฟ + Brand Book แล้ว");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "ร่าง prompt ไม่สำเร็จ");
    } finally {
      setDrafting(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAsset(file, {
        assetType: "deliverable",
        entityType: "image_request",
        entityId: id,
        linkRole: "deliverable",
      });
      load();
      showToast("อัปโหลดเวอร์ชันใหม่แล้ว");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addComment() {
    if (!comment.trim()) return;
    try {
      await api("/postits", {
        method: "POST",
        body: JSON.stringify({
          type: "note",
          content: comment.trim(),
          entityType: "image_request",
          entityId: id,
        }),
      });
      setComment("");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "คอมเมนต์ไม่สำเร็จ");
    }
  }

  if (!req) {
    return (
      <AppShell title="งานภาพ">
        <div className="space-y-3">
          <Link href="/image-requests" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300">
            <ArrowLeft className="size-4" /> กลับหน้ารวมงานภาพ
          </Link>
          {error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-sm text-zinc-500">กำลังโหลด...</p>}
        </div>
      </AppShell>
    );
  }

  const st = IMAGE_REQUEST_STATUS[req.status];
  const ty = IMAGE_REQUEST_TYPE_LABEL[req.imageType] ?? IMAGE_REQUEST_TYPE_LABEL.other;
  const prio = IMAGE_REQUEST_PRIORITY[req.priority] ?? IMAGE_REQUEST_PRIORITY.normal;
  const overdue =
    !!req.dueAt && new Date(req.dueAt).getTime() < Date.now() && !["approved", "cancelled"].includes(req.status);

  // client-side role logic (server enforce ของจริง)
  const isRequester = me?.id === req.requesterId;
  const isAssignee = me?.id === req.assigneeId;
  const isAdmin = !!me?.roles?.includes("admin");
  const isParticipant = isRequester || isAssignee || isAdmin;
  const canApprove = isRequester || !!me?.roles?.some((r) => APPROVER_ROLES.includes(r));
  const canCancel = isRequester || isAdmin;
  const active = !["approved", "cancelled"].includes(req.status);

  return (
    <AppShell title={`${req.displayCode} · ${req.title}`}>
      <div className="space-y-5">
        <Link href="/image-requests" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="size-4" /> กลับหน้ารวมงานภาพ
        </Link>

        {/* header */}
        <div className={cardCls}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-amber-300">{req.displayCode}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
              {ty.emoji} {ty.label}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
              <span className={`inline-block h-2 w-2 rounded-full ${prio.dot}`} /> {prio.label}
            </span>
            {req.dueAt && (
              <span className={`inline-flex items-center gap-1 text-xs ${overdue ? "font-semibold text-red-400" : "text-zinc-400"}`}>
                <Clock className="size-4" /> ครบกำหนด {new Date(req.dueAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-100">{req.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1.5">
              ผู้ขอ: <EntityAvatar entityType="user" id={req.requesterId} name={req.requesterName ?? "?"} size="sm" />
              {req.requesterName ?? "—"}
            </span>
            <span className="flex items-center gap-1.5">
              ผู้รับผิดชอบ:
              {isParticipant && active ? (
                <FilterSelect
                  value={req.assigneeId ?? ""}
                  onChange={(v) => patch({ assigneeId: v || null }, "มอบหมายแล้ว")}
                  options={[
                    { value: "", label: "— ยังไม่มอบหมาย —" },
                    ...assignees.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
              ) : (
                <span>{req.assigneeName ?? "ยังไม่มอบหมาย"}</span>
              )}
            </span>
            {req.status === "approved" && (
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <CircleCheck className="size-4" /> อนุมัติโดย {req.approvedByName ?? "—"}{" "}
                {req.approvedAt && `· ${new Date(req.approvedAt).toLocaleDateString("th-TH")}`}
              </span>
            )}
          </div>

          {/* action buttons ตามสถานะ + บทบาท */}
          {active && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
              <span className="text-xs text-zinc-500">การทำงาน:</span>
              {req.status === "open" && isParticipant &&
                (req.assigneeId ? (
                  <ActionBtn onClick={() => move("in_progress")} label="เริ่มทำ" />
                ) : (
                  <span className="text-xs text-amber-300">มอบหมายผู้รับผิดชอบก่อน</span>
                ))}
              {req.status === "revision" && isParticipant && (
                <ActionBtn onClick={() => move("in_progress")} label="กลับไปทำต่อ" />
              )}
              {(req.status === "in_progress" || req.status === "revision") && isParticipant && (
                <ActionBtn onClick={() => move("review")} label="ส่งรีวิว" />
              )}
              {req.status === "review" && isParticipant && (
                <ActionBtn
                  onClick={() => {
                    const reason = window.prompt("เหตุผลที่ขอแก้ (จะบันทึกเป็นคอมเมนต์):") ?? "";
                    move("revision", reason.trim() ? { comment: reason.trim() } : {});
                  }}
                  label="ขอแก้"
                  tone="warn"
                />
              )}
              {req.status === "review" && canApprove && (
                <ActionBtn
                  onClick={() => {
                    setPickedAssetId(req.versions[0]?.id ?? null);
                    setApproving(true);
                  }}
                  label="อนุมัติ"
                  tone="ok"
                />
              )}
              {canCancel && (
                <button
                  onClick={() => {
                    if (window.confirm("ยกเลิกงานภาพนี้?"))
                      cancelImageRequest(id)
                        .then(load)
                        .catch((err) => showToast(err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ"));
                  }}
                  className="rounded-lg border border-red-900 px-3 py-1 text-xs text-red-300 hover:bg-red-950"
                >
                  ยกเลิกงาน
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* brief */}
          <div className={cardCls}>
            <p className={labelCls}>โจทย์ / บรีฟ</p>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <EditableField
                  label="แพลตฟอร์ม"
                  value={req.platform ?? ""}
                  disabled={!isParticipant || !active}
                  onSave={(v) => patch({ platform: v || null })}
                />
                <EditableField
                  label="ขนาด/สัดส่วน"
                  value={req.sizeNote ?? ""}
                  disabled={!isParticipant || !active}
                  onSave={(v) => patch({ sizeNote: v || null })}
                />
              </div>
              <EditableField
                label="ข้อความบนภาพ (copy)"
                value={req.copyText ?? ""}
                disabled={!isParticipant || !active}
                onSave={(v) => patch({ copyText: v || null })}
              />
              <EditableArea
                label="บรีฟ"
                value={req.brief ?? ""}
                disabled={!isParticipant || !active}
                onSave={(v) => patch({ brief: v || null })}
              />
              <div className="flex flex-wrap gap-4 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
                <span>
                  <Tag className="inline size-4 align-text-bottom" /> แบรนด์:{" "}
                  {req.brand ? (
                    <Link href={`/brands/${req.brand.id}`} className="text-amber-300 hover:underline">
                      {req.brand.name}
                    </Link>
                  ) : (
                    "— ไม่ระบุ —"
                  )}
                </span>
                <span>
                  <Target className="inline size-4 align-text-bottom" /> ปลายทาง:{" "}
                  {req.entityType && req.entityId ? (
                    req.entityType === "episode" ? (
                      <Link href={`/episodes/${req.entityId}`} className="text-amber-300 hover:underline">
                        {req.targetLabel ?? IMAGE_REQUEST_TARGET_LABEL[req.entityType]}
                      </Link>
                    ) : req.entityType === "campaign" ? (
                      <Link href={`/campaigns/${req.entityId}`} className="text-amber-300 hover:underline">
                        {req.targetLabel ?? IMAGE_REQUEST_TARGET_LABEL[req.entityType]}
                      </Link>
                    ) : (
                      <span className="text-zinc-300">
                        {IMAGE_REQUEST_TARGET_LABEL[req.entityType]} · {req.targetLabel ?? ""}
                      </span>
                    )
                  ) : (
                    "— ไม่ระบุ —"
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* draft prompt */}
          <div className={cardCls}>
            <div className="mb-2 flex items-center justify-between">
              <p className={`${labelCls} mb-0`}>Image Prompt (ก๊อปไป gen ใน ChatGPT/Grok)</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={draft}
                  disabled={drafting || !active}
                  className="rounded-lg bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-violet-400/40 hover:bg-violet-500/30 disabled:opacity-50"
                >
                  {drafting ? "กำลังร่าง..." : "ร่าง prompt จาก Brand Book"}
                </button>
                {promptText && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(promptText);
                      showToast("ก๊อป prompt แล้ว");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    <ClipboardList className="size-4" /> ก๊อป
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onBlur={() => promptText !== (req.draftPrompt ?? "") && patch({ draftPrompt: promptText || null }, "บันทึก prompt แล้ว")}
              rows={9}
              disabled={!isParticipant || !active}
              placeholder="ยังไม่มี prompt — กดปุ่มร่างเพื่อให้ระบบร่างจากบรีฟ + Brand Book"
              className={`${inputCls} w-full font-mono text-xs leading-5`}
            />
            {draftMeta && (
              <div className="mt-2 space-y-1 text-xs text-zinc-500">
                <p>
                  ที่มา: {draftMeta.provenance === "ai" ? "AI เกลาจากบรีฟ + Brand Book" : "ประกอบจากบรีฟ + Brand Book (AI ยังไม่ตั้งค่า)"}
                </p>
                {draftMeta.negativePrompt && <p>Negative: {draftMeta.negativePrompt}</p>}
                {draftMeta.notes && <p>โน้ต: {draftMeta.notes}</p>}
              </div>
            )}
          </div>
        </div>

        {/* versions gallery */}
        <div className={cardCls}>
          <div className="mb-3 flex items-center justify-between">
            <p className={`${labelCls} mb-0`}>เวอร์ชันภาพ ({req.versions.length})</p>
            {isParticipant && active && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {uploading ? "กำลังอัปโหลด..." : "อัปโหลดเวอร์ชันใหม่"}
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {req.versions.map((v, idx) => (
              <VersionThumb
                key={v.id}
                version={v}
                index={req.versions.length - idx}
                approved={req.approvedAssetId === v.id}
                onClick={() => setLightbox(v)}
              />
            ))}
          </div>
          {req.versions.length === 0 && (
            <p className="rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center text-sm text-zinc-500">
              ยังไม่มีภาพ — gen ภาพจาก prompt ด้านบนแล้วอัปโหลดเข้ามาเป็นเวอร์ชันแรก
            </p>
          )}
        </div>

        {/* comments */}
        <div className={cardCls}>
          <p className={labelCls}>คอมเมนต์ ({req.comments.length})</p>
          <div className="space-y-2">
            {req.comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2 rounded-xl bg-zinc-950/50 px-3 py-2">
                <EntityAvatar entityType="user" id={c.createdBy} name={c.createdByName ?? "?"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500">
                    {c.createdByName ?? "—"} ·{" "}
                    {new Date(c.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-zinc-200">{c.content}</p>
                </div>
              </div>
            ))}
            {req.comments.length === 0 && <p className="text-sm text-zinc-600">ยังไม่มีคอมเมนต์</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addComment()}
              placeholder="พิมพ์คอมเมนต์... (Enter เพื่อส่ง)"
              className={`${inputCls} flex-1`}
            />
            <button
              onClick={addComment}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              ส่ง
            </button>
          </div>
        </div>
      </div>

      {/* lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setLightbox(null)}
        >
          <LightboxImage version={lightbox} />
        </div>
      )}

      {/* approve modal — เลือกเวอร์ชันภาพที่ใช้ */}
      {approving && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-100"><CircleCheck className="size-5" /> อนุมัติ — เลือกภาพที่ใช้</h3>
              <button onClick={() => setApproving(false)} className="text-zinc-500 hover:text-zinc-200">
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {req.versions.map((v, idx) => (
                <button
                  key={v.id}
                  onClick={() => setPickedAssetId(v.id)}
                  className={`overflow-hidden rounded-xl border-2 ${
                    pickedAssetId === v.id ? "border-emerald-400" : "border-transparent hover:border-zinc-600"
                  }`}
                >
                  <VersionThumb version={v} index={req.versions.length - idx} approved={false} compact />
                </button>
              ))}
            </div>
            {req.versions.length === 0 && (
              <p className="text-sm text-zinc-500">ยังไม่มีเวอร์ชันภาพ — อนุมัติโดยไม่เลือกภาพได้</p>
            )}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => {
                  setApproving(false);
                  move("approved", pickedAssetId ? { approvedAssetId: pickedAssetId } : {});
                }}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                ยืนยันอนุมัติ
              </button>
              <button onClick={() => setApproving(false)} className="text-sm text-zinc-500 hover:text-zinc-300">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-amber-200 shadow-lg ring-1 ring-amber-400/30">
          {toast}
        </div>
      )}
    </AppShell>
  );
}

function ActionBtn({
  onClick,
  label,
  tone = "default",
}: {
  onClick: () => void;
  label: string;
  tone?: "default" | "ok" | "warn";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
      : tone === "warn"
        ? "border border-orange-800 text-orange-300 hover:bg-orange-950"
        : "bg-amber-400 text-zinc-950 hover:bg-amber-300";
  return (
    <button onClick={onClick} className={`rounded-lg px-3 py-1 text-xs font-medium ${cls}`}>
      {label}
    </button>
  );
}

function EditableField({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <input
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        className={`${inputCls} mt-1 w-full disabled:opacity-60`}
      />
    </label>
  );
}

function EditableArea({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <textarea
        value={v}
        disabled={disabled}
        rows={3}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        className={`${inputCls} mt-1 w-full disabled:opacity-60`}
      />
    </label>
  );
}

function VersionThumb({
  version,
  index,
  approved,
  compact,
  onClick,
}: {
  version: ImageRequestVersion;
  index: number;
  approved: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const url = useAssetImage(version.mimeType.startsWith("image/") ? version.id : null);
  const body = (
    <div className="relative">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={version.originalFilename} className={`w-full object-cover ${compact ? "h-24" : "h-36"}`} />
      ) : (
        <div className={`flex w-full items-center justify-center bg-zinc-800 ${compact ? "h-24" : "h-36"}`}>
          <File className="size-8" />
        </div>
      )}
      <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-200">
        v{index}
      </span>
      {approved && (
        <span className="absolute right-1 top-1 inline-flex items-center gap-1 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-950">
          <CircleCheck className="size-3.5" /> ใช้ภาพนี้
        </span>
      )}
      {!compact && (
        <div className="bg-zinc-950/60 px-2 py-1 text-[10px] text-zinc-400">
          <p className="truncate">{version.originalFilename}</p>
          <p>
            {version.uploadedByName ?? "—"} ·{" "}
            {new Date(version.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
          </p>
        </div>
      )}
    </div>
  );
  if (!onClick) return <div className="overflow-hidden rounded-xl">{body}</div>;
  return (
    <button onClick={onClick} className="overflow-hidden rounded-xl text-left transition hover:ring-2 hover:ring-amber-400/60">
      {body}
    </button>
  );
}

function LightboxImage({ version }: { version: ImageRequestVersion }) {
  const url = useAssetImage(version.mimeType.startsWith("image/") ? version.id : null);
  if (!url) return <p className="text-sm text-zinc-400">กำลังโหลดภาพ...</p>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={version.originalFilename}
      className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    />
  );
}
