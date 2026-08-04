"use client";

// 🚫 Do's & Don'ts (Character Sheet ข้อ 4) — กฎประจำตัวละคร
// dos = สิ่งที่ต้องมีเสมอ / donts = ข้อห้าม (content rules ของสตูดิโอ)
// บันทึกผ่าน PATCH /characters/:id เดิม → ฝังเข้า DIRECTIVE ของทุก prompt ที่ก๊อป
// (ALWAYS/NEVER bullets ทุกค่าย + Grok merge donts เข้า Negative prompt ให้ด้วย)

import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Ban, Check, CircleCheck, X } from "lucide-react";

function TagListEditor({
  label,
  icon,
  placeholder,
  items,
  onChange,
  accent,
}: {
  label: string;
  icon: ReactNode;
  placeholder: string;
  items: string[];
  onChange: (next: string[]) => void;
  accent: "emerald" | "red";
}) {
  const [input, setInput] = useState("");
  const chipCls =
    accent === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-red-500/40 bg-red-500/10 text-red-200";

  function add() {
    const v = input.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setInput("");
  }

  return (
    <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <p className="flex items-center gap-1 text-sm font-semibold text-zinc-200">
        {icon} {label}
      </p>
      {items.length === 0 && <p className="text-xs text-zinc-600">ยังไม่มีรายการ</p>}
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${chipCls}`}
          >
            {item}
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              title="ลบข้อนี้"
              className="inline-flex items-center text-current opacity-60 hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-400"
        />
        <button
          onClick={add}
          className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          + เพิ่ม
        </button>
      </div>
    </div>
  );
}

export default function DosDontsSection({
  characterId,
  initialDos,
  initialDonts,
  onSaved,
}: {
  characterId: string;
  initialDos: string[];
  initialDonts: string[];
  onSaved: () => Promise<void>;
}) {
  const [dos, setDos] = useState<string[]>(initialDos);
  const [donts, setDonts] = useState<string[]>(initialDonts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // sync เมื่อ character reload (เช่นแก้จากที่อื่น) — เฉพาะตอนไม่มี edit ค้าง
  useEffect(() => {
    setDos(initialDos);
    setDonts(initialDonts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialDos), JSON.stringify(initialDonts)]);

  const dirty =
    JSON.stringify(dos) !== JSON.stringify(initialDos) ||
    JSON.stringify(donts) !== JSON.stringify(initialDonts);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/characters/${characterId}`, {
        method: "PATCH",
        body: JSON.stringify({ dos, donts }),
      });
      await onSaved();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
          <Ban className="size-5" /> Do&apos;s &amp; Don&apos;ts
        </h3>
        <div className="flex items-center gap-2">
          {savedFlash && !dirty && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
              บันทึกแล้ว <Check className="size-3.5" />
            </span>
          )}
          {dirty && (
            <button
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        กฎพวกนี้ฝังเข้า DIRECTIVE ของทุก prompt ที่ก๊อปจากหน้านี้อัตโนมัติ — Do&apos;s เป็น ALWAYS,
        Don&apos;ts เป็น NEVER (และ Grok เอา Don&apos;ts ไปรวมใน negative prompt ให้ด้วย)
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TagListEditor
          label="Do's (ต้องมีเสมอ)"
          icon={<CircleCheck className="size-4" />}
          accent="emerald"
          placeholder='เช่น "ยิ้มเห็นลักยิ้มซ้ายทุกรูป"'
          items={dos}
          onChange={setDos}
        />
        <TagListEditor
          label="Don'ts (ข้อห้าม)"
          icon={<Ban className="size-4" />}
          accent="red"
          placeholder='เช่น "ห้ามถือแอลกอฮอล์"'
          items={donts}
          onChange={setDonts}
        />
      </div>
    </section>
  );
}
