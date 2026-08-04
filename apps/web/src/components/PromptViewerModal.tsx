"use client";

// 👁️ ดู/ก๊อป Prompt — shared viewer ทุกคลัง (Location/Voice/Hand/Gesture/Camera/Lighting/Prompt Library)
// โมเดลตาม ImagePromptViewer ของหน้า Character:
//  - tab ต่อ tool เมื่อมีหลาย variant / tab เดียวเมื่อเป็น text variant
//  - textarea แก้ได้ (dirty จนกว่าจะสลับ tab) + 📋 ก๊อป → "คัดลอกแล้ว ✓"
//  - "ข้อมูลภายใน" collapsible (negative prompt / continuity ฯลฯ) พร้อมปุ่มก๊อปรายบรรทัด
//  - ESC / คลิก backdrop เพื่อปิด

import { useEffect, useState } from "react";
import { Eye, Copy, Check, ChevronDown } from "lucide-react";
import type { PromptVariant } from "@/lib/promptBuilders";

export default function PromptViewerModal({
  title,
  variants,
  onClose,
}: {
  title: string;
  variants: PromptVariant[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const active = variants[Math.min(idx, Math.max(variants.length - 1, 0))];
  // edited = ข้อความที่ผู้ใช้แก้เอง (dirty) — null = ใช้ค่าที่ระบบสร้างของ variant ที่เลือก
  // derive แทน sync-in-effect: สลับ tab จะรีเซ็ตเป็นค่าที่ระบบสร้างเสมอ
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedInternal, setCopiedInternal] = useState<number | null>(null);

  const dirty = edited !== null;
  const text = edited ?? active?.text ?? "";

  // ESC เพื่อปิด
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function switchTab(next: number) {
    if (next === idx) return;
    setIdx(next);
    setEdited(null); // dirty flag รีเซ็ตเมื่อสลับ tab
    setCopied(false);
  }

  function copyText(value: string) {
    void navigator.clipboard.writeText(value);
  }

  const internal = active?.internal ?? [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col space-y-4 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-6 shadow-2xl duration-200 animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-1.5 text-lg font-semibold" title={title}>
            <Eye className="size-5 shrink-0" />
            <span className="truncate">{title}</span>
          </h3>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-700 px-2.5 py-1 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            ปิด
          </button>
        </div>

        {/* Tool tabs — tab เดียวเมื่อเป็น text variant */}
        <div className="flex flex-wrap gap-2">
          {variants.map((v, i) => (
            <button
              key={`${v.tool}-${i}`}
              onClick={() => switchTab(i)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                i === idx
                  ? "border-amber-400 bg-amber-400/10 text-amber-300"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {active?.hint && <p className="text-xs text-zinc-500">{active.hint}</p>}

        <textarea
          value={text}
          onChange={(e) => setEdited(e.target.value)}
          rows={12}
          className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200 outline-none focus:border-amber-400"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              copyText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2500);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
          >
            {copied ? (
              <>
                คัดลอกแล้ว <Check className="size-4" />
              </>
            ) : (
              <>
                <Copy className="size-4" /> ก๊อป
              </>
            )}
          </button>
          {dirty && (
            <button
              onClick={() => setEdited(null)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              รีเซ็ตเป็นค่าที่ระบบสร้าง
            </button>
          )}
        </div>

        {/* ข้อมูลภายใน — ไม่รวมใน prompt ที่วางค่ายนอก (policy-sensitive) แต่ให้ทีมเห็น/ก๊อปแยกได้ */}
        {internal.length > 0 && (
          <details className="group rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-zinc-400 [&::-webkit-details-marker]:hidden">
              <span>ข้อมูลภายใน (ไม่รวมใน ChatGPT/Gemini prompt)</span>
              <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-3 text-xs text-zinc-400">
              {internal.map((entry, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-zinc-300">{entry.label}</p>
                    <button
                      onClick={() => {
                        copyText(entry.text);
                        setCopiedInternal(i);
                        setTimeout(() => setCopiedInternal((cur) => (cur === i ? null : cur)), 2000);
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-amber-300"
                    >
                      {copiedInternal === i ? (
                        <>
                          คัดลอกแล้ว <Check className="size-3.5" />
                        </>
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap">{entry.text}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
