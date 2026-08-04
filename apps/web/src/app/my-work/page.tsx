"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, FileText, SquareCheck, MessageSquare, Paperclip, Clapperboard, ArrowRight } from "lucide-react";
import AppShell from "@/components/AppShell";
import TaskCardModal, { ENTITY_EMOJI, LABEL_COLORS, parseLabel } from "@/components/TaskCardModal";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";

interface Assignee {
  id: string;
  name: string;
  email: string;
}

interface Task {
  id: string;
  title: string;
  entityType: string | null;
  entityId: string | null;
  assigneeId: string | null;
  assignee: Assignee | null;
  dueDate: string | null;
  priority: "low" | "normal" | "urgent";
  status: "todo" | "in_progress" | "done" | "blocked";
  createdFrom: string;
  createdBy: string;
  createdAt: string;
  // Trello badge fields — optional ทั้งหมด เผื่อคุยกับ API build เก่า
  labels?: string[];
  hasDescription?: boolean;
  checklistDone?: number;
  checklistTotal?: number;
  commentCount?: number;
  attachmentCount?: number;
}

interface TaskList {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}

const COLUMNS: { key: Task["status"]; label: string; accent: string }[] = [
  { key: "todo", label: "ต้องทำ", accent: "border-zinc-600" },
  { key: "in_progress", label: "กำลังทำ", accent: "border-blue-500" },
  { key: "done", label: "เสร็จแล้ว", accent: "border-emerald-500" },
  { key: "blocked", label: "ติดปัญหา", accent: "border-red-500" },
];

// ปุ่ม quick move ต่อคอลัมน์ — โชว์เฉพาะตอน hover ให้การ์ดโล่งแบบ Trello
const MOVES: Record<Task["status"], { to: Task["status"]; label: string }[]> = {
  todo: [
    { to: "in_progress", label: "เริ่มทำ" },
    { to: "blocked", label: "ติดปัญหา" },
  ],
  in_progress: [
    { to: "done", label: "เสร็จ" },
    { to: "blocked", label: "ติดปัญหา" },
  ],
  done: [{ to: "todo", label: "เปิดใหม่" }],
  blocked: [
    { to: "in_progress", label: "กลับไปทำ" },
    { to: "todo", label: "กลับไปคิว" },
  ],
};

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400";

const emptyForm = { title: "", assigneeId: "", dueDate: "", priority: "normal" };

