"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type CharacterCategory } from "@/lib/api";
import { Drama } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

// จัดการ taxonomy "ประเภทตัวละคร" — mirror ProductCategory/Audience management
export default function CharacterCategoriesSection() {
  const [categories, setCategories] = useState<CharacterCategory[] | null>(null);
  const [unavailable, setUnavailable] = useState(false); // API build เก่า (404)
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [adding, setAdding] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<CharacterCategory[]>("/character-categories");
      setCategories(res);
      setUnavailable(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/404|Cannot (GET|POST|PATCH|DELETE)|not found/i.test(msg)) setUnavailable(true);
      else setError(msg || "โหลดประเภทตัวละครไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function saveAdd() {
    const label = addLabel.trim();
    if (!label) return;
    void run(async () => {
      await api("/character-categories", {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      setAddLabel("");
      setAdding(false);
    });
  }

  function saveEdit() {
    const label = editLabel.trim();
    const id = editId;
    if (!id || !label) return;
    void run(async () => {
      await api(`/character-categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ label }),
      });
      setEditId(null);
    });
  }

  function toggleArchive(c: CharacterCategory) {
    const status = c.status === "active" ? "archived" : "active";
    void run(() =>
      api(`/character-categories/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    );
  }

  function remove(c: CharacterCategory) {
    if (!confirm(`ลบประเภท "${c.label}"?`)) return;
    void run(() => api(`/character-categories/${c.id}`, { method: "DELETE" }));
  }

  const visible = (categories ?? []).filter((c) => showArchived || c.status === "active");

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Drama className="size-4" /> ประเภทตัวละคร (Character Category)</h2>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
          taxonomy กลาง
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
        นิยามประเภทตัวละครชุดกลาง — ตัวละครเลือกได้หลายประเภท (เช่น รีวิวเวอร์, พิธีกร, สายมู) ใช้กรองในหน้า
        Characters ได้
      </p>

      {unavailable && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          API build เก่า — ยังไม่มี endpoint จัดการประเภทตัวละคร กรุณา rebuild &amp; restart API :4000 แล้วลองใหม่
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!unavailable && (
        <>
          <div className="space-y-2">
            {visible.map((c) =>
              editId === c.id ? (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/40 bg-zinc-950/60 p-3"
                >
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    maxLength={40}
                    className={`${inputCls} max-w-xs`}
                  />
                  <button
                    type="button"
                    disabled={busy || !editLabel.trim()}
                    onClick={saveEdit}
                    className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                  >
                    บันทึก
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditId(null)}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    ยกเลิก
                  </button>
                </div>
              ) : (
                <div
                  key={c.id}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 ${
                    c.status === "archived" ? "opacity-60" : ""
                  }`}
                >
                  <span className="text-sm font-semibold text-zinc-100">{c.label}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                    {c.key}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                      ใช้อยู่ {c.characterCount} ตัว
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setEditLabel(c.label);
                        setEditId(c.id);
                        setAdding(false);
                      }}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      แก้ไข
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => toggleArchive(c)}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      {c.status === "active" ? "เก็บเข้ากรุ" : "กู้คืน"}
                    </button>
                    {c.characterCount === 0 && !c.builtin ? (
                      <button
                        disabled={busy}
                        onClick={() => remove(c)}
                        className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        ลบ
                      </button>
                    ) : (
                      <span
                        title={c.builtin ? "ประเภทพื้นฐาน ลบไม่ได้" : "มีตัวละครใช้อยู่ — เก็บเข้ากรุแทน"}
                        className="cursor-not-allowed rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-600"
                      >
                        ลบ
                      </span>
                    )}
                  </div>
                </div>
              ),
            )}
            {categories && visible.length === 0 && (
              <p className="py-4 text-center text-sm text-zinc-500">
                ยังไม่มีประเภทตัวละคร — กด &ldquo;+ เพิ่มประเภท&rdquo; เพื่อสร้างอันแรก
              </p>
            )}
            {!categories && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}
          </div>

          {adding ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/40 bg-zinc-950/60 p-3">
              <input
                autoFocus
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveAdd()}
                placeholder="ชื่อประเภท เช่น รีวิวเวอร์"
                maxLength={40}
                className={`${inputCls} max-w-xs`}
              />
              <button
                type="button"
                disabled={busy || !addLabel.trim()}
                onClick={saveAdd}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setAddLabel("");
                }}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                ยกเลิก
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAddLabel("");
                setAdding(true);
                setEditId(null);
              }}
              className="rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10"
            >
              + เพิ่มประเภท
            </button>
          )}
        </>
      )}
    </section>
  );
}
