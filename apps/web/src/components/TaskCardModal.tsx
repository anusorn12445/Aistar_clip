"use client";

// TaskCardModal — การ์ดงานแบบ Trello: labels, รายละเอียด, checklist,
// ไฟล์แนบ, ความคิดเห็น + sidebar "เพิ่มในการ์ด" / "การทำงาน"
// ทุกการแก้ไข PATCH ตรงแล้วเรียก onChanged ให้บอร์ดรีเฟรช

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  X,
  Trash2,
  MessageSquare,
  User,
  Calendar,
  Clapperboard,
  ArrowRight,
} from "lucide-react";
import { FilterSelect } from "@/components/ui/filter-select";
import { api } from "@/lib/api";
import { Asset, AssetList, formatFileSize, uploadAsset } from "@/lib/assets";
import { useAssetImage } from "@/lib/media";

// ── shared label helpers (หน้า my-work ใช้ด้วย) ──────────────
export const LABEL_COLORS: Record<string, { bar: string; chip: string }> = {
  green: { bar: "bg-emerald-500", chip: "bg-emerald-600 text-white" },
  yellow: { bar: "bg-yellow-400", chip: "bg-yellow-500 text-zinc-950" },
  orange: { bar: "bg-orange-500", chip: "bg-orange-600 text-white" },
  red: { bar: "bg-red-500", chip: "bg-red-600 text-white" },
  purple: { bar: "bg-purple-500", chip: "bg-purple-600 text-white" },
  blue: { bar: "bg-blue-500", chip: "bg-blue-600 text-white" },
  sky: { bar: "bg-sky-400", chip: "bg-sky-500 text-zinc-950" },
  pink: { bar: "bg-pink-400", chip: "bg-pink-500 text-white" },
  zinc: { bar: "bg-zinc-500", chip: "bg-zinc-600 text-white" },
};

export function parseLabel(raw: string): { color: string; text: string } {
  const idx = raw.indexOf(":");
  if (idx === -1) return { color: "zinc", text: raw };
  const color = raw.slice(0, idx);
  return { color: LABEL_COLORS[color] ? color : "zinc", text: raw.slice(idx + 1) };
}

export const STATUS_LABEL_TH: Record<string, string> = {
  todo: "ต้องทำ",
  in_progress: "กำลังทำ",
  done: "เสร็จแล้ว",
  blocked: "ติดปัญหา",
};

export const ENTITY_EMOJI: Record<string, string> = {
  shot: "🎬",
  episode: "🎬",
  character: "🎭",
  product: "🛍️",
  content: "📅",
  campaign: "🎯",
  live: "🔴",
};

// ── types ────────────────────────────────────────────────────
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface TaskComment {
  id: string;
  content: string;
  createdBy: string;
  createdAt: string;
  authorName?: string;
}

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  labels?: string[];
  checklist?: ChecklistItem[] | null;
  entityType: string | null;
  entityId: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string; email: string } | null;
  dueDate: string | null;
  priority: "low" | "normal" | "urgent";
  status: "todo" | "in_progress" | "done" | "blocked";
  createdBy: string;
  createdAt: string;
  comments?: TaskComment[];
  attachmentCount?: number;
}

interface Props {
  taskId: string;
  assignees: { id: string; name: string; email: string }[];
  episodeHref?: string | null;
  episodeLabel?: string | null;
  onClose: () => void;
  onChanged: () => void;
}

// ── small helpers ────────────────────────────────────────────
function timeAgoTh(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "เมื่อครู่";
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH");
}

// markdown-lite: แสดงตามบรรทัดจริง + URL กดได้
function renderWithLinks(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="break-all text-amber-300 underline hover:text-amber-200"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function currentUserId(): string | null {
  try {
    const me = JSON.parse(localStorage.getItem("aistar_user") ?? "null") as { id: string } | null;
    return me?.id ?? null;
  } catch {
    return null;
  }
}

const sideBtnCls =
  "flex w-full items-center gap-2 rounded-lg bg-zinc-800 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-700";
const sideSelectCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none focus:border-amber-400";

// ไฟล์แนบหนึ่งชิ้น — รูปโชว์ thumbnail, ไฟล์อื่นเป็น chip ชื่อ+ขนาด
function AttachmentTile({ asset }: { asset: Asset }) {
  const isImage = asset.mimeType.startsWith("image/");
  const url = useAssetImage(isImage ? asset.id : null);
  if (isImage) {
    return (
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.originalFilename} className="h-20 w-full object-cover" />
        ) : (
          <div className="h-20 w-full animate-pulse bg-zinc-800" />
        )}
        <p className="truncate px-2 py-1 text-[10px] text-zinc-400" title={asset.originalFilename}>
          {asset.originalFilename}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2">
      <FileText className="size-5 shrink-0 text-zinc-400" />
      <div className="min-w-0">
        <p className="truncate text-[11px] text-zinc-200" title={asset.originalFilename}>
          {asset.originalFilename}
        </p>
        <p className="text-[10px] text-zinc-500">{formatFileSize(asset.fileSize)}</p>
      </div>
    </div>
  );
}

