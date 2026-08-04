"use client";

// RelationPicker — modal เลือก entity มาเชื่อมกับ prompt (4 แท็บ: ตัวละคร/สินค้า/ลูกค้า/แบรนด์)
// ใช้ซ้ำได้ทั้งโหมด "เชื่อมทันที" (การ์ด prompt) และโหมด "staged" (ฟอร์มสร้าง/QuickCapture)
// — parent เป็นคนตัดสินใจว่า onPick แล้วยิง API เลยหรือเก็บไว้ก่อน

import { useEffect, useMemo, useState } from "react";
import { Link, X, Check } from "lucide-react";
import { api, type Character, type CharacterList, type Client, type BrandListItem } from "@/lib/api";
import type { Paged, Product } from "@/lib/catalog";
import {
  RELATION_ENTITY_TYPES,
  RELATION_TYPE_META,
  type PromptRelation,
  type RelationEntityType,
} from "@/lib/prompts";

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

interface PickerItem {
  entityId: string;
  name: string;
  code: string | null;
  sub: string | null; // บรรทัดรองเช่นแบรนด์ของสินค้า
}

interface Props {
  onPick: (rel: PromptRelation) => void;
  onClose: () => void;
  /** คู่ที่เชื่อมแล้ว — โชว์ ✓ และกดซ้ำไม่ได้ */
  linked?: { entityType: string; entityId: string }[];
  title?: string;
  initialTab?: RelationEntityType;
}

export default function RelationPicker({
  onPick,
  onClose,
  linked = [],
  title = "เชื่อมกับ...",
  initialTab = "character",
}: Props) {
  const [tab, setTab] = useState<RelationEntityType>(initialTab);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedSet = useMemo(
    () => new Set(linked.map((l) => `${l.entityType}|${l.entityId}`)),
    [linked],
  );

  // โหลดรายการของแท็บที่เปิดอยู่ — debounce ค้นหา 300ms
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const query = q.trim();
        let next: PickerItem[] = [];
        if (tab === "character") {
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          const res = await api<CharacterList>(
            `/characters${params.toString() ? `?${params}` : ""}`,
          );
          next = res.items.map((c: Character) => ({
            entityId: c.id,
            name: c.nameTh,
            code: c.displayCode,
            sub: c.nameEn,
          }));
        } else if (tab === "product") {
          const params = new URLSearchParams({ pageSize: "50" });
          if (query) params.set("q", query);
          const res = await api<Paged<Product>>(`/products?${params}`);
          next = res.items.map((p) => ({
            entityId: p.id,
            name: p.name,
            code: p.displayCode,
            sub: p.brand?.name ?? null,
          }));
        } else if (tab === "client") {
          const params = new URLSearchParams({ status: "active" });
          if (query) params.set("q", query);
          const res = await api<Client[]>(`/clients?${params}`);
          next = res.map((c) => ({
            entityId: c.id,
            name: c.name,
            code: null,
            sub: c.contactName ?? null,
          }));
        } else {
          const params = new URLSearchParams({ status: "active" });
          if (query) params.set("q", query);
          const res = await api<BrandListItem[]>(`/brands?${params}`);
          next = res.map((b) => ({
            entityId: b.id,
            name: b.name,
            code: null,
            sub: b.tagline,
          }));
        }
        if (!cancelled) setItems(next);
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setError(err instanceof Error ? err.message : "โหลดรายการไม่สำเร็จ");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, q]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-10 flex w-full max-w-lg flex-col rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-zinc-100">
            <Link className="size-4" /> {title}
          </h2>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            ปิด <X className="size-4" />
          </button>
        </div>

        {/* 4 แท็บ entity */}
        <div className="mb-3 flex overflow-hidden rounded-lg border border-zinc-700 text-sm">
          {RELATION_ENTITY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setQ("");
              }}
              className={`flex-1 px-2 py-2 ${
                tab === t
                  ? "bg-amber-400/10 font-semibold text-amber-300"
                  : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {RELATION_TYPE_META[t].icon} {RELATION_TYPE_META[t].label}
            </button>
          ))}
        </div>

        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`ค้นหา${RELATION_TYPE_META[tab].label}...`}
          className={`${inputCls} mb-3 w-full`}
        />

        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

        <div className="max-h-80 space-y-1 overflow-y-auto">
          {loading && <p className="px-2 py-4 text-center text-xs text-zinc-500">กำลังโหลด...</p>}
          {!loading && items.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-zinc-500">
              ไม่พบ{RELATION_TYPE_META[tab].label}
              {q.trim() ? "ที่ค้นหา" : ""}
            </p>
          )}
          {!loading &&
            items.map((item) => {
              const already = linkedSet.has(`${tab}|${item.entityId}`);
              return (
                <button
                  key={item.entityId}
                  type="button"
                  disabled={already}
                  onClick={() =>
                    onPick({
                      entityType: tab,
                      entityId: item.entityId,
                      name: item.name,
                      code: item.code,
                    })
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    already
                      ? "cursor-default bg-zinc-800/40 text-zinc-500"
                      : "text-zinc-200 hover:bg-amber-400/10 hover:text-amber-300"
                  }`}
                >
                  <span>{RELATION_TYPE_META[tab].icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {item.name}
                      {item.code && (
                        <span className="ml-1.5 font-mono text-[10px] text-zinc-500">
                          {item.code}
                        </span>
                      )}
                    </span>
                    {item.sub && (
                      <span className="block truncate text-[11px] text-zinc-500">{item.sub}</span>
                    )}
                  </span>
                  {already && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <Check className="size-3" /> เชื่อมแล้ว
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
