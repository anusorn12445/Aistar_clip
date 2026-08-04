"use client";

// External Capture modal ("🔄 สร้างจากภายนอก") — reusable กับคลัง production ทุกตัว
// (Location / Gesture / Camera / Lighting / Hand): CEO ไป gen เนื้อหากับ AI ค่ายนอก
// (ChatGPT/Grok/Gemini) → วางข้อความ+รูปกลับมา → Claude แตกเป็นฟิลด์ → ส่ง draft
// ให้หน้าแม่ prefill ฟอร์ม create เดิม (review-first — บันทึกผ่าน endpoint create ปกติ)
// UX เดียวกับ characters/ReverseCapture + prompts/QuickCapture

import { useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  X,
  Image as ImageIcon,
  Sparkles,
  FileText,
  ArrowRight,
} from "lucide-react";
import { uploadAsset } from "@/lib/assets";
import {
  extractLibraryCapture,
  fetchLibraryCaptureStatus,
  type LibraryCaptureDraft,
  type LibraryCaptureTarget,
} from "@/lib/library-capture";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";
const btnPrimary =
  "rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800";

const CONFIDENCE_CHIP: Record<string, { label: string; cls: string }> = {
  high: { label: "AI มั่นใจ: สูง", cls: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40" },
  medium: { label: "AI มั่นใจ: กลาง", cls: "bg-amber-400/15 text-amber-300 ring-amber-400/40" },
  low: {
    label: "AI มั่นใจ: ต่ำ — ตรวจให้ดีก่อนบันทึก",
    cls: "bg-zinc-400/15 text-zinc-300 ring-zinc-400/40",
  },
};

// assetType ของรูปอ้างอิงตาม convention เดิมของแต่ละคลัง
const ASSET_TYPE: Record<LibraryCaptureTarget, string> = {
  location: "location_reference",
  gesture: "gesture_reference",
  camera_preset: "camera_reference",
  lighting_preset: "lighting_reference",
  hand: "hand_reference",
};

interface CapturedImage {
  assetId: string;
  preview: string;
}

interface Props {
  targetType: LibraryCaptureTarget;
  /** ชื่อคลังที่โชว์ในหัวโมดัล เช่น "Location" */
  title: string;
  /** ได้ draft แล้ว — หน้าแม่ prefill ฟอร์ม create เดิม + ปิดโมดัล */
  onDraft: (draft: LibraryCaptureDraft) => void;
  onClose: () => void;
}

export default function ExternalCaptureModal({ targetType, title, onDraft, onClose }: Props) {
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<LibraryCaptureDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLibraryCaptureStatus()
      .then((s) => setAiConfigured(s.configured))
      .catch(() => setAiConfigured(false));
  }, []);

  useEffect(() => {
    // revoke object URLs ตอน unmount เท่านั้น
    return () => {
      setImages((prev) => {
        prev.forEach((im) => URL.revokeObjectURL(im.preview));
        return prev;
      });
    };
  }, []);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of list) {
        const asset = await uploadAsset(file, { assetType: ASSET_TYPE[targetType] });
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

  async function runExtract() {
    if (!text.trim() && images.length === 0) {
      setError("วางข้อความสรุป หรือวางรูปอย่างน้อยหนึ่งรูปก่อนให้ AI แตกข้อมูล");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const d = await extractLibraryCapture({
        targetType,
        text: text.trim() || undefined,
        imageAssetIds: images.length > 0 ? images.map((im) => im.assetId) : undefined,
      });
      setDraft(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI แตกข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // ฟิลด์ที่มีค่า / ยังว่าง — โชว์ให้รีวิวก่อนเทลงฟอร์ม
  const filled: [string, string][] = [];
  const missing: string[] = [];
  if (draft) {
    for (const [k, v] of Object.entries(draft.fields)) {
      if (Array.isArray(v)) {
        if (v.length > 0) filled.push([k, v.join(", ")]);
        else missing.push(k);
      } else if (typeof v === "boolean") {
        if (v) filled.push([k, "true"]);
      } else if (typeof v === "string" && v.trim()) {
        filled.push([k, v]);
      } else {
        missing.push(k);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col space-y-4 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-6 shadow-2xl duration-200 animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 font-semibold text-zinc-100">
              <RefreshCw className="size-4" /> สร้าง {title} จากภายนอก
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              gen เนื้อหากับ AI ค่ายนอก (ChatGPT/Grok/Gemini) แล้ววาง “ข้อความ + รูป” กลับมา —
              AI จะแตกเป็นฟิลด์ให้รีวิวก่อนบันทึก
            </p>
          </div>
          <button onClick={onClose} className={`${btnGhost} inline-flex items-center gap-1`}>
            <X className="size-4" /> ปิด
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="วางข้อความ/สรุปที่ได้จาก ChatGPT/Grok/Gemini..."
          className={inputCls}
        />

        {/* image paste / drop / pick zone — pattern เดียวกับ ReverseCapture */}
        <div
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          tabIndex={0}
          className="cursor-pointer rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-6 text-center text-sm text-zinc-400 outline-none hover:border-amber-400/50 focus:border-amber-400/50"
        >
          <ImageIcon className="inline size-4 align-[-0.125em]" /> วางรูป (Ctrl/⌘+V), ลากรูปมาวาง, หรือคลิกเพื่อเลือกไฟล์ (ไม่บังคับ)
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
            {images.map((im) => (
              <div
                key={im.assetId}
                className="relative h-24 w-20 overflow-hidden rounded-lg border border-zinc-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.preview} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(im.assetId);
                  }}
                  className="absolute right-1 top-1 rounded bg-black/70 px-1 py-1 text-white hover:bg-red-600"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {aiConfigured === false ? (
            <span className="text-xs text-zinc-500">
              ตั้งค่า ANTHROPIC_API_KEY ในหน้า Settings เพื่อให้ AI แตกข้อมูลอัตโนมัติ —
              ระหว่างนี้ปิดหน้าต่างนี้แล้วกรอกฟอร์มเองได้
            </span>
          ) : (
            <button
              onClick={runExtract}
              disabled={busy || uploading || aiConfigured == null}
              className={`${btnPrimary} inline-flex items-center gap-1.5`}
            >
              <Sparkles className="size-4" />
              {busy ? "AI กำลังแตกข้อมูล..." : "แตกข้อมูล"}
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* review — confidence chip + notes + ฟิลด์ที่ได้/ที่ยังว่าง ก่อนเทลงฟอร์ม */}
        {draft && (
          <div className="space-y-3 rounded-xl border border-amber-400/30 bg-zinc-950/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-zinc-200">ผลที่ AI แตกได้</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ${
                  CONFIDENCE_CHIP[draft.confidence]?.cls ?? CONFIDENCE_CHIP.low.cls
                }`}
              >
                {CONFIDENCE_CHIP[draft.confidence]?.label ?? draft.confidence}
              </span>
            </div>

            {draft.notes && (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <FileText className="mt-0.5 size-4 shrink-0" /> AI ฝากตรวจ: {draft.notes}
              </p>
            )}

            {filled.length > 0 && (
              <dl className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                {filled.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[10rem_1fr] gap-2 text-xs">
                    <dt className="truncate font-mono text-zinc-500">{k}</dt>
                    <dd className="break-words text-zinc-300">{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            {missing.length > 0 && (
              <p className="rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
                ฟิลด์ที่ AI ไม่พบหลักฐาน (เว้นว่างไว้):{" "}
                <span className="font-mono">{missing.join(", ")}</span> — เติมเองได้ในฟอร์ม
              </p>
            )}

            <button onClick={() => onDraft(draft)} className={`${btnPrimary} inline-flex items-center gap-1.5`}>
              ใช้ draft นี้ <ArrowRight className="size-4" /> เติมลงฟอร์ม
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
