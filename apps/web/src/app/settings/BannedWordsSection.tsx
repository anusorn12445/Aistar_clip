"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BANNED_CATEGORY_LABEL,
  BANNED_PLATFORM_LABEL,
  BANNED_SEVERITY_LABEL,
  BannedWord,
  BannedWordInput,
  archiveBannedWord,
  createBannedWord,
  fetchBannedWords,
  invalidateBannedWordsCache,
  updateBannedWord,
} from "@/lib/banned-words";
import { FilterSelect } from "@/components/ui/filter-select";
import { Ban } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

const PLATFORM_KEYS = ["tiktok", "youtube", "facebook"] as const;

interface Draft {
  term: string;
  platforms: string[];
  severity: string;
  category: string;
  replacement: string;
  note: string;
}

const EMPTY_DRAFT: Draft = {
  term: "",
  platforms: [],
  severity: "ban",
  category: "",
  replacement: "",
  note: "",
};

function toDraft(w: BannedWord): Draft {
  return {
    term: w.term,
    platforms: w.platforms ?? [],
    severity: w.severity,
    category: w.category ?? "",
    replacement: w.replacement ?? "",
    note: w.note ?? "",
  };
}

// 🚫 คำต้องห้าม (Banned Words) — คลังคำที่แพลตฟอร์มแบน/ลดการมองเห็น
// บังคับใช้ 3 ชั้น: ฉีดเข้า prompt AI · live scanner ทุกช่องข้อความพูด · HARD BLOCK ตอน Clip Job พร้อมโพสต์
export default function BannedWordsSection() {
  const [words, setWords] = useState<BannedWord[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // filters
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [platform, setPlatform] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [editId, setEditId] = useState<string | null>(null); // "new" | uuid | null
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchBannedWords();
      setWords(res);
      setUnavailable(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/404|Cannot (GET|POST|PATCH|DELETE)|not found/i.test(msg)) setUnavailable(true);
      else setError(msg || "โหลดคำต้องห้ามไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    // เรียกผ่าน microtask — setState เกิดใน async callback (เลี่ยง cascading render, idiom เดียวกับหน้า affiliate)
    void Promise.resolve().then(load);
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      invalidateBannedWordsCache(); // scanner ฝั่งหน้า clip/affiliate โหลดชุดใหม่รอบถัดไป
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!draft.term.trim()) return;
    const input: BannedWordInput = {
      term: draft.term.trim(),
      platforms: draft.platforms,
      severity: draft.severity,
      category: draft.category.trim(),
      replacement: draft.replacement.trim(),
      note: draft.note.trim(),
    };
    const id = editId;
    void run(async () => {
      if (id === "new") await createBannedWord(input);
      else if (id) await updateBannedWord(id, input);
      setEditId(null);
    });
  }

  function archive(w: BannedWord) {
    if (!confirm(`เก็บคำ "${w.term}" เข้ากรุ? (จะไม่ถูกใช้สแกน/บล็อกอีก)`)) return;
    void run(() => archiveBannedWord(w.id));
  }

  function unarchive(w: BannedWord) {
    void run(() => updateBannedWord(w.id, { status: "active" }));
  }

  const visible = useMemo(() => {
    return (words ?? []).filter((w) => {
      if (!showArchived && w.status !== "active") return false;
      if (severity && w.severity !== severity) return false;
      if (platform && w.platforms.length > 0 && !w.platforms.includes(platform)) return false;
      if (q) {
        const needle = q.toLowerCase();
        const hay = [w.term, w.replacement ?? "", w.note ?? "", w.category ?? ""].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [words, showArchived, severity, platform, q]);

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Ban className="size-4" /> คำต้องห้าม (Banned Words)</h2>
        <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
          hard block
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-amber-400"
          />
          แสดงที่เก็บเข้ากรุ
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        คำที่แพลตฟอร์มแบน/ลดการมองเห็น — ระบบบังคับใช้ 3 ชั้น: ① ฉีดเข้า prompt ตอน AI เขียนสคริปต์ ②
        สแกนสด+แทนที่คลิกเดียวในทุกช่องข้อความพูด ③ <span className="inline-block size-2 rounded-full bg-red-500 align-middle" /> ระดับ &ldquo;แบน&rdquo; บล็อก Clip Job ไม่ให้พร้อมโพสต์จนกว่าจะแก้หมด
        (<span className="inline-block size-2 rounded-full bg-amber-500 align-middle" /> &ldquo;เสี่ยง&rdquo; = เตือนอย่างเดียว)
      </p>

      {unavailable && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          API build เก่า — ยังไม่มี endpoint คำต้องห้าม กรุณา rebuild &amp; restart API :4000 แล้ว run seed
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!unavailable && (
        <>
          {/* filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาคำ/คำแทน/โน้ต..."
              className="w-56 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs outline-none focus:border-amber-400"
            />
            <FilterSelect
              value={severity}
              onChange={setSeverity}
              options={[
                { value: "", label: "ทุกระดับ" },
                { value: "ban", label: "แบน" },
                { value: "risky", label: "เสี่ยง" },
              ]}
            />
            <FilterSelect
              value={platform}
              onChange={setPlatform}
              options={[
                { value: "", label: "ทุกแพลตฟอร์ม" },
                ...PLATFORM_KEYS.map((p) => ({ value: p, label: BANNED_PLATFORM_LABEL[p] })),
              ]}
            />
            <span className="text-xs text-zinc-500">{visible.length} คำ</span>
          </div>

          {/* table */}
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-zinc-950/60 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">คำ</th>
                  <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                  <th className="px-3 py-2 font-medium">ระดับ</th>
                  <th className="px-3 py-2 font-medium">หมวด</th>
                  <th className="px-3 py-2 font-medium">คำแทนที่แนะนำ</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {visible.map((w) => {
                  const sev = BANNED_SEVERITY_LABEL[w.severity] ?? {
                    label: w.severity,
                    cls: "bg-zinc-800 text-zinc-300",
                  };
                  return (
                    <BannedWordRow
                      key={w.id}
                      word={w}
                      sev={sev}
                      busy={busy}
                      editing={editId === w.id}
                      draft={draft}
                      setDraft={setDraft}
                      onEdit={() => {
                        if (editId === w.id) setEditId(null);
                        else {
                          setDraft(toDraft(w));
                          setEditId(w.id);
                        }
                      }}
                      onSave={save}
                      onCancel={() => setEditId(null)}
                      onArchive={() => archive(w)}
                      onUnarchive={() => unarchive(w)}
                    />
                  );
                })}
                {words && visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                      ไม่พบคำตามเงื่อนไข — run seed เพื่อเติมคำมาตรฐาน ~50 คำ หรือกด &ldquo;+ เพิ่มคำ&rdquo;
                    </td>
                  </tr>
                )}
                {!words && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                      กำลังโหลด...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {editId === "new" ? (
            <WordEditor draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditId(null)} busy={busy} isNew />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setEditId("new");
              }}
              className="rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10"
            >
              + เพิ่มคำต้องห้าม
            </button>
          )}
        </>
      )}
    </section>
  );
}

