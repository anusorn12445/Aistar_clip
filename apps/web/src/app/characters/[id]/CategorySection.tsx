"use client";

import { useState } from "react";
import { api, type CharacterCategory } from "@/lib/api";
import { Drama, X } from "lucide-react";

type CategoryChip = { id: string; label: string };

// section "ประเภทตัวละคร" — assign หลายประเภท (many-to-many) ผ่าน PATCH /characters/:id { categoryIds }
// mirror AudienceSection แต่ persist ผ่าน update path ของ character (permission เดียวกับแก้ character)
export default function CategorySection({
  characterId,
  initial,
}: {
  characterId: string;
  initial: CategoryChip[];
}) {
  const [selected, setSelected] = useState<CategoryChip[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState<CharacterCategory[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  function openPicker() {
    setPickerOpen(true);
    setCatalogError(null);
    setCatalog(null);
    api<CharacterCategory[]>("/character-categories?status=active")
      .then((res) => setCatalog(Array.isArray(res) ? res : []))
      .catch((err) => {
        setCatalog([]);
        setCatalogError(
          err instanceof Error
            ? err.message
            : "โหลดรายการประเภทไม่สำเร็จ (ต้องมีสิทธิ์ Settings)",
        );
      });
  }

  // PATCH ชุด categoryIds ทั้งหมดใหม่ (replace-set)
  async function persist(next: CategoryChip[]) {
    const prev = selected;
    setSelected(next); // optimistic
    setBusy(true);
    setError(null);
    try {
      await api(`/characters/${characterId}`, {
        method: "PATCH",
        body: JSON.stringify({ categoryIds: next.map((c) => c.id) }),
      });
    } catch (err) {
      setSelected(prev); // rollback
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function addCategory(cat: CharacterCategory) {
    if (selected.some((c) => c.id === cat.id)) return;
    void persist([...selected, { id: cat.id, label: cat.label }]);
    setPickerOpen(false);
    setQ("");
  }

  function remove(id: string) {
    void persist(selected.filter((c) => c.id !== id));
  }

  const selectedIds = new Set(selected.map((c) => c.id));
  const options = (catalog ?? []).filter(
    (c) =>
      !selectedIds.has(c.id) &&
      (!q.trim() || c.label.toLowerCase().includes(q.trim().toLowerCase())),
  );

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
          <Drama className="size-5" /> ประเภทตัวละคร
          <span className="text-sm font-normal text-zinc-500">({selected.length})</span>
        </h3>
        {!pickerOpen && (
          <button
            onClick={openPicker}
            disabled={busy}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            + เพิ่มประเภท
          </button>
        )}
      </div>

      {error && <p className="text-sm text-amber-400/80">{error}</p>}

      {pickerOpen && (
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาประเภท..."
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            <button
              onClick={() => {
                setPickerOpen(false);
                setQ("");
              }}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              ปิด
            </button>
          </div>
          {catalogError && <p className="text-xs text-amber-400/80">{catalogError}</p>}
          {catalog === null ? (
            <p className="text-sm text-zinc-500">กำลังโหลด...</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-zinc-500">
              ไม่มีประเภทให้เลือก — สร้างประเภทใหม่ได้ที่ Settings → ประเภทตัวละคร
            </p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {options.map((c) => (
                <button
                  key={c.id}
                  disabled={busy}
                  onClick={() => addCategory(c)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-left hover:border-amber-400/60 hover:bg-zinc-900 disabled:opacity-50"
                >
                  <span className="text-sm text-zinc-200">{c.label}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{c.characterCount} ตัว</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected.length === 0 && !pickerOpen ? (
        <p className="text-sm text-zinc-500">
          ยังไม่ได้ระบุประเภท — กด &ldquo;+ เพิ่มประเภท&rdquo; เพื่อเลือกจาก taxonomy กลาง
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selected.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-sm text-amber-200"
            >
              {c.label}
              <button
                onClick={() => remove(c.id)}
                disabled={busy}
                className="inline-flex items-center text-amber-300/70 hover:text-red-300 disabled:opacity-50"
                title="เอาออก"
              >
                <X className="size-4" />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