export default function TaskCardModal({
  taskId,
  assignees,
  episodeHref,
  episodeLabel,
  onClose,
  onChanged,
}: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // edit states
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [newItem, setNewItem] = useState("");
  const [commentDraft, setCommentDraft] = useState("");

  // attachments
  const [attachments, setAttachments] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // อ่าน user id จาก localStorage หลัง mount เท่านั้น — อ่านตอน render ทำ hydration mismatch
  // (server ไม่มี localStorage) → React 19 ทิ้ง SSR tree ทั้งหน้า
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    setMeId(currentUserId());
  }, []);

  const loadDetail = useCallback(async () => {
    try {
      const detail = await api<TaskDetail>(`/tasks/${taskId}`);
      setTask(detail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดรายละเอียดงานไม่สำเร็จ");
    }
  }, [taskId]);

  const loadAttachments = useCallback(async () => {
    try {
      const res = await api<AssetList>(`/assets?entityType=task&entityId=${taskId}&pageSize=50`);
      setAttachments(res.items);
    } catch {
      /* ระบบไฟล์แนบเป็นส่วนเสริม — โหลดพลาดไม่ต้อง block modal */
    }
  }, [taskId]);

  useEffect(() => {
    loadDetail();
    loadAttachments();
  }, [loadDetail, loadAttachments]);

  // Esc = ปิด
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // PATCH แบบเข้าคิวทีละคำสั่ง + refetch เฉพาะคำสั่งล่าสุด — กัน response เก่า
  // มาทับ optimistic state ตอนพิมพ์ checklist รัวๆ (Enter ติดกันหลายครั้ง)
  const opSeqRef = useRef(0);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  function patch(body: Record<string, unknown>) {
    const seq = ++opSeqRef.current;
    setError(null);
    chainRef.current = chainRef.current.then(async () => {
      try {
        await api(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(body) });
        if (seq === opSeqRef.current) await loadDetail();
        onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
        if (seq === opSeqRef.current) await loadDetail(); // rollback local view
      }
    });
    return chainRef.current;
  }

  // ── labels ─────────────────────────────────────────────────
  const labels = task?.labels ?? [];

  function addLabel(color: string) {
    const text = (labelDrafts[color] ?? "").trim();
    if (!text || text.length > 24) return;
    const raw = `${color}:${text}`;
    if (labels.includes(raw) || labels.length >= 10) return;
    setLabelDrafts((d) => ({ ...d, [color]: "" }));
    patch({ labels: [...labels, raw] });
  }

  function removeLabel(raw: string) {
    patch({ labels: labels.filter((l) => l !== raw) });
  }

  // ── checklist ──────────────────────────────────────────────
  const checklist: ChecklistItem[] = Array.isArray(task?.checklist) ? task.checklist : [];
  const doneCount = checklist.filter((i) => i.done).length;
  const progress = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0;

  function saveChecklist(next: ChecklistItem[]) {
    // optimistic — ติ๊กแล้วเห็นทันที
    setTask((t) => (t ? { ...t, checklist: next } : t));
    patch({ checklist: next });
  }

  function addChecklistItem() {
    const text = newItem.trim();
    if (!text || checklist.length >= 50) return;
    setNewItem("");
    saveChecklist([...checklist, { id: crypto.randomUUID(), text, done: false }]);
  }

  // ── comments ───────────────────────────────────────────────
  async function sendComment() {
    const content = commentDraft.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setCommentDraft("");
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งความคิดเห็นไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function deleteComment(commentId: string) {
    setBusy(true);
    try {
      await api(`/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" });
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบความคิดเห็นไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // ── attachments ────────────────────────────────────────────
  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadAsset(file, {
          assetType: "task_attachment",
          entityType: "task",
          entityId: taskId,
          linkRole: "reference",
        });
      }
      await Promise.all([loadAttachments(), loadDetail()]);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── title ──────────────────────────────────────────────────
  function saveTitle() {
    setEditingTitle(false);
    const title = titleDraft.trim();
    if (task && title && title !== task.title) patch({ title });
  }

  const emoji = ENTITY_EMOJI[task?.entityType ?? ""] ?? "✅";
  const comments = task?.comments ?? [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/60 duration-200 animate-in slide-in-from-right">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-zinc-800 bg-zinc-900/95 px-5 py-4 backdrop-blur">
          <span className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-lg bg-zinc-800 text-xl">
            {emoji}
          </span>
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="w-full rounded-lg border border-amber-400 bg-zinc-800 px-2 py-1 text-base font-semibold outline-none"
              />
            ) : (
              <h2
                onClick={() => {
                  if (!task) return;
                  setTitleDraft(task.title);
                  setEditingTitle(true);
                }}
                title="คลิกเพื่อแก้ชื่องาน"
                className="cursor-text break-words rounded px-1 text-base font-semibold text-zinc-100 hover:bg-zinc-800"
              >
                {task?.title ?? "กำลังโหลด..."}
              </h2>
            )}
            <p className="mt-0.5 px-1 text-xs text-zinc-500">
              ในลิสต์ <span className="text-zinc-300">{STATUS_LABEL_TH[task?.status ?? ""] ?? "—"}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            title="ปิด (Esc)"
            className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="size-5" />
          </button>
        </div>

        {error && <p className="px-5 pt-3 text-sm text-red-400">{error}</p>}

        {!task && !error && <p className="px-5 py-10 text-center text-sm text-zinc-500">กำลังโหลด...</p>}

        {task && (
          <div className="flex flex-col gap-6 p-5 sm:flex-row">
            {/* ── main column ── */}
            <div className="min-w-0 flex-1 space-y-6">
              {/* labels */}
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Labels</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {labels.map((raw) => {
                    const { color, text } = parseLabel(raw);
                    return (
                      <button
                        key={raw}
                        onClick={() => removeLabel(raw)}
                        title="คลิกเพื่อเอา label ออก"
                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${LABEL_COLORS[color].chip} hover:opacity-80`}
                      >
                        {text}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setLabelPickerOpen((v) => !v)}
                    className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    {labelPickerOpen ? "− ปิด" : "+ เพิ่ม label"}
                  </button>
                </div>
                {labelPickerOpen && (
                  <div className="mt-2 grid grid-cols-1 gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/60 p-3 sm:grid-cols-3">
                    {Object.keys(LABEL_COLORS).map((color) => (
                      <div key={color} className="flex items-center gap-1.5">
                        <button
                          onClick={() => addLabel(color)}
                          title={`เพิ่ม label สี ${color}`}
                          className={`h-6 w-8 shrink-0 rounded ${LABEL_COLORS[color].bar} hover:opacity-80`}
                        />
                        <input
                          value={labelDrafts[color] ?? ""}
                          onChange={(e) => setLabelDrafts((d) => ({ ...d, [color]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addLabel(color);
                          }}
                          maxLength={24}
                          placeholder="ชื่อ label"
                          className="w-full min-w-0 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] outline-none focus:border-amber-400"
                        />
                      </div>
                    ))}
                    <p className="col-span-full text-[10px] text-zinc-500">
                      พิมพ์ชื่อแล้วคลิกแถบสี (หรือ Enter) เพื่อเพิ่ม · คลิก label ด้านบนเพื่อลบ
                    </p>
                  </div>
                )}
              </section>

              {/* description */}
              <section>
                <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <FileText className="size-3.5" /> รายละเอียด
                </p>
                {editingDesc ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      rows={5}
                      placeholder="เพิ่มรายละเอียดแบบละเอียด..."
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditingDesc(false);
                          patch({ description: descDraft });
                        }}
                        className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                      >
                        บันทึก
                      </button>
                      <button
                        onClick={() => setEditingDesc(false)}
                        className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : task.description ? (
                  <div
                    onClick={() => {
                      setDescDraft(task.description ?? "");
                      setEditingDesc(true);
                    }}
                    title="คลิกเพื่อแก้ไข"
                    className="cursor-text whitespace-pre-wrap rounded-xl bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    {renderWithLinks(task.description)}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setDescDraft("");
                      setEditingDesc(true);
                    }}
                    className="w-full rounded-xl bg-zinc-800/50 px-3 py-3 text-left text-sm text-zinc-500 hover:bg-zinc-800"
                  >
                    เพิ่มรายละเอียดแบบละเอียด...
                  </button>
                )}
              </section>

              {/* checklist */}
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Checklist {checklist.length > 0 && `(${doneCount}/${checklist.length})`}
                </p>
                {checklist.length > 0 && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="w-8 text-right text-[10px] text-zinc-500">{progress}%</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  {checklist.map((item) => (
                    <div key={item.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-zinc-800/60">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() =>
                          saveChecklist(
                            checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                          )
                        }
                        className="h-4 w-4 accent-emerald-500"
                      />
                      <span
                        className={`flex-1 text-sm ${item.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}
                      >
                        {item.text}
                      </span>
                      <button
                        onClick={() => saveChecklist(checklist.filter((i) => i.id !== item.id))}
                        title="ลบรายการ"
                        className="opacity-0 transition group-hover:opacity-100"
                      >
                        <Trash2 className="size-4 text-zinc-400 hover:text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addChecklistItem();
                  }}
                  placeholder="เพิ่มรายการ... (Enter)"
                  className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm outline-none focus:border-amber-400"
                />
              </section>

              {/* attachments */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    ไฟล์แนบ {attachments.length > 0 && `(${attachments.length})`}
                  </p>
                  <button
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {uploading ? "กำลังอัปโหลด..." : "+ อัปโหลด"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files)}
                  />
                </div>
                {attachments.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {attachments.map((a) => (
                      <AttachmentTile key={a.id} asset={a} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600">ยังไม่มีไฟล์แนบ</p>
                )}
              </section>

              {/* comments */}
              <section>
                <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <MessageSquare className="size-3.5" /> ความคิดเห็น {comments.length > 0 && `(${comments.length})`}
                </p>
                <input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendComment();
                  }}
                  disabled={busy}
                  placeholder="เขียนความคิดเห็น... (Enter ส่ง)"
                  className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400 disabled:opacity-50"
                />
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-amber-400/20 text-xs font-semibold text-amber-300">
                        {(c.authorName ?? "?").charAt(0)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs">
                          <span className="font-semibold text-zinc-200">{c.authorName ?? "—"}</span>{" "}
                          <span className="text-zinc-500">· {timeAgoTh(c.createdAt)}</span>
                        </p>
                        <p className="whitespace-pre-wrap rounded-lg bg-zinc-800/70 px-2.5 py-1.5 text-sm text-zinc-200">
                          {renderWithLinks(c.content)}
                        </p>
                        {meId === c.createdBy && (
                          <button
                            onClick={() => deleteComment(c.id)}
                            disabled={busy}
                            className="mt-0.5 text-[10px] text-zinc-500 hover:text-red-400 disabled:opacity-50"
                          >
                            ลบ
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {comments.length === 0 && <p className="text-xs text-zinc-600">ยังไม่มีความคิดเห็น</p>}
                </div>
              </section>
            </div>

            {/* ── sidebar ── */}
            <div className="w-full shrink-0 space-y-4 sm:w-48">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  เพิ่มในการ์ด
                </p>
                <div className="space-y-1.5">
                  <label className="block">
                    <span className="mb-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
                      <User className="size-3" /> สมาชิก
                    </span>
                    <FilterSelect
                      value={task.assigneeId ?? ""}
                      disabled={busy}
                      onChange={(v) => patch({ assigneeId: v || null })}
                      className="w-full"
                      options={[
                        { value: "", label: "— ยังไม่มอบหมาย —" },
                        ...assignees.map((a) => ({ value: a.id, label: a.name })),
                      ]}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
                      <Calendar className="size-3" /> วันครบกำหนด
                    </span>
                    <div className="flex gap-1">
                      <input
                        type="date"
                        value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                        disabled={busy}
                        onChange={(e) =>
                          patch({
                            dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                          })
                        }
                        className={`${sideSelectCls} flex-1`}
                      />
                      {task.dueDate && (
                        <button
                          onClick={() => patch({ dueDate: null })}
                          disabled={busy}
                          title="ล้างวันครบกำหนด"
                          className="rounded-lg bg-zinc-800 px-2 text-xs text-zinc-400 hover:bg-zinc-700"
                        >
                          ล้าง
                        </button>
                      )}
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] text-zinc-500">ความสำคัญ</span>
                    <FilterSelect
                      value={task.priority}
                      disabled={busy}
                      onChange={(v) => patch({ priority: v })}
                      className="w-full"
                      options={[
                        { value: "urgent", label: "ด่วน" },
                        { value: "normal", label: "ปกติ" },
                        { value: "low", label: "ชิลๆ" },
                      ]}
                    />
                  </label>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  การทำงาน
                </p>
                <div className="space-y-1.5">
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] text-zinc-500">ย้ายไปลิสต์</span>
                    <FilterSelect
                      value={task.status}
                      disabled={busy}
                      onChange={(v) => patch({ status: v })}
                      className="w-full"
                      options={[
                        { value: "todo", label: "ต้องทำ" },
                        { value: "in_progress", label: "กำลังทำ" },
                        { value: "done", label: "เสร็จแล้ว" },
                        { value: "blocked", label: "ติดปัญหา" },
                      ]}
                    />
                  </label>
                  {episodeHref && (
                    <Link href={episodeHref} className={sideBtnCls}>
                      <Clapperboard className="size-4 shrink-0" />
                      <span className="flex-1">เปิด Episode{episodeLabel ? ` ${episodeLabel}` : ""}</span>
                      <ArrowRight className="size-4 shrink-0" />
                    </Link>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-zinc-600">
                สร้างเมื่อ {new Date(task.createdAt).toLocaleDateString("th-TH")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