function BannedWordRow({
  word: w,
  sev,
  busy,
  editing,
  draft,
  setDraft,
  onEdit,
  onSave,
  onCancel,
  onArchive,
  onUnarchive,
}: {
  word: BannedWord;
  sev: { label: string; cls: string };
  busy: boolean;
  editing: boolean;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  return (
    <>
      <tr className={w.status === "archived" ? "opacity-50" : ""}>
        <td className="px-3 py-2">
          <span className="font-medium text-zinc-100">{w.term}</span>
          {w.builtin && (
            <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">builtin</span>
          )}
          {w.note && <p className="mt-0.5 max-w-[16rem] text-[10px] text-zinc-500">{w.note}</p>}
        </td>
        <td className="px-3 py-2">
          {w.platforms.length === 0 ? (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">ทุกแพลตฟอร์ม</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {w.platforms.map((p) => (
                <span key={p} className="rounded bg-sky-900/50 px-1.5 py-0.5 text-[10px] text-sky-200">
                  {BANNED_PLATFORM_LABEL[p] ?? p}
                </span>
              ))}
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${sev.cls}`}>{sev.label}</span>
        </td>
        <td className="px-3 py-2 text-zinc-400">
          {w.category ? BANNED_CATEGORY_LABEL[w.category] ?? w.category : "—"}
        </td>
        <td className="px-3 py-2 text-emerald-300">{w.replacement ?? "—"}</td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-1.5">
            <button
              disabled={busy}
              onClick={onEdit}
              className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
            >
              {editing ? "ปิด" : "แก้ไข"}
            </button>
            {w.status === "active" ? (
              <button
                disabled={busy}
                onClick={onArchive}
                className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                เก็บเข้ากรุ
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={onUnarchive}
                className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                กู้คืน
              </button>
            )}
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={6} className="px-3 pb-3">
            <WordEditor
              draft={draft}
              setDraft={setDraft}
              onSave={onSave}
              onCancel={onCancel}
              busy={busy}
              termLocked={w.builtin}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function WordEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
  isNew = false,
  termLocked = false,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  isNew?: boolean;
  termLocked?: boolean; // builtin — term แก้ไม่ได้ (แก้ได้เฉพาะคำแทน/โน้ต/แพลตฟอร์ม/ระดับ)
}) {
  function togglePlatform(p: string) {
    setDraft((d) => ({
      ...d,
      platforms: d.platforms.includes(p) ? d.platforms.filter((x) => x !== p) : [...d.platforms, p],
    }));
  }
  return (
    <div className="space-y-3 rounded-xl border border-amber-400/40 bg-zinc-950/60 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">
            คำต้องห้าม * {termLocked && <span className="text-zinc-600">(builtin — แก้ตัวคำไม่ได้)</span>}
          </span>
          <input
            value={draft.term}
            onChange={(e) => setDraft((d) => ({ ...d, term: e.target.value }))}
            placeholder='เช่น "รักษา"'
            maxLength={120}
            disabled={termLocked}
            className={`${inputCls} disabled:opacity-50`}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">คำแทนที่แนะนำ (ปุ่ม [แทนที่] ในตัวสแกนใช้คำนี้)</span>
          <input
            value={draft.replacement}
            onChange={(e) => setDraft((d) => ({ ...d, replacement: e.target.value }))}
            placeholder='เช่น "ดูแล"'
            maxLength={200}
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <span className="block text-xs text-zinc-500">แพลตฟอร์ม (ไม่เลือก = ห้ามทุกแพลตฟอร์ม)</span>
          <div className="flex gap-1.5">
            {PLATFORM_KEYS.map((p) => {
              const on = draft.platforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`rounded-lg px-2.5 py-1 text-xs ${
                    on
                      ? "bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/50"
                      : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {BANNED_PLATFORM_LABEL[p]}
                </button>
              );
            })}
          </div>
        </div>
        <label className="space-y-1">
          <span className="block text-xs text-zinc-500">ระดับ</span>
          <FilterSelect
            value={draft.severity}
            onChange={(v) => setDraft((d) => ({ ...d, severity: v }))}
            options={[
              { value: "ban", label: "แบน — บล็อกพร้อมโพสต์" },
              { value: "risky", label: "เสี่ยง — เตือนอย่างเดียว" },
            ]}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-zinc-500">หมวด</span>
          <input
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            placeholder="เช่น health_claim"
            maxLength={60}
            list="banned-category-options"
            className="w-40 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none focus:border-amber-400"
          />
          <datalist id="banned-category-options">
            {Object.keys(BANNED_CATEGORY_LABEL).map((k) => (
              <option key={k} value={k}>
                {BANNED_CATEGORY_LABEL[k]}
              </option>
            ))}
          </datalist>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">โน้ต (เงื่อนไข/บริบท เช่น &ldquo;อย. รับรอง ใช้ได้เมื่อมีเลขจริง&rdquo;)</span>
        <input
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          maxLength={500}
          className={inputCls}
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !draft.term.trim()}
          onClick={onSave}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {isNew ? "เพิ่มคำ" : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
