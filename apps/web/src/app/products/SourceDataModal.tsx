"use client";

import { fmtDate, SOURCE_PLATFORM_LABEL, type Product } from "@/lib/catalog";
import { Link as LinkIcon, X } from "lucide-react";

// Modal "ข้อมูลต้นทาง" — แสดง sourceRaw ทุกคอลัมน์ตรงกับไฟล์ต้นฉบับ 100%
// + surface field ที่ map แล้ว (ยอดขาย/เดือน, ขายรวม, เรตติ้ง, สต๊อก, ร้าน)
export default function SourceDataModal({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  if (!product) return null;
  const raw = product.sourceRaw ?? null;
  const badge = product.sourcePlatform
    ? SOURCE_PLATFORM_LABEL[product.sourcePlatform] ?? SOURCE_PLATFORM_LABEL.generic
    : null;
  const shopeeLink =
    product.platformLinks?.shopee ??
    (raw && typeof raw["ลิงก์สินค้า"] === "string" ? (raw["ลิงก์สินค้า"] as string) : undefined) ??
    (raw && typeof raw["product_link"] === "string" ? (raw["product_link"] as string) : undefined);

  // แสดง sourceRaw ทุกคีย์ (คงลำดับที่เก็บ) — คีย์ที่ขึ้นต้น _ = โน้ตของระบบ
  const rawEntries = raw ? Object.entries(raw) : [];

  const structured: { label: string; value: string | number | null | undefined }[] = [
    { label: "ร้านค้า", value: product.shopName },
    { label: "เรตติ้ง", value: product.rating },
    { label: "ขาย/เดือน", value: product.soldMonth },
    { label: "ขายทั้งหมด", value: product.soldTotal },
    { label: "สต๊อก", value: product.stockQty },
    { label: "ค่าคอม %", value: product.commissionPct },
  ].filter((s) => s.value != null && s.value !== "");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-900 shadow-2xl duration-200 animate-in slide-in-from-right"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-amber-300">ข้อมูลต้นทาง</p>
            {badge && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                {badge.label}
              </span>
            )}
            {product.sourceType && (
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                {product.sourceType}
              </span>
            )}
            {product.importedAt && (
              <span className="text-xs text-zinc-500">นำเข้า {fmtDate(product.importedAt)}</span>
            )}
          </div>
          <button onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-300">
            <X className="size-4" /> ปิด
          </button>
        </div>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
          {shopeeLink && (
            <a
              href={shopeeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-200 hover:bg-orange-500/20"
            >
              <LinkIcon className="size-4" /> เปิดสินค้าบน Shopee
            </a>
          )}

          {structured.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {structured.map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2"
                >
                  <p className="text-[11px] text-zinc-500">{s.label}</p>
                  <p className="text-sm font-medium text-zinc-100">{String(s.value)}</p>
                </div>
              ))}
            </div>
          )}

          {rawEntries.length > 0 ? (
            <div>
              <p className="mb-2 text-xs text-zinc-500">
                ทุกคอลัมน์จากไฟล์ต้นฉบับ ({rawEntries.length}) — ตรงกับไฟล์ 100%
              </p>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <tbody className="divide-y divide-zinc-800">
                    {rawEntries.map(([k, v]) => (
                      <tr key={k}>
                        <td className="w-1/3 whitespace-nowrap bg-zinc-950/50 px-3 py-1.5 align-top font-medium text-zinc-400">
                          {k}
                        </td>
                        <td className="break-words px-3 py-1.5 text-zinc-200">
                          {formatCell(v, k)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
              สินค้านี้ไม่มีข้อมูลต้นทาง (ไม่ได้นำเข้าจากไฟล์)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// แสดงค่าในเซลล์ — ลิงก์ให้คลิกได้, ค่าว่างเป็น —
function formatCell(v: unknown, key: string) {
  if (v == null || v === "") return <span className="text-zinc-600">—</span>;
  const s = String(v);
  if (/^https?:\/\//.test(s)) {
    return (
      <a
        href={s}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-300 underline decoration-dotted hover:text-amber-200"
      >
        {s}
      </a>
    );
  }
  // คีย์โน้ตของระบบ (ขึ้นต้น _) ทำสีจางลงให้รู้ว่าไม่ใช่คอลัมน์ต้นฉบับ
  return <span className={key.startsWith("_") ? "text-zinc-500 italic" : ""}>{s}</span>;
}
