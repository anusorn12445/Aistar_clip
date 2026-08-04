"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BLUEPRINT_DEFAULT_FIELDS,
  BLUEPRINT_REQUIRED_FIELD_OPTIONS,
  archiveCharacterBlueprint,
  createCharacterBlueprint,
  fetchCharacterBlueprints,
  updateCharacterBlueprint,
  type CharacterBlueprint,
  type CharacterBlueprintInput,
} from "@/lib/api";
import { Dna } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

// ฟอร์มแก้/สร้าง blueprint (พิมพ์เขียว)
interface Draft {
  name: string;
  icon: string;
  description: string;
  houseRules: string;
  requiredFields: string[];
  defaults: Record<string, string>;
  isDefault: boolean;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  icon: "",
  description: "",
  houseRules: "",
  requiredFields: [],
  defaults: {},
  isDefault: false,
};

function toDraft(bp: CharacterBlueprint): Draft {
  const defaults: Record<string, string> = {};
  for (const [k, v] of Object.entries(bp.defaults ?? {})) {
    defaults[k] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
  }
  return {
    name: bp.name,
    icon: bp.icon ?? "",
    description: bp.description ?? "",
    houseRules: bp.houseRules ?? "",
    requiredFields: bp.requiredFields ?? [],
    defaults,
    isDefault: bp.isDefault,
  };
}

function toInput(d: Draft): CharacterBlueprintInput {
  // defaults: ตัดค่าว่างออก
  const defaults: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d.defaults)) {
    if (v.trim()) defaults[k] = v.trim();
  }
  return {
    name: d.name.trim(),
    icon: d.icon.trim(),
    description: d.description.trim(),
    houseRules: d.houseRules.trim(),
    requiredFields: d.requiredFields,
    defaults,
    isDefault: d.isDefault,
  };
}

