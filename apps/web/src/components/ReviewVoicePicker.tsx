"use client";

// 💬 เลือกเสียงลูกค้า (รีวิว 4-5 ดาวของสินค้า) — checkbox list สูงสุด 5 ข้อ
// ใช้ 2 ที่: ฟอร์มสร้าง Clip Job (clip-jobs/page.tsx) + shot board (clip-jobs/[id]/page.tsx)
// คลังรีวิวอยู่ที่ตัวสินค้า (CustomerFeedback) — เพิ่ม/ลบรีวิวทำที่ modal 📋 ข้อมูลรีวิว หน้า Products

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { CustomerFeedback, fetchProductTopReviews } from "@/lib/api";

export const REVIEW_PICK_MAX = 5;

export function reviewStars(rating: number | null): string {
  return rating != null ? "⭐".repeat(Math.min(rating, 5)) : "✨ ไม่รู้ดาว (แต่ชมชัด)";
}

export default function ReviewVoicePicker({
  productId,
  productCode,
  selected,
  onChange,
}: {
  productId: string;
  /** displayCode ของสินค้า — ใช้ทำลิงก์ไปเปิด modal 📋 ที่หน้า Products */
  productCode?: string;
  /** ข้อความรีวิวที่ติ๊กเลือกไว้ (เก็บเป็น text ตรงกับ subjectBrief.reviews) */
  selected: string[];
  onChange: (reviews: string[]) => void;
}) {
  // เก็บ productId คู่ผลลัพธ์ — เปลี่ยนสินค้าแล้วรู้ว่ายังโหลดไม่เสร็จ (ไม่ต้อง setState ซิงก์ใน effect)
  const [result, setResult] = useState<{ productId: string; items: CustomerFeedback[] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchProductTopReviews(productId)
      .then((r) => alive && setResult({ productId, items: r.items }))
      .catch(() => alive && setResult({ productId, items: [] }));
    return () => {
      alive = false;
    };
  }, [productId]);

  const loaded = result?.productId === productId;
  const reviews = result?.productId === productId ? result.items : [];

  const toggle = (text: string) => {
    if (selected.includes(text)) {
      onChange(selected.filter((t) => t !== text));
    } else if (selected.length < REVIEW_PICK_MAX) {
      onChange([...selected, text]);
    }
  };

  if (!loaded) {
    return (
      <p className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
        <Loader2 className="size-3 animate-spin" /> กำลังโหลดรีวิวลูกค้า...
      </p>
    );
  }

  // รีวิวที่เคยเลือกไว้แต่ไม่อยู่ในคลังแล้ว (โดนลบ) — ยังโชว์ให้เอาออกได้ ไม่หายเงียบ
  const knownTexts = new Set(reviews.map((r) => r.text));
  const orphanSelected = selected.filter((t) => !knownTexts.has(t));

  if (reviews.length === 0 && orphanSelected.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-700 px-2.5 py-2 text-[11px] text-zinc-500">
        ยังไม่มีรีวิว 4-5 ดาวในคลังของสินค้านี้ — ไปวางรีวิวจากหน้า Shopee ให้ AI คัดได้ที่{" "}
        {productCode ? (
          <Link
            href={`/products?q=${encodeURIComponent(productCode)}`}
            className="text-amber-300 underline decoration-dotted hover:text-amber-200"
          >
            ข้อมูลรีวิว ที่หน้าสินค้า
          </Link>
        ) : (
          <span className="text-zinc-400">ข้อมูลรีวิว ที่หน้าสินค้า</span>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
        {reviews.map((r) => {
          const checked = selected.includes(r.text);
          const full = !checked && selected.length >= REVIEW_PICK_MAX;
          const gem = r.themes[0]?.trim();
          return (
            <label
              key={r.id}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                checked
                  ? "border-amber-400/60 bg-amber-400/10"
                  : full
                    ? "border-zinc-800 opacity-50"
                    : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={full}
                onChange={() => toggle(r.text)}
                className="mt-0.5 accent-amber-400"
              />
              <span className="min-w-0 flex-1">
                <span className="text-[10px] text-amber-300">{reviewStars(r.rating)}</span>
                <span className="block text-zinc-200">{r.text}</span>
                {gem && (
                  <span className="mt-0.5 inline-block rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                    {gem}
                  </span>
                )}
              </span>
            </label>
          );
        })}
        {orphanSelected.map((t) => (
          <label
            key={t}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-400/5 px-2.5 py-1.5 text-xs"
          >
            <input
              type="checkbox"
              checked
              onChange={() => toggle(t)}
              className="mt-0.5 accent-amber-400"
            />
            <span className="min-w-0 flex-1">
              <span className="text-[10px] text-zinc-500">รีวิวนี้ไม่อยู่ในคลังแล้ว — ติ๊กออกได้</span>
              <span className="block text-zinc-300">{t}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-zinc-500">
        เลือกแล้ว {selected.length}/{REVIEW_PICK_MAX} — AI จะเอาไป paraphrase เป็น hook/บทพูด
        (ไม่ก๊อปคำต่อคำ)
      </p>
    </div>
  );
}
