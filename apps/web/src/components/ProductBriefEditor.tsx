"use client";

// 📋 ฟอร์ม Review Brief ของสินค้า (กรอกครั้งเดียวที่ตัวสินค้า — ใช้ทุก Clip Job)
// ใช้ซ้ำ 3 ที่: ReviewBriefModal (หน้า Products), ฟอร์มสร้าง Clip Job, Shot board
// มีกล่อง 🤖 AI แตกฟิลด์: วางข้อความจากหน้า Shopee (+รูปในคลังสินค้า) → เติมช่องว่างให้,
// ช่องที่มีข้อมูลแล้วไม่ทับ — โชว์ "AI เสนอ: ..." ให้กดแทนที่เอง

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Target, FileText, Tag, TriangleAlert, Check, X } from "lucide-react";
import {
  ReviewBrief,
  extractReviewBrief,
  saveReviewBrief,
} from "@/lib/catalog";
import { fetchEntityImageAssets, type Asset } from "@/lib/assets";
import { isCoverAsset } from "@/lib/cover";

interface FormState {
  highlights: string[];
  specs: string;
  targetAudience: string;
  painPoint: string;
  howToUse: string; // 1 ขั้นต่อบรรทัด (textarea)
  promo: string;
  cautions: string;
  extraNote: string;
}

function toForm(b: ReviewBrief | null | undefined): FormState {
  return {
    highlights: (b?.highlights ?? []).filter((h) => h.trim()),
    specs: b?.specs ?? "",
    targetAudience: b?.targetAudience ?? "",
    painPoint: b?.painPoint ?? "",
    howToUse: (b?.howToUse ?? []).join("\n"),
    promo: b?.promo ?? "",
    cautions: b?.cautions ?? "",
    extraNote: b?.extraNote ?? "",
  };
}

function toBrief(f: FormState): ReviewBrief {
  return {
    highlights: f.highlights.map((h) => h.trim()).filter(Boolean).slice(0, 20),
    specs: f.specs.trim(),
    targetAudience: f.targetAudience.trim(),
    painPoint: f.painPoint.trim(),
    howToUse: f.howToUse
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20),
    promo: f.promo.trim(),
    cautions: f.cautions.trim(),
    extraNote: f.extraNote.trim(),
  };
}

// ช่องที่ AI เสนอค่ามาแต่ช่องเดิมมีข้อมูลอยู่ — เก็บไว้โชว์ hint "AI เสนอ: ..."
type Suggestions = Partial<Record<keyof FormState, string | string[]>>;

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400";

// hint "AI เสนอ: ..." ใต้ช่องที่มีข้อมูลเดิม — กด [ใช้ของ AI] เพื่อแทนที่
function SuggestHint({
  value,
  onApply,
}: {
  value: string | string[] | undefined;
  onApply: (v: string | string[]) => void;
}) {
  if (value == null) return null;
  const text = Array.isArray(value) ? value.join(", ") : value;
  return (
    <p className="mt-1 flex items-start gap-1.5 text-[11px] text-violet-300/90">
      <span className="min-w-0 flex-1 truncate" title={text}>
        AI เสนอ: {text}
      </span>
      <button
        type="button"
        onClick={() => onApply(value)}
        className="shrink-0 rounded bg-violet-400/15 px-1.5 py-0.5 font-semibold text-violet-200 hover:bg-violet-400/25"
      >
        ใช้ของ AI
      </button>
    </p>
  );
}

