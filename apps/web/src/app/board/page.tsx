"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Pin, Trash2 } from "lucide-react";
import { Itim } from "next/font/google";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";
import { POSTIT_TYPES, Postit } from "@/lib/intelligence";

// ฟอนต์ลายมือไทย — ให้เหมือนเขียนโน้ตด้วยมือจริงๆ
const itim = Itim({ weight: "400", subsets: ["thai", "latin"] });

// สีกระดาษโพสต์อิทแบบคลาสสิก (โทน 3M) ต่อประเภท
const PAPER: Record<string, string> = {
  note: "#FEF49C",
  idea: "#FFD180",
  todo: "#9EDBFF",
  issue: "#FF9EB5",
  feedback: "#9FF0D2",
  qc_note: "#FFC29E",
  risk: "#FFA099",
  reference: "#C5B8FF",
  decision: "#B9F6A6",
  question: "#F5A8EC",
};

// เอียงนิดๆ เหมือนแปะมือ — คงที่ต่อโน้ต ไม่กระโดดตอน re-render
function tiltOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return ((h % 7) - 3) * 0.7; // -2.1 ถึง +2.1 องศา
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "เมื่อกี้";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function StickyNote({
  p,
  busy,
  onSave,
  onChangeType,
  onRemove,
  onToTask,
}: {
  p: Postit;
  busy: boolean;
  onSave: (content: string) => Promise<void>;
  onChangeType: (type: string) => Promise<void>;
  onRemove: () => void;
  onToTask: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.content);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const paper = PAPER[p.type] ?? PAPER.note;

  useEffect(() => {
    if (editing) {
      areaRef.current?.focus();
      areaRef.current?.setSelectionRange(draft.length, draft.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== p.content) await onSave(next);
    else setDraft(p.content);
  }

  return (
    <div
      style={{ transform: `rotate(${tiltOf(p.id)}deg)`, backgroundColor: paper }}
      className="group relative aspect-square p-4 pb-3 text-zinc-900 shadow-[3px_5px_12px_rgba(0,0,0,0.45)] transition-all duration-150 hover:z-10 hover:rotate-0 hover:scale-[1.04] hover:shadow-[5px_8px_20px_rgba(0,0,0,0.55)]"
    >
      {/* เทปกาวแปะหัวโน้ต */}
      <div
        className="absolute -top-2.5 left-1/2 h-5 w-20 -translate-x-1/2 border border-white/20 bg-white/30"
        style={{ transform: `translateX(-50%) rotate(${tiltOf(p.id) * -1.2}deg)` }}
      />
      {/* มุมพับล่างขวา */}
      <div
        className="absolute bottom-0 right-0 h-6 w-6"
        style={{
          background: "rgba(0,0,0,0.16)",
          clipPath: "polygon(100% 0, 0 100%, 0 0)",
        }}
      />
      <div
        className="absolute bottom-0 right-0 h-6 w-6 bg-zinc-950"
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
      />

      {/* ปุ่มบนโน้ต — โผล่ตอน hover (ซ่อนตอนแก้ไข) */}
      {!editing && (
        <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            title="แปลงเป็นงานใน My Work"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onToTask();
            }}
            className="rounded bg-zinc-900/15 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-zinc-900/30"
          >
            <CircleCheck className="size-3.5" />
          </button>
          <button
            title="เก็บโน้ตออกจากกระดาน"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="rounded bg-zinc-900/15 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-zinc-900/30"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}

      {/* เนื้อโน้ต — คลิกเพื่อแก้ */}
      {editing ? (
        <div className="flex h-full flex-col">
          <textarea
            ref={areaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft(p.content);
                setEditing(false);
              }
            }}
            className={`${itim.className} h-full w-full flex-1 resize-none bg-transparent text-lg leading-snug text-zinc-900 outline-none placeholder:text-zinc-900/40`}
            placeholder="เขียนโน้ต..."
          />
          {/* จุดสีเปลี่ยนประเภทกระดาษ */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {Object.entries(PAPER).map(([t, color]) => (
              <button
                key={t}
                title={POSTIT_TYPES[t]?.label ?? t}
                onMouseDown={(e) => {
                  e.preventDefault(); // กัน blur ก่อนเปลี่ยนสี
                  onChangeType(t);
                }}
                style={{ backgroundColor: color }}
                className={`h-4 w-4 rounded-full border ${
                  p.type === t ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-900/30"
                }`}
              />
            ))}
            <span className="ml-auto text-[9px] text-zinc-900/50">Enter บันทึก</span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex h-full w-full cursor-text flex-col text-left"
          title="คลิกเพื่อแก้ไข"
        >
          <span
            className={`${itim.className} flex-1 overflow-hidden whitespace-pre-wrap text-lg leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6]`}
          >
            {p.content}
          </span>
          <span className="mt-2 text-[10px] text-zinc-900/50">
            {p.createdByName ?? "ทีม"} · {timeAgo(p.createdAt)}
          </span>
        </button>
      )}
    </div>
  );
}

