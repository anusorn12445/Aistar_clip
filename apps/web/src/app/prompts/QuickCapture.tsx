"use client";

// Quick-Capture "⚡ เพิ่มเร็ว (วางจาก Facebook)" — เวิร์กโฟลว์ของ CEO:
// เจอโพสต์แจก prompt → วางรูปจาก clipboard + วางข้อความ → AI แตกฟิลด์ → รีวิว → บันทึกเข้า Library
// แท็บ B: วางลิงก์สาธารณะ → server ดึง Open Graph (best-effort) แล้วเข้าสายเดียวกัน

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  createPromptCapture,
  extractPromptCapture,
  fetchPromptCaptureStatus,
  fetchPromptCaptureUrl,
} from "@/lib/api";
import { fetchAssetObjectUrl, uploadAsset } from "@/lib/assets";
import RelationPicker from "@/components/RelationPicker";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  PROMPT_TYPES,
  PROMPT_TYPE_LABEL,
  RELATION_TYPE_META,
  addPromptRelation,
  type Platform,
  type PromptRelation,
} from "@/lib/prompts";
import { Image as ImageIcon, Link as LinkIcon, X, Zap } from "lucide-react";

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

const CONFIDENCE_CHIP: Record<string, { label: string; cls: string }> = {
  high: { label: "AI มั่นใจ: สูง", cls: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50" },
  medium: { label: "AI มั่นใจ: กลาง", cls: "bg-zinc-800 text-zinc-300 border-zinc-700" },
  low: {
    label: "AI มั่นใจ: ต่ำ — ตรวจให้ดีก่อนบันทึก",
    cls: "bg-amber-400/10 text-amber-300 border-amber-400/40",
  },
};

const emptyReview = {
  name: "",
  promptType: "scene",
  body: "",
  negativeBody: "",
  targetPlatform: "",
  notes: "",
};

interface Props {
  platforms: Platform[];
  onSaved: () => void;
  onClose: () => void;
  /** relations ที่ pre-stage มาจากบริบท (เช่น filter ที่ค้างอยู่ใน Library) — เอาออกได้ก่อนบันทึก */
  initialRelations?: PromptRelation[];
}

export default function QuickCapture({ platforms, onSaved, onClose, initialRelations }: Props) {
  const [tab, setTab] = useState<"paste" | "link">("paste");

  // relations ที่จะเชื่อมหลังบันทึก (staged) — chip โชว์ในฟอร์มรีวิว
  const [stagedRels, setStagedRels] = useState<PromptRelation[]>(initialRelations ?? []);
  const [showRelPicker, setShowRelPicker] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  // key มีอยู่แต่ใช้จริงไม่ได้ (revoked/invalid → 503) — ปิดปุ่ม AI ทั้ง session, ให้กรอกเอง
  const [aiUnavailable, setAiUnavailable] = useState(false);

  // input ของแท็บ A
  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [imageAssetId, setImageAssetId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // แท็บ B
  const [linkUrl, setLinkUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  // review form (prefill จาก AI หรือกรอกเอง)
  const [review, setReview] = useState({ ...emptyReview });
  const [confidence, setConfidence] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // AI ใช้ไม่ได้ → เปิดฟอร์มกรอกเองไปเลย (ยังเร็วกว่าฟอร์มเต็มแบบเดิม)
    fetchPromptCaptureStatus()
      .then((s) => {
        setAiConfigured(s.configured);
        if (!s.configured) setShowReview(true);
      })
      .catch(() => {
        setAiConfigured(false);
        setShowReview(true);
      });
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
    // revoke เฉพาะตอน unmount — preview ระหว่างทางจัดการใน setImageFromFile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("วางได้เฉพาะไฟล์รูปภาพ");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadAsset(file, { assetType: "prompt_example" });
      setImageAssetId(asset.id);
      setImagePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }, []);

  // Ctrl+V ที่ไหนก็ได้ในโมดัล — ถ้า clipboard มีรูป จับอัปโหลดทันที
  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return; // ข้อความปล่อยให้ไหลลง textarea ตามปกติ
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    void uploadImage(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void uploadImage(file);
  }

  async function runExtract(override?: { text?: string; sourceUrl?: string; imageAssetId?: string | null }) {
    const useText = (override?.text ?? text).trim();
    const useAssetId = override?.imageAssetId !== undefined ? override.imageAssetId : imageAssetId;
    const useSource = (override?.sourceUrl ?? sourceUrl).trim();
    if (!useText && !useAssetId) {
      setError("วางรูปหรือข้อความโพสต์ก่อน แล้วค่อยให้ AI แตกฟิลด์");
      return;
    }
    setExtracting(true);
    setError(null);
    try {
      const res = await extractPromptCapture({
        text: useText || undefined,
        imageAssetId: useAssetId ?? undefined,
        sourceUrl: useSource || undefined,
      });
      setReview({
        name: res.name,
        promptType: (PROMPT_TYPES as readonly string[]).includes(res.promptType)
          ? res.promptType
          : "scene",
        body: res.body,
        negativeBody: res.negativeBody ?? "",
        targetPlatform: res.targetPlatform === "unknown" ? "" : res.targetPlatform,
        notes: res.notes ?? "",
      });
      setConfidence(res.confidence);
      setShowReview(true);
      if (!res.body) {
        setError("AI ไม่เจอ prompt ในโพสต์นี้ — กรอก/แก้เองในฟอร์มด้านล่างได้เลย");
      }
    } catch (err) {
      // 503 = key มี แต่เรียกจริงไม่ได้ (revoked/invalid) → เลิกใช้ AI ทั้ง session, เปิดฟอร์มกรอกเอง
      if (err instanceof ApiError && err.status === 503) {
        setAiUnavailable(true);
        setShowReview(true);
        setError(
          "AI ยังใช้ไม่ได้ — ตรวจ ANTHROPIC_API_KEY ที่หน้า Settings; ระหว่างนี้กรอกฟิลด์เองได้",
        );
      } else {
        setError(err instanceof Error ? err.message : "AI แตกฟิลด์ไม่สำเร็จ");
      }
    } finally {
      setExtracting(false);
    }
  }

  async function handleFetchUrl() {
    const url = linkUrl.trim();
    if (!url) return;
    setFetching(true);
    setLinkNotice(null);
    setError(null);
    try {
      const res = await fetchPromptCaptureUrl(url);
      if (res.ok) {
        const fetchedText = [res.title, res.description].filter(Boolean).join("\n");
        if (fetchedText) setText(fetchedText);
        setSourceUrl(url);
        let assetId: string | null = imageAssetId;
        if (res.imageAssetId) {
          assetId = res.imageAssetId;
          setImageAssetId(res.imageAssetId);
          try {
            const objUrl = await fetchAssetObjectUrl(res.imageAssetId);
            setImagePreview((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return objUrl;
            });
          } catch {
            /* preview พังไม่เป็นไร — assetId ยังใช้ต่อได้ */
          }
        }
        setTab("paste");
        if (aiConfigured) {
          await runExtract({ text: fetchedText || text, sourceUrl: url, imageAssetId: assetId });
        }
      } else {
        setLinkNotice(
          `${res.reason ?? "ดึงข้อมูลจากลิงก์ไม่สำเร็จ"} — โพสต์ในกลุ่ม/ติด login ใช้แท็บ "วางรูป+ข้อความ" แทน`,
        );
        setSourceUrl(url); // เก็บที่มาไว้ให้แม้ดึงเนื้อหาไม่ได้
        setTab("paste");
      }
    } catch (err) {
      setLinkNotice(err instanceof Error ? err.message : "ดึงข้อมูลจากลิงก์ไม่สำเร็จ");
    } finally {
      setFetching(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createPromptCapture({
        name: review.name.trim(),
        promptType: review.promptType,
        body: review.body,
        negativeBody: review.negativeBody.trim() || undefined,
        targetPlatform: review.targetPlatform.trim() || undefined,
        notes: review.notes.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        exampleAssetIds: imageAssetId ? [imageAssetId] : undefined,
      });
      // relations ที่ stage ไว้ — เชื่อมหลังบันทึกสำเร็จ (พลาดไม่ทำให้ capture ล้ม แก้ได้จากการ์ด)
      for (const rel of stagedRels) {
        await addPromptRelation(created.id, rel).catch(() => {});
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const tabCls = (active: boolean) =>
    `rounded-t-lg px-4 py-2 text-sm ${
      active
        ? "border border-b-0 border-zinc-700 bg-zinc-900 font-semibold text-amber-300"
        : "text-zinc-400 hover:text-zinc-200"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-zinc-700 bg-zinc-900 p-6 shadow-2xl duration-200 animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
        onPaste={handlePaste}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">
            <Zap className="size-4" /> เพิ่มเร็ว — วาง prompt จาก Facebook
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            ปิด <X className="size-4" />
          </button>
        </div>

        {linkNotice && (
          <p className="mb-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
            {linkNotice}
          </p>
        )}

        {/* tabs */}
        <div className="flex gap-1 border-b border-zinc-700">
          <button onClick={() => setTab("paste")} className={tabCls(tab === "paste")}>
            วางรูป+ข้อความ
          </button>
          <button onClick={() => setTab("link")} className={tabCls(tab === "link")}>
            <LinkIcon className="size-4" /> วางลิงก์
          </button>
        </div>

        <div className="space-y-3 rounded-b-xl border border-t-0 border-zinc-700 bg-zinc-900 p-4">
          {tab === "link" && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
                วางลิงก์โพสต์สาธารณะ — ระบบจะลองดึงรูป+ข้อความให้ (โพสต์ในกลุ่ม/ติด login
                จะดึงไม่ได้ ให้ใช้แท็บวางรูป+ข้อความแทน)
              </p>
              <div className="flex gap-2">
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleFetchUrl())}
                  placeholder="https://www.facebook.com/..."
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={handleFetchUrl}
                  disabled={fetching || !linkUrl.trim()}
                  className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {fetching ? "กำลังดึง..." : "ดึงข้อมูล"}
                </button>
              </div>
            </div>
          )}

          {tab === "paste" && (
            <>
              {/* paste zone รูป */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-600 bg-zinc-950/50 p-3 text-center hover:border-amber-400/50"
              >
                {imagePreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- object URL จาก clipboard */}
                    <img
                      src={imagePreview}
                      alt="รูปตัวอย่างที่วาง"
                      className="max-h-48 rounded-lg object-contain"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImageAssetId(null);
                        setImagePreview((prev) => {
                          if (prev) URL.revokeObjectURL(prev);
                          return null;
                        });
                      }}
                      className="absolute -right-2 -top-2 rounded-full bg-zinc-800 px-1.5 text-xs text-zinc-300 hover:bg-red-900"
                      title="เอารูปออก"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-2xl"><ImageIcon className="size-4" /></p>
                    <p className="text-xs text-zinc-400">
                      {uploading ? "กำลังอัปโหลดรูป..." : "กด Ctrl+V วางรูปจาก clipboard ที่นี่"}
                    </p>
                    <p className="text-[11px] text-zinc-600">หรือลากไฟล์มาวาง / คลิกเพื่อเลือกไฟล์</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f);
                    e.target.value = "";
                  }}
                />
              </div>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="วางข้อความโพสต์... (ก๊อปทั้งโพสต์มาวางได้เลย เดี๋ยว AI คัดเฉพาะตัว prompt ให้)"
                rows={5}
                className={`${inputCls} w-full`}
              />
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="ลิงก์ที่มา (ถ้ามี) เช่น https://www.facebook.com/groups/..."
                className={`${inputCls} w-full`}
              />

              {aiConfigured && !aiUnavailable && (
                <button
                  type="button"
                  onClick={() => runExtract()}
                  disabled={extracting || uploading || (!text.trim() && !imageAssetId)}
                  className="w-full rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {extracting ? "AI กำลังแตกฟิลด์..." : "ให้ AI แตกฟิลด์"}
                </button>
              )}
              {aiConfigured === false && (
                <p className="text-xs text-zinc-500">
                  AI ยังไม่ได้ตั้งค่า (ANTHROPIC_API_KEY) — กรอกฟิลด์เองด้านล่างได้เลย
                </p>
              )}
              {aiUnavailable && (
                <p className="text-xs text-amber-300">
                  AI ยังใช้ไม่ได้ — ตรวจ ANTHROPIC_API_KEY ที่หน้า Settings; กรอกฟิลด์เองด้านล่างได้เลย
                </p>
              )}
              {!showReview && aiConfigured && !aiUnavailable && (
                <button
                  type="button"
                  onClick={() => setShowReview(true)}
                  className="w-full rounded-lg border border-zinc-700 px-4 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
                >
                  ข้าม AI — กรอกฟิลด์เอง
                </button>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* review form — ตรวจก่อนบันทึก */}
          {tab === "paste" && showReview && (
            <form onSubmit={handleSave} className="space-y-3 border-t border-zinc-800 pt-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-zinc-200">ตรวจฟิลด์ก่อนบันทึก</p>
                {confidence && CONFIDENCE_CHIP[confidence] && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${CONFIDENCE_CHIP[confidence].cls}`}
                  >
                    {CONFIDENCE_CHIP[confidence].label}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  value={review.name}
                  onChange={(e) => setReview({ ...review, name: e.target.value })}
                  placeholder="ชื่อ prompt *"
                  className={inputCls}
                />
                <FilterSelect
                  value={review.promptType}
                  onChange={(v) => setReview({ ...review, promptType: v })}
                  options={PROMPT_TYPES.map((t) => ({ value: t, label: PROMPT_TYPE_LABEL[t] }))}
                />
              </div>
              <textarea
                required
                value={review.body}
                onChange={(e) => setReview({ ...review, body: e.target.value })}
                placeholder="Prompt body *"
                rows={5}
                className={`${inputCls} w-full font-mono`}
              />
              <textarea
                value={review.negativeBody}
                onChange={(e) => setReview({ ...review, negativeBody: e.target.value })}
                placeholder="Negative prompt (ถ้ามี)"
                rows={2}
                className={`${inputCls} w-full font-mono`}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    list="capture-platforms"
                    value={review.targetPlatform}
                    onChange={(e) => setReview({ ...review, targetPlatform: e.target.value })}
                    placeholder="Platform เช่น midjourney (ว่าง = unknown)"
                    className={`${inputCls} w-full`}
                  />
                  <datalist id="capture-platforms">
                    {platforms.map((p) => (
                      <option key={p.id} value={p.key} />
                    ))}
                    {["midjourney", "grok", "chatgpt", "kling"].map((k) => (
                      <option key={`hint-${k}`} value={k} />
                    ))}
                  </datalist>
                </div>
                <input
                  value={review.notes}
                  onChange={(e) => setReview({ ...review, notes: e.target.value })}
                  placeholder="โน้ต เช่น --ar 9:16, model ที่โพสต์บอก"
                  className={inputCls}
                />
              </div>
              {/* เชื่อมกับ entity (staged) — POST relations หลังบันทึกสำเร็จ */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500"><LinkIcon className="size-4" /> เชื่อมกับ (ไม่บังคับ):</span>
                {stagedRels.map((r) => (
                  <span
                    key={`${r.entityType}-${r.entityId}`}
                    className="flex items-center gap-1 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                  >
                    <span>{RELATION_TYPE_META[r.entityType].icon}</span>
                    <span className="max-w-32 truncate">{r.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setStagedRels((rels) =>
                          rels.filter(
                            (x) =>
                              !(x.entityType === r.entityType && x.entityId === r.entityId),
                          ),
                        )
                      }
                      className="text-zinc-500 hover:text-red-300"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setShowRelPicker(true)}
                  className="rounded-full border border-dashed border-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:border-amber-400/50 hover:text-amber-300"
                >
                  + เชื่อม
                </button>
              </div>
              <button
                type="submit"
                disabled={saving || uploading}
                className="w-full rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึกเข้า Library"}
              </button>
            </form>
          )}
          {showRelPicker && (
            <RelationPicker
              title="เชื่อมกับ (ไม่บังคับ)"
              linked={stagedRels}
              onPick={(rel) => {
                setStagedRels((rels) =>
                  rels.some(
                    (r) => r.entityType === rel.entityType && r.entityId === rel.entityId,
                  )
                    ? rels
                    : [...rels, rel],
                );
                setShowRelPicker(false);
              }}
              onClose={() => setShowRelPicker(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
