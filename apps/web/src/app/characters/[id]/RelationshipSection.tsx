"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, type Character, type CharacterList, type CharacterRelationship } from "@/lib/api";
import { gradientFor, initialOf, useAssetImage } from "@/lib/media";
import { ArrowLeft, Link as LinkIcon, X } from "lucide-react";

// อารมณ์ความสัมพันธ์ที่พบบ่อย — ใช้เป็น datalist ให้เลือกเร็ว (ยังพิมพ์เองได้)
const COMMON_TYPES = [
  "เพื่อน",
  "เพื่อนสนิท",
  "คู่แข่ง",
  "พี่น้อง",
  "แฟน",
  "แฟนเก่า",
  "เจ้านาย-ลูกน้อง",
  "ครู-ลูกศิษย์",
  "คู่หู",
  "ศัตรู",
];

function RelAvatar({ assetId, name }: { assetId: string | null; name: string }) {
  const url = useAssetImage(assetId);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-12 w-12 rounded-full object-cover" />;
  }
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
      style={{ background: gradientFor(name) }}
    >
      {initialOf(name)}
    </div>
  );
}

export default function RelationshipSection({ characterId }: { characterId: string }) {
  const [items, setItems] = useState<CharacterRelationship[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // form state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Character[]>([]);
  const [picked, setPicked] = useState<Character | null>(null);
  const [relationType, setRelationType] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api<CharacterRelationship[]>(`/characters/${characterId}/relationships`);
      setItems(rows);
      setError(null);
    } catch (err) {
      // endpoint ยังไม่มี (API build เก่า) → แสดง empty state ไม่ crash
      setItems([]);
      setError(err instanceof Error ? err.message : "โหลดความสัมพันธ์ไม่สำเร็จ");
    }
  }, [characterId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ค้นหาตัวละครสำหรับ picker (debounce) — ตัดตัวเองออก
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api<CharacterList>(`/characters?q=${encodeURIComponent(query.trim())}`);
        setResults(res.items.filter((c) => c.id !== characterId).slice(0, 8));
      } catch {
        setResults([]);
      }
    }, 250);
  }, [query, characterId]);

  function resetForm() {
    setPicked(null);
    setQuery("");
    setResults([]);
    setRelationType("");
    setNotes("");
    setAdding(false);
  }

  async function save() {
    if (!picked || !relationType.trim()) return;
    setSaving(true);
    try {
      await api(`/characters/${characterId}/relationships`, {
        method: "POST",
        body: JSON.stringify({
          toCharacterId: picked.id,
          relationType: relationType.trim(),
          notes: notes.trim() || undefined,
        }),
      });
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove(relId: string) {
    if (!confirm("ลบความสัมพันธ์นี้?")) return;
    try {
      await api(`/characters/${characterId}/relationships/${relId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
          <LinkIcon className="size-5" /> ความสัมพันธ์
          {items && <span className="text-sm font-normal text-zinc-500">({items.length})</span>}
        </h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            + เพิ่มความสัมพันธ์
          </button>
        )}
      </div>

      {error && <p className="text-sm text-amber-400/80">{error}</p>}

      {adding && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          {picked ? (
            <div className="flex items-center gap-3">
              <RelAvatar assetId={picked.thumbAssetId ?? null} name={picked.nameTh} />
              <div className="flex-1">
                <p className="font-semibold">{picked.nameTh}</p>
                <p className="font-mono text-xs text-amber-300">{picked.displayCode}</p>
              </div>
              <button
                onClick={() => setPicked(null)}
                className="text-sm text-zinc-400 hover:text-zinc-200"
              >
                เปลี่ยน
              </button>
            </div>
          ) : (
            <div>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาตัวละคร (ชื่อ / รหัส)..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
              />
              {results.length > 0 && (
                <div className="mt-2 max-h-56 space-y-1 overflow-auto">
                  {results.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setPicked(c);
                        setResults([]);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-800"
                    >
                      <RelAvatar assetId={c.thumbAssetId ?? null} name={c.nameTh} />
                      <span className="flex-1 text-sm">{c.nameTh}</span>
                      <span className="font-mono text-xs text-zinc-500">{c.displayCode}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <input
              list="rel-types"
              value={relationType}
              onChange={(e) => setRelationType(e.target.value)}
              placeholder="ความสัมพันธ์ เช่น เพื่อน, คู่แข่ง"
              maxLength={40}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            <datalist id="rel-types">
              {COMMON_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
          <div className="flex gap-2">
            <button
              disabled={!picked || !relationType.trim() || saving}
              onClick={save}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button
              onClick={resetForm}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {items && items.length === 0 && !adding && (
        <p className="text-sm text-zinc-500">ยังไม่มีความสัมพันธ์กับตัวละครอื่น</p>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
            >
              {r.other ? (
                <Link href={`/characters/${r.other.id}`} className="shrink-0">
                  <RelAvatar assetId={r.other.thumbAssetId} name={r.other.nameTh} />
                </Link>
              ) : (
                <RelAvatar assetId={null} name="?" />
              )}
              <div className="min-w-0 flex-1">
                {r.other ? (
                  <Link
                    href={`/characters/${r.other.id}`}
                    className="font-semibold hover:text-amber-300"
                  >
                    {r.other.nameTh}
                  </Link>
                ) : (
                  <span className="text-zinc-500">(ตัวละครถูกลบ)</span>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">
                    {r.relationType}
                  </span>
                  {r.direction === "incoming" && (
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500" title="ฝั่งตรงข้ามเป็นผู้เพิ่ม">
                      <ArrowLeft className="size-3.5" /> ถูกอ้างถึง
                    </span>
                  )}
                </div>
                {r.notes && <p className="mt-1 truncate text-xs text-zinc-400">{r.notes}</p>}
              </div>
              <button
                onClick={() => remove(r.id)}
                className="inline-flex shrink-0 items-center text-zinc-500 hover:text-red-400"
                title="ลบ"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