export default function ProductBriefEditor({
  productId,
  initial,
  onSaved,
  extractAssets,
}: {
  productId: string;
  initial: ReviewBrief | null | undefined;
  /** เรียกหลัง PATCH สำเร็จ — parent ใช้ sync state/badge */
  onSaved?: (brief: ReviewBrief) => void;
  /** รูปในคลัง (ถ้า parent โหลดไว้แล้ว) — ไม่ส่งมา = editor ไปโหลดเองตอนกด AI แตกฟิลด์ */
  extractAssets?: Asset[];
}) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [highlightInput, setHighlightInput] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions>({});
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI extract box
  const [extractText, setExtractText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractInfo, setExtractInfo] = useState<string | null>(null);

  // เปลี่ยนสินค้า (productId เปลี่ยน) → reset form ตามข้อมูลตัวใหม่
  const lastProduct = useRef(productId);
  useEffect(() => {
    if (lastProduct.current !== productId) {
      lastProduct.current = productId;
      setForm(toForm(initial));
      setSuggestions({});
      setExtractText("");
      setExtractInfo(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const set = (k: keyof FormState, v: string | string[]) =>
    setForm((f) => ({ ...f, [k]: v }) as FormState);

  function addHighlight() {
    const v = highlightInput.trim();
    if (v && !form.highlights.includes(v)) set("highlights", [...form.highlights, v]);
    setHighlightInput("");
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const brief = toBrief(form);
      await saveReviewBrief(productId, brief);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      onSaved?.(brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  // เลือกรูปส่งให้ AI: รูปหลัก (cover) ก่อน แล้วตามด้วยรูปใหม่สุด — สูงสุด 4 รูป
  function pickExtractIds(assets: Asset[]): string[] {
    const sorted = [...assets].sort((a, b) => {
      const ac = isCoverAsset(a, "product", productId) ? 0 : 1;
      const bc = isCoverAsset(b, "product", productId) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted.slice(0, 4).map((a) => a.id);
  }

  async function handleExtract() {
    if (!extractText.trim()) {
      setError("วางข้อความจากหน้า Shopee/รายละเอียดสินค้าก่อน");
      return;
    }
    setExtracting(true);
    setError(null);
    setExtractInfo(null);
    try {
      const assets =
        extractAssets ?? (await fetchEntityImageAssets("product", productId).catch(() => []));
      const assetIds = pickExtractIds(assets);
      const res = await extractReviewBrief(productId, extractText.trim(), assetIds);
      applyExtracted(res.brief);
      setExtractInfo(
        `AI แตกฟิลด์เสร็จ${assetIds.length ? ` (ใช้รูปช่วยอ่าน ${assetIds.length} รูป)` : ""} — ตรวจแล้วกดบันทึก`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI แตกฟิลด์ไม่สำเร็จ");
    } finally {
      setExtracting(false);
    }
  }

  // เติมเฉพาะช่องว่าง — ช่องที่มีข้อมูลแล้วเก็บข้อเสนอไว้เป็น hint (ไม่ทับของเดิม)
  function applyExtracted(b: ReviewBrief) {
    const next: FormState = { ...form };
    const sug: Suggestions = {};

    const aiHighlights = (b.highlights ?? []).filter((h) => h.trim());
    if (aiHighlights.length) {
      if (next.highlights.length === 0) next.highlights = aiHighlights.slice(0, 20);
      else sug.highlights = aiHighlights;
    }
    const aiHowTo = (b.howToUse ?? []).filter((h) => h.trim()).join("\n");
    if (aiHowTo) {
      if (!next.howToUse.trim()) next.howToUse = aiHowTo;
      else if (aiHowTo !== next.howToUse.trim()) sug.howToUse = aiHowTo;
    }
    const textKeys: [keyof FormState, string | undefined][] = [
      ["specs", b.specs],
      ["targetAudience", b.targetAudience],
      ["painPoint", b.painPoint],
      ["promo", b.promo],
      ["cautions", b.cautions],
      ["extraNote", b.extraNote],
    ];
    for (const [k, v] of textKeys) {
      const val = v?.trim();
      if (!val) continue;
      const cur = (next[k] as string).trim();
      if (!cur) (next as unknown as Record<string, string>)[k] = val;
      else if (val !== cur) sug[k] = val;
    }
    setForm(next);
    setSuggestions(sug);
  }

  // กด [ใช้ของ AI] — แทนค่าช่องนั้นด้วยข้อเสนอ แล้วเอา hint ออก
  function applySuggestion(field: keyof FormState, v: string | string[]) {
    set(field, v);
    setSuggestions((prev) => {
      const rest = { ...prev };
      delete rest[field];
      return rest;
    });
  }

  const briefNow = useMemo(() => toBrief(form), [form]);

  return (
    <div className="space-y-3">
      {/* 🤖 AI extract box */}
      <div className="space-y-2 rounded-xl border border-dashed border-violet-500/40 bg-violet-950/20 p-3">
        <textarea
          value={extractText}
          onChange={(e) => setExtractText(e.target.value)}
          rows={3}
          placeholder="วางข้อความจากหน้า Shopee/รายละเอียดสินค้า..."
          className={`${inputCls} resize-y bg-zinc-950`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExtract()}
            disabled={extracting}
            className="rounded-lg border border-violet-500/60 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/15 disabled:opacity-50"
          >
            {extracting ? "AI กำลังแตกฟิลด์..." : "AI แตกฟิลด์ (ใช้รูปที่แนบช่วยอ่านด้วย)"}
          </button>
          {extractInfo && <span className="text-[11px] text-violet-300">{extractInfo}</span>}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* จุดเด่น/USP — chip input */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-400">
          <Sparkles className="inline size-4 align-[-0.125em]" /> จุดเด่น / USP <span className="font-normal text-zinc-600">(พิมพ์แล้วกด Enter)</span>
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {form.highlights.map((h) => (
            <span
              key={h}
              className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-1 text-xs text-amber-200"
            >
              {h}
              <button
                type="button"
                onClick={() => set("highlights", form.highlights.filter((x) => x !== h))}
                className="text-amber-300 hover:text-amber-100"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={highlightInput}
            onChange={(e) => setHighlightInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addHighlight();
              }
            }}
            placeholder="เช่น ซึมไว ไม่เหนียว"
            className={`${inputCls} w-48 flex-none`}
          />
        </div>
        <SuggestHint value={suggestions.highlights} onApply={(v) => applySuggestion("highlights", v)} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-400">สรรพคุณ / สเปกหลัก</label>
        <textarea
          value={form.specs}
          onChange={(e) => set("specs", e.target.value)}
          rows={2}
          placeholder="เช่น มีส่วนผสม Niacinamide 5% ช่วยเรื่องผิวหมองคล้ำ..."
          className={`${inputCls} resize-y`}
        />
        <SuggestHint value={suggestions.specs} onApply={(v) => applySuggestion("specs", v)} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-400">
            <Target className="inline size-4 align-[-0.125em]" /> กลุ่มเป้าหมาย
          </label>
          <input
            value={form.targetAudience}
            onChange={(e) => set("targetAudience", e.target.value)}
            placeholder="เช่น สาวออฟฟิศผิวแพ้ง่าย 25-35"
            className={inputCls}
          />
          <SuggestHint value={suggestions.targetAudience} onApply={(v) => applySuggestion("targetAudience", v)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-400">ปัญหาที่แก้</label>
          <input
            value={form.painPoint}
            onChange={(e) => set("painPoint", e.target.value)}
            placeholder="เช่น ผิวมัน เป็นสิวง่ายช่วงหน้าร้อน"
            className={inputCls}
          />
          <SuggestHint value={suggestions.painPoint} onApply={(v) => applySuggestion("painPoint", v)} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-400">
          <FileText className="inline size-4 align-[-0.125em]" /> วิธีใช้ <span className="font-normal text-zinc-600">(1 ขั้นต่อบรรทัด)</span>
        </label>
        <textarea
          value={form.howToUse}
          onChange={(e) => set("howToUse", e.target.value)}
          rows={3}
          placeholder={"ล้างหน้าให้สะอาด\nหยด 2-3 หยดลงฝ่ามือ\nแตะเบา ๆ ให้ทั่วหน้า เช้า-เย็น"}
          className={`${inputCls} resize-y`}
        />
        <SuggestHint value={suggestions.howToUse} onApply={(v) => applySuggestion("howToUse", v)} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-400">
          <Tag className="inline size-4 align-[-0.125em]" /> โปรโมชั่น
        </label>
        <input
          value={form.promo}
          onChange={(e) => set("promo", e.target.value)}
          placeholder="เช่น ลด 40% + โค้ดหน้าร้าน เหลือ 259.-"
          className={inputCls}
        />
        <SuggestHint value={suggestions.promo} onApply={(v) => applySuggestion("promo", v)} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-400">
          <TriangleAlert className="inline size-4 align-[-0.125em]" /> ข้อควรระวัง / ห้ามพูด
        </label>
        <textarea
          value={form.cautions}
          onChange={(e) => set("cautions", e.target.value)}
          rows={2}
          placeholder="เช่น ห้ามเคลมรักษาสิว — พูดได้แค่ช่วยให้ผิวดูดีขึ้น"
          className={`${inputCls} resize-y`}
        />
        <SuggestHint value={suggestions.cautions} onApply={(v) => applySuggestion("cautions", v)} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-400">โน้ตเพิ่มเติม</label>
        <textarea
          value={form.extraNote}
          onChange={(e) => set("extraNote", e.target.value)}
          rows={2}
          placeholder="อะไรก็ได้ที่อยากให้ AI รู้ตอนคิดคอนเซปต์/บท"
          className={`${inputCls} resize-y`}
        />
        <SuggestHint value={suggestions.extraNote} onApply={(v) => applySuggestion("extraNote", v)} />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกข้อมูลรีวิว (เก็บที่ตัวสินค้า)"}
        </button>
        {savedFlash && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-300">
            บันทึกแล้ว <Check className="size-4" />
          </span>
        )}
        {!savedFlash && (
          <span className="text-[11px] text-zinc-500">
            {briefNow.highlights?.length ?? 0} จุดเด่น · {briefNow.howToUse?.length ?? 0} ขั้นวิธีใช้
          </span>
        )}
      </div>
    </div>
  );
}