// 🧬 Character Blueprint (พิมพ์เขียว) — จัดการ creation directive ที่คุมมาตรฐานการสร้างตัวละคร
export default function CharacterBlueprintsSection() {
  const [blueprints, setBlueprints] = useState<CharacterBlueprint[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // editId = "new" ตอนสร้างใหม่, uuid ตอนแก้, null = ปิดฟอร์ม
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchCharacterBlueprints();
      setBlueprints(res);
      setUnavailable(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/404|Cannot (GET|POST|PATCH|DELETE)|not found/i.test(msg)) setUnavailable(true);
      else setError(msg || "โหลดพิมพ์เขียวไม่สำเร็จ");
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

  function startNew() {
    setDraft(EMPTY_DRAFT);
    setEditId("new");
  }

  function startEdit(bp: CharacterBlueprint) {
    setDraft(toDraft(bp));
    setEditId(bp.id);
  }

  function save() {
    if (!draft.name.trim()) return;
    const input = toInput(draft);
    const id = editId;
    void run(async () => {
      if (id === "new") await createCharacterBlueprint(input);
      else if (id) await updateCharacterBlueprint(id, input);
      setEditId(null);
    });
  }

  function archive(bp: CharacterBlueprint) {
    if (!confirm(`เก็บพิมพ์เขียว "${bp.name}" เข้ากรุ?`)) return;
    void run(() => archiveCharacterBlueprint(bp.id));
  }

  function unarchive(bp: CharacterBlueprint) {
    void run(() => updateCharacterBlueprint(bp.id, { status: "active" }));
  }

  function toggleRequired(key: string) {
    setDraft((d) => ({
      ...d,
      requiredFields: d.requiredFields.includes(key)
        ? d.requiredFields.filter((k) => k !== key)
        : [...d.requiredFields, key],
    }));
  }

  const visible = (blueprints ?? []).filter((b) => showArchived || b.status === "active");

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Dna className="size-4" /> พิมพ์เขียวตัวละคร (Character Blueprint)</h2>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
          creation directive
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
        พิมพ์เขียวคือ &ldquo;กฎบ้าน + ค่าเริ่มต้น + ฟิลด์บังคับ&rdquo; ที่ฉีดเข้า AI ทั้งตอน AI Wizard และ
        สร้างจากภายนอก — ทำให้ตัวละครทุกตัวออกมาครบและได้มาตรฐานเดียวกัน
      </p>

      {unavailable && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          API build เก่า — ยังไม่มี endpoint จัดการพิมพ์เขียว กรุณา rebuild &amp; restart API :4000 แล้ว run seed
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!unavailable && (
        <>
          <div className="space-y-2">
            {visible.map((bp) => (
              <div key={bp.id}>
                <div
                  className={`flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 ${
                    bp.status === "archived" ? "opacity-60" : ""
                  }`}
                >
                  <span className="text-lg">{bp.icon || "🧬"}</span>
                  <span className="text-sm font-semibold text-zinc-100">{bp.name}</span>
                  {bp.isDefault && (
                    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-300 ring-1 ring-amber-400/40">
                      default
                    </span>
                  )}
                  {bp.requiredFields.length > 0 && (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                      required: {bp.requiredFields.join(", ")}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      disabled={busy}
                      onClick={() => (editId === bp.id ? setEditId(null) : startEdit(bp))}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      {editId === bp.id ? "ปิด" : "แก้ไข"}
                    </button>
                    {bp.status === "active" ? (
                      <button
                        disabled={busy}
                        onClick={() => archive(bp)}
                        className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        เก็บเข้ากรุ
                      </button>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => unarchive(bp)}
                        className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        กู้คืน
                      </button>
                    )}
                  </div>
                </div>
                {bp.description && editId !== bp.id && (
                  <p className="px-4 pt-1 text-xs text-zinc-500">{bp.description}</p>
                )}
                {editId === bp.id && <BlueprintEditor draft={draft} setDraft={setDraft} onToggleRequired={toggleRequired} onSave={save} onCancel={() => setEditId(null)} busy={busy} />}
              </div>
            ))}
            {blueprints && visible.length === 0 && (
              <p className="py-4 text-center text-sm text-zinc-500">
                ยังไม่มีพิมพ์เขียว — run seed หรือกด &ldquo;+ เพิ่มพิมพ์เขียว&rdquo; เพื่อสร้างอันแรก
              </p>
            )}
            {!blueprints && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}
          </div>

          {editId === "new" ? (
            <BlueprintEditor draft={draft} setDraft={setDraft} onToggleRequired={toggleRequired} onSave={save} onCancel={() => setEditId(null)} busy={busy} />
          ) : (
            <button
              type="button"
              onClick={startNew}
              className="rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10"
            >
              + เพิ่มพิมพ์เขียว
            </button>
          )}
        </>
      )}
    </section>
  );
}

function BlueprintEditor({
  draft,
  setDraft,
  onToggleRequired,
  onSave,
  onCancel,
  busy,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  onToggleRequired: (key: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-2 space-y-3 rounded-xl border border-amber-400/40 bg-zinc-950/60 p-4">
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">ไอคอน</span>
          <input
            value={draft.icon}
            onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
            placeholder=""
            maxLength={4}
            className={inputCls}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">ชื่อพิมพ์เขียว *</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="เช่น แม่บ้านอีสาน"
            maxLength={80}
            className={inputCls}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">คำอธิบายสั้น</span>
        <input
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className={inputCls}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">
          House Rules — directive ที่ฉีดเข้า system prompt ของ AI
        </span>
        <textarea
          value={draft.houseRules}
          onChange={(e) => setDraft((d) => ({ ...d, houseRules: e.target.value }))}
          rows={4}
          placeholder="เช่น ตัวละครต้องเป็นคนอีสาน อบอุ่นจริงใจ โทนภาพอุ่นแบบบ้าน..."
          className={inputCls}
        />
      </label>

      {/* requiredFields multiselect */}
      <div className="space-y-1">
        <span className="text-xs text-zinc-500">ฟิลด์บังคับ (ห้ามเว้นว่าง) — เตือนถ้า AI ร่างมาไม่ครบ</span>
        <div className="flex flex-wrap gap-1.5">
          {BLUEPRINT_REQUIRED_FIELD_OPTIONS.map((key) => {
            const on = draft.requiredFields.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggleRequired(key)}
                className={`rounded-lg px-2.5 py-1 text-xs ${
                  on
                    ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/50"
                    : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>

      {/* defaults key/value over known field set */}
      <div className="space-y-1">
        <span className="text-xs text-zinc-500">
          ค่าเริ่มต้น (DEFAULTS) — AI ยึดค่าเหล่านี้เว้นแต่ข้อมูลตั้งต้นระบุเป็นอย่างอื่น
        </span>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {BLUEPRINT_DEFAULT_FIELDS.map((key) => (
            <div key={key} className="grid grid-cols-[8rem_1fr] items-center gap-2">
              <span className="truncate text-xs text-zinc-400">{key}</span>
              <input
                value={draft.defaults[key] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, defaults: { ...d.defaults, [key]: e.target.value } }))
                }
                placeholder="—"
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-amber-400"
              />
            </div>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={draft.isDefault}
          onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
          className="accent-amber-400"
        />
        ตั้งเป็นพิมพ์เขียว default (pre-select ตอนสร้างตัวละคร)
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !draft.name.trim()}
          onClick={onSave}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          บันทึก
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
