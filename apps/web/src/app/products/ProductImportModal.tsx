"use client";

import { useRef, useState } from "react";
import {
  fmtPrice,
  previewProductImport,
  runProductImport,
  SOURCE_PLATFORM_LABEL,
  type ImportPreviewResult,
  type ImportResult,
} from "@/lib/catalog";
import { Download, TriangleAlert, X } from "lucide-react";

// Modal นำเข้าสินค้าจากไฟล์ export (shoptool.app / pyptools.io / อื่นๆ)
// flow: เลือกไฟล์ → preview (ตรวจเครื่องมือ + ตัวอย่าง map) → ยืนยันนำเข้า → สรุปผล
export default function ProductImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void; // parent refetch หลังนำเข้า
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  async function handleFile(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
    setBusy(true);
    try {
      const res = await previewProductImport(f);
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runProductImport(file);
      setResult(res);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const badge = preview
    ? SOURCE_PLATFORM_LABEL[preview.detectedPlatform] ?? SOURCE_PLATFORM_LABEL.generic
    : null;

  // คอลัมน์ที่จะโชว์ในตารางตัวอย่าง (target fields หลัก)
  const previewCols: { key: keyof NonNullable<typeof preview>["mappedPreview"][number]; label: string }[] = [
    { key: "name", label: "ชื่อสินค้า" },
    { key: "price", label: "ราคา" },
    { key: "salePrice", label: "ราคาสูงสุด" },
    { key: "commissionPct", label: "ค่าคอม %" },
    { key: "rating", label: "เรตติ้ง" },
    { key: "soldMonth", label: "ขาย/เดือน" },
    { key: "soldTotal", label: "ขายรวม" },
    { key: "stockQty", label: "สต๊อก" },
    { key: "externalItemId", label: "Item ID" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-900 shadow-2xl duration-200 animate-in slide-in-from-right"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <p className="text-sm font-semibold text-amber-300"><Download className="size-4" /> นำเข้าสินค้าจากไฟล์</p>
          <button onClick={close} className="text-sm text-zinc-500 hover:text-zinc-300">
            <X className="size-4" /> ปิด
          </button>
        </div>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
          {/* ขั้นตอน 1: เลือกไฟล์ */}
          {!result && (
            <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/50 p-4">
              <p className="mb-2 text-xs text-zinc-400">
                เลือกไฟล์ export จากเครื่องมือวิจัยสินค้า (ShopTool / PYP Tools / อื่นๆ) — รองรับ .csv และ .xlsx
              </p>
              <label className="inline-block cursor-pointer rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300">
                {busy && !preview ? "กำลังอ่านไฟล์..." : file ? "เปลี่ยนไฟล์" : "เลือกไฟล์..."}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    void handleFile(e.target.files?.[0]);
                  }}
                />
              </label>
              {file && <span className="ml-3 text-xs text-zinc-400">{file.name}</span>}
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {/* ขั้นตอน 2: preview */}
          {preview && !result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                <span className="text-xs text-zinc-400">ตรวจพบเครื่องมือ:</span>
                {badge && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
                {preview.sourceType && (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                    {preview.sourceType}
                  </span>
                )}
                <span className="text-xs text-zinc-400">
                  · {preview.totalRows.toLocaleString("th-TH")} แถว · {preview.headers.length} คอลัมน์
                </span>
                {preview.detectedPlatform === "generic" && (
                  <span className="text-xs text-amber-300">
                    (ไฟล์ยังไม่มีโปรไฟล์เฉพาะ — ใช้การจับคู่อัตโนมัติ ทุกคอลัมน์ยังถูกเก็บครบ)
                  </span>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/70 text-zinc-400">
                    <tr>
                      {previewCols.map((c) => (
                        <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {preview.mappedPreview.map((row, i) => (
                      <tr key={i} className="text-zinc-200">
                        {previewCols.map((c) => {
                          const v = row[c.key];
                          const text =
                            c.key === "price" || c.key === "salePrice"
                              ? v != null
                                ? `฿${fmtPrice(v as number)}`
                                : "—"
                              : v != null && v !== ""
                                ? String(v)
                                : "—";
                          return (
                            <td
                              key={c.key}
                              className={`whitespace-nowrap px-3 py-2 ${c.key === "name" ? "max-w-[220px] truncate" : ""}`}
                              title={c.key === "name" ? String(v ?? "") : undefined}
                            >
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.unmappedColumns.length > 0 && (
                <p className="text-xs text-zinc-500">
                  คอลัมน์ที่เก็บไว้ใน &quot;ข้อมูลต้นทาง&quot; ({preview.unmappedColumns.length}):{" "}
                  <span className="text-zinc-400">{preview.unmappedColumns.join(", ")}</span>
                </p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleImport}
                  disabled={busy || preview.totalRows === 0}
                  className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {busy ? "กำลังนำเข้า..." : `นำเข้า ${preview.totalRows.toLocaleString("th-TH")} รายการ`}
                </button>
                <button
                  onClick={reset}
                  disabled={busy}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* ขั้นตอน 3: สรุปผล */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="สร้างใหม่" value={result.created} cls="text-emerald-300" />
                <Stat label="อัปเดต" value={result.updated} cls="text-blue-300" />
                <Stat label="ข้าม" value={result.skipped} cls="text-zinc-400" />
                <Stat label="ล้มเหลว" value={result.failed} cls="text-red-300" />
              </div>
              {result.truncated && result.truncatedNote && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <TriangleAlert className="size-4" /> {result.truncatedNote}
                </p>
              )}
              {result.failedRows.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-200">
                  <p className="mb-1 font-medium">แถวที่นำเข้าไม่สำเร็จ:</p>
                  <ul className="space-y-0.5">
                    {result.failedRows.slice(0, 10).map((f) => (
                      <li key={f.row}>
                        แถว {f.row}: {f.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={reset}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  นำเข้าไฟล์อื่น
                </button>
                <button
                  onClick={close}
                  className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
                >
                  เสร็จสิ้น
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-center">
      <p className={`text-2xl font-bold ${cls}`}>{value.toLocaleString("th-TH")}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
