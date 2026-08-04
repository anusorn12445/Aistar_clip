"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api, fetchBrands, type BrandListItem } from "@/lib/api";
import { gradientFor, initialOf, useAssetImage } from "@/lib/media";
import { Tag, ShoppingBag, Handshake, Pencil, FileText } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400";

// โลโก้แบรนด์ (linkRole 'logo_icon') → fallback letter avatar บน gradient
function BrandLogo({ brand }: { brand: BrandListItem }) {
  const url = useAssetImage(brand.logoAssetId);
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`โลโก้ ${brand.name}`}
        className="h-14 w-14 shrink-0 rounded-xl border border-zinc-700 object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white/90"
      style={{ background: gradientFor(brand.name) }}
      aria-label={`โลโก้ ${brand.name}`}
    >
      {initialOf(brand.name)}
    </div>
  );
}

function CompletenessBar({ percent }: { percent: number }) {
  const complete = percent >= 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-500">Brand Book</span>
        <span className="flex items-center gap-1.5">
          <span className={complete ? "text-emerald-300" : "text-zinc-400"}>{percent}%</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] ${
              complete ? "bg-emerald-400/15 text-emerald-300" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {complete ? "ครบ" : "ยังไม่ครบ"}
          </span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${complete ? "bg-emerald-400" : "bg-amber-400"}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

export default function BrandsIndexPage() {
  const [brands, setBrands] = useState<BrandListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setBrands(await fetchBrands());
      setError(null);
    } catch (err) {
      setBrands([]);
      setError(err instanceof Error ? err.message : "โหลดแบรนด์ไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return brands ?? [];
    return (brands ?? []).filter((b) => b.name.toLowerCase().includes(needle));
  }, [brands, q]);

  async function createBrand() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      await api("/brands", {
        method: "POST",
        body: JSON.stringify({
          name,
          ...(newContact.trim() ? { contact: newContact.trim() } : {}),
          ...(newNotes.trim() ? { notes: newNotes.trim() } : {}),
        }),
      });
      setCreateOpen(false);
      setNewName("");
      setNewContact("");
      setNewNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างแบรนด์ไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell
      title="Brands / แบรนด์"
      actions={
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + เพิ่มแบรนด์
        </button>
      }
    >
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100"><Tag className="size-5" /> แบรนด์ทั้งหมด</h1>
            <p className="text-xs text-zinc-500">
              คัมภีร์แบรนด์ (Brand Book) ของลูกค้าแต่ละราย — ทีมใช้ก่อนผลิต, AI ใช้เป็น context
            </p>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อแบรนด์..."
            className={`${inputCls} w-64`}
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {brands === null && !error && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}

        {brands !== null && filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
            {q.trim()
              ? "ไม่พบแบรนด์ที่ค้นหา"
              : "ยังไม่มีแบรนด์ — กด “+ เพิ่มแบรนด์” เพื่อเริ่มสร้าง Brand Book แรก"}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600"
            >
              <div className="flex items-start gap-3">
                <BrandLogo brand={b} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-zinc-100">{b.name}</p>
                    {b.status === "archived" && (
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                        เก็บเข้ากรุ
                      </span>
                    )}
                  </div>
                  {b.tagline ? (
                    <p className="truncate text-xs italic text-amber-200/80">“{b.tagline}”</p>
                  ) : (
                    <p className="text-xs text-zinc-600">ยังไม่มีสโลแกน</p>
                  )}
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
                    <ShoppingBag className="size-3.5" /> สินค้า {b.productCount} · <Handshake className="size-3.5" /> ลูกค้า {b.clientCount}
                  </p>
                </div>
              </div>

              <CompletenessBar percent={b.bookCompleteness ?? 0} />

              <div className="mt-auto flex gap-2 pt-1">
                <Link
                  href={`/brands/${b.id}/book`}
                  className="flex-1 rounded-lg bg-amber-400/10 px-3 py-1.5 text-center text-sm font-medium text-amber-300 hover:bg-amber-400/20"
                >
                  Brand Book
                </Link>
                <Link
                  href={`/brands/${b.id}`}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-center text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  <Pencil className="size-4" /> แก้ไข
                </Link>
                <Link
                  href={`/prompts?entityType=brand&entityId=${b.id}`}
                  title="Prompt ที่เชื่อมกับแบรนด์นี้"
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-center text-sm text-zinc-300 hover:bg-zinc-800 hover:text-amber-300"
                >
                  <FileText className="size-4" /> Prompt
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* modal เพิ่มแบรนด์ — reuse POST /brands เดิม (name/contact/notes) */}
      {createOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => !creating && setCreateOpen(false)}
        >
          <div
            className="fixed inset-y-0 right-0 flex h-full w-full max-w-xl flex-col space-y-4 overflow-y-auto border-l border-zinc-700 bg-zinc-900 p-6 shadow-2xl shadow-black/60 duration-200 animate-in slide-in-from-right"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-zinc-100">+ เพิ่มแบรนด์</h2>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-200">ชื่อแบรนด์ *</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void createBrand()}
                placeholder="เช่น NARA Skincare"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-200">ช่องทางติดต่อ</label>
              <input
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                placeholder="เช่น line: @brand"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-200">โน้ต</label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreateOpen(false)}
                disabled={creating}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => void createBrand()}
                disabled={creating || !newName.trim()}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {creating ? "กำลังสร้าง..." : "สร้างแบรนด์"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
