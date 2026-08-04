"use client";

import { useCallback, useEffect, useState } from "react";
import { ShoppingBag, FileText, X } from "lucide-react";
import {
  api,
  TIE_IN_ENTITY_PATH,
  type TieInEntity,
  type TieInProductLink,
} from "@/lib/api";
import type { Paged, Product } from "@/lib/catalog";
import CoverImage from "@/components/CoverImage";

// section "🛍️ สินค้า Tie-In" — ผูกสินค้าจริงเข้ากับ character / series / location (ไม่บังคับ)
// image-forward, empty-friendly, degrade อย่างนุ่มนวลถ้า API build เก่า (section ว่าง ไม่ crash)
export default function TieInProducts({
  entity,
  entityId,
}: {
  entity: TieInEntity;
  entityId: string;
}) {
  const base = `/${TIE_IN_ENTITY_PATH[entity]}/${entityId}/tie-in-products`;

  const [links, setLinks] = useState<TieInProductLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // note ที่กำลังแก้ inline — productId → ข้อความ (draft)
  const [noteDraft, setNoteDraft] = useState<{ productId: string; value: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api<TieInProductLink[]>(base);
      setLinks(rows);
      setError(null);
    } catch (err) {
      // endpoint ยังไม่มี (API build เก่า) → empty state ไม่ crash
      setLinks([]);
      setError(err instanceof Error ? err.message : "โหลดสินค้า tie-in ไม่สำเร็จ");
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  // ค้นหาสินค้าใน picker (debounce เบา ๆ)
  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    setSearchError(null);
    const t = setTimeout(() => {
      const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      api<Paged<Product>>(`/products${query}`)
        .then((res) => {
          if (!cancelled) setResults(res.items ?? []);
        })
        .catch((err) => {
          if (!cancelled) {
            setResults([]);
            setSearchError(err instanceof Error ? err.message : "ค้นหาสินค้าไม่สำเร็จ");
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pickerOpen, q]);

  // PUT ชุด link ทั้งหมดใหม่ (replace)
  async function persist(items: { productId: string; note?: string }[]) {
    setBusy(true);
    setError(null);
    try {
      const rows = await api<TieInProductLink[]>(base, {
        method: "PUT",
        body: JSON.stringify({ items }),
      });
      setLinks(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const currentItems = () =>
    (links ?? []).map((l) => ({ productId: l.productId, note: l.note ?? undefined }));

  function addProduct(p: Product) {
    if ((links ?? []).some((l) => l.productId === p.id)) return;
    void persist([...currentItems(), { productId: p.id }]);
    setPickerOpen(false);
    setQ("");
  }

  function remove(productId: string) {
    void persist(currentItems().filter((i) => i.productId !== productId));
  }

  function saveNote(productId: string, value: string) {
    const note = value.trim();
    void persist(
      currentItems().map((i) => (i.productId === productId ? { ...i, note: note || undefined } : i)),
    );
    setNoteDraft(null);
  }

  const linkedIds = new Set((links ?? []).map((l) => l.productId));
  const options = (results ?? []).filter((p) => !linkedIds.has(p.id));

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-lg font-semibold">
          <ShoppingBag className="size-5" />
          สินค้า Tie-In
          {links && <span className="text-sm font-normal text-zinc-500">({links.length})</span>}
        </h3>
        {!pickerOpen && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={busy}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            + เพิ่มสินค้า
          </button>
        )}
      </div>

      {error && <p className="text-sm text-amber-400/80">{error}</p>}

      {pickerOpen && (
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสินค้า (ชื่อ / รหัส)..."
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={() => {
                setPickerOpen(false);
                setQ("");
              }}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              ปิด
            </button>
          </div>
          {searchError && <p className="text-xs text-amber-400/80">{searchError}</p>}
          {results === null ? (
            <p className="text-sm text-zinc-500">กำลังโหลด...</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-zinc-500">
              ไม่พบสินค้าให้เลือก — เพิ่มสินค้าใหม่ได้ที่หน้า สินค้า
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {options.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 px-2 py-1.5 text-left hover:border-amber-400/60 hover:bg-zinc-900 disabled:opacity-50"
                >
                  <CoverImage
                    entityType="product"
                    entityId={p.id}
                    name={p.name}
                    aspect="aspect-square"
                    className="h-10 w-10 shrink-0 rounded-lg"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-200">{p.name}</span>
                    <span className="block text-xs text-zinc-500">{p.displayCode}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {links && links.length === 0 && !pickerOpen && (
        <p className="text-sm text-zinc-500">
          ยังไม่ได้ผูกสินค้า — ไม่บังคับ. กด &ldquo;+ เพิ่มสินค้า&rdquo; เพื่อผูกสินค้าที่ tie-in
        </p>
      )}

      {links && links.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {links.map((l) => (
            <div
              key={l.productId}
              className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
            >
              <CoverImage
                entityType="product"
                entityId={l.productId}
                name={l.product.name}
                aspect="aspect-square"
                className="h-16 w-16 shrink-0 rounded-lg"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-100">{l.product.name}</p>
                    <p className="text-xs text-zinc-500">{l.product.displayCode}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(l.productId)}
                    disabled={busy}
                    className="shrink-0 text-zinc-500 hover:text-red-400 disabled:opacity-50"
                    title="เอาออก"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {noteDraft?.productId === l.productId ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={noteDraft.value}
                      onChange={(e) => setNoteDraft({ productId: l.productId, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveNote(l.productId, noteDraft.value);
                        if (e.key === "Escape") setNoteDraft(null);
                      }}
                      placeholder="บริบทการ tie-in..."
                      className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => saveNote(l.productId, noteDraft.value)}
                      disabled={busy}
                      className="rounded-md border border-amber-400/50 px-2 py-1 text-xs text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                    >
                      บันทึก
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNoteDraft({ productId: l.productId, value: l.note ?? "" })}
                    className="block max-w-full text-left text-xs text-zinc-400 hover:text-amber-300"
                  >
                    {l.note ? (
                      <span className="line-clamp-2">
                        <FileText className="inline size-3.5 align-[-0.125em]" /> {l.note}
                      </span>
                    ) : (
                      <span className="text-zinc-600">+ เพิ่มโน้ต tie-in</span>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