function BoardInner() {
  const router = useRouter();
  const [notes, setNotes] = useState<Postit[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [saving, setSaving] = useState(false);

  const [q, setQ] = useState("");
  const [fType, setFType] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ pageSize: "50", sortBy: "createdAt", sortDir: "desc" });
      if (q) params.set("q", q);
      if (fType) params.set("type", fType);
      const res = await api<{ items: Postit[] }>(`/postits?${params}`);
      setNotes(res.items.filter((p) => p.status === "open" || p.status === "in_progress"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดโน้ตไม่สำเร็จ");
    }
  }, [q, fType]);

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api<Postit>("/postits", {
        method: "POST",
        body: JSON.stringify({ type: noteType, content: content.trim() }),
      });
      setContent("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "แปะโน้ตไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveContent(p: Postit, next: string) {
    setBusyId(p.id);
    const prev = notes;
    setNotes(prev.map((n) => (n.id === p.id ? { ...n, content: next } : n)));
    try {
      await api(`/postits/${p.id}`, { method: "PATCH", body: JSON.stringify({ content: next }) });
    } catch (err) {
      setNotes(prev);
      setError(err instanceof Error ? err.message : "บันทึกโน้ตไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function changeType(p: Postit, type: string) {
    const prev = notes;
    setNotes(prev.map((n) => (n.id === p.id ? { ...n, type } : n)));
    try {
      await api(`/postits/${p.id}`, { method: "PATCH", body: JSON.stringify({ type }) });
    } catch (err) {
      setNotes(prev);
      setError(err instanceof Error ? err.message : "เปลี่ยนสีไม่สำเร็จ");
    }
  }

  async function removeNote(p: Postit) {
    setBusyId(p.id);
    try {
      const path: Record<string, string[]> = {
        open: ["in_progress", "resolved", "archived"],
        in_progress: ["resolved", "archived"],
        resolved: ["archived"],
      };
      for (const s of path[p.status] ?? []) {
        await api(`/postits/${p.id}`, { method: "PATCH", body: JSON.stringify({ status: s }) });
      }
      setNotes((ns) => ns.filter((n) => n.id !== p.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "เก็บโน้ตไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function toTask(p: Postit) {
    setBusyId(p.id);
    try {
      await api(`/postits/${p.id}/convert-to-task`, { method: "POST", body: JSON.stringify({}) });
      setNotes((ns) => ns.filter((n) => n.id !== p.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "แปลงเป็นงานไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Post-it Board">
      <div className="space-y-6">
        <form onSubmit={addNote} className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={noteType}
            onChange={setNoteType}
            options={Object.entries(POSTIT_TYPES).map(([v, m]) => ({ value: v, label: m.label }))}
          />
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="พิมพ์โน้ตแล้วกด Enter แปะเลย..."
            className="min-w-64 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={saving || !content.trim()}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? "กำลังแปะ..." : <><Pin className="size-3.5" /> แปะ</>}
          </button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="หาโน้ต..."
            className="w-40 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
          />
          <FilterSelect
            value={fType}
            onChange={setFType}
            options={[
              { value: "", label: "ทุกสี" },
              ...Object.entries(POSTIT_TYPES).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
        </form>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {notes.length > 0 ? (
          <div className="grid grid-cols-2 gap-6 pt-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {notes.map((p) => (
              <StickyNote
                key={p.id}
                p={p}
                busy={busyId === p.id}
                onSave={(c) => saveContent(p, c)}
                onChangeType={(t) => changeType(p, t)}
                onRemove={() => removeNote(p)}
                onToTask={() => toTask(p)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-16 text-center">
            <Pin className="mx-auto size-8" />
            <p className="mt-2 text-sm text-zinc-300">กระดานยังว่าง — แปะโน้ตแรกได้เลย</p>
            <p className="mt-1 text-xs text-zinc-500">
              ไอเดีย เตือนความจำ ปัญหาที่เจอ อะไรก็แปะได้ พิมพ์ด้านบนแล้วกด Enter · คลิกโน้ตเพื่อแก้ไข
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <BoardInner />
    </Suspense>
  );
}
