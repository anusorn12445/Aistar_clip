"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Brand, ProductCategory } from "@/lib/catalog";
import { ChevronDown, ChevronUp, X } from "lucide-react";

// Modal จัดการแบรนด์ & หมวดหมู่ — 2 แท็บ, optimistic + refetch ตอนปิด
export default function CatalogManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void; // parent จะ refetch categories/brands ต่อ
}) {
  const [tab, setTab] = useState<"categories" | "brands">("categories");
  const [categories, setCategories] = useState<ProductCategory[] | null>(null);
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [unavailable, setUnavailable] = useState(false); // API build เก่า (endpoint 404)
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  // add forms
  const [newCat, setNewCat] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandContact, setNewBrandContact] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cats, brs] = await Promise.all([
        api<ProductCategory[]>("/categories"),
        api<Brand[]>("/brands"),
      ]);
      setCategories(cats);
      setBrands(brs);
      setUnavailable(false);
    } catch (err) {
      // endpoint ยังไม่มี (API build เก่า) → degrade แทน crash
      const msg = err instanceof Error ? err.message : "";
      if (/404|Cannot (GET|POST|PATCH|DELETE)/i.test(msg)) {
        setUnavailable(true);
      } else {
        setError(msg || "โหลดข้อมูลไม่สำเร็จ");
      }
    }
  }, []);

  useEffect(() => {
    if (open) {
      setTab("categories");
      setEditId(null);
      load();
    }
  }, [open, load]);

  if (!open) return null;

  function close() {
    onClose();
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // ── categories ─────────────────────────────────────────────
  function addCategory() {
    const label = newCat.trim();
    if (!label) return;
    run(async () => {
      await api("/categories", { method: "POST", body: JSON.stringify({ label }) });
      setNewCat("");
    });
  }

  function saveLabel(c: ProductCategory) {
    const label = editVal.trim();
    setEditId(null);
    if (!label || label === c.label) return;
    run(() => api(`/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ label }) }));
  }

  function toggleCatStatus(c: ProductCategory) {
    const status = c.status === "active" ? "archived" : "active";
    run(() => api(`/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ status }) }));
  }

  function deleteCategory(c: ProductCategory) {
    run(() => api(`/categories/${c.id}`, { method: "DELETE" }));
  }

  function moveCategory(index: number, dir: -1 | 1) {
    if (!categories) return;
    const next = index + dir;
    if (next < 0 || next >= categories.length) return;
    const ids = categories.map((c) => c.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    run(() => api("/categories/reorder", { method: "POST", body: JSON.stringify({ ids }) }));
  }

  // ── brands ─────────────────────────────────────────────────
  function addBrand() {
    const name = newBrandName.trim();
    if (!name) return;
    run(async () => {
      await api("/brands", {
        method: "POST",
        body: JSON.stringify({ name, contact: newBrandContact.trim() || undefined }),
      });
      setNewBrandName("");
      setNewBrandContact("");
    });
  }

  function saveBrandName(b: Brand) {
    const name = editVal.trim();
    setEditId(null);
    if (!name || name === b.name) return;
    run(() => api(`/brands/${b.id}`, { method: "PATCH", body: JSON.stringify({ name }) }));
  }

  function toggleBrandStatus(b: Brand) {
    const status = b.status === "active" ? "archived" : "active";
    run(() => api(`/brands/${b.id}`, { method: "PATCH", body: JSON.stringify({ status }) }));
  }

  function deleteBrand(b: Brand) {
    run(() => api(`/brands/${b.id}`, { method: "DELETE" }));
  }

  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm outline-none focus:border-amber-400";
  const tabCls = (active: boolean) =>
    `rounded-lg px-4 py-1.5 text-sm font-medium ${
      active ? "bg-amber-400 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-900 shadow-2xl duration-200 animate-in slide-in-from-right"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setTab("categories")} className={tabCls(tab === "categories")}>
              หมวดหมู่
            </button>
            <button onClick={() => setTab("brands")} className={tabCls(tab === "brands")}>
              แบรนด์
            </button>
          </div>
          <button onClick={close} className="text-sm text-zinc-500 hover:text-zinc-300">
            <X className="size-4" /> ปิด
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {unavailable && (
            <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              API build เก่า — ยังไม่มี endpoint จัดการหมวดหมู่/แบรนด์ กรุณา rebuild &amp; restart
              API :4000 แล้วลองใหม่
            </div>
          )}
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

          {/* ── หมวดหมู่ ── */}
          {tab === "categories" && !unavailable && (
            <div className="space-y-2">
              {categories?.map((c, i) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2 ${
                    c.status === "archived" ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex flex-col">
                    <button
                      disabled={busy || i === 0}
                      onClick={() => moveCategory(i, -1)}
                      className="text-xs text-zinc-500 hover:text-amber-300 disabled:opacity-30"
                      title="เลื่อนขึ้น"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      disabled={busy || i === categories.length - 1}
                      onClick={() => moveCategory(i, 1)}
                      className="text-xs text-zinc-500 hover:text-amber-300 disabled:opacity-30"
                      title="เลื่อนลง"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    {editId === c.id ? (
                      <input
                        autoFocus
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        onBlur={() => saveLabel(c)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveLabel(c);
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className={`${inputCls} w-full`}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditId(c.id);
                          setEditVal(c.label);
                        }}
                        className="flex items-center gap-1.5 text-sm text-zinc-100 hover:text-amber-300"
                        title="คลิกเพื่อแก้ชื่อ"
                      >
                        {c.builtin && <span title="หมวดพื้นฐาน แก้ชื่อได้ ลบไม่ได้" />}
                        {c.label}
                      </button>
                    )}
                    <span className="ml-0.5 font-mono text-[10px] text-zinc-600">{c.key}</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                    {c.productCount} สินค้า
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => toggleCatStatus(c)}
                    className="shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    {c.status === "active" ? "เก็บเข้ากรุ" : "กู้คืน"}
                  </button>
                  {!c.builtin && c.productCount === 0 ? (
                    <button
                      disabled={busy}
                      onClick={() => deleteCategory(c)}
                      className="shrink-0 rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                    >
                      ลบ
                    </button>
                  ) : (
                    <span
                      title={
                        c.builtin
                          ? "หมวดพื้นฐานลบไม่ได้"
                          : "มีสินค้าใช้อยู่ — เก็บเข้ากรุแทน"
                      }
                      className="shrink-0 cursor-not-allowed rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-600"
                    >
                      ลบ
                    </span>
                  )}
                </div>
              ))}
              {categories && categories.length === 0 && (
                <p className="py-4 text-center text-sm text-zinc-500">ยังไม่มีหมวดหมู่</p>
              )}
              <div className="flex items-center gap-2 pt-2">
                <input
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCategory()}
                  placeholder="+ เพิ่มหมวดหมู่ (ชื่อไทยได้)"
                  className={`${inputCls} flex-1`}
                />
                <button
                  disabled={busy || !newCat.trim()}
                  onClick={addCategory}
                  className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  เพิ่ม
                </button>
              </div>
            </div>
          )}

          {/* ── แบรนด์ ── */}
          {tab === "brands" && !unavailable && (
            <div className="space-y-2">
              {brands?.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2 ${
                    b.status === "archived" ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {editId === b.id ? (
                      <input
                        autoFocus
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        onBlur={() => saveBrandName(b)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveBrandName(b);
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className={`${inputCls} w-full`}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditId(b.id);
                          setEditVal(b.name);
                        }}
                        className="block truncate text-sm text-zinc-100 hover:text-amber-300"
                        title="คลิกเพื่อแก้ชื่อ"
                      >
                        {b.name}
                      </button>
                    )}
                    {b.contact && (
                      <span className="block truncate text-[11px] text-zinc-500">{b.contact}</span>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                    {b.productCount ?? b._count?.products ?? 0} สินค้า
                  </span>
                  <Link
                    href={`/brands/${b.id}`}
                    className="shrink-0 rounded-lg border border-amber-400/40 px-2 py-1 text-xs text-amber-300 hover:bg-amber-400/10"
                    title="ฐานความรู้แบรนด์ (Brand Knowledge)"
                  >
                    ความรู้แบรนด์
                  </Link>
                  <button
                    disabled={busy}
                    onClick={() => toggleBrandStatus(b)}
                    className="shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    {b.status === "active" ? "เก็บเข้ากรุ" : "กู้คืน"}
                  </button>
                  {(b.productCount ?? b._count?.products ?? 0) === 0 ? (
                    <button
                      disabled={busy}
                      onClick={() => deleteBrand(b)}
                      className="shrink-0 rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                    >
                      ลบ
                    </button>
                  ) : (
                    <span
                      title="มีสินค้าใช้อยู่ — เก็บเข้ากรุแทน"
                      className="shrink-0 cursor-not-allowed rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-600"
                    >
                      ลบ
                    </span>
                  )}
                </div>
              ))}
              {brands && brands.length === 0 && (
                <p className="py-4 text-center text-sm text-zinc-500">ยังไม่มีแบรนด์</p>
              )}
              <div className="flex items-center gap-2 pt-2">
                <input
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addBrand()}
                  placeholder="+ ชื่อแบรนด์ใหม่"
                  className={`${inputCls} flex-1`}
                />
                <input
                  value={newBrandContact}
                  onChange={(e) => setNewBrandContact(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addBrand()}
                  placeholder="ช่องทางติดต่อ (ไม่บังคับ)"
                  className={`${inputCls} w-44`}
                />
                <button
                  disabled={busy || !newBrandName.trim()}
                  onClick={addBrand}
                  className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  เพิ่ม
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
