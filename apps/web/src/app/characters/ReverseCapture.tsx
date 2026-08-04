"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  captureCharacterFromExternal,
  type Character,
  type CharacterCaptureDraft,
} from "@/lib/api";
import { uploadAsset } from "@/lib/assets";
import {
  buildCaptureBrief,
  CAPTURE_TOOLS,
  REFERENCE_PHOTO_ANTI_CLONE_RULE,
  REFERENCE_PHOTO_EXACT_RULE,
  type CaptureReferenceMode,
  type CaptureTool,
} from "./captureBrief";
import {
  Check,
  ClipboardList,
  Image as ImageIcon,
  Info,
  Lightbulb,
  Paperclip,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

// รูปที่วางมา — upload ทันที เก็บ assetId + preview (object URL จากไฟล์ตรง ๆ)
interface CapturedImage {
  assetId: string;
  preview: string;
}

// ฟอร์มรีวิว (แก้ได้) — prefill จาก draft ของ AI หรือกรอกเองตอน AI ปิด
interface ReviewForm {
  nameTh: string;
  nameEn: string;
  oneLineConcept: string;
  age: string;
  gender: string;
  region: string;
  roleLabel: string;
  persona: Record<string, unknown>;
  visualDna: Record<string, unknown>;
}

const CONFIDENCE_CHIP: Record<string, { label: string; cls: string }> = {
  high: { label: "มั่นใจสูง", cls: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40" },
  medium: { label: "มั่นใจปานกลาง", cls: "bg-amber-400/15 text-amber-300 ring-amber-400/40" },
  low: { label: "มั่นใจต่ำ — ช่วยตรวจให้ดี", cls: "bg-zinc-400/15 text-zinc-300 ring-zinc-400/40" },
};

// หัวข้อ persona/visualDna ที่โชว์ให้รีวิว (label ไทย → key)
const PERSONA_ROWS: [string, string][] = [
  ["ประวัติย่อ", "short_bio"],
  ["ปูมหลัง", "backstory"],
  ["นิสัยเด่น", "personality"],
  ["สไตล์ภาษา", "language_style"],
  ["วลีติดปาก", "catchphrases"],
];
const VISUAL_ROWS: [string, string][] = [
  ["เชื้อชาติ", "ethnicity"],
  ["รูปหน้า", "face_shape"],
  ["ดวงตา", "eyes"],
  ["ผิว", "skin_tone"],
  ["ทรงผม", "hair_style"],
  ["จุดเด่น", "distinctive_features"],
  ["สไตล์แต่งตัว", "fashion_style"],
  ["แสง", "lighting"],
];

function rowValue(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean).join(", ");
  return String(v);
}

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

export default function ReverseCapture({
  aiConfigured,
  blueprintId,
}: {
  aiConfigured: boolean;
  blueprintId?: string;
}) {
  const router = useRouter();

  // step 1
  const [seed, setSeed] = useState("");
  const [tool, setTool] = useState<CaptureTool>("chatgpt");
  const [copied, setCopied] = useState(false);

  // step 3
  const [summary, setSummary] = useState("");
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [aiBusy, setAiBusy] = useState(false);
  const [draft, setDraft] = useState<CharacterCaptureDraft | null>(null);
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [missingRequired, setMissingRequired] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 📎 รูปต้นแบบ 3 โหมด: ไม่แนบ / คล้ายไม่เหมือน / เหมือนต้นฉบับ (รูปไม่เก็บเข้าระบบ แนบเองในแชต)
  const [referenceMode, setReferenceMode] = useState<CaptureReferenceMode>("none");
  const brief = buildCaptureBrief(tool, seed, { referenceMode });
  const ethnicityMissing =
    !!form && !rowValue(form.visualDna, "ethnicity").trim();

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("ก๊อปไม่สำเร็จ — ก๊อปด้วยมือจากกล่องด้านล่างได้เลย");
    }
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of list) {
        const asset = await uploadAsset(file, { assetType: "character_reference" });
        setImages((prev) => [...prev, { assetId: asset.id, preview: URL.createObjectURL(file) }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.items)
      .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter((f): f is File => f != null);
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
  }

  function removeImage(assetId: string) {
    setImages((prev) => prev.filter((im) => im.assetId !== assetId));
  }

  function draftToForm(d: CharacterCaptureDraft): ReviewForm {
    const persona = (d.persona ?? {}) as Record<string, unknown>;
    return {
      nameTh: d.nameTh ?? "",
      nameEn: d.nameEn ?? "",
      oneLineConcept: rowValue(persona, "one_line_concept"),
      age: d.suggested?.age != null ? String(d.suggested.age) : "",
      gender: d.suggested?.gender ?? "",
      region: d.suggested?.region ?? "",
      roleLabel: d.suggested?.roleLabel ?? "",
      persona,
      visualDna: (d.visualDna ?? {}) as Record<string, unknown>,
    };
  }

  async function runAi() {
    if (!summary.trim() && images.length === 0) {
      setError("วางสรุปตัวละคร หรือวางรูปอย่างน้อยหนึ่งรูปก่อนให้ AI แตก");
      return;
    }
    setAiBusy(true);
    setError(null);
    try {
      const d = await captureCharacterFromExternal({
        text: summary.trim() || undefined,
        imageAssetIds: images.map((im) => im.assetId),
        seed: seed.trim() || undefined,
        blueprintId,
      });
      setDraft(d);
      setForm(draftToForm(d));
      setMissingRequired(d.missingRequired ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI แตกตัวละครไม่สำเร็จ");
    } finally {
      setAiBusy(false);
    }
  }

  // เปิดฟอร์มกรอกเอง (ตอน AI ปิด หรืออยากข้าม AI) — รูปที่วางไว้ยังผูกให้ตอนสร้าง
  function startManual() {
    setForm({
      nameTh: "",
      nameEn: "",
      oneLineConcept: seed.trim(),
      age: "",
      gender: "",
      region: "",
      roleLabel: "",
      persona: {},
      visualDna: {},
    });
  }

  async function createCharacter() {
    if (!form) return;
    if (!form.nameTh.trim()) {
      setError("ต้องมีชื่อไทยก่อนสร้างตัวละคร");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // persona: คง draft เดิม + sync one_line_concept ที่ผู้ใช้แก้
      const persona = { ...form.persona, one_line_concept: form.oneLineConcept.trim() };
      const ageNum = form.age.trim() ? Number(form.age) : undefined;
      const created = await api<Character>("/characters", {
        method: "POST",
        body: JSON.stringify({
          nameTh: form.nameTh.trim(),
          nameEn: form.nameEn.trim() || undefined,
          oneLineConcept: form.oneLineConcept.trim() || undefined,
          roleLabel: form.roleLabel.trim() || undefined,
          age: ageNum != null && !Number.isNaN(ageNum) ? ageNum : undefined,
          gender: form.gender.trim() || undefined,
          region: form.region.trim() || undefined,
          persona,
          visualDna: (() => {
            // ใช้รูปต้นแบบ → ตอกกฎ anti-clone ติดตัวละครถาวร (ไปโผล่ทุก prompt ในอนาคต)
            const dna = { ...form.visualDna } as Record<string, unknown>;
            if (referenceMode !== "none") {
              const rules = Array.isArray(dna.anti_clone_rules)
                ? (dna.anti_clone_rules as unknown[]).map(String)
                : [];
              const rule =
                referenceMode === "exact" ? REFERENCE_PHOTO_EXACT_RULE : REFERENCE_PHOTO_ANTI_CLONE_RULE;
              if (!rules.includes(rule)) rules.push(rule);
              dna.anti_clone_rules = rules;
            }
            return Object.keys(dna).length > 0 ? dna : undefined;
          })(),
          blueprintId: blueprintId || undefined,
        }),
      });

      // ผูกรูปที่ upload ไว้แล้ว — รูปแรก = ปก (primary_reference), ที่เหลือ = reference
      for (let i = 0; i < images.length; i++) {
        await api(`/assets/${images[i].assetId}/links`, {
          method: "POST",
          body: JSON.stringify({
            entityType: "character",
            entityId: created.id,
            linkRole: i === 0 ? "primary_reference" : "reference",
          }),
        });
        // โหมดเหมือนต้นฉบับ → รูปแรกคือ ground truth ของหน้า ล็อคเป็น prompt_reference ให้เลย
        if (i === 0 && referenceMode === "exact") {
          await api(`/assets/${images[i].assetId}/links`, {
            method: "POST",
            body: JSON.stringify({
              entityType: "character",
              entityId: created.id,
              linkRole: "prompt_reference",
            }),
          });
        }
      }

      router.push(`/characters/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างตัวละครไม่สำเร็จ");
      setCreating(false);
    }
  }

  const stepBadge = "flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-zinc-950";

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <p className="text-sm text-zinc-400">
        <RefreshCw className="inline size-4 align-text-bottom" /> gen รูปกับ AI ค่ายนอก (ChatGPT/Gemini/Grok) แล้วเอา “สรุป + รูป” กลับมาให้ Claude แตกเป็นตัวละคร
      </p>

      {/* ── Step 1: seed → brief ── */}
      <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="flex items-center gap-2">
          <span className={stepBadge}>1</span>
          <span className="text-sm font-semibold text-zinc-200">ใส่ไอเดีย → ได้ brief ไปก๊อป</span>
        </div>
        <textarea
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          rows={2}
          placeholder="ไอเดียตั้งต้น เช่น สาวอีสานสายแซ่บ รีวิวของถูกปากตรงใจ วัย 24"
          className={inputCls}
        />
        <div className="flex gap-1">
          {CAPTURE_TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                tool === t.id
                  ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/50"
                  : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto self-center text-xs text-zinc-500">
            {CAPTURE_TOOLS.find((t) => t.id === tool)?.hint}
          </span>
        </div>
        {/* 📎 รูปต้นแบบ — 3 โหมด: brief เปลี่ยนสดตามที่เลือก */}
        <div className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 text-xs text-zinc-300">
          <p className="flex items-center gap-1 font-medium text-zinc-400">
            <Paperclip className="size-4" /> รูปต้นแบบที่จะแนบให้ AI:
          </p>
          {(
            [
              { v: "none", label: "ไม่แนบรูป — ให้ AI คิดหน้าใหม่จากคอนเซ็ปต์" },
              { v: "similar", label: "แนบรูป · เอาหน้าคล้าย แต่ไม่เหมือนเป๊ะ (แรงบันดาลใจ)" },
              { v: "exact", label: "แนบรูป · เอาเหมือนต้นฉบับ (รูปนี้คือหน้าจริงของตัวละคร)" },
            ] as { v: CaptureReferenceMode; label: string }[]
          ).map((o) => (
            <label key={o.v} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="referenceMode"
                checked={referenceMode === o.v}
                onChange={() => setReferenceMode(o.v)}
                className="accent-amber-400"
              />
              <span>{o.label}</span>
            </label>
          ))}
          {referenceMode !== "none" && (
            <p className="text-[11px] text-amber-300/80">
              <Lightbulb className="inline size-4 align-text-bottom" /> อย่าลืมลากรูปต้นแบบแนบในแชตคู่กับ brief — ระบบส่งรูปให้ไม่ได้ และรูปต้นแบบจะไม่ถูกเก็บเข้าระบบ
              {referenceMode === "exact" &&
                " · รูปแรกที่วางกลับใน step 3 จะถูกล็อคเป็น Reference ประจำตัวละครให้อัตโนมัติ"}
            </p>
          )}
        </div>
        <div className="relative">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900 p-3 pr-20 text-xs text-zinc-300">
            {brief}
          </pre>
          <button
            onClick={copyBrief}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-300"
          >
            {copied ? (
              <>
                <Check className="size-3.5" /> ก๊อปแล้ว
              </>
            ) : (
              <>
                <ClipboardList className="size-3.5" /> ก๊อป
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Step 2: external (ทำที่อื่น) ── */}
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-500">
        <span className={stepBadge}>2</span>
        เอา brief ไปวางใน {CAPTURE_TOOLS.find((t) => t.id === tool)?.label} → gen รูป → ปรับจนพอใจ → ก๊อปสรุป + เซฟรูป
      </div>

      {/* ── Step 3: capture back ── */}
      <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="flex items-center gap-2">
          <span className={stepBadge}>3</span>
          <span className="text-sm font-semibold text-zinc-200">วางสรุป + รูปกลับมา → ให้ AI แตกเป็นตัวละคร</span>
        </div>

        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="วางข้อความสรุปตัวละครที่ก๊อปมาจาก AI ค่ายนอกที่นี่..."
          className={inputCls}
        />

        {/* image paste / drop / pick zone */}
        <div
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          tabIndex={0}
          className="cursor-pointer rounded-lg border border-dashed border-zinc-700 bg-zinc-900 px-4 py-6 text-center text-sm text-zinc-400 outline-none hover:border-amber-400/50 focus:border-amber-400/50"
        >
          <ImageIcon className="inline size-4 align-text-bottom" /> วางรูป (Ctrl/⌘+V), ลากรูปมาวาง, หรือคลิกเพื่อเลือกไฟล์
          {uploading && <span className="ml-2 text-amber-300">กำลังอัปโหลด...</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((im, i) => (
              <div key={im.assetId} className="relative h-24 w-20 overflow-hidden rounded-lg border border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.preview} alt="" className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-amber-400 px-1 text-[10px] font-bold text-zinc-950">
                    ปก
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(im.assetId);
                  }}
                  className="absolute right-1 top-1 inline-flex items-center rounded bg-black/70 px-1 text-[10px] text-white hover:bg-red-600"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {aiConfigured ? (
            <button
              onClick={runAi}
              disabled={aiBusy || creating}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              {aiBusy ? "AI กำลังแตกเป็นตัวละคร..." : "ให้ AI แตกเป็นตัวละคร"}
            </button>
          ) : (
            <span className="text-xs text-zinc-500">
              ตั้งค่า ANTHROPIC_API_KEY เพื่อให้ AI แตกอัตโนมัติ — ระหว่างนี้กรอกเองได้ (รูปยังผูกให้)
            </span>
          )}
          {!form && (
            <button
              onClick={startManual}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              กรอกเอง
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* ── Review + create ── */}
      {form && (
        <div className="space-y-4 rounded-xl border border-amber-400/30 bg-zinc-950/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-200">รีวิวก่อนสร้าง</span>
            {draft && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ${
                  CONFIDENCE_CHIP[draft.confidence]?.cls ?? CONFIDENCE_CHIP.low.cls
                }`}
              >
                AI: {CONFIDENCE_CHIP[draft.confidence]?.label ?? draft.confidence}
              </span>
            )}
          </div>

          {ethnicityMissing && (
            <p className="rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
              <Info className="inline size-4 align-text-bottom" /> ไม่ได้ระบุเชื้อชาติ — ระบบจะ default เป็นไทย/เอเชียตะวันออกเฉียงใต้
            </p>
          )}

          {missingRequired.length > 0 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <TriangleAlert className="inline size-4 align-text-bottom" /> ตามพิมพ์เขียว ยังมีฟิลด์บังคับที่ยังว่าง:{" "}
              <span className="font-semibold">{missingRequired.join(", ")}</span> — ควรเติมให้ครบก่อน/หลังสร้าง
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">ชื่อไทย *</span>
              <input
                value={form.nameTh}
                onChange={(e) => setForm({ ...form, nameTh: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">ชื่ออังกฤษ</span>
              <input
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">คอนเซ็ปต์หนึ่งบรรทัด</span>
            <input
              value={form.oneLineConcept}
              onChange={(e) => setForm({ ...form, oneLineConcept: e.target.value })}
              className={inputCls}
            />
          </label>
          <div className="grid grid-cols-4 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">อายุ</span>
              <input
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                inputMode="numeric"
                className={inputCls}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">เพศ</span>
              <input
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">ภูมิภาค</span>
              <input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">บทบาท</span>
              <input
                value={form.roleLabel}
                onChange={(e) => setForm({ ...form, roleLabel: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>

          {/* persona / visualDna rows (อ่านรีวิว — แก้ละเอียดต่อในหน้า detail) */}
          {(Object.keys(form.persona).length > 0 || Object.keys(form.visualDna).length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewRows title="Persona" obj={form.persona} rows={PERSONA_ROWS} />
              <ReviewRows title="Visual DNA" obj={form.visualDna} rows={VISUAL_ROWS} />
            </div>
          )}

          <button
            onClick={createCharacter}
            disabled={creating}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {creating ? "กำลังสร้าง..." : "สร้างตัวละคร"}
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewRows({
  title,
  obj,
  rows,
}: {
  title: string;
  obj: Record<string, unknown>;
  rows: [string, string][];
}) {
  const visible = rows.filter(([, key]) => rowValue(obj, key).trim());
  if (visible.length === 0) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <p className="mb-2 text-xs font-semibold text-amber-300">{title}</p>
      <dl className="space-y-1.5">
        {visible.map(([label, key]) => (
          <div key={key} className="grid grid-cols-[6rem_1fr] gap-2 text-xs">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="text-zinc-300">{rowValue(obj, key)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