export default function MyWorkPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [error, setError] = useState<string | null>(null);

  // "งานของฉัน" vs "งานที่ฉันสร้าง"
  const [mineCreated, setMineCreated] = useState(false);

  // filters
  const [q, setQ] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [dueAfter, setDueAfter] = useState("");
  const [dueBefore, setDueBefore] = useState("");

  // create form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // drag & drop ข้าม column
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Task["status"] | null>(null);

  // Trello card modal
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);

  // map shotId → episode สำหรับลิงก์จาก task (งานจาก handoff ชี้ที่ shot)
  const [shotEpisodes, setShotEpisodes] = useState<
    Record<string, { id: string; displayCode: string; title: string }>
  >({});

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (mineCreated) params.set("createdBy", "me");
      else params.set("assigneeId", "me");
      if (q) params.set("q", q);
      if (fPriority) params.set("priority", fPriority);
      if (dueAfter) params.set("dueAfter", dueAfter);
      if (dueBefore) params.set("dueBefore", dueBefore);
      params.set("pageSize", "50");
      params.set("sortBy", "dueDate");
      params.set("sortDir", "asc");
      const res = await api<TaskList>(`/tasks?${params.toString()}`);
      setTasks(res.items);
      setTotal(res.total);
      setError(null);

      // resolve shot → episode เพื่อให้กดจากการ์ดงานไปหน้า episode ได้เลย
      const shotIds = new Set(
        res.items.filter((t) => t.entityType === "shot" && t.entityId).map((t) => t.entityId as string),
      );
      if (shotIds.size > 0) {
        try {
          const map: Record<string, { id: string; displayCode: string; title: string }> = {};
          // shots endpoint หน้าละ 50 — วนไม่เกิน 4 หน้า พอครบที่ต้องใช้ก็หยุด
          for (let page = 1; page <= 4; page++) {
            const shots = await api<{
              items: { id: string; episode: { id: string; displayCode: string; title: string } | null }[];
              total: number;
              pageSize: number;
            }>(`/shots?page=${page}`);
            for (const s of shots.items) {
              if (s.episode && shotIds.has(s.id)) map[s.id] = s.episode;
            }
            if (page * shots.pageSize >= shots.total) break;
            if (Object.keys(map).length >= shotIds.size) break;
          }
          setShotEpisodes(map);
        } catch {
          /* ลิงก์เสริม — โหลดพลาดไม่ต้องโวยวาย */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดงานไม่สำเร็จ");
    }
  }, [mineCreated, q, fPriority, dueAfter, dueBefore]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<Assignee[]>("/tasks/assignees")
      .then(setAssignees)
      .catch(() => setAssignees([]));
  }, [router]);

  // debounced reload เมื่อ filter เปลี่ยน
  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
  }, [load]);

  const activeFilters = [q, fPriority, dueAfter, dueBefore].filter(Boolean).length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          assigneeId: form.assigneeId || undefined,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          priority: form.priority,
        }),
      });
      setForm({ ...emptyForm });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างงานไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function moveTask(task: Task, to: Task["status"]) {
    if (task.status === to) return;
    setBusyId(task.id);
    setError(null);
    // optimistic — การ์ดย้ายทันที ถ้า server ปฏิเสธค่อย rollback
    const prev = tasks;
    setTasks(prev.map((t) => (t.id === task.id ? { ...t, status: to } : t)));
    try {
      await api<Task>(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: to }),
      });
      await load();
    } catch (err) {
      setTasks(prev);
      setError(err instanceof Error ? err.message : "ย้ายงานไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  // episode link ของ task (handoff ชี้ shot → resolve เป็น episode)
  function episodeInfo(t: Task): { href: string; label: string | null } | null {
    if (t.entityType === "episode" && t.entityId)
      return { href: `/episodes/${t.entityId}`, label: null };
    const ep = t.entityType === "shot" && t.entityId ? shotEpisodes[t.entityId] : null;
    return ep ? { href: `/episodes/${ep.id}`, label: ep.displayCode } : null;
  }

  // due chip แบบ Trello — แดง = เลยกำหนด, เหลือง = ภายใน 48 ชม., ซ่อนเมื่อเสร็จแล้ว
  function dueChip(t: Task) {
    if (!t.dueDate || t.status === "done") return null;
    const due = new Date(t.dueDate);
    const diff = due.getTime() - Date.now();
    const cls =
      diff < 0
        ? "bg-red-600/90 text-white"
        : diff <= 48 * 3600 * 1000
          ? "bg-amber-500/90 text-zinc-950"
          : "bg-zinc-800 text-zinc-400";
    return (
      <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${cls}`}>
        <Clock className="size-3" /> {due.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
      </span>
    );
  }

  const modalTask = modalTaskId ? tasks.find((t) => t.id === modalTaskId) : null;
  const modalEpisode = modalTask ? episodeInfo(modalTask) : null;

  return (
    <AppShell
      title="My Work"
      actions={
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + สร้างงาน
        </button>
      }
    >
      <div className="space-y-6">
        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-zinc-700 text-sm">
            <button
              onClick={() => setMineCreated(false)}
              className={`px-3 py-2 ${!mineCreated ? "bg-amber-400/10 text-amber-300" : "text-zinc-400 hover:bg-zinc-800"}`}
            >
              งานของฉัน
            </button>
            <button
              onClick={() => setMineCreated(true)}
              className={`px-3 py-2 ${mineCreated ? "bg-amber-400/10 text-amber-300" : "text-zinc-400 hover:bg-zinc-800"}`}
            >
              งานที่ฉันสร้าง
            </button>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่องาน..."
            className={`${inputCls} min-w-44 flex-1`}
          />
          <FilterSelect
            value={fPriority}
            onChange={setFPriority}
            options={[
              { value: "", label: "ทุกความสำคัญ" },
              { value: "urgent", label: "ด่วน" },
              { value: "normal", label: "ปกติ" },
              { value: "low", label: "ชิลๆ" },
            ]}
          />
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            ครบกำหนดตั้งแต่
            <input type="date" value={dueAfter} onChange={(e) => setDueAfter(e.target.value)} className={inputCls} />
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            ถึง
            <input type="date" value={dueBefore} onChange={(e) => setDueBefore(e.target.value)} className={inputCls} />
          </label>
          {activeFilters > 0 && (
            <button
              onClick={() => {
                setQ("");
                setFPriority("");
                setDueAfter("");
                setDueBefore("");
              }}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              ล้าง filter ({activeFilters})
            </button>
          )}
          <span className="text-xs text-zinc-500">
            ทั้งหมด {total} งาน · ลากการ์ดข้าม column เพื่อย้ายสถานะ · คลิกการ์ดเพื่อเปิดรายละเอียด
          </span>
        </div>

        {/* create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm font-semibold">สร้างงานใหม่</p>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="ชื่องาน เช่น ตรวจ visual DNA ของแพรวา *"
              className={`${inputCls} w-full bg-zinc-800`}
            />
            <div className="grid grid-cols-3 gap-3">
              <FilterSelect
                value={form.assigneeId}
                onChange={(v) => setForm({ ...form, assigneeId: v })}
                options={[
                  { value: "", label: "— ยังไม่มอบหมาย —" },
                  ...assignees.map((a) => ({ value: a.id, label: `${a.name} (${a.email})` })),
                ]}
              />
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className={`${inputCls} bg-zinc-800`}
              />
              <FilterSelect
                value={form.priority}
                onChange={(v) => setForm({ ...form, priority: v })}
                options={[
                  { value: "normal", label: "ปกติ" },
                  { value: "urgent", label: "ด่วน" },
                  { value: "low", label: "ชิลๆ" },
                ]}
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? "กำลังสร้าง..." : "สร้างงาน"}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* empty state ทั้งบอร์ด — บอกว่างานมาจากไหน ไม่ใช่แค่ "ไม่มีงาน" */}
        {total === 0 && activeFilters === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-8 text-center">
            <p className="text-sm text-zinc-300">
              {mineCreated ? "ยังไม่มีงานที่คุณสร้าง" : "ยังไม่มีงานที่มอบหมายให้คุณ"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              งานจะเข้ามาอัตโนมัติเมื่อ Episode ถูก &ldquo;ส่งงานเข้าทีม Production&rdquo; (handoff)
              หรือสร้างเองด้วยปุ่ม &ldquo;+ สร้างงาน&rdquo; มุมขวาบน
            </p>
          </div>
        )}

        {/* board */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col.key);
            const isDropTarget = dragId !== null && dragOverCol === col.key;
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverCol !== col.key) setDragOverCol(col.key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = dragId ?? e.dataTransfer.getData("text/plain");
                  const task = tasks.find((t) => t.id === id);
                  setDragOverCol(null);
                  setDragId(null);
                  if (task) moveTask(task, col.key);
                }}
                className={`rounded-2xl border-t-2 ${col.accent} bg-zinc-900/50 p-3 transition ${
                  isDropTarget ? "bg-zinc-800/80 ring-2 ring-amber-400/50" : ""
                }`}
              >
                <p className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                  {col.label}
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                    {items.length}
                  </span>
                </p>
                <div className="space-y-2">
                  {items.map((t) => {
                    const labels = t.labels ?? [];
                    const clTotal = t.checklistTotal ?? 0;
                    const clDone = t.checklistDone ?? 0;
                    const episode = episodeInfo(t);
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          setDragId(t.id);
                          e.dataTransfer.setData("text/plain", t.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragOverCol(null);
                        }}
                        onClick={(e) => {
                          // คลิกการ์ดเพื่อเปิด modal — ยกเว้นคลิกปุ่ม/ลิงก์ข้างใน
                          if ((e.target as HTMLElement).closest("button,a,input,select")) return;
                          setModalTaskId(t.id);
                        }}
                        title="คลิกเพื่อเปิดรายละเอียด"
                        className={`group cursor-pointer space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-900 p-3 transition-all hover:-translate-y-0.5 hover:border-zinc-600 hover:shadow-lg hover:shadow-black/40 ${
                          dragId === t.id ? "opacity-40 ring-1 ring-amber-400/40" : ""
                        }`}
                      >
                        {/* label color bars */}
                        {labels.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            {labels.slice(0, 4).map((raw) => {
                              const { color, text } = parseLabel(raw);
                              return (
                                <span
                                  key={raw}
                                  title={text}
                                  className={`h-1.5 w-8 rounded-full ${LABEL_COLORS[color].bar}`}
                                />
                              );
                            })}
                            {labels.length > 4 && (
                              <span className="text-[9px] text-zinc-500">+{labels.length - 4}</span>
                            )}
                          </div>
                        )}

                        {/* title */}
                        <p className="text-sm leading-snug text-zinc-100">{t.title}</p>

                        {/* badges row — โชว์เฉพาะอันที่มีของ */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                          <span className="select-none text-xs">
                            {ENTITY_EMOJI[t.entityType ?? ""] ?? "✅"}
                          </span>
                          {t.priority === "urgent" && (
                            <span title="ด่วน" className="h-2 w-2 rounded-full bg-red-500" />
                          )}
                          {dueChip(t)}
                          {t.hasDescription && <span title="มีรายละเอียด"><FileText className="size-3" /></span>}
                          {clTotal > 0 && (
                            <span
                              title="checklist"
                              className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 ${
                                clDone === clTotal
                                  ? "bg-emerald-600/90 text-white"
                                  : "text-zinc-500"
                              }`}
                            >
                              <SquareCheck className="size-3" /> {clDone}/{clTotal}
                            </span>
                          )}
                          {(t.commentCount ?? 0) > 0 && <span title="ความคิดเห็น" className="inline-flex items-center gap-0.5"><MessageSquare className="size-3" /> {t.commentCount}</span>}
                          {(t.attachmentCount ?? 0) > 0 && <span title="ไฟล์แนบ" className="inline-flex items-center gap-0.5"><Paperclip className="size-3" /> {t.attachmentCount}</span>}
                        </div>

                        {episode && (
                          <Link
                            href={episode.href}
                            className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 hover:underline"
                          >
                            <Clapperboard className="size-3" /> เปิด Episode{episode.label ? ` ${episode.label}` : ""} <ArrowRight className="size-3" />
                          </Link>
                        )}

                        {/* quick moves (hover) + avatar */}
                        <div className="flex items-end justify-between gap-2 pt-0.5">
                          <div className="flex flex-wrap gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            {MOVES[t.status].map((m) => (
                              <button
                                key={m.to}
                                disabled={busyId === t.id}
                                onClick={() => moveTask(t, m.to)}
                                className="rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                          {t.assignee ? (
                            <span
                              title={t.assignee.name}
                              className="flex h-6 w-6 shrink-0 select-none items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-semibold text-amber-300"
                            >
                              {t.assignee.name.charAt(0)}
                            </span>
                          ) : (
                            <span className="h-6 w-6 shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="rounded-xl border border-dashed border-zinc-800 py-6 text-center text-xs text-zinc-600">
                      ไม่มีงาน
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trello card modal */}
      {modalTaskId && (
        <TaskCardModal
          taskId={modalTaskId}
          assignees={assignees}
          episodeHref={modalEpisode?.href ?? null}
          episodeLabel={modalEpisode?.label ?? null}
          onClose={() => setModalTaskId(null)}
          onChanged={load}
        />
      )}
    </AppShell>
  );
}
